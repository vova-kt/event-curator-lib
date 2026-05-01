#!/usr/bin/env node
/**
 * fetch-search.js — manual one-shot.
 *
 * Runs a real search adapter against one or more queries and writes the results
 * to `eval/fixtures/<slug>.search.json`. The fixture freezes the timeframe and
 * query parameters so downstream eval scripts (run-extract, future run-rank)
 * are reproducible without re-hitting the search API.
 *
 * With `expand: null`, a single literal "<query> <city>" search is issued.
 * `expand: 'templates'` fans out via 4 deterministic phrasings (no LLM).
 * `expand: 'llm'` uses llmExpand (requires OPENAI_API_KEY). Results across
 * all queries are merged and deduplicated by URL before writing the fixture.
 *
 * Configure in [eval/config.js](../config.js) → `fetchSearch`. Run:
 *   node --env-file=.env.dev eval/scripts/fetch-search.js
 */

import { tavily } from '../../src/adapters/search/tavily.js';
import { firecrawl } from '../../src/adapters/search/firecrawl.js';
import { templates } from '../../src/strategies/queryExpansion/templates.js';
import { llmExpand } from '../../src/strategies/queryExpansion/llmExpand.js';
import { requireEnv } from '../core/env.js';
import { makeSlug } from '../core/slug.js';
import { writeSearchFixture } from '../core/fixtures.js';
import { buildExpandCtx } from '../core/ctx.js';
import { config } from '../config.js';

const { query: queryText, city, days, search: which, expand, model, maxResults, force } = config.fetchSearch;

try {
  const adapter = buildSearchAdapter(which);

  const today = new Date();
  const to = new Date(today);
  to.setUTCDate(to.getUTCDate() + days);
  const timeframe = { from: isoDate(today), to: isoDate(to) };

  const slug = makeSlug({ queryText, city, days, from: timeframe.from });

  let queries;
  if (expand) {
    const strategy = buildExpandStrategy(expand);
    const expandCtx = buildExpandCtx({
      query: { city, queryText, timeframe },
      ...(expand === 'llm' ? { apiKey: requireEnv('OPENAI_API_KEY'), model } : {}),
    });
    queries = await strategy(expandCtx);
    console.log(`expanded to ${queries.length} queries via ${expand}`);
  } else {
    queries = [`${queryText} ${city}`];
  }

  console.log(`fetching: adapter=${which} queries=${queries.length} max=${maxResults}`);
  const allHitsArrays = await Promise.all(queries.map((q) => adapter.search(q, { maxResults })));
  const seen = new Set();
  const hits = allHitsArrays.flat().filter((h) => {
    if (seen.has(h.url)) return false;
    seen.add(h.url);
    return true;
  });
  const totalRaw = allHitsArrays.reduce((s, a) => s + a.length, 0);
  console.log(`got ${hits.length} hits (${totalRaw} total, ${totalRaw - hits.length} deduped by url)`);

  const path = writeSearchFixture(
    {
      slug,
      query: { city, queryText },
      timeframe,
      fetchedAt: new Date().toISOString(),
      search: { adapter: which, queries },
      hits,
    },
    { force },
  );
  console.log(`wrote ${path}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

/**
 * @param {string} name
 * @returns {import('../../src/core/types.js').SearchAdapter}
 */
function buildSearchAdapter(name) {
  switch (name) {
    case 'tavily':
      return tavily({ apiKey: requireEnv('TAVILY_API_KEY') });
    case 'firecrawl':
      return firecrawl({ apiKey: requireEnv('FIRECRAWL_API_KEY') });
    default:
      throw new Error(`unknown search=${name} in config.fetchSearch; supported: tavily, firecrawl`);
  }
}

/**
 * @param {string} name
 * @returns {import('../../src/core/types.js').QueryExpansionStrategy}
 */
function buildExpandStrategy(name) {
  switch (name) {
    case 'templates':
      return templates();
    case 'llm':
      return llmExpand();
    default:
      throw new Error(`unknown expand=${name} in config.fetchSearch; supported: templates, llm`);
  }
}

/** @param {Date} d */
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
