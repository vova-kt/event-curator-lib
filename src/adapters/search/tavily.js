/**
 * Tavily search adapter. Uses fetch directly to keep deps lean.
 * See docs/adapters.md.
 */

/**
 * @param {{ apiKey: string, endpoint?: string, includeRawContent?: boolean }} opts
 * @returns {import('../../core/types.js').SearchAdapter}
 */
export function tavily({ apiKey, endpoint = 'https://api.tavily.com/search', includeRawContent = true }) {
  return {
    name: 'tavily',
    async search(query, opts = {}) {
      const body = {
        api_key: apiKey,
        query,
        max_results: opts.maxResults ?? 10,
        include_raw_content: includeRawContent,
        search_depth: 'advanced',
      };
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`tavily ${resp.status}: ${detail}`);
      }
      const data = /** @type {{ results?: Array<{ url: string, title: string, content?: string, raw_content?: string }> }} */ (await resp.json());
      const results = data.results ?? [];
      return results.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.content,
        content: r.raw_content,
        source: 'tavily',
      }));
    },
  };
}
