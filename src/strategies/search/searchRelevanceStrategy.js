/**
 * discoverFilter strategy: score search hits for relevance via LLM,
 * then fetch full page content for the top N using Readability.
 * See docs/strategies.md.
 */

import { structuredChat } from '../../core/structured.js';
import {
  scoreRelevancePrompt,
  scoreRelevanceSchema,
} from '../../prompts/searchRelevance.js';

/**
 * @returns {import('../../core/types.js').SearchSourcesEnchanceStrategy}
 */
export function searchRelevanceStrategy() {
  return async function relevanceFetchImpl(hits, ctx, query) {
    if (hits.length === 0) return { hits };
    const cfg = ctx.config.searchEnhance;
    const log = ctx.logger;

    const prompt = scoreRelevancePrompt({
      city: query.city,
      queryText: query.queryText,
      hits: hits.map((h) => ({
        url: h.url,
        title: h.title,
        snippet: h.snippet?.substring(0, 1000) ?? 'none',
      })),
    });

    const { data, usage } = await structuredChat(ctx.llm, {
      model: cfg.model,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      schema: scoreRelevanceSchema,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      maxRetries: ctx.config.llm.maxRetries,
    });

    /** @type {{ index: number, score: number }[]} */
    const scores = data.scores ?? [];
    const scoreMap = new Map(scores.map((s) => [s.index, s.score]));
    const scored = hits
      .map((hit, i) => ({ hit, score: scoreMap.get(i) ?? 0 }))
      .filter((s) => s.score >= cfg.relevanceThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, cfg.maxFetch);

    log.debug(
      `[relevanceFetch] ${hits.length} → ${scored.length} after threshold=${cfg.relevanceThreshold} + top-${cfg.maxFetch}`,
    );

    const enriched = await fetchContent(
      scored.map((s) => s.hit),
      log,
    );
    return { hits: enriched, usage };
  };
}

const FETCH_TIMEOUT_MS = 10_000;

/**
 * @param {import('../../core/types.js').SearchHit[]} hits
 * @param {import('../../core/logger.js').Logger} log
 * @returns {Promise<import('../../core/types.js').SearchHit[]>}
 */
async function fetchContent(hits, log) {
  const { Readability } = await import('@mozilla/readability');
  const { parseHTML } = await import('linkedom');

  const settled = await Promise.allSettled(
    hits.map(async (hit) => {
      const res = await fetch(hit.url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; events-curator/0.1)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const { document } = parseHTML(html);
      const article = new Readability(document).parse();
      return { ...hit, content: article?.textContent ?? hit.content };
    }),
  );

  return settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    log.warn(
      `[relevanceFetch] fetch failed for ${hits[i].url}: ${r.reason instanceof Error ? r.reason.message : r.reason}`,
    );
    return hits[i];
  });
}
