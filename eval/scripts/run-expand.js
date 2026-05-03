#!/usr/bin/env node
/**
 * run-expand.js — the query-expansion eval.
 *
 * Calls the `llmExpand` strategy with a real LLM and renders metric reports
 * against `<slug>.expand-golden.json` when present.
 *
 * Two modes controlled by the GRID array:
 *   - **Single variation** (1 entry): detailed per-config reports, aggregate
 *     summary, run files, and a cost/usage footer — the daily prompt-iteration
 *     workflow.
 *   - **Grid sweep** (multiple entries): compact progress output followed by a
 *     cost/quality comparison table across all variations.
 *
 * Configure MODELS / TEMPERATURES / LIMITS below, then run:
 *   node --env-file=.env.dev eval/scripts/run-expand.js
 */

import { resolve } from 'node:path';
import { llmExpand } from '../../src/strategies/queryExpansion/index.js';
import { openai } from '../../src/adapters/llm/openai.js';
import { withTracking } from '../../src/adapters/llm/tracking.js';
import { calculateCost } from '../../src/core/pricing.js';
import { requireEnv } from '../core/env.js';
import { loadExpandGoldenFixture } from '../core/fixtures.js';
import { writeRun, gitShaOf } from '../core/runs.js';
import { RunKind } from '../core/runKind.js';
import { buildExpandCtx } from '../core/ctx.js';
import {
  goldenQueryCoverage,
  queryDiversity,
  constraintCompliance,
  expectedLanguageCoverage,
} from '../core/metrics.js';
import { hasMonthYearAnchor, hasBadTimeRef } from '../core/queryHeuristics.js';
import { ratio, compose } from '../core/report.js';


/**
 * @param {number} startOffsetDays
 * @param {number} windowDays
 */
