/**
 * Same-day fuzzy-title dedupe.
 * Two events on the same day at the same city with similar titles are treated as duplicates.
 */

import { normalize } from '../../core/identity.js';

/**
 * @param {{ threshold?: number }} [opts]
 * @returns {import('../../core/types.js').Strategy}
 */
export function fuzzyTitle({ threshold = 0.85 } = {}) {
  return function fuzzyTitleStrategy(events) {
    /** @type {import('../../core/types.js').Event[]} */
    const kept = [];
    for (const e of events) {
      const dup = kept.find((k) => isSameDay(k, e) && sameCity(k, e) && titleSim(k.title, e.title) >= threshold);
      if (!dup) kept.push(e);
    }
    return kept;
  };
}

/**
 * @param {import('../../core/types.js').Event} a
 * @param {import('../../core/types.js').Event} b
 */
function isSameDay(a, b) {
  return a.startsAt.slice(0, 10) === b.startsAt.slice(0, 10);
}

/**
 * @param {import('../../core/types.js').Event} a
 * @param {import('../../core/types.js').Event} b
 */
function sameCity(a, b) {
  return normalize(a.venue.city) === normalize(b.venue.city);
}

/**
 * Token Jaccard. Cheap, language-agnostic, plenty good at the 0.85 default.
 * @param {string} a
 * @param {string} b
 */
function titleSim(a, b) {
  const sa = new Set(normalize(a).split(' ').filter(Boolean));
  const sb = new Set(normalize(b).split(' ').filter(Boolean));
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}
