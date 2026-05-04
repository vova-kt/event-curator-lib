/**
 * DiscoverFilter stage: run discoverFilter strategies on search hits.
 * See docs/pipeline.md.
 */

import { ProgressStage, ProgressPhase } from '../core/progress.js';

/**
 * @param {import('../core/types.js').SearchHit[]} hits
 * @param {import('../core/types.js').Ctx} ctx
 * @param {import('../core/types.js').Query} query
 * @param {import('../core/types.js').RunOptions} [opts]
 * @returns {Promise<{ hits: import('../core/types.js').SearchHit[], usage: import('../core/types.js').LLMUsage }>}
 */
export async function searchRankSources(hits, ctx, query, opts) {
  const emit = opts?.onProgress ?? (() => {});
  const signal = opts?.signal;
  const log = ctx.logger;
  const strategies = ctx.strategies.searchQueriesEnhance ?? [];

  let inputTokens = 0;
  let outputTokens = 0;

  if (strategies.length === 0) {
    return { hits, usage: { inputTokens, outputTokens } };
  }

  emit({ stage: ProgressStage.SEARCH_ENHANCE, phase: ProgressPhase.START, total: hits.length });

  let filtered = hits;
  for (const strategy of strategies) {
    signal?.throwIfAborted();
    const before = filtered.length;
    try {
      const result = await strategy(filtered, ctx, query);
      filtered = result.hits;
      if (result.usage) {
        inputTokens += result.usage.inputTokens;
        outputTokens += result.usage.outputTokens;
      }
      log.debug(`[discoverFilter] ${strategy.name || 'strategy'}: ${before} → ${filtered.length}`);
    } catch (err) {
      log.warn('[discoverFilter] strategy failed:', err instanceof Error ? err.message : err);
    }
  }

  emit({ stage: ProgressStage.SEARCH_ENHANCE, phase: ProgressPhase.DONE, count: filtered.length });

  return { hits: filtered, usage: { inputTokens, outputTokens } };
}
