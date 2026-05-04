#!/usr/bin/env node
/**
 * One-shot example. See docs/examples.md.
 */

import { createCurator, DEFAULTS, EventState } from '../src/index.js';
import { memory } from '../src/adapters/storage/memory.js';
import { openai } from '../src/adapters/llm/openai.js';
import { tavily } from '../src/adapters/search/tavily.js';
import { stubLLM, stubSearch } from './_stubs.js';
import { mergeConfig } from '../src/core/config.js';
import { llmExpand } from '../src/strategies/queryExpansion/index.js';
import { brave } from '../src/adapters/search/brave.js';

const args = parseArgs(process.argv.slice(2));

if (!args.city || !args.query) {
  console.error(
    'Usage: node examples/script.js --city "berlin" --query "russian standup" --days 14 --maxQueries 2 --maxEvents 10 --guidance "no open mic" [--dry]',
  );
  process.exit(1);
}

let options = {
  dry: true,
  search: [stubSearch()],
  storage: memory(),
  llm: stubLLM(),
  maxEvents: Number(args.maxEvents ?? 10),
  maxQueries: Number(args.maxQueries ?? 1),
  timeframe: {
    rolling: { days: Number(args.days ?? 7) },
  },
  eventsModel: DEFAULTS.eventExtraction.model,
};

if (args.dry !== 'true' && args.dry !== '') {
  options = {
    ...options,
    dry: false,
    llm: openai({ apiKey: requireEnv('OPENAI_API_KEY') }),
    search: [
      brave({ apiKey: requireEnv('BRAVE_API_KEY') }),
      tavily({ apiKey: requireEnv('TAVILY_API_KEY') }),
    ],
  };
}

const curator = await createCurator({
  llm: options.llm,
  search: options.search,
  storage: options.storage,
  strategies: {
    queryExpansion: [llmExpand()],
  },
  config: mergeConfig(DEFAULTS, {
    search: {
      ...DEFAULTS.search,
      maxQueries: options.maxQueries,
    },
    eventExtraction: {
      ...DEFAULTS.eventExtraction,
      model: options.eventsModel,
    },
    pipeline: {
      ...DEFAULTS.pipeline,
      maxEvents: options.maxEvents,
    },
  }),
});

const { events } = await curator.curate({
  city: args.city,
  queryText: args.query,
  timeframe: options.timeframe,
  maxEvents: options.maxEvents,
  guidance: args.guidance,
});

if (events.length === 0) {
  console.log('(no events found)');
} else {
  for (const [i, e] of events.entries()) {
    const price = formatPrice(e.price);
    console.log(`[${i + 1}] ${e.deduplicationKey}${price ? ` – (${price})` : ''}`);
    if (e.rationale) console.log(`     ↳ ${e.rationale}`);
  }
  // The script prints every returned event in one shot, so all of them count
  // as "shown" — record that so cross-session dedupe (storage.getShownIds)
  // suppresses them on the next run.
  await curator.recordFeedback({
    ids: events.map((e) => e.id),
    state: EventState.SHOWN,
    ref: { city: args.city, queryText: args.query },
  });
}

await curator.close();

/**
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = '';
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

/**
 * @param {string} name
 */
function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

/**
 * @param {import("../src/core/types.js").EventPrice} [price]
 */
function formatPrice(price) {
  if (!price) return ''
  return price.free
    ? 'free'
    : price.min !== undefined
      ? `${price.min}${price.currency ? ' ' + price.currency : ''}`
      : '';
}
