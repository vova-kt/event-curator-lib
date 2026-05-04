import { llmExpand } from '../../../src/strategies/queryExpansion/index.js';
import { loadExpandGoldenFixture } from '../../core/fixtures.js';
import { writeRun } from '../../core/runs.js';
import { RunKind } from '../../core/runKind.js';
import { buildExpandCtx } from '../../core/ctx.js';
import { buildReport } from './report.js';

/** @typedef {import('./types.js').ExpandConfig} ExpandConfig */
/** @typedef {import('./types.js').RunResult} RunResult */

/**
 * @param {ExpandConfig} cfg
 * @param {{
 *   llm: import('../../../src/core/types.js').LLMAdapter,
 *   model: string, temperature: number, limit: number,
 *   promptSha: string, writeRunRecord: boolean,
 * }} opts
 * @returns {Promise<RunResult>}
 */
export async function runOne(cfg, { llm, model, temperature, limit, promptSha, writeRunRecord }) {
  const slug = `${model}-${cfg.query.queryText}-${cfg.query.city}`;
  const golden = loadExpandGoldenFixture(slug);

  const start = Date.now();
  const ctx = buildExpandCtx({
    query: cfg.query,
    llm,
    model,
    limit,
    temperature,
  });
  const queries = await llmExpand()(ctx);
  const elapsedMs = Date.now() - start;

  const report = buildReport({
    candidate: queries,
    golden: golden?.queries ?? null,
    expectedLanguages: cfg.expectedLanguages,
  });

  let runPath = null;
  if (writeRunRecord) {
    runPath = writeRun({
      slug,
      kind: RunKind.EXPAND,
      llm: { provider: 'openai', model, temperature },
      promptHashes: { 'expandQueries.js': promptSha },
      output: queries,
      report: report.data,
    });
  }

  return { config: cfg, slug, queries, golden, elapsedMs, report, runPath };
}
