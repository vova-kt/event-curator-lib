/**
 * LLM-driven query expansion. One call covers timeframe phrasings, local-language variants,
 * and synonym diversity. Persisted via the storage KV table, keyed by (city, queryText, timeframe).
 *
 * Failure mode: in `config.dev` mode, the underlying error is re-thrown so misconfigurations
 * are loud during development. In prod (default), it logs a warning and falls back to the
 * `templates` strategy so a transient LLM hiccup doesn't reduce discovery to zero queries.
 */

import { expandQueriesPrompt, expandQueriesSchema } from '../../prompts/index.js';
import { structuredChat } from '../../core/structured.js';
import { resolveTimeframe } from '../../core/timeframe.js';
import { templates } from './templates.js';

const CACHE_PREFIX = 'qx:llmExpand:v2';

/**
 * @returns {import('../../core/types.js').SearchQueriesStrategy}
 */
export function searchQueriesExpand() {
  return async function llmExpandStrategy(ctx, query) {
    const cap = ctx.config.search.maxQueries;
    if (cap < 1) {
      return { queries: [query.queryText] };
    }
    const tf = resolveTimeframe(query.timeframe, ctx.config.pipeline.defaultRollingDays);
    const key = cacheKey(query.city, query.queryText, tf);

    const cached = await ctx.storage.getKV(key);
    if (cached) {
      const parsed = safeParseQueries(cached);
      if (parsed) return { queries: parsed.slice(0, cap) };
    }

    try {
      const prompt = expandQueriesPrompt({
        city: query.city,
        queryText: query.queryText,
        timeframe: tf,
        limit: cap,
      });
      const { data, usage } = await structuredChat(ctx.llm, {
        model: ctx.config.search.model,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        schema: expandQueriesSchema,
        temperature: ctx.config.search.temperature,
        maxTokens: ctx.config.search.maxTokens,
        maxRetries: ctx.config.llm.maxRetries,
      });
      const queries = sanitize(/** @type {{ queries?: unknown }} */ (data).queries);
      if (queries.length === 0) {
        throw new Error('LLM returned no usable queries');
      }
      const sliced = queries.slice(0, cap);
      await ctx.storage.setKV(key, JSON.stringify(sliced));
      return { queries: sliced, usage };
    } catch (err) {
      if (ctx.config.dev) throw err;
      ctx.logger.warn('[llmExpand] LLM failed, falling back to templates:', err instanceof Error ? err.message : err);
      return await templates()(ctx, query);
    }
  };
}

/**
 * @param {string} city
 * @param {string} queryText
 * @param {{ from: string, to: string }} tf
 */
function cacheKey(city, queryText, tf) {
  return `${CACHE_PREFIX}|${normalize(city)}|${normalize(queryText)}|${tf.from}|${tf.to}`;
}

/** @param {string} s */
function normalize(s) {
  return s.trim().toLowerCase();
}

/** @param {string} raw */
function safeParseQueries(raw) {
  try {
    const parsed = JSON.parse(raw);
    return sanitize(parsed);
  } catch {
    return null;
  }
}

/**
 * @param {unknown} v
 * @returns {string[]}
 */
function sanitize(v) {
  if (!Array.isArray(v)) return [];
  /** @type {string[]} */
  const out = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}
