import { buildSystem } from './_system.js';

/** @type {Record<string, unknown>} */
export const extractEventsSchema = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Performer/group name; append program suffix after a dash when source mentions one',
          },
          description: {
            type: 'string',
            description: 'Single sentence in the query language summarising the event',
          },
          venue: {
            type: 'object',
            description: 'Venue location details, "unknown" if data is missing',
            properties: {
              name: {
                type: 'string',
              },
              address: {
                type: 'string',
              },
              city: {
                type: 'string',
              },
            },
            required: ['name', 'address', 'city'],
            additionalProperties: false,
          },
          startsAt: {
            type: 'string',
            description: 'ISO 8601 datetime.',
          },
          endsAt: {
            type: 'string',
            description: 'ISO 8601 datetime.',
          },
          occurrences: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'All ISO 8601 dates within timeframe for recurring events;',
          },
          deduplicationKey: {
            type: 'string',
            description: '"artist name, venue name, dd-mm-yy" — lowercase English, ASCII-transliterated.',
          },
          reason: {
            type: 'string',
            description: 'Chain-of-thought reasoning about how well this event matches the query.',
          },
          score: {
            type: 'object',
            description:
              'Event relevance scores in 0-10 range based on query intent, location, timeframe, language intent, and event quality.',
            properties: {
              queryIntent: {
                type: 'integer',
              },
              location: {
                type: 'integer',
              },
              timeframe: {
                type: 'integer',
              },
              languageIntent: {
                type: 'integer',
              },
              quality: {
                type: 'integer',
              },
            },
            required: [
              'queryIntent',
              'location',
              'timeframe',
              'languageIntent',
              'quality',
            ],
            additionalProperties: false,
          },
          source: {
            type: 'object',
            description: 'Information about the web source of the event data.',
            properties: {
              name: {
                type: 'string',
              },
              url: {
                type: 'string',
              },
            },
            required: ['name', 'url'],
            additionalProperties: false,
          },
          price: {
            type: 'object',
            properties: {
              currency: {
                type: 'string',
              },
              min: {
                type: 'number',
              },
              max: {
                type: 'number',
              },
              free: {
                type: 'boolean',
              },
            },
            required: ['currency', 'min', 'max', 'free'],
            additionalProperties: false,
          },
        },
        required: [
          'title',
          'description',
          'startsAt',
          'venue',
          'deduplicationKey',
          'reason',
          'score',
          'source',
        ],
        additionalProperties: true,
      },
    },
  },
  additionalProperties: false,
  required: ['events'],
};

/**
 * @typedef {Object} ExtractPage
 * @property {string} sourceName
 * @property {string} sourceUrl
 * @property {string} pageText
 */

/**
 * @typedef {Object} ExtractEventsArgs
 * @property {string} city
 * @property {string} queryText
 * @property {{ from: string, to: string }} timeframe
 * @property {string[]} expandedQueries
 * @property {ExtractPage[]} pages
 */

/**
 * Build the extract-events prompt. The LLM receives one or more pages in a
 * single request and returns a JSON object with `events: Event[]`, where each
 * event echoes back the `source.name` and `source.url` of the page it was
 * extracted from.
 *
 * Page text can be large, so this prompt applies the long-input exception
 * documented in docs/prompts.md: the bulk `<pages>` block sits at the
 * top of the user message, with the short query recap at the bottom.
 *
 * @param {ExtractEventsArgs} args
 * @returns {{ system: string, user: string }}
 */
