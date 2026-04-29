/**
 * LLM-backed filter against user preferences.
 * No-op when there are no liked/disliked examples to learn from.
 */

import { filterByPreferencePrompt } from '../../prompts/filterByPreference.js';

/** @type {import('../../core/types.js').Strategy} */
export const preferenceLLM = async (events, ctx) => {
  const { liked, disliked, derivedTraits } = ctx.preference;
  if (events.length === 0) return events;
  if (liked.length === 0 && disliked.length === 0 && !derivedTraits) return events;

  const candidates = events.map((e) => ({
    id: e.id,
    title: e.title,
    category: e.category,
    venue: { name: e.venue.name, city: e.venue.city },
    startsAt: e.startsAt,
    subcategories: e.subcategories,
  }));

  const prompt = filterByPreferencePrompt({
    candidates,
    liked: liked.map((l) => ({ title: l.title, venue: l.venue, subcategories: l.subcategories })),
    disliked: disliked.map((d) => ({ title: d.title, venue: d.venue, subcategories: d.subcategories })),
    derivedTraits,
  });

  const resp = await ctx.llm.chat({
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    json: true,
    signal: ctx.signal,
  });

  const json = /** @type {{ keep?: string[] }} */ (resp.json ?? {});
  const keepIds = new Set(json.keep ?? []);
  // If the LLM produced nothing actionable, keep everything (conservative default).
  if (keepIds.size === 0) return events;
  return events.filter((e) => keepIds.has(e.id));
};
