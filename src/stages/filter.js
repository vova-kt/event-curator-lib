/**
 * Filter stage: applies configured strategies. See docs/pipeline.md.
 */

/**
 * @param {import('../core/types.js').Event[]} events
 * @param {import('../core/types.js').Ctx} ctx
 * @returns {Promise<import('../core/types.js').Event[]>}
 */
export async function filter(events, ctx) {
  const log = ctx.logger;
  let current = events;
  for (const strategy of ctx.strategies.filter) {
    const before = current.length;
    try {
      current = await strategy(current, ctx);
      log.debug(`[filter] ${strategy.name || 'strategy'}: ${before} → ${current.length}`);
    } catch (err) {
      log.warn(`[filter] strategy failed:`, err instanceof Error ? err.message : err);
    }
  }
  return current;
}
