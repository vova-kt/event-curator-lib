import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTimeframe } from '../src/core/timeframe.js';

test('resolveTimeframe: explicit dates pass through', () => {
  const r = resolveTimeframe({ from: '2026-05-01', to: '2026-05-15' }, 14);
  assert.deepEqual(r, { from: '2026-05-01', to: '2026-05-15' });
});

test('resolveTimeframe: rolling resolves to from..from+days', () => {
  const r = resolveTimeframe({ rolling: { days: 7, anchor: '2026-05-01' } }, 14);
  assert.equal(r.from, '2026-05-01');
  assert.equal(r.to, '2026-05-08');
});

test('resolveTimeframe: rolling without days uses default', () => {
  const r = resolveTimeframe({ rolling: { anchor: '2026-05-01', days: /** @type {any} */ (undefined) } }, 14);
  assert.equal(r.from, '2026-05-01');
  assert.equal(r.to, '2026-05-15');
});
