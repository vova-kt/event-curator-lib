import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rules } from '../src/strategies/filter/rules.js';
import { preferenceLLM } from '../src/strategies/filter/preferenceLLM.js';
import { makeEvent, stubLLM } from './_helpers.js';

/**
 * @param {Partial<import('../src/core/types.js').Ctx>} extra
 * @returns {import('../src/core/types.js').Ctx}
 */
function ctx(extra = {}) {
  return /** @type {any} */ ({
    preference: { liked: [], disliked: [], explicitFilters: {} },
    query: { city: 'Berlin', category: 'comedy', timeframe: { from: '2026-05-01', to: '2026-05-31' } },
    config: { dedupe: { fuzzyTitleThreshold: 0.85 } },
    ...extra,
  });
}

test('rules: excludeKeywords drops matching events', async () => {
  const events = [
    makeEvent({ title: 'Open Mic at Pub' }),
    makeEvent({ title: 'Pro Comedy Show', source: { name: 's', url: 'https://b.example.com' } }),
  ];
  const out = await rules(events, ctx({ preference: { liked: [], disliked: [], explicitFilters: { excludeKeywords: ['open mic'] } } }));
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Pro Comedy Show');
});

test('rules: query filters override preference filters', async () => {
  const events = [
    makeEvent({ title: 'Cheap show', price: { currency: 'EUR', min: 5 }, source: { name: 's', url: 'https://a.example.com' } }),
    makeEvent({ title: 'Pricey show', price: { currency: 'EUR', min: 50 }, source: { name: 's', url: 'https://b.example.com' } }),
  ];
  const out = await rules(events, ctx({
    preference: { liked: [], disliked: [], explicitFilters: { price: { max: 100 } } },
    query: { city: 'Berlin', category: 'comedy', timeframe: { from: '2026-05-01', to: '2026-05-31' }, filters: { price: { max: 10 } } },
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Cheap show');
});

test('preferenceLLM: returns input unchanged when there is no preference signal', async () => {
  const events = [makeEvent({ title: 'A' }), makeEvent({ title: 'B', source: { name: 's', url: 'https://b.example.com' } })];
  const llm = stubLLM(() => ({ keep: ['nothing'] }));
  const out = await preferenceLLM(events, ctx({ llm }));
  assert.equal(out.length, 2);
});

test('preferenceLLM: keeps only ids the LLM returns when preferences exist', async () => {
  const a = makeEvent({ title: 'A' });
  const b = makeEvent({ title: 'B', source: { name: 's', url: 'https://b.example.com' } });
  const llm = stubLLM(() => ({ keep: [a.id] }));
  const out = await preferenceLLM([a, b], ctx({
    llm,
    preference: {
      liked: [{ id: 'evt_x', title: 'X', category: 'comedy', venue: { name: 'V', city: 'Berlin' }, startsAt: '2026-05-02' }],
      disliked: [],
      explicitFilters: {},
    },
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].id, a.id);
});
