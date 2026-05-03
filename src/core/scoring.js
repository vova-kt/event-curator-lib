/**
 * Compute a single 0–10 overall relevancy score from multi-dimensional
 * EventScore fields and a weights object (from `config.scoring.weights`).
 *
 * Missing dimensions (e.g. `languageIntent` when no language was requested)
 * are skipped — their weight is excluded from the denominator so the result
 * stays on the same 0–10 scale.
 *
 * @param {Record<string, number | undefined | null>} score
 * @param {Record<string, number>} weights
 * @returns {number}
 */
export function overallScore(score, weights) {
  let weightedSum = 0;
  let weightSum = 0;
  for (const [dim, w] of Object.entries(weights)) {
    const v = score[dim];
    if (v == null) continue;
    weightedSum += v * w;
    weightSum += w;
  }
  return weightSum === 0 ? 0 : weightedSum / weightSum;
}
