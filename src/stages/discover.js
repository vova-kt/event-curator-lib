/**
 * Discover stage: build search queries, fan across search adapters, return SearchHit[].
 * See docs/pipeline.md.
 */

/**
 * @param {import('../core/types.js').Ctx} ctx
 * @returns {Promise<import('../core/types.js').SearchHit[]>}
 */
export async function discover(ctx) {
  const queries = buildQueries(ctx);
  /** @type {import('../core/types.js').SearchHit[]} */
  const all = [];
  for (const adapter of ctx.search) {
    for (const q of queries) {
      try {
        const hits = await adapter.search(q, {
          maxResults: ctx.config.search.maxResultsPerAdapter,
          signal: ctx.signal,
        });
        all.push(...hits);
      } catch (err) {
        // One adapter or query failing should not kill discovery.
        // Surface via console so the operator notices.
        // eslint-disable-next-line no-console
        console.warn(`[discover] ${adapter.name} failed for "${q}":`, err instanceof Error ? err.message : err);
      }
    }
  }
  return dedupeByUrl(all);
}

/**
 * @param {import('../core/types.js').Ctx} ctx
 * @returns {string[]}
 */
function buildQueries(ctx) {
  const { city, category } = ctx.query;
  // Diverse phrasings improve recall across different sites.
  return [
    `${category} events in ${city}`,
    `upcoming ${category} ${city}`,
    `${category} schedule ${city}`,
    `live ${category} ${city} this month`,
  ];
}

/**
 * @param {import('../core/types.js').SearchHit[]} hits
 */
function dedupeByUrl(hits) {
  /** @type {Map<string, import('../core/types.js').SearchHit>} */
  const seen = new Map();
  for (const h of hits) {
    if (!seen.has(h.url)) seen.set(h.url, h);
  }
  return [...seen.values()];
}
