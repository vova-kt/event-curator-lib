import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenize,
  normalizeVenue,
  titleSimilarity,
  titleMatches,
  dateMatches,
  venueMatches,
} from '../eval/core/matching.js';
import { matchEvents } from '../eval/core/metrics.js';

describe('tokenize', () => {
  test('Latin text', () => {
    const tokens = tokenize('Jazz Night at Blue Note');
    assert.ok(tokens.has('jazz'));
    assert.ok(tokens.has('night'));
    assert.ok(tokens.has('blue'));
    assert.ok(tokens.has('note'));
  });

  test('Cyrillic text', () => {
    const tokens = tokenize('Открытый микрофон');
    assert.ok(tokens.has('открытыи'));
    assert.ok(tokens.has('микрофон'));
  });

  test('mixed-script text', () => {
    const tokens = tokenize('Galym Stand-up Tour 2026');
    assert.ok(tokens.has('galym'));
    assert.ok(tokens.has('stand'));
    assert.ok(tokens.has('tour'));
    assert.ok(tokens.has('2026'));
  });

  test('short tokens filtered', () => {
    const tokens = tokenize('a b cc');
    assert.equal(tokens.size, 1);
    assert.ok(tokens.has('cc'));
  });

  test('accented Latin normalized', () => {
    const tokens = tokenize('Café Müller');
    assert.ok(tokens.has('cafe'));
    assert.ok(tokens.has('muller'));
  });
});

describe('normalizeVenue', () => {
  test('strips English articles', () => {
    assert.equal(normalizeVenue('The Blue Note'), 'blue note');
  });

  test('preserves Cyrillic', () => {
    const result = normalizeVenue('Кафе Пушкинъ');
    assert.ok(result.includes('кафе'));
    assert.ok(result.includes('пушкинъ'));
  });

  test('normalizes mixed venue', () => {
    assert.equal(normalizeVenue('SaliGari Bar'), 'saligari bar');
  });
});

describe('titleSimilarity', () => {
  test('identical Cyrillic titles', () => {
    const s = titleSimilarity(
      'Открытый микрофон. Стендап в Берлине',
      'Открытый микрофон. Стендап в Берлине',
    );
    assert.equal(s, 1.0);
  });

  test('cross-lingual titles have zero overlap', () => {
    const s = titleSimilarity(
      'Открытый микрофон. Стендап в Берлине',
      'Open mic. Standup in Berlin',
    );
    assert.equal(s, 0);
  });

  test('same-language partial overlap', () => {
    const s = titleSimilarity(
      'Open Mic: Stand-up in Berlin (Germany)',
      'Open mic. Standup in Berlin',
    );
    assert.ok(s > 0.4);
  });
});

describe('venueMatches', () => {
  test('exact match', () => {
    assert.ok(venueMatches('SaliGari Bar', 'SaliGari Bar'));
  });

  test('substring match', () => {
    assert.ok(venueMatches('SaliGari', 'SaliGari Bar'));
  });

  test('Cyrillic venue match', () => {
    assert.ok(venueMatches('Кафе Пушкинъ', 'Кафе Пушкинъ'));
  });

  test('different venues', () => {
    assert.ok(!venueMatches('Blue Note', 'SaliGari Bar'));
  });

  test('undefined returns false', () => {
    assert.ok(!venueMatches(undefined, 'SaliGari Bar'));
  });
});

describe('dateMatches', () => {
  test('same date different times', () => {
    assert.ok(dateMatches('2026-05-06T20:00:00+02:00', '2026-05-06T19:00:00+02:00'));
  });

  test('adjacent day within tolerance', () => {
    assert.ok(dateMatches('2026-05-06', '2026-05-07'));
  });

  test('beyond tolerance', () => {
    assert.ok(!dateMatches('2026-05-06', '2026-05-09'));
  });

  test('undefined returns false', () => {
    assert.ok(!dateMatches(undefined, '2026-05-06'));
  });
});

describe('matchEvents two-pass', () => {
  const ev = (title, startsAt, venue) => ({ title, startsAt, venue: { name: venue, city: 'Berlin' } });

  test('pass 1: same-language title match', () => {
    const golden = [ev('Open mic in Berlin', '2026-05-06', 'SaliGari Bar')];
    const candidate = [ev('Open mic in Berlin', '2026-05-06', 'SaliGari Bar')];
    const r = matchEvents(golden, candidate);
    assert.equal(r.matched.length, 1);
    assert.ok(r.matched[0].fields.title);
  });

  test('pass 2: cross-lingual fallback via venue+date', () => {
    const golden = [ev('Открытый микрофон. Стендап в Берлине', '2026-05-06', 'SaliGari Bar')];
    const candidate = [ev('Open mic. Standup in Berlin', '2026-05-06', 'SaliGari Bar')];
    const r = matchEvents(golden, candidate);
    assert.equal(r.matched.length, 1);
    assert.ok(!r.matched[0].fields.title, 'should be a fallback match');
    assert.ok(r.matched[0].fields.venue);
    assert.ok(r.matched[0].fields.date);
  });

  test('title match takes priority over fallback', () => {
    const golden = [ev('Open mic in Berlin', '2026-05-06', 'SaliGari Bar')];
    const candidate = [
      ev('Open mic in Berlin', '2026-05-06', 'Other Venue'),
      ev('Другое название', '2026-05-06', 'SaliGari Bar'),
    ];
    const r = matchEvents(golden, candidate);
    assert.equal(r.matched.length, 1);
    assert.ok(r.matched[0].fields.title, 'title match should win');
    assert.equal(r.matched[0].candidateIdx, 0);
  });

  test('fallback requires both venue AND date', () => {
    const golden = [ev('Стендап шоу', '2026-05-06', 'SaliGari Bar')];
    const candidate = [
      ev('Some show', '2026-05-06', 'Other Venue'),
      ev('Another show', '2026-06-01', 'SaliGari Bar'),
    ];
    const r = matchEvents(golden, candidate);
    assert.equal(r.matched.length, 0);
    assert.equal(r.unmatchedGolden.length, 1);
  });

  test('candidate used in pass 1 is not available for pass 2', () => {
    const golden = [
      ev('Open mic in Berlin', '2026-05-06', 'SaliGari Bar'),
      ev('Открытый микрофон', '2026-05-06', 'SaliGari Bar'),
    ];
    const candidate = [ev('Open mic in Berlin', '2026-05-06', 'SaliGari Bar')];
    const r = matchEvents(golden, candidate);
    assert.equal(r.matched.length, 1, 'only one candidate to match');
    assert.equal(r.unmatchedGolden.length, 1);
  });
});
