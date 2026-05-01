/**
 * Environment access for eval scripts. The only thing eval scripts pull from
 * `process.env` is API keys — everything else lives in `eval/config.js`.
 * Run scripts under `node --env-file=.env.dev` to populate keys without
 * checking secrets into git.
 */

/**
 * Read an env var or throw a friendly message.
 *
 * @param {string} name
 * @returns {string}
 */
export function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `env var ${name} is required. Run with: node --env-file=.env.dev eval/scripts/<script>.js`,
    );
  }
  return v;
}
