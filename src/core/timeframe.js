/**
 * Timeframe resolution. Rolling windows resolve at call time.
 * See docs/pipeline.md.
 */

/**
 * @param {import('./types.js').Query['timeframe']} tf
 * @param {number} defaultRollingDays
 * @returns {{ from: string, to: string }}
 */
export function resolveTimeframe(tf, defaultRollingDays) {
  if ('rolling' in tf) {
    const anchor = tf.rolling.anchor ? new Date(tf.rolling.anchor) : new Date();
    const days = tf.rolling.days ?? defaultRollingDays;
    const to = new Date(anchor);
    to.setUTCDate(to.getUTCDate() + days);
    return { from: isoDate(anchor), to: isoDate(to) };
  }
  return { from: tf.from, to: tf.to };
}

/**
 * @param {Date} d
 */
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
