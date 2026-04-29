import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCurator } from '../src/index.js';
import { memory } from '../src/adapters/storage/memory.js';
import { templates } from '../src/strategies/queryExpansion/index.js';
import { stubLLM, stubSearch } from './_helpers.js';

// These tests focus on dedupe / feedback wiring, not query expansion. Use the
// deterministic `templates` strategy so they don't depend on stubbed LLM calls
// for query expansion.
const deterministicExpansion = { queryExpansion: [templates()] };

test('createCurator: full pipeline returns events from stub adapters', async () => {
  const llm = stubLLM((req) => {
    if (req.system.includes('extract structured upcoming events')) {
      return {
        events: [
          {
            title: 'Test Comedy Night',
            startsAt: '2026-05-02T20:00:00+00:00',
            venue: { name: 'Test Café', city: 'Berlin' },
            source: { name: 'stub', url: 'https://example.com/listing' },
          },
        ],
      };
    }
    return {};
  });
  const search = stubSearch([{
    url: 'https://example.com/listing',
    title: 'Listing',
    snippet: 'Listing of comedy in Berlin',
    content: 'Comedy events in Berlin this week.',
    source: 'stub',
  }]);
  const storage = memory();

  const curator = await createCurator({ llm, search: [search], storage, strategies: deterministicExpansion });
  const { events } = await curator.curate({
    city: 'Berlin',
    queryText: 'comedy',
    timeframe: { rolling: { days: 14 } },
    limit: 5,
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Test Comedy Night');
  await curator.close();
});

test('createCurator: cross-session dedupe only drops events the consumer marked shown', async () => {
  let calls = 0;
  const llm = stubLLM(() => {
    calls++;
    return {
      events: [
        {
          title: 'Same Event Twice',
          startsAt: '2026-05-02T20:00:00+00:00',
          venue: { name: 'Café', city: 'Berlin' },
          source: { name: 'stub', url: 'https://x.example.com' },
        },
      ],
    };
  });
  const search = stubSearch([{ url: 'https://x.example.com', title: 't', content: 'c', source: 'stub' }]);
  const storage = memory();
  const curator = await createCurator({ llm, search: [search], storage, strategies: deterministicExpansion });

  const first = await curator.curate({
    city: 'Berlin',
    queryText: 'comedy',
    timeframe: { rolling: { days: 14 } },
  });
  assert.equal(first.events.length, 1);

  // Without an explicit markShown, the same event resurfaces — events that
  // landed in storage but were never actually shown to the user remain
  // eligible for re-discovery.
  const secondNotShown = await curator.curate({
    city: 'Berlin',
    queryText: 'comedy',
    timeframe: { rolling: { days: 14 } },
  });
  assert.equal(secondNotShown.events.length, 1);

  // Once the consumer marks it shown, the cross-session dedupe drops it.
  await curator.markShown([first.events[0].id], { city: 'Berlin', queryText: 'comedy' });
  const third = await curator.curate({
    city: 'Berlin',
    queryText: 'comedy',
    timeframe: { rolling: { days: 14 } },
  });
  assert.equal(third.events.length, 0);
  assert.ok(calls >= 2);

  await curator.close();
});

test('createCurator: listShown returns previously shown events for a saved query', async () => {
  const llm = stubLLM(() => ({
    events: [
      {
        title: 'Listed',
        startsAt: '2026-05-02T20:00:00+00:00',
        venue: { name: 'V', city: 'Berlin' },
        source: { name: 'stub', url: 'https://x.example.com' },
      },
    ],
  }));
  const search = stubSearch([{ url: 'https://x.example.com', title: 't', content: 'c', source: 'stub' }]);
  const storage = memory();
  const curator = await createCurator({ llm, search: [search], storage, strategies: deterministicExpansion });

  const { events } = await curator.curate({
    city: 'Berlin', queryText: 'comedy', timeframe: { rolling: { days: 14 } },
  });
  await curator.markShown(events.map((e) => e.id), { city: 'Berlin', queryText: 'comedy' });

  const history = await curator.listShown({ city: 'Berlin', queryText: 'comedy' });
  assert.equal(history.length, 1);
  assert.equal(history[0].title, 'Listed');

  // Nothing shown for a different saved query.
  const empty = await curator.listShown({ city: 'Berlin', queryText: 'jazz' });
  assert.equal(empty.length, 0);

  await curator.close();
});

test('createCurator: clearPreferences wipes prefs', async () => {
  const llm = stubLLM(() => ({}));
  const search = stubSearch([]);
  const storage = memory();
  const curator = await createCurator({ llm, search: [search], storage, strategies: deterministicExpansion });

  // Seed something via storage directly.
  await storage.updatePreference((p) => ({ ...p, explicitFilters: { excludeKeywords: ['x'] } }));
  await curator.clearPreferences();
  const after = await storage.getPreference();
  assert.deepEqual(after.explicitFilters, {});
  await curator.close();
});

test('createCurator: recordFeedback persists likes scoped by query', async () => {
  const llm = stubLLM((req) => {
    if (req.system.includes('extract structured upcoming events')) {
      return {
        events: [
          { title: 'A', startsAt: '2026-05-02T20:00:00+00:00', venue: { name: 'V', city: 'Berlin' }, source: { name: 'stub', url: 'https://x.example.com' } },
        ],
      };
    }
    if (req.system.includes('summarize a user')) {
      return { traits: 'alt-comedy' };
    }
    return {};
  });
  const search = stubSearch([{ url: 'https://x.example.com', title: 't', content: 'c', source: 'stub' }]);
  const storage = memory();
  const curator = await createCurator({ llm, search: [search], storage, strategies: deterministicExpansion, config: { preferences: { traitsRefreshThreshold: 1, deriveTraits: true } } });

  const { events } = await curator.curate({ city: 'Berlin', queryText: 'comedy', timeframe: { rolling: { days: 14 } } });
  await curator.recordFeedback({ liked: [events[0].id], disliked: [] });

  const pref = await storage.getPreference({ city: 'Berlin', queryText: 'comedy' });
  assert.equal(pref.liked.length, 1);
  assert.equal(pref.liked[0].id, events[0].id);
  await curator.close();
});
