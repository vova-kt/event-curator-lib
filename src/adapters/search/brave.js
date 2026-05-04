/**
 * Brave Web Search adapter. Uses fetch against the Brave Search API.
 * See docs/adapters.md.
 */

import { DEFAULTS } from '../../core/config.js';

/**
 * @param {{ apiKey: string, endpoint?: string }} opts
 * @returns {import('../../core/types.js').SearchAdapter}
 */
export function brave({ apiKey, endpoint = 'https://api.search.brave.com/res/v1/web/search' }) {
  return {
    name: 'brave',
    async search(query, opts = {}) {
      const count = DEFAULTS.search.maxQueries;
      const url = new URL(endpoint);
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(Math.min(count, 20)));

      const resp = await fetch(url, {
        headers: {
          accept: 'application/json',
          'x-subscription-token': apiKey,
        },
        signal: opts.signal,
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`brave ${resp.status}: ${detail}`);
      }
      const data = /** @type {{ web?: { results?: Array<{ url: string, title: string, description?: string, extra_snippets?: string[] }> } }} */ (await resp.json());
      const results = data.web?.results ?? [];
      return results.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.description,
        content: r.extra_snippets?.length ? r.extra_snippets.join('\n\n') : undefined,
        source: 'brave',
      }));
    },
  };
}
