/**
 * Per-query heuristic checks for the query expansion eval:
 *
 * - `detectExpectedLanguage` — best-guess ISO 639-3 code, biased toward a
 *   caller-supplied set of expected languages. Non-Latin scripts resolve via
 *   Unicode block (essentially perfect signal, no library needed); Latin
 *   script falls back to franc's `francAll`, intersected with the expected
 *   set so noisy low-confidence guesses on short queries don't wander into
 *   irrelevant languages (franc tends to favor Malay/Indonesian for any
 *   ASCII-only short string — those get filtered out as long as `expected`
 *   is set correctly).
 * - `hasMonthYearAnchor` / `hasBadTimeRef` — prompt-rule violation detectors
 *   for "May 2026" anchors and forbidden relative-time references.
 *
 * Sibling to [matching.js](matching.js): both hold heuristic comparators a
 * future ranking eval could reuse.
 */

import { francAll } from 'franc-min';

// Script blocks we can resolve without statistical detection. Each entry maps
// a Unicode script range to the set of ISO 639-3 codes that use it. franc is
// then asked to disambiguate within that set when the script covers multiple
// languages (Cyrillic, Arabic). Adding a non-Latin language = one entry.
/** @type {Array<{ re: RegExp, langs: string[] }>} */
const NON_LATIN_SCRIPTS = [
  { re: /[\u0400-\u04ff]/, langs: ['rus', 'ukr', 'bul', 'srp', 'mkd', 'bel', 'kaz'] }, // Cyrillic
  { re: /[\u4e00-\u9fff]/, langs: ['cmn'] },                  // CJK Unified Ideographs
  { re: /[\u3040-\u30ff]/, langs: ['jpn'] },                  // Hiragana + Katakana
  { re: /[\uac00-\ud7af]/, langs: ['kor'] },                  // Hangul
  { re: /[\u0600-\u06ff]/, langs: ['arb', 'pes', 'urd'] },    // Arabic
  { re: /[\u0900-\u097f]/, langs: ['hin'] },                  // Devanagari
  { re: /[\u0370-\u03ff]/, langs: ['ell'] },                  // Greek
  { re: /[\u0590-\u05ff]/, langs: ['heb'] },                  // Hebrew
  { re: /[\u0e00-\u0e7f]/, langs: ['tha'] },                  // Thai
];

// francAll returns all candidate languages ranked by score in [0, 1] (the top
// match is always 1.0). A 0.5 floor rejects vanishingly-likely tails without
// losing genuine secondary matches — short ASCII queries routinely have the
// real language at 0.6-0.9 even when franc's top guess is Malay or Indonesian.
const MIN_PROBABILITY = 0.5;
const FRANC_OPTS = { minLength: 3 };

/**
 * Best-guess ISO 639-3 code for a query, biased toward the expected set.
 * Returns `'und'` when no expected language is a plausible match.
 *
 * @param {string} query
 * @param {string[]} expected  ISO 639-3 codes the city's audience speaks.
 * @returns {string}
 */
export function detectExpectedLanguage(query, expected) {
  for (const { re, langs } of NON_LATIN_SCRIPTS) {
    if (!re.test(query)) continue;
    const candidates = francAll(query, FRANC_OPTS);
    for (const [code, prob] of candidates) {
      if (prob < MIN_PROBABILITY) break;
      if (langs.includes(code) && expected.includes(code)) return code;
    }
    return langs.find((l) => expected.includes(l)) ?? 'und';
  }
  const candidates = francAll(query, FRANC_OPTS);
  for (const [code, prob] of candidates) {
    if (prob < MIN_PROBABILITY) break;
    if (expected.includes(code)) return code;
  }
  return 'und';
}

const MONTHS = {
  english: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  german: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  // Russian month stems (cover both nominative "май" and genitive "мая", etc.)
  russian: ['январ', 'феврал', 'март', 'апрел', 'ма[йя]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'],
};

// Genitive forms used after a numeric day (e.g. "5 мая").
const RUSSIAN_DAY_MONTHS = ['мая', 'июня', 'июля'];

const RELATIVE_TIME = {
  english: ['today', 'tonight', 'tomorrow', 'this week', 'this weekend', 'next week', 'next weekend', 'this friday', 'next saturday', 'this month'],
  german: ['heute', 'morgen', 'Wochenende', 'diese Woche', 'nächste Woche'],
  russian: ['сегодня', 'завтра', 'выходн', 'на этой неделе', 'на следующей неделе'],
};

const word = (/** @type {string[]} */ parts) => `\\b(?:${parts.join('|')})\\b`;
const flat = (/** @type {Record<string, string[]>} */ obj) => Object.values(obj).flat();

const HAS_MONTH_YEAR_RE = new RegExp(`${word(flat(MONTHS))}.*\\b20\\d{2}\\b`, 'i');
const HAS_BAD_TIME_REF_RE = new RegExp(
  `${word(flat(RELATIVE_TIME))}|\\b\\d{1,2}\\s*(?:${[...MONTHS.english, ...MONTHS.german, ...RUSSIAN_DAY_MONTHS].join('|')})\\b`,
  'i',
);

/**
 * True when the query is anchored to a specific month + year (e.g. "May 2026").
 * @param {string} query
 */
export function hasMonthYearAnchor(query) {
  return HAS_MONTH_YEAR_RE.test(query);
}

/**
 * True when the query uses a relative or day-without-year time reference the
 * `expandQueries` prompt forbids ("tomorrow", "this weekend", "5 May").
 * @param {string} query
 */
export function hasBadTimeRef(query) {
  return HAS_BAD_TIME_REF_RE.test(query);
}
