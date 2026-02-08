import { tavilyProvider } from './tavily'
import { braveProvider } from './brave'
import { serperProvider } from './serper'
import { searxngProvider } from './searxng'
import { duckduckgoProvider } from './duckduckgo'

import type { SearchProvider, WebSearchResponse } from '../search-providers'
import type { Logger } from '@levelcode/common/types/contracts/logger'

// Priority order: try configured providers first, DuckDuckGo as final fallback
const ALL_PROVIDERS: SearchProvider[] = [
  tavilyProvider, // Best: AI-summarized answers (like Linkup)
  braveProvider, // Great: High quality results
  serperProvider, // Good: Google results
  searxngProvider, // Good: Open source, self-hosted
  duckduckgoProvider, // Fallback: Always works, no key needed
]

/** Get the first available search provider (has API key or is keyless) */
export function getAvailableSearchProvider(): SearchProvider {
  for (const provider of ALL_PROVIDERS) {
    if (provider.isAvailable()) return provider
  }
  return duckduckgoProvider // Should never reach here since DDG is always available
}

/** Get all configured search providers */
export function getConfiguredSearchProviders(): SearchProvider[] {
  return ALL_PROVIDERS.filter((p) => p.isAvailable())
}

/** Execute search with automatic fallback through providers */
export async function searchWithFallback(params: {
  query: string
  depth?: 'standard' | 'deep'
  maxResults?: number
  fetch: typeof globalThis.fetch
  logger: Logger
  preferredProvider?: string // e.g., 'tavily', 'brave', etc.
}): Promise<WebSearchResponse> {
  const { logger, preferredProvider } = params

  // Build provider order: preferred first, then others by priority
  let providers = [...ALL_PROVIDERS.filter((p) => p.isAvailable())]
  if (preferredProvider) {
    const preferred = providers.find((p) => p.name === preferredProvider)
    if (preferred) {
      providers = [
        preferred,
        ...providers.filter((p) => p.name !== preferredProvider),
      ]
    }
  }

  for (const provider of providers) {
    try {
      logger.info(
        { provider: provider.name, query: params.query },
        `Trying search provider: ${provider.name}`,
      )
      const result = await provider.search(params)
      if (result.results.length > 0 || result.answer) {
        logger.info(
          { provider: provider.name, resultCount: result.results.length },
          `Search succeeded with ${provider.name}`,
        )
        return result
      }
    } catch (error) {
      logger.warn(
        {
          provider: provider.name,
          error: error instanceof Error ? error.message : String(error),
        },
        `Search provider ${provider.name} failed, trying next`,
      )
    }
  }

  return { results: [], provider: 'none' }
}

export {
  tavilyProvider,
  braveProvider,
  serperProvider,
  searxngProvider,
  duckduckgoProvider,
}
