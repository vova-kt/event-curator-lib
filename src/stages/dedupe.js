/**
 * Dedupe stage: in-batch dedupe via configured strategies plus cross-session
 * dedupe via storage's `getShownIds`. See docs/pipeline.md.
 */

/**
 * @param {import('../core/types.js').Event[]} events
 * @param {import('../core/types.js').Ctx} ctx
 * @returns {Promise<import('../core/types.js').Event[]>}
 */
export async function dedupe(events, ctx) {
  const log = ctx.logger;
  let current = events;
  for (const strategy of ctx.strategies.dedupe) {
    const before = current.length;
    try {
      current = await strategy(current, ctx);
      log.debug(`[dedupe] ${strategy.name || 'strategy'}: ${before} → ${current.length}`);
    } catch (err) {
      log.warn(`[dedupe] strategy failed:`, err instanceof Error ? err.message : err);
    }
  }
  // Cross-session: drop ids that have already been shown to the user in any
  // prior session (via storage.markShown). Events sitting in storage that were
  // never actually shown remain eligible to surface again.
  const shown = await ctx.storage.getShownIds(current.map((e) => e.id));
  if (shown.size === 0) return current;
  const out = current.filter((e) => !shown.has(e.id));
  log.debug(`[dedupe] cross-session: dropped ${current.length - out.length} already-shown events`);
  return out;
}
