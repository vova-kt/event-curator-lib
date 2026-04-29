/**
 * Rank stage: applies configured strategies. Last one wins. See docs/pipeline.md.
 */

/**
 * @param {import('../core/types.js').Event[]} events
 * @param {import('../core/types.js').Ctx} ctx
 * @returns {Promise<import('../core/types.js').Event[]>}
 */
export async function rank(events, ctx) {
  const log = ctx.logger;
  let current = events;
  for (const strategy of ctx.strategies.rank) {
    const before = current.length;
    try {
      current = await strategy(current, ctx);
      log.debug(`[rank] ${strategy.name || 'strategy'}: ${before} → ${current.length}`);
    } catch (err) {
      log.warn(`[rank] strategy failed:`, err instanceof Error ? err.message : err);
    }
  }
  return current;
}
