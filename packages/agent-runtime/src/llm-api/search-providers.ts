import type { Logger } from '@levelcode/common/types/contracts/logger'

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface WebSearchResponse {
  answer?: string // AI-summarized answer (if provider supports it)
  results: WebSearchResult[] // Raw search results
  provider: string // Which provider was used
}

export interface SearchProvider {
  name: string
  /** Returns true if this provider is configured (has API key or is keyless) */
  isAvailable(): boolean
  /** Execute a web search */
  search(params: {
    query: string
    depth?: 'standard' | 'deep'
    maxResults?: number
    fetch: typeof globalThis.fetch
    logger: Logger
  }): Promise<WebSearchResponse>
}

/** Format search results into a readable string for the LLM */
export function formatSearchResults(response: WebSearchResponse): string {
  const parts: string[] = []

  if (response.answer) {
    parts.push(response.answer)
    parts.push('')
  }

  if (response.results.length > 0) {
    parts.push('Sources:')
    for (let i = 0; i < response.results.length; i++) {
      const r = response.results[i]
      parts.push(`[${i + 1}] ${r.title}`)
      parts.push(`    ${r.url}`)
      if (r.snippet) parts.push(`    ${r.snippet}`)
      parts.push('')
    }
  }

  return parts.join('\n').trim()
}
