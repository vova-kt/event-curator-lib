/**
 * @typedef {Object} ExtractEventsArgs
 * @property {string} city
 * @property {string} category
 * @property {{ from: string, to: string }} timeframe
 * @property {string} pageText
 * @property {string} sourceUrl
 */

/**
 * Build the extract-events prompt. The LLM returns a JSON object with `events: Event[]`.
 *
 * @param {ExtractEventsArgs} args
 * @returns {{ system: string, user: string }}
 */
export function extractEventsPrompt({ city, category, timeframe, pageText, sourceUrl }) {
  const system =
    'You extract structured upcoming events from web content. ' +
    'Return strict JSON. Skip past events, generic listings, or content that is not an event. ' +
    'If a single page describes multiple events, return all of them. If unsure, omit the event.';

  const user = [
    `City: ${city}`,
    `Category: ${category}`,
    `Timeframe: ${timeframe.from} to ${timeframe.to}`,
    `Source URL: ${sourceUrl}`,
    '',
    'Page content:',
    pageText.slice(0, 12_000),
    '',
    'Return JSON of shape:',
    '{ "events": [',
    '  { "title": string,',
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
  ].join('\n');

  return { system, user };
}
