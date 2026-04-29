import { buildSystem } from './_system.js';

/**
 * @typedef {Object} ExpandQueriesArgs
 * @property {string} city
 * @property {string} category
 * @property {{ from: string, to: string }} timeframe
 * @property {number} limit
 */

/**
 * Build the query-expansion prompt. The LLM returns a JSON object with `queries: string[]`.
 *
 * Structure follows docs/prompts_guide.md.
 *
 * @param {ExpandQueriesArgs} args
 * @returns {{ system: string, user: string }}
 */
export function expandQueriesPrompt({ city, category, timeframe, limit }) {
  const system = buildSystem({
    role: 'You produce diverse web-search queries that maximize recall for upcoming-event discovery.',
    task: 'Given a city, category, timeframe, and limit, return up to `limit` plain web-search queries a knowledgeable local would type to find these events.',
    rules: [
      '- Diversify across synonyms and register (e.g. "concerts" / "gigs" / "shows"; "talks" / "lectures" / "meetups").',
      '- When the city\'s primary language is not English, include native-language variants (e.g. "Konzerte Berlin" for Berlin, "concerts à Paris" for Paris). Keep some English variants too.',
      '- Derive timeframe phrasings from the dates: include calendar-anchored forms (e.g. "May 2026") and natural-language forms when they fit the window ("this weekend", "next month"). Anchor relative phrasings against the `from` date.',
      '- Mix general listings ("events in X") with category-specific ones.',
      '- Each query is a plain search string: no boolean operators, no quotes, no site: filters.',
      '- Keep each query under ~80 characters.',
      '- Use real venues, artists, or terms only when they are well-known landmarks of the city/category. Do not invent names.',
      '- Return at most `limit` queries. No duplicates.',
    ].join('\n'),
    inputFormat: [
      'The user message contains four labelled lines:',
      '  City: <name>',
      '  Category: <name>',
      '  Timeframe: <ISO from> to <ISO to>',
      '  Limit: <integer>',
    ].join('\n'),
    outputFormat: [
      'Strict JSON, no commentary:',
      '{ "queries": [string, ...] }',
    ].join('\n'),
  });

  const user = [
    `City: ${city}`,
    `Category: ${category}`,
    `Timeframe: ${timeframe.from} to ${timeframe.to}`,
    `Limit: ${limit}`,
  ].join('\n');

  return { system, user };
}
