/**
 * Playwright-backed search adapter — opt-in, heavy.
 *
 * Not bundled by default. Pass a `playwright` import in (dependency-injection)
 * so this file stays a no-op for users who don't need it.
 *
 * Usage:
 *   import { chromium } from 'playwright';
 *   import { playwright } from 'events-curator/adapters/search/playwright';
 *   const search = playwright({ chromium, searchEngineUrl: '...' });
 *
 * The shape of `searchEngineUrl` etc. depends on which engine you point it at.
 * This adapter is a stub that returns no results unless wired up.
 */

/**
 * @param {{
 *   chromium: { launch: (opts?: object) => Promise<{ newContext: () => Promise<unknown>, close: () => Promise<void> }> },
 *   searchEngineUrl?: string,
 * }} _opts
 * @returns {import('../../core/types.js').SearchAdapter}
 */
export function playwright(_opts) {
  return {
    name: 'playwright',
    async search(_query, _opts = {}) {
      // Intentionally empty: ship a working contract, leave the engine-specific
      // selector/extraction logic for the integrator. See docs/adapters.md.
      return [];
    },
  };
}
