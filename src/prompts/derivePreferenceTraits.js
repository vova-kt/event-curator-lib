/**
 * @typedef {Object} DerivePreferenceTraitsArgs
 * @property {Array<{ title: string, category: string, venue: { name: string, city: string }, startsAt: string, subcategories?: string[] }>} liked
 * @property {Array<{ title: string, category: string, venue: { name: string, city: string }, startsAt: string, subcategories?: string[] }>} disliked
 */

/**
 * Summarize liked / disliked examples into a one-line trait string used as
 * cheaper few-shot context for filter / rank prompts.
 *
 * @param {DerivePreferenceTraitsArgs} args
 * @returns {{ system: string, user: string }}
 */
export function derivePreferenceTraitsPrompt({ liked, disliked }) {
  const system =
    'You summarize a user\'s event preferences from examples in one short, dense line. ' +
    'Mention venue style, sub-genres, time-of-day, price band, and any clear avoidances. ' +
    'Return strict JSON.';

  const user = [
    'Liked:',
    JSON.stringify(liked, null, 2),
    '',
    'Disliked:',
    JSON.stringify(disliked, null, 2),
    '',
    'Return JSON: { "traits": string }   // one line, <= 200 chars',
  ].join('\n');

  return { system, user };
}
