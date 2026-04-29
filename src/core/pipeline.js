/**
 * Pipeline orchestrator. See docs/pipeline.md.
 */

import { discover } from '../stages/discover.js';
import { extract } from '../stages/extract.js';
import { dedupe } from '../stages/dedupe.js';
import { filter } from '../stages/filter.js';
import { rank } from '../stages/rank.js';

/**
 * @param {import('./types.js').Ctx} ctx
 * @returns {Promise<import('./types.js').Event[]>}
 */
export async function runCuration(ctx) {
  const hits = await discover(ctx);
  let events = await extract(hits, ctx);
  events = await dedupe(events, ctx);
  events = await filter(events, ctx);
  events = await rank(events, ctx);
  const limit = ctx.query.limit ?? ctx.config.pipeline.defaultLimit;
  events = events.slice(0, limit);
  // Persist after slice so we only mark what we actually showed as "seen".
  if (events.length > 0) await ctx.storage.upsertEvents(events);
  return events;
}
