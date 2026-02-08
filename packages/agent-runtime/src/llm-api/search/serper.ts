import type { SearchProvider } from '../search-providers'

/** Serper.dev - Google Search API. Free tier: 2,500 queries.
 *  Get key at: https://serper.dev
 *  Set env: SERPER_API_KEY */
export const serperProvider: SearchProvider = {
  name: 'serper',
  isAvailable() {
    return Boolean(process.env.SERPER_API_KEY)
  },
  async search({ query, maxResults = 8, fetch, logger }) {
    const apiKey = process.env.SERPER_API_KEY!

    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: maxResults }),
    })

    if (!res.ok) throw new Error(`Serper error: HTTP ${res.status}`)

    const data = (await res.json()) as {
      answerBox?: { answer?: string; snippet?: string }
      organic?: Array<{ title: string; link: string; snippet: string }>
    }

    return {
      answer: data.answerBox?.answer ?? data.answerBox?.snippet,
      results: (data.organic ?? []).map((r) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet ?? '',
      })),
      provider: 'serper',
    }
  },
}
