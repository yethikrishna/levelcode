import type { SearchProvider } from '../search-providers'

/** Tavily API - AI-focused search, very similar to Linkup. Free tier: 1,000 queries/month.
 *  Get key at: https://tavily.com
 *  Set env: TAVILY_API_KEY */
export const tavilyProvider: SearchProvider = {
  name: 'tavily',
  isAvailable() {
    return Boolean(process.env.TAVILY_API_KEY)
  },
  async search({ query, depth, maxResults = 8, fetch, logger }) {
    const apiKey = process.env.TAVILY_API_KEY!
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: depth === 'deep' ? 'advanced' : 'basic',
        max_results: maxResults,
        include_answer: true,
      }),
    })

    if (!res.ok) throw new Error(`Tavily API error: HTTP ${res.status}`)

    const data = (await res.json()) as {
      answer?: string
      results?: Array<{ title: string; url: string; content: string }>
    }

    return {
      answer: data.answer,
      results: (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.slice(0, 300) ?? '',
      })),
      provider: 'tavily',
    }
  },
}
