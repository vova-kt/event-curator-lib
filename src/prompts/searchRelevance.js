import { buildSystem } from './_system.js';

/** @type {Record<string, unknown>} */
export const scoreRelevanceSchema = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: 'Zero-based index of the search result.' },
          score: { type: 'number', minimum: 0, maximum: 1, description: 'Composite relevance score.' },
        },
        required: ['index', 'score'],
        additionalProperties: false,
      },
    },
  },
  required: ['scores'],
  additionalProperties: false,
};

/**
 * @typedef {Object} ScoreRelevanceArgs
 * @property {string} city
 * @property {string} queryText
 * @property {{ url: string, title: string, snippet?: string }[]} hits
 */

/**
 * @param {ScoreRelevanceArgs} args
 * @returns {{ system: string, user: string }}
 */
export function scoreRelevancePrompt({ city, queryText, hits }) {
  const system = buildSystem({
    role: 'You are a relevance scorer for web search results about upcoming events.',
    task: `Given a city, a user query, and a list of search results (URL, title, snippet), score each result's relevance as a composite 0–1 number.`,
    rules: [
      '- Evaluate three signals and combine them into a single composite score:',
      '  1. **URL signal** (is this an event listing, venue, or ticketing page? Generic news/blog/social pages score lower).',
      '  2. **Title relevance** (does the title suggest upcoming events matching the query and city?).',
      '  3. **Snippet relevance** (does the snippet mention dates, venues, performers, or event details related to the query?).',
      '- A result that scores high on all three signals gets close to 1.0.',
      '- A result with a good URL but irrelevant title/snippet should still score low.',
      '- Score every result in the input — do not skip any.',
      '- When in doubt, round down rather than up.',
    ].join('\n'),
    inputFormat: [
      'The user message contains:',
      '  Line 1: City: <name>',
      '  Line 2: Query: <freeform query>',
      '  Then one block per result:',
      '  [<index>] <url>',
      '  Title: <title>',
      '  Snippet: <snippet or "(none)">',
    ].join('\n'),
  });

  const resultBlocks = hits.map((h, i) =>
    `[${i}] ${h.url}\nTitle: ${h.title}\nSnippet: ${h.snippet || '(none)'}`,
  );

  const user = [
    `City: ${city}`,
    `Query: ${queryText}`,
    '',
    ...resultBlocks,
  ].join('\n');

  return { system, user };
}
