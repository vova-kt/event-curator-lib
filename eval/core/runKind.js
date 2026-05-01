/**
 * Eval run kinds. The literal value lands in `eval/runs/<slug>__<ts>.json`
 * under the `kind` field and is read by `promote-golden.js` to decide what
 * shape the run output has.
 */

/** @enum {string} */
export const RunKind = Object.freeze({
  EXTRACT: 'extract',
  EXPAND:  'expand',
  RANK:    'rank',
});
