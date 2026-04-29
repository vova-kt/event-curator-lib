/**
 * Levelled logger. Built from `config.logging.level` and `config.logging.file`
 * (see ./config.js). When `file` is set and we're running in Node, every call
 * additionally appends a JSON Lines record to that path regardless of level —
 * the file always captures debug-level detail. Browser silently skips file
 * output (no `node:fs`).
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

/** @type {((path: string, line: string) => void) | null} */
let appendLine = null;
if (typeof process !== 'undefined' && process.versions?.node) {
  try {
    const fs = await import('node:fs');
    appendLine = (path, line) => fs.appendFileSync(path, line);
  } catch {
    appendLine = null;
  }
}

/**
 * @param {unknown} a
 * @returns {unknown}
 */
function serializeArg(a) {
  if (a instanceof Error) return { name: a.name, message: a.message, stack: a.stack };
  return a;
}

/**
 * @param {string} path
 * @param {keyof typeof RANK} level
 * @param {unknown[]} args
 */
function writeFileLine(path, level, args) {
  if (!appendLine) return;
  let line;
  try {
    line = JSON.stringify({ ts: new Date().toISOString(), level, args: args.map(serializeArg) }) + '\n';
  } catch {
    line = JSON.stringify({ ts: new Date().toISOString(), level, args: args.map(String) }) + '\n';
  }
  try { appendLine(path, line); } catch { /* swallow — logging must not throw */ }
}

/**
 * @typedef {Object} Logger
 * @property {(...args: unknown[]) => void} error
 * @property {(...args: unknown[]) => void} warn
 * @property {(...args: unknown[]) => void} info
 * @property {(...args: unknown[]) => void} debug
 */

/**
 * @param {string} [level]
 * @param {string|null} [file]
 * @returns {Logger}
 */
export function createLogger(level = LogLevel.WARN, file = null) {
  const threshold = RANK[/** @type {keyof typeof RANK} */ (level)] ?? RANK.warn;
  const fileSink = file && appendLine ? file : null;

  /**
   * @param {keyof typeof RANK} method
   * @param {(...args: unknown[]) => void} consoleFn
   * @returns {(...args: unknown[]) => void}
   */
  const make = (method, consoleFn) => {
    const toConsole = RANK[method] <= threshold;
    if (!toConsole && !fileSink) return NOOP;
    if (toConsole && !fileSink) return consoleFn;
    if (!toConsole && fileSink) return (...args) => writeFileLine(fileSink, method, args);
    return (...args) => {
      consoleFn(...args);
      writeFileLine(/** @type {string} */ (fileSink), method, args);
    };
  };

  return {
    // eslint-disable-next-line no-console
    error: make('error', (...args) => console.error(...args)),
    // eslint-disable-next-line no-console
    warn:  make('warn',  (...args) => console.warn(...args)),
    // eslint-disable-next-line no-console
    info:  make('info',  (...args) => console.log(...args)),
    // eslint-disable-next-line no-console
    debug: make('debug', (...args) => console.log(...args)),
  };
}
