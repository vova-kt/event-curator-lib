import { buildSystem } from './_system.js';

/** @type {Record<string, unknown>} */
export const expandQueriesSchema = {
  type: 'object',
  properties: {
    queries: {
      type: 'array',
      items: { type: 'string' },
      description: 'Diverse web-search queries for event discovery.',
    },
  },
  required: ['queries'],
  additionalProperties: false,
};

/**
 * @typedef {Object} ExpandQueriesArgs
 * @property {string} city
 * @property {string} queryText
 * @property {{ from: string, to: string }} timeframe
 * @property {number} limit
 */

/**
 * Build the query-expansion prompt. The LLM returns a JSON object with `queries: string[]`.
 *
 * Structure follows docs/prompts.md.
 *
 * @param {ExpandQueriesArgs} args
 * @returns {{ system: string, user: string }}
 */
export function expandQueriesPrompt({ city, queryText, timeframe, limit }) {
  const system = buildSystem({
    role: 'You produce diverse web-search queries that maximize recall for upcoming-event discovery.',
    task: 'Given a city, the user\'s freeform query, a timeframe, and a limit, return up to `limit` plain web-search queries a knowledgeable local would type to find these events.',
    rules: [
      '- Interpret the user\'s freeform query liberally: cover its synonyms, sub-genres, neighbouring topics, and the registers people actually search in (e.g. "concerts" / "gigs" / "shows"; "talks" / "lectures" / "meetups").',
      '- Cover up to three language registers. Include EVERY register that applies, balancing the output across them — do not let one register crowd out another:',
      '  1. English — always include at least 2 queries.',
      '  2. The city\'s primary local language (e.g. German for Berlin, French for Paris, Spanish for Madrid). MANDATORY when the city\'s primary language is not English: include at least 2 queries written idiomatically in that language ("Stand-up Comedy auf Russisch in Berlin", not "russian standup berlin in german"). Skipping the local language is a major recall failure — locals search in their own language.',
      '  3. Any language implied by the user\'s query itself — if the topic names a community, diaspora, or language ("russian standup", "spanish poetry night", "ukrainische Filme"), include at least 2 native-script queries in that language. Use the language\'s own script and idiomatic phrasing ("русский стендап Берлин", not romanized).',
      '  When all three registers apply, aim for a roughly even split across them. Do not duplicate the same query across languages — each query should bring different recall.',
      '- Timeframe phrasings default to "month year" granularity ("May 2026", "Mai 2026", "май 2026"). Do NOT use specific dates ("9 May"), day-of-week references ("this Friday", "next Saturday"), or relative day phrases ("tonight", "tomorrow", "this weekend") unless the user\'s freeform query explicitly requests that level of precision (e.g. "events this weekend", "Friday night comedy").',
      '  Derive the month(s) to mention from the `from`–`to` window. If the window spans parts of two months, mention both. Use each month name at most once across all queries to avoid wasted recall.',
      '- Mix general listings ("events in X") with topic-specific ones drawn from the user\'s query, but skew toward topic-specific — over-broad "events in Berlin" queries dilute recall for niche topics.',
      '- Each query is a plain search string: no boolean operators, no quotes, no site: filters.',
      '- Keep each query under ~80 characters.',
      '- Use real venues, artists, or terms only when they are well-known landmarks of the city/topic. Do not invent names.',
      '- Return exactly `limit` queries when you can produce that many distinct ones — under-filling the limit costs recall. Only return fewer if you genuinely cannot find more non-duplicate phrasings.',
      '- No duplicates and no near-duplicates (e.g. swapping word order without changing meaning).',
    ].join('\n'),
    inputFormat: [
      'The user message contains four labelled lines:',
      '  City: <name>',
      '  Query: <user\'s freeform query>',
      '  Timeframe: <ISO from> to <ISO to>',
      '  Limit: <integer>',
    ].join('\n'),
    examples: [
      '<example>',
      'Input:',
      '  City: Paris',
      '  Query: spanish poetry night',
      '  Timeframe: 2026-09-10 to 2026-09-24',
      '  Limit: 8',
      'Output:',
      '{"queries":[',
      '  "spanish poetry night Paris September 2026",',
      '  "spanish-language poetry reading Paris",',
      '  "soirée poésie hispanophone Paris septembre 2026",',
      '  "lecture poésie espagnole Paris",',
      '  "noche de poesía española París septiembre 2026",',
      '  "recital de poesía en español París",',
      '  "poesía hispanoamericana París septiembre 2026",',
      '  "spanish poetry open mic Paris"',
      ']}',
      'Notes: 2 English, 2 French (city-local, mandatory because Paris isn\'t English), 3 Spanish (topic-implied), 1 mixed.',
      'Time anchors use "September 2026" / "septembre 2026" / "septiembre 2026" — month-year only, no specific dates or day-of-week references because the user query did not request them.',
      'For your input, follow this pattern: identify the city\'s primary local language, identify any topic-implied language from the user query, balance roughly 2-3 queries per applicable register, and use idiomatic phrasing in each language\'s own script.',
      '</example>',
    ].join('\n'),
  });

  const user = [
    `City: ${city}`,
    `Query: ${queryText}`,
    `Timeframe: ${timeframe.from} to ${timeframe.to}`,
    `Limit: ${limit}`,
  ].join('\n');

  return { system, user };
}
