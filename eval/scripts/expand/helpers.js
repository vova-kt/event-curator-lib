/**
 * @param {number} startOffsetDays
 * @param {number} windowDays
 */
export function timeframeOf(startOffsetDays, windowDays) {
  const from = new Date(Date.now() + startOffsetDays * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + (startOffsetDays + windowDays) * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

/** @param {ReturnType<typeof import('../../core/metrics.js').constraintCompliance>} cc */
export function violationCount(cc) {
  return cc.tooLong.length + cc.booleanOps.length + cc.quoted.length +
    cc.siteFilter.length + cc.duplicates.length;
}

/** @param {number[]} a */
export function sum(a) {
  return a.reduce((x, y) => x + y, 0);
}

/** @param {number[]} a */
export function avg(a) {
  return a.length === 0 ? 0 : sum(a) / a.length;
}

/**
 * @param {string} title
 * @param {string[]} queries
 */
export function queryList(title, queries) {
  if (queries.length === 0) return `${title}: none`;
  return `${title}:\n` + queries.map((q) => `  - ${q}`).join('\n');
}
