/**
 * Firecrawl search adapter. Returns full extracted page content as markdown.
 * See docs/adapters.md.
 *
 * Currently a thin scaffold using fetch + the Firecrawl `/v1/search` endpoint.
 * Tune as needed; the adapter contract is what matters for the rest of the lib.
 */

/**
 * @param {{ apiKey: string, endpoint?: string }} opts
 * @returns {import('../../core/types.js').SearchAdapter}
 */
export function firecrawl({ apiKey, endpoint = 'https://api.firecrawl.dev/v1/search' }) {
  return {
    name: 'firecrawl',
    async search(query, opts = {}) {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query,
          limit: opts.maxResults ?? 10,
          scrapeOptions: { formats: ['markdown'] },
        }),
        signal: opts.signal,
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`firecrawl ${resp.status}: ${detail}`);
      }
      const data = /** @type {{ data?: Array<{ url: string, title?: string, description?: string, markdown?: string }> }} */ (await resp.json());
      const results = data.data ?? [];
      return results.map((r) => ({
        url: r.url,
        title: r.title ?? r.url,
        snippet: r.description,
        content: r.markdown,
        source: 'firecrawl',
      }));
    },
  };
}
