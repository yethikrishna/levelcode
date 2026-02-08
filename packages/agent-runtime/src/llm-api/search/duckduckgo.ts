import type { SearchProvider } from '../search-providers'

/** DuckDuckGo HTML search - Always available, no API key needed.
 *  Parses HTML results from DuckDuckGo's lite endpoint. */
export const duckduckgoProvider: SearchProvider = {
  name: 'duckduckgo',
  isAvailable() {
    return true // Always available, no API key needed
  },
  async search({ query, maxResults = 8, fetch }) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'LevelCode/0.3.0 (CLI; web-search)' },
    })

    if (!res.ok) throw new Error(`DuckDuckGo returned HTTP ${res.status}`)

    const html = await res.text()
    const results: Array<{ title: string; url: string; snippet: string }> = []

    // Parse results from HTML
    const resultPattern =
      /<a rel="nofollow" class="result__a" href="([^"]*)"[^>]*>(.*?)<\/a>/g
    const snippetPattern =
      /<a class="result__snippet"[^>]*>(.*?)<\/a>/g

    const titles: string[] = []
    const urls: string[] = []
    let match: RegExpExecArray | null

    while ((match = resultPattern.exec(html)) !== null) {
      const href = match[1]
        ?.replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, '')
        ?.split('&')[0]
      const title = match[2]?.replace(/<\/?b>/g, '')
      if (href && title) {
        urls.push(decodeURIComponent(href))
        titles.push(title)
      }
    }

    const snippets: string[] = []
    while ((match = snippetPattern.exec(html)) !== null) {
      const snippet = match[1]
        ?.replace(/<\/?b>/g, '')
        ?.replace(/<[^>]+>/g, '')
      if (snippet) snippets.push(snippet)
    }

    for (let i = 0; i < Math.min(titles.length, maxResults); i++) {
      results.push({
        title: titles[i] ?? '',
        url: urls[i] ?? '',
        snippet: snippets[i] ?? '',
      })
    }

    return { results, provider: 'duckduckgo' }
  },
}
