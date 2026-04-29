/**
 * @typedef {Object} FilterByPreferenceArgs
 * @property {Array<{ id: string, title: string, category: string, venue: { name: string, city: string }, startsAt: string, subcategories?: string[] }>} candidates
 * @property {Array<{ title: string, venue: { name: string, city: string }, subcategories?: string[] }>} liked
 * @property {Array<{ title: string, venue: { name: string, city: string }, subcategories?: string[] }>} disliked
 * @property {string} [derivedTraits]
 */

/**
 * Drop events that don't match the user's preferences.
 *
 * @param {FilterByPreferenceArgs} args
 * @returns {{ system: string, user: string }}
 */
export function filterByPreferencePrompt({ candidates, liked, disliked, derivedTraits }) {
  const system =
    'You decide which events match a user, given examples of what they liked and disliked. ' +
    'Be conservative: when in doubt, keep the event. ' +
    'Return strict JSON listing the ids of events to KEEP.';

  const user = [
    derivedTraits ? `User traits: ${derivedTraits}` : null,
    '',
    'Liked examples:',
    JSON.stringify(liked, null, 2),
    '',
    'Disliked examples:',
    JSON.stringify(disliked, null, 2),
    '',
    'Candidate events:',
    JSON.stringify(candidates, null, 2),
    '',
    'Return JSON: { "keep": [id, id, ...] }',
  ]
    .filter((l) => l !== null)
    .join('\n');

  return { system, user };
}
