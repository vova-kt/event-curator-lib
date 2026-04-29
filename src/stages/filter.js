/**
 * Filter stage: applies configured strategies. See docs/pipeline.md.
 */

/**
 * @param {import('../core/types.js').Event[]} events
 * @param {import('../core/types.js').Ctx} ctx
 * @returns {Promise<import('../core/types.js').Event[]>}
 */
export async function filter(events, ctx) {
  let current = events;
  for (const strategy of ctx.strategies.filter) {
    try {
      current = await strategy(current, ctx);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[filter] strategy failed:`, err instanceof Error ? err.message : err);
    }
  }
  return current;
}
