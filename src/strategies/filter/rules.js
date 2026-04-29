/**
 * Rule-based filter using `Preference.explicitFilters`. Pure, no LLM.
 */

import { normalize } from '../../core/identity.js';

/** @type {import('../../core/types.js').Strategy} */
export const rules = (events, ctx) => {
  const f = { ...(ctx.preference.explicitFilters ?? {}), ...(ctx.query.filters ?? {}) };
  const excludeKeywords = (f.excludeKeywords ?? []).map((k) => k.toLowerCase());
  const excludeVenues = new Set((f.excludeVenues ?? []).map((v) => normalize(v)));

  return events.filter((e) => {
    if (excludeVenues.has(normalize(e.venue.name))) return false;
    if (excludeKeywords.length > 0) {
      const haystack = `${e.title} ${e.description ?? ''}`.toLowerCase();
      if (excludeKeywords.some((k) => haystack.includes(k))) return false;
    }
    if (f.freeOnly && !e.price?.free) return false;
    if (f.price) {
      const { min, max } = f.price;
      const eMin = e.price?.min ?? e.price?.max;
      if (min !== undefined && eMin !== undefined && eMin < min) return false;
      if (max !== undefined && e.price?.min !== undefined && e.price.min > max) return false;
    }
    return true;
  });
};
