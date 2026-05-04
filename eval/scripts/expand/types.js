/**
 * Shared type definitions for the expand eval.
 */

/**
 * @typedef {{
 *   query: { queryText: string, city: string, timeframe: { from: string, to: string } },
 *   expectedLanguages: string[],
 * }} ExpandConfig
 */

/**
 * @typedef {{ model: string, temperature: number, limit: number }} Variation
 */

/**
 * @typedef {{
 *   config: ExpandConfig, slug: string, queries: string[],
 *   golden: { queries: string[] } | null, elapsedMs: number,
 *   report: import('./report.js').ExpandReport | null,
 *   runPath: string | null,
 *   error?: string,
 * }} RunResult
 */

/**
 * @typedef {{
 *   variation: Variation,
 *   results: RunResult[],
 *   elapsedMs: number,
 *   usage: import('../../../src/adapters/llm/tracking.js').UsageStats,
 *   cost: import('../../../src/core/pricing.js').CostBreakdown | null,
 * }} VariationResult
 */
