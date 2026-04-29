/**
 * @typedef {Object} RankByPreferenceArgs
 * @property {Array<{ id: string, title: string, category: string, venue: { name: string, city: string }, startsAt: string, subcategories?: string[] }>} candidates
 * @property {Array<{ title: string, venue: { name: string, city: string }, subcategories?: string[] }>} liked
 * @property {Array<{ title: string, venue: { name: string, city: string }, subcategories?: string[] }>} disliked
 * @property {string} [derivedTraits]
 */

/**
 * Rank candidates by likely user interest. Returns ordered ids and a per-event rationale.
 *
 * @param {RankByPreferenceArgs} args
 * @returns {{ system: string, user: string }}
 */
export function rankByPreferencePrompt({ candidates, liked, disliked, derivedTraits }) {
  const system =
    'You rank events by likelihood the user enjoys them, given prior likes and dislikes. ' +
    'Highest interest first. Return strict JSON.';

  const user = [
    derivedTraits ? `User traits: ${derivedTraits}` : null,
    '',
    'Liked examples:',
    JSON.stringify(liked, null, 2),
    '',
    'Disliked examples:',
    JSON.stringify(disliked, null, 2),
    '',
    'Candidates:',
    JSON.stringify(candidates, null, 2),
    '',
    'Return JSON of shape:',
    '{ "ranked": [ { "id": string, "rationale": string }, ... ] }',
    'Include every candidate id exactly once.',
  ]
    .filter((l) => l !== null)
    .join('\n');

  return { system, user };
}
