/**
 * Levelled logger. Built from `config.logging.level` (see ./config.js).
 */

/** @enum {string} */
export const LogLevel = Object.freeze({
  SILENT: 'silent',
  ERROR:  'error',
  WARN:   'warn',
  INFO:   'info',
  DEBUG:  'debug',
});

const RANK = Object.freeze({
  silent: 0,
  error:  1,
  warn:   2,
  info:   3,
  debug:  4,
});

const NOOP = () => {};

/**
 * @typedef {Object} Logger
 * @property {(...args: unknown[]) => void} error
 * @property {(...args: unknown[]) => void} warn
 * @property {(...args: unknown[]) => void} info
 * @property {(...args: unknown[]) => void} debug
 */

/**
 * @param {string} [level]
 * @returns {Logger}
 */
export function createLogger(level = LogLevel.WARN) {
  const threshold = RANK[/** @type {keyof typeof RANK} */ (level)] ?? RANK.warn;
  /** @type {(method: keyof typeof RANK, fn: (...args: unknown[]) => void) => (...args: unknown[]) => void} */
  const gate = (method, fn) => (RANK[method] <= threshold ? fn : NOOP);
  return {
    // eslint-disable-next-line no-console
    error: gate('error', (...args) => console.error(...args)),
    // eslint-disable-next-line no-console
    warn:  gate('warn',  (...args) => console.warn(...args)),
    // eslint-disable-next-line no-console
    info:  gate('info',  (...args) => console.log(...args)),
    // eslint-disable-next-line no-console
    debug: gate('debug', (...args) => console.log(...args)),
  };
}
