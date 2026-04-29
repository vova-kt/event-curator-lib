/**
 * @typedef {Object} DedupeJudgeArgs
 * @property {Array<{ id: string, title: string, startsAt: string, venue: { name: string, city: string } }>} candidates
 */

/**
 * Ask the LLM to merge near-duplicate events.
 * Returns groups of ids that refer to the same real-world event.
 *
 * @param {DedupeJudgeArgs} args
 * @returns {{ system: string, user: string }}
 */
export function dedupeJudgePrompt({ candidates }) {
  const system =
    'You decide whether events are duplicates of one another (same real-world event listed twice). ' +
    'Different shows by the same artist on different nights are NOT duplicates. ' +
    'Return strict JSON.';

  const user = [
    'Candidate events:',
    JSON.stringify(candidates, null, 2),
    '',
    'Return JSON of shape:',
    '{ "groups": [ [id1, id2, ...], [id3], ... ] }',
    'Each group lists ids that refer to the same event. Singletons are allowed.',
  ].join('\n');

  return { system, user };
}