function timeframeOf(startOffsetDays, windowDays) {
  const from = new Date(Date.now() + startOffsetDays * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + (startOffsetDays + windowDays) * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

/**
 * @typedef {{
 *   query: { queryText: string, city: string, timeframe: { from: string, to: string } },
 *   expectedLanguages: string[],
 * }} ExpandConfig
 */

/**
 * @typedef {{ model: string, temperature: number, limit: number }} Variation
 */

/* ------------------------------------------------------------------ */
/*  Grid — edit to sweep across model / temperature / limit            */
/* ------------------------------------------------------------------ */

const MODELS = ['gpt-5.4-nano', 'gpt-5.4-mini', 'gpt-5.4'];
const TEMPERATURES = [0.0, 0.3, 0.7];
const LIMITS = [5, 8, 12];

/** @type {Variation[]} */
const GRID = MODELS.flatMap((model) =>
  TEMPERATURES.flatMap((temperature) =>
    LIMITS.map((limit) => ({ model, temperature, limit })),
  ),
);

/* ------------------------------------------------------------------ */
/*  Query configs                                                      */
/* ------------------------------------------------------------------ */

/** @type {ExpandConfig[]} */
const configs = [
  {
    query: { queryText: 'russian standup', city: 'berlin', timeframe: timeframeOf(0, 30) },
    expectedLanguages: ['rus', 'deu', 'eng'],
  },
  {
    query: { queryText: 'jazz concert', city: 'new york', timeframe: timeframeOf(0, 7) },
    expectedLanguages: ['eng'],
  },
  {
    query: { queryText: 'tech meetup ai', city: 'san francisco', timeframe: timeframeOf(0, 14) },
    expectedLanguages: ['eng'],
  },
  {
    query: { queryText: 'contemporary art exhibition', city: 'paris', timeframe: timeframeOf(7, 120) },
    expectedLanguages: ['fra', 'eng'],
  },
  {
    query: { queryText: 'street food festival', city: 'bangkok', timeframe: timeframeOf(0, 21) },
    expectedLanguages: ['tha', 'eng'],
  },
  {
    query: { queryText: 'startup pitch night', city: 'london', timeframe: timeframeOf(0, 75) },
    expectedLanguages: ['eng'],
  },
  {
    query: { queryText: 'marathon half-marathon', city: 'tokyo', timeframe: timeframeOf(14, 90) },
    expectedLanguages: ['jpn', 'eng'],
  },
  {
    query: { queryText: 'indie film screening', city: 'amsterdam', timeframe: timeframeOf(0, 14) },
    expectedLanguages: ['nld', 'eng'],
  },
  {
    query: { queryText: 'yoga retreat weekend', city: 'lisbon', timeframe: timeframeOf(7, 45) },
    expectedLanguages: ['por', 'eng'],
  },
  {
    query: { queryText: 'salsa bachata social', city: 'barcelona', timeframe: timeframeOf(0, 10) },
    expectedLanguages: ['spa', 'cat', 'eng'],
  },
];


/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

try {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const promptPath = resolve(
    new URL('../../src/prompts/expandQueries.js', import.meta.url).pathname,
  );
  const promptSha = gitShaOf(promptPath);
  const isGrid = GRID.length > 1;

  if (isGrid) {
    console.log(`expand grid eval — ${GRID.length} variations × ${configs.length} configs = ${GRID.length * configs.length} LLM calls\n`);
  } else {
    console.log(`expand eval — ${configs.length} config(s)\n`);
  }

  /**
   * @typedef {{
   *   variation: Variation,
   *   results: RunResult[],
   *   elapsedMs: number,
   *   usage: import('../../src/adapters/llm/tracking.js').UsageStats,
   *   cost: import('../../src/core/pricing.js').CostBreakdown | null,
   * }} VariationResult
   */

  /** @type {VariationResult[]} */
  const variationResults = [];

  for (const variation of GRID) {
    const { model, temperature, limit } = variation;
    const tracker = withTracking(openai({ apiKey, model }));

    if (isGrid) {
      process.stdout.write(`  ${model} t=${temperature} l=${limit} ...`);
    }

    const start = Date.now();
    const results = await Promise.all(
      configs.map(async (cfg) => {
        try {
          return await runOne(cfg, {
            llm: tracker.llm,
            model,
            temperature,
            limit,
            promptSha,
            writeRunRecord: !isGrid,
          });
        } catch (err) {
          if (!isGrid) throw err;
          return /** @type {RunResult} */ ({
            config: cfg,
            slug: `${model}-${cfg.query.queryText}-${cfg.query.city}`,
            queries: [],
            golden: null,
            elapsedMs: 0,
            report: null,
            runPath: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
    const elapsedMs = Date.now() - start;
    const usage = tracker.usage();
    const cost = calculateCost(model, {
      inputTokens: usage.totalInput,
      outputTokens: usage.totalOutput,
    });

    if (isGrid) {
      const errors = results.filter((r) => r.error).length;
      console.log(` ${(elapsedMs / 1000).toFixed(1)}s ${errors ? errors + ' errors' : 'ok'}`);
    }

    variationResults.push({ variation, results, elapsedMs, usage, cost });
  }

  if (!isGrid) {
    const { variation, results, usage, cost } = variationResults[0];
    for (const r of results) {
      console.log(`=== ${r.slug} ===`);
      console.log(`model: ${variation.model}  city: ${r.config.query.city}  query: "${r.config.query.queryText}"  timeframe: ${r.config.query.timeframe.from}→${r.config.query.timeframe.to}`);
      console.log(`expanded to ${r.queries.length} queries in ${(r.elapsedMs / 1000).toFixed(1)}s`);
      console.log('\n' + r.report.text + '\n');
      console.log(`run saved: ${r.runPath}`);
      if (!r.golden) {
        console.log(
          `\nno golden file yet. Hand-curate a list of must-have phrasings, save as ` +
            `eval/fixtures/${r.slug}.expand-golden.json with shape ` +
            `{ "slug": "${r.slug}", "queries": [...] }.`,
        );
      }
      console.log();
    }

    if (results.length > 1) {
      console.log('=== aggregate (' + results.length + ' configs) ===');
      console.log(buildAggregateReport(results) + '\n');
    }

    console.log(`usage: ${usage.totalInput} input + ${usage.totalOutput} output tokens, ${usage.calls} calls`);
    if (cost) {
      console.log(`cost: $${cost.totalCost.toFixed(4)} (input: $${cost.inputCost.toFixed(4)}, output: $${cost.outputCost.toFixed(4)})`);
    }
  } else {
    console.log('\n' + renderGridReport(variationResults));
  }
} catch (err) {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
}


/* ------------------------------------------------------------------ */
/*  Per-config runner                                                  */
/* ------------------------------------------------------------------ */

/**
 * @typedef {{
 *   config: ExpandConfig, slug: string, queries: string[],
 *   golden: { queries: string[] } | null, elapsedMs: number,
 *   report: ReturnType<typeof buildReport> | null,
 *   runPath: string | null,
 *   error?: string,
 * }} RunResult
 */

/**
 * @param {ExpandConfig} cfg
 * @param {{
 *   llm: import('../../src/core/types.js').LLMAdapter,
 *   model: string, temperature: number, limit: number,
 *   promptSha: string, writeRunRecord: boolean,
 * }} opts
 * @returns {Promise<RunResult>}
 */
async function runOne(cfg, { llm, model, temperature, limit, promptSha, writeRunRecord }) {
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


/* ------------------------------------------------------------------ */
/*  Per-config report                                                  */
/* ------------------------------------------------------------------ */

/**
 * @param {{ candidate: string[], golden: string[] | null, expectedLanguages: string[] }} args
 */
function buildReport({ candidate, golden, expectedLanguages }) {
  const div = queryDiversity(candidate);
  const cc = constraintCompliance(candidate);
  const lc = expectedLanguageCoverage(candidate, expectedLanguages);
  const cov = golden ? goldenQueryCoverage(golden, candidate) : null;
  const monthYearCount = candidate.filter(hasMonthYearAnchor).length;
  const badTimeRefs = candidate.filter(hasBadTimeRef);

  const sections = [
    'metrics',
    cov
      ? ratio('golden coverage', cov.matched.length, cov.goldenCount)
      : 'golden coverage: (no golden fixture)',
    `diversity (avg pairwise token-Jaccard distance, ${div.pairs} pairs)\n` +
      `  avg=${div.avgDistance.toFixed(3)}  min=${div.minDistance.toFixed(3)}`,
    `constraint compliance (${cc.total} queries)\n` +
      [
        ratio('  too long (>80c)',     cc.tooLong.length,     cc.total),
        ratio('  boolean operators',   cc.booleanOps.length,  cc.total),
        ratio('  quoted phrases',      cc.quoted.length,      cc.total),
        ratio('  site: filters',       cc.siteFilter.length,  cc.total),
        ratio('  duplicates',          cc.duplicates.length,  cc.total),
      ].join('\n'),
    `language coverage (expected: ${expectedLanguages.join(', ')})\n` +
      [
        ratio('  in expected', lc.matched, lc.total),
        ratio('  unexpected',  lc.unexpected, lc.total),
        ...Object.entries(lc.distribution).map(([k, n]) => ratio(`  ${k}`, n, lc.total)),
      ].join('\n'),
    ratio('month-year anchored', monthYearCount, candidate.length),
    badTimeRefs.length > 0
      ? `BAD time refs (specific dates / day-of-week / relative day — should be 0):\n` +
        badTimeRefs.map((q) => `  ! ${q}`).join('\n')
      : 'specific-date/day-of-week refs: none (good)',
    queryList('output queries', candidate),
    cov && cov.unmatchedGolden.length > 0
      ? queryList('unmatched golden (missed phrasings)', cov.unmatchedGolden.map((i) => golden[i]))
      : null,
  ];

  return {
    text: compose(sections),
    data: {
      diversity: div,
      constraintCompliance: cc,
      languageCoverage: lc,
      monthYearCount,
      badTimeRefCount: badTimeRefs.length,
      ...(cov ? { goldenCoverage: cov } : {}),
    },
  };
}


/* ------------------------------------------------------------------ */
/*  Aggregate report (single-variation mode)                           */
/* ------------------------------------------------------------------ */

/**
 * @param {RunResult[]} results
 */
function buildAggregateReport(results) {
  const n = results.length;
  const totalQueries = sum(results.map((r) => r.queries.length));
  const avgPerConfig = totalQueries / n;

  const withGolden = results.filter((r) => r.report?.data.goldenCoverage);
  const avgCoverage = withGolden.length === 0
    ? null
    : avg(withGolden.map((r) => r.report.data.goldenCoverage.coverage));

  const avgDiversity = avg(results.map((r) => r.report?.data.diversity.avgDistance ?? 0));
  const minDiversity = Math.min(...results.map((r) => r.report?.data.diversity.minDistance ?? 1));

  const totalViolations = sum(results.map((r) => r.report ? violationCount(r.report.data.constraintCompliance) : 0));
  const totalBadTime = sum(results.map((r) => r.report?.data.badTimeRefCount ?? 0));
  const totalMonthYear = sum(results.map((r) => r.report?.data.monthYearCount ?? 0));
  const avgLangCoverage = avg(results.map((r) => r.report?.data.languageCoverage.coverage ?? 0));

  const perConfig = results
    .map((r) => {
      const cov = r.report?.data.goldenCoverage;
      const v = r.report ? violationCount(r.report.data.constraintCompliance) : 0;
      return (
        `  - ${r.slug}` +
        `  n=${r.queries.length}` +
        `  cov=${cov ? cov.coverage.toFixed(3) : 'n/a'}` +
        `  div=${(r.report?.data.diversity.avgDistance ?? 0).toFixed(3)}` +
        `  viol=${v}` +
        `  badTime=${r.report?.data.badTimeRefCount ?? 0}`
      );
    })
    .join('\n');

  const sections = [
    `totals\n` +
      `  configs:           ${n}\n` +
      `  total queries:     ${totalQueries}\n` +
      `  avg queries/config: ${avgPerConfig.toFixed(1)}`,
    `quality (averages)\n` +
      (avgCoverage === null
        ? `  golden coverage:   (no golden fixtures)\n`
        : `  golden coverage:   ${avgCoverage.toFixed(3)}  (${withGolden.length}/${n} have golden)\n`) +
      `  diversity avg:     ${avgDiversity.toFixed(3)}\n` +
      `  diversity min:     ${minDiversity.toFixed(3)}\n` +
      `  language coverage: ${avgLangCoverage.toFixed(3)}`,
    `violations (totals across all configs)\n` +
      `  constraint:        ${totalViolations}\n` +
      `  bad time refs:     ${totalBadTime}\n` +
      `  month-year anchored: ${totalMonthYear}/${totalQueries}`,
    `per-config\n${perConfig}`,
  ];

  return compose(sections);
}


/* ------------------------------------------------------------------ */
/*  Grid report (multi-variation mode)                                 */
/* ------------------------------------------------------------------ */

/**
 * @param {VariationResult[]} all
 */
function renderGridReport(all) {
  const hdr =
    'model             temp  limit  queries  diversity  langCov  violations  badTime  inTok     outTok    cost$     time';
  const sep = '-'.repeat(hdr.length);
  const rows = all.map((v) => {
    const ok = v.results.filter((r) => !r.error);
    const avgQueries = ok.length === 0 ? 0 : ok.reduce((s, r) => s + r.queries.length, 0) / ok.length;
    const avgDiv = ok.length === 0 ? 0 : ok.reduce((s, r) => s + (r.report?.data.diversity.avgDistance ?? 0), 0) / ok.length;
    const avgLang = ok.length === 0 ? 0 : ok.reduce((s, r) => s + (r.report?.data.languageCoverage.coverage ?? 0), 0) / ok.length;
    const totalViol = ok.reduce((s, r) => s + (r.report ? violationCount(r.report.data.constraintCompliance) : 0), 0);
    const totalBad = ok.reduce((s, r) => s + (r.report?.data.badTimeRefCount ?? 0), 0);
    const errors = v.results.filter((r) => r.error).length;
    const errSuffix = errors > 0 ? `  (${errors} err)` : '';
    const costStr = v.cost ? v.cost.totalCost.toFixed(4) : 'n/a';

    return [
      v.variation.model.padEnd(18),
      v.variation.temperature.toFixed(1).padStart(4),
      String(v.variation.limit).padStart(6),
      avgQueries.toFixed(1).padStart(8),
      avgDiv.toFixed(3).padStart(10),
      avgLang.toFixed(3).padStart(8),
      String(totalViol).padStart(11),
      String(totalBad).padStart(8),
      String(v.usage.totalInput).padStart(9),
      String(v.usage.totalOutput).padStart(9),
      costStr.padStart(9),
      (v.elapsedMs / 1000).toFixed(1).padStart(7) + 's' + errSuffix,
    ].join('');
  });

  const totalCost = all.reduce((s, v) => s + (v.cost?.totalCost ?? 0), 0);
  const totalTime = all.reduce((s, v) => s + v.elapsedMs, 0);
  const totalIn = all.reduce((s, v) => s + v.usage.totalInput, 0);
  const totalOut = all.reduce((s, v) => s + v.usage.totalOutput, 0);

  return [
    `expand grid eval — ${all.length} variations × ${configs.length} configs\n`,
    sep,
    hdr,
    sep,
    ...rows,
    sep,
    `totals: ${totalIn} input + ${totalOut} output tokens, $${totalCost.toFixed(4)}, ${(totalTime / 1000).toFixed(1)}s`,
    '',
    renderInsights(all),
  ].join('\n');
}

/**
 * @param {VariationResult[]} all
 */
function renderInsights(all) {
  const scored = all
    .filter((v) => v.results.every((r) => !r.error))
    .map((v) => {
      const ok = v.results;
      const avgDiv = ok.reduce((s, r) => s + (r.report?.data.diversity.avgDistance ?? 0), 0) / ok.length;
      const avgLang = ok.reduce((s, r) => s + (r.report?.data.languageCoverage.coverage ?? 0), 0) / ok.length;
      const totalViol = ok.reduce((s, r) => s + (r.report ? violationCount(r.report.data.constraintCompliance) : 0), 0);
      const totalBad = ok.reduce((s, r) => s + (r.report?.data.badTimeRefCount ?? 0), 0);
      const quality = avgDiv * 0.4 + avgLang * 0.4 - totalViol * 0.05 - totalBad * 0.05;
      return { v, avgDiv, avgLang, totalViol, totalBad, quality };
    });

  if (scored.length === 0) return 'no error-free variations to rank';

  scored.sort((a, b) => b.quality - a.quality);
  const best = scored[0];
  const cheapest = scored.reduce((a, b) => (a.v.cost?.totalCost ?? Infinity) < (b.v.cost?.totalCost ?? Infinity) ? a : b);

  const tag = (s) => `${s.v.variation.model} t=${s.v.variation.temperature} l=${s.v.variation.limit}`;

  const lines = [
    'insights',
    `  best quality:  ${tag(best)}  (div=${best.avgDiv.toFixed(3)} lang=${best.avgLang.toFixed(3)} viol=${best.totalViol} bad=${best.totalBad})  $${(best.v.cost?.totalCost ?? 0).toFixed(4)}`,
    `  cheapest:      ${tag(cheapest)}  $${(cheapest.v.cost?.totalCost ?? 0).toFixed(4)}  (div=${cheapest.avgDiv.toFixed(3)} lang=${cheapest.avgLang.toFixed(3)} viol=${cheapest.totalViol})`,
  ];

  if (best !== cheapest && best.v.cost && cheapest.v.cost) {
    const costDelta = best.v.cost.totalCost - cheapest.v.cost.totalCost;
    const qualDelta = best.quality - cheapest.quality;
    lines.push(`  quality premium: +$${costDelta.toFixed(4)} for +${qualDelta.toFixed(3)} quality score`);
  }

  return lines.join('\n');
}


/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** @param {ReturnType<typeof constraintCompliance>} cc */
function violationCount(cc) {
  return cc.tooLong.length + cc.booleanOps.length + cc.quoted.length +
    cc.siteFilter.length + cc.duplicates.length;
}

/** @param {number[]} a */
function sum(a) {
  return a.reduce((x, y) => x + y, 0);
}

/** @param {number[]} a */
function avg(a) {
  return a.length === 0 ? 0 : sum(a) / a.length;
}

/**
 * @param {string} title
 * @param {string[]} queries
 */
function queryList(title, queries) {
  if (queries.length === 0) return `${title}: none`;
  return `${title}:\n` + queries.map((q) => `  - ${q}`).join('\n');
}
