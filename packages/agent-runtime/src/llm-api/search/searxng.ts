import type { SearchProvider } from '../search-providers'

/** SearXNG - Open source metasearch engine. Free, self-hosted or use public instances.
 *  Set env: SEARXNG_URL (e.g., https://searx.be or http://localhost:8888) */
export const searxngProvider: SearchProvider = {
  name: 'searxng',
  isAvailable() {
    return Boolean(process.env.SEARXNG_URL)
  },
  async search({ query, maxResults = 8, fetch, logger }) {
    const baseUrl = process.env.SEARXNG_URL!.replace(/\/$/, '')
    const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json&engines=google,bing,duckduckgo&language=en`

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) throw new Error(`SearXNG error: HTTP ${res.status}`)

    const data = (await res.json()) as {
      results?: Array<{ title: string; url: string; content: string }>
    }

    return {
      results: (data.results ?? []).slice(0, maxResults).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content ?? '',
      })),
      provider: 'searxng',
    }
  },
}