export function extractEventsPrompt({
  city,
  queryText,
  timeframe,
  expandedQueries,
  pages,
}) {
  const system = buildSystem({
    role: 'You extract structured upcoming events from web content.',
    task: [
      'Read the supplied pages and return the events they describe as JSON. ' +
        'A single request may include multiple pages — return events from all of them. ' +
        'If a single page describes multiple events, return all of them.',
    ].join('\n'),
    rules: [
      "- Return ALL events found in the pages whose startsAt is within the user's Timeframe.",
      '- "title": (REQUIRED) use the performer\'s or group\'s name exactly as it appears in the source. ' +
        'If the source mentions a current program — a tour name, album name, residency, or show title — append it after a dash ' +
        '(e.g. "Radiohead – In Rainbows Tour", "DJ Shadow – Rebuild / Destroy Tour"). ' +
        'Omit the program suffix when the source does not mention one. ' +
        'Do NOT append the venue, date, or city.',
      '- "deduplicationKey": (REQUIRED) a strict lowercase English deduplication string in exact format: "artist name, venue name, dd-mm-yy". ' +
        'Use the primary performer or artist name only (no tour/program suffix), ' +
        'the venue short name, and the event date as dd-mm-yy. ' +
        'All lowercase, ASCII-transliterated, comma-separated. ' +
        'Example: "radiohead, columbiahalle, 15-06-26".',
      '- "description" (REQUIRED) must be a single sentence in the same language the user wrote their Query in. Summarise what the event is, do not repeat the title.',
      '- "score" (REQUIRED) object with five 0–10 integer dimensions: ' +
        "queryIntent (how well the event matches the query's vibe/intent without relevance to dates or location), " +
        'location (relevance to queried location), ' +
        'dates (relevance to queried timeframe), ' +
        'languageIntent (relevance to requested language or 10 if no language specified). ' +
        'quality (big artists, unique events, lifetime opportunities have bigger score; recurring, amateur events have less). ' +
        '- Use the original Query and the Expanded Queries list to judge relevance across different phrasings and languages.',
      '- Do NOT filter by relevancy — return every event you find, even low-scoring ones. Downstream stages will decide what to keep.',
      '- Do not invent details. Leave fields out rather than guess.',
      '- For each event, set source.name and source.url to the SOURCE_NAME and SOURCE_URL of the page it was extracted from, copied verbatim. ' +
        'Never substitute another URL mentioned inside the page content. If one page yields multiple events, every event repeats the same source.',
      '- Recurring events: return ONE object per recurring event, not one per date. ' +
        'Set startsAt to the earliest occurrence within the Timeframe and list every occurrence ' +
        'that falls within the Timeframe in the "occurrences" array (ISO 8601 datetimes, chronologically sorted). ' +
        'Omit "occurrences" for one-off events.',
      '- If unsure whether something is an event, give it small score on "queryIntent"',
    ].join('\n'),
    inputFormat: [
      'The user message contains, in order:',
      '  1. A <pages> block holding one or more <page> entries. Each <page> has:',
      '       <source_name>opaque adapter id; echo verbatim</source_name>',
      '       <source_url>page url; echo verbatim</source_url>',
      '       <content>raw page text</content>',
      "  2. A <query> block with the user's preferences:",
      '       <city>...</city>',
      "       <text>user's freeform query</text>",
      '       <timeframe from="ISO" to="ISO" />',
      '  3. An optional <expanded_queries> block listing search variations derived from the original query, possibly in different languages. Use these as additional context when scoring relevancy.',
    ].join('\n'),
  });

  const pagesBlock = pages
    .map((p) =>
      [
        '  <page>',
        `    <source_name>${p.sourceName}</source_name>`,
        `    <source_url>${p.sourceUrl}</source_url>`,
        '    <content>',
        p.pageText,
        '    </content>',
        '  </page>',
      ].join('\n'),
    )
    .join('\n');

  const parts = [
    '<pages>',
    pagesBlock,
    '</pages>',
    '',
    '<query>',
    `  <city>${city}</city>`,
    `  <text>${queryText}</text>`,
    `  <timeframe from="${timeframe.from}" to="${timeframe.to}" />`,
    '</query>',
  ];

  if (expandedQueries && expandedQueries.length > 0) {
    parts.push('');
    parts.push('<expanded_queries>');
    for (const q of expandedQueries) {
      parts.push(`  <q>${q}</q>`);
    }
    parts.push('</expanded_queries>');
  }

  const user = parts.join('\n');

  return { system, user };
}
