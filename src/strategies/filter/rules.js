/**
 * Rule-based filter using `Preference.explicitFilters`. Pure, no LLM.
 *
 * Keyword matching is morphology-aware via Snowball stemming so that
 * `excludeKeywords: ['концерт']` matches `'концерта'`, `'концертов'`, etc.,
 * and `['concert']` matches `'concerts'` / `'concerted'`.
 */

import { newStemmer } from 'snowball-stemmers';
import { normalize } from '../../core/identity.js';

const CYRILLIC = /[\u0400-\u04FF]/;
/** @type {Map<string, { stem: (w: string) => string }>} */
const stemmerCache = new Map();

/** @param {string} lang */
function stemmerFor(lang) {
  const cached = stemmerCache.get(lang);
  if (cached) return cached;
  const s = newStemmer(lang);
  stemmerCache.set(lang, s);
  return s;
}

/** @param {string} token */
function stemToken(token) {
  const lang = CYRILLIC.test(token) ? 'russian' : 'english';
  return stemmerFor(lang).stem(token);
}

/**
 * Lowercase, tokenize on Unicode letters, stem each token, rejoin with spaces.
 * @param {string} text
 */
function stemPhrase(text) {
  const tokens = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  return tokens.map(stemToken).join(' ');
}

/** @type {import('../../core/types.js').Strategy} */
export const rules = (events, ctx) => {
  const f = { ...(ctx.preference.explicitFilters ?? {}), ...(ctx.query.filters ?? {}) };
  const excludeKeywordStems = (f.excludeKeywords ?? [])
    .map((k) => stemPhrase(k))
    .filter((k) => k.length > 0);
  const excludeVenues = new Set((f.excludeVenues ?? []).map((v) => normalize(v)));

  return events.filter((e) => {
    if (excludeVenues.has(normalize(e.venue.name))) return false;
    if (excludeKeywordStems.length > 0) {
      const haystack = ` ${stemPhrase(`${e.title} ${e.description ?? ''}`)} `;
      if (excludeKeywordStems.some((k) => haystack.includes(` ${k} `))) return false;
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
