import type { SearchProvider } from '../search-providers'

/** Brave Search API - High quality results. Free tier: 2,000 queries/month.
 *  Get key at: https://brave.com/search/api/
 *  Set env: BRAVE_SEARCH_API_KEY */
export const braveProvider: SearchProvider = {
  name: 'brave',
  isAvailable() {
    return Boolean(process.env.BRAVE_SEARCH_API_KEY)
  },
  async search({ query, maxResults = 8, fetch, logger }) {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY!
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    })

    if (!res.ok) throw new Error(`Brave Search error: HTTP ${res.status}`)

    const data = (await res.json()) as {
      web?: {
        results?: Array<{ title: string; url: string; description: string }>
      }
    }

    return {
      results: (data.web?.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description ?? '',
      })),
      provider: 'brave',
    }
  },
}
