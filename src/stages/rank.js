/**
 * Rank stage: applies configured strategies. Last one wins. See docs/pipeline.md.
 */

/**
 * @param {import('../core/types.js').Event[]} events
 * @param {import('../core/types.js').Ctx} ctx
 * @returns {Promise<import('../core/types.js').Event[]>}
 */
export async function rank(events, ctx) {
  let current = events;
  for (const strategy of ctx.strategies.rank) {
    try {
      current = await strategy(current, ctx);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[rank] strategy failed:`, err instanceof Error ? err.message : err);
    }
  }
  return current;
}
