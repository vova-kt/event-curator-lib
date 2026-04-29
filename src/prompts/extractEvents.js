/**
 * @typedef {Object} ExtractPage
 * @property {string} sourceUrl
 * @property {string} pageText
 */

/**
 * @typedef {Object} ExtractEventsArgs
 * @property {string} city
 * @property {string} category
 * @property {{ from: string, to: string }} timeframe
 * @property {ExtractPage[]} pages
 */

/**
 * Build the extract-events prompt. The LLM receives one or more pages in a
 * single request and returns a JSON object with `events: Event[]`, where each
 * event carries the `sourceUrl` of the page it was extracted from.
 *
 * @param {ExtractEventsArgs} args
 * @returns {{ system: string, user: string }}
 */
export function extractEventsPrompt({ city, category, timeframe, pages }) {
  const system =
    'You extract structured upcoming events from web content. ' +
    'Return strict JSON. Skip past events, generic listings, or content that is not an event. ' +
    'A single request may include multiple pages — return events from all of them, tagging each with its source URL. ' +
    'If a single page describes multiple events, return all of them. If unsure, omit the event.';

  const pagesBlock = pages
    .map((p, i) =>
      [
        `--- PAGE ${i + 1} ---`,
        `PAGE_INDEX: ${i + 1}`,
        `SOURCE_URL: ${p.sourceUrl}`,
        'CONTENT:',
        p.pageText,
      ].join('\n'),
    )
    .join('\n\n');

  const user = [
    `City: ${city}`,
    `Category: ${category}`,
    `Timeframe: ${timeframe.from} to ${timeframe.to}`,
    '',
    'Pages:',
    pagesBlock,
    '',
    'Return JSON of shape:',
    '{ "events": [',
    '  { "pageIndex": integer,  // 1-based, must equal the PAGE_INDEX of the page this event came from',
    '    "sourceUrl": string,   // must equal that page\'s SOURCE_URL (used to cross-check pageIndex)',
    '    "title": string,',
    '    "description": string?,',
    '    "startsAt": ISO 8601 datetime string,',
    '    "endsAt": ISO 8601 datetime string?,',
    '    "venue": { "name": string, "address": string?, "city": string, "country": string? },',
    '    "category": string,',
    '    "subcategories": string[]?,',
    '    "price": { "currency": string?, "min": number?, "max": number?, "free": boolean? }?',
    '  }',
    '] }',
    '',
    'Rules:',
    `- Only events whose startsAt is within the timeframe.`,
    `- Only events in or near "${city}".`,
    '- Omit any event you cannot date precisely (no "TBD", no "soon").',
    '- Do not invent details. Leave fields out rather than guess.',
    '- Set pageIndex and sourceUrl on each event to the PAGE_INDEX and SOURCE_URL of the page it was extracted from. If a page yields multiple events, repeat its pageIndex on each.',
  ].join('\n');

  return { system, user };
}
