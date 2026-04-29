/**
 * Dedupe stage: in-batch dedupe via configured strategies plus cross-session
 * dedupe via storage's `getSeenIds`. See docs/pipeline.md.
 */

/**
 * @param {import('../core/types.js').Event[]} events
 * @param {import('../core/types.js').Ctx} ctx
 * @returns {Promise<import('../core/types.js').Event[]>}
 */
export async function dedupe(events, ctx) {
  let current = events;
  for (const strategy of ctx.strategies.dedupe) {
    try {
      current = await strategy(current, ctx);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[dedupe] strategy failed:`, err instanceof Error ? err.message : err);
    }
  }
  // Cross-session: drop ids already curated.
  const seen = await ctx.storage.getSeenIds(current.map((e) => e.id));
  if (seen.size === 0) return current;
  return current.filter((e) => !seen.has(e.id));
}
