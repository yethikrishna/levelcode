import { jsonToolResult } from '@levelcode/common/util/messages'

import { callWebSearchAPI } from '../../../llm-api/levelcode-web-api'
import { formatSearchResults } from '../../../llm-api/search-providers'
import { searchWithFallback } from '../../../llm-api/search/index'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { ClientEnv, CiEnv } from '@levelcode/common/types/contracts/env'
import type { Logger } from '@levelcode/common/types/contracts/logger'

export const handleWebSearch = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<'web_search'>
  logger: Logger
  apiKey: string

  agentStepId: string
  clientSessionId: string
  fingerprintId: string
  repoId: string | undefined
  repoUrl: string | undefined
  userInputId: string
  userId: string | undefined

  fetch: typeof globalThis.fetch
  clientEnv: ClientEnv
  ciEnv: CiEnv
}): Promise<{
  output: LevelCodeToolOutput<'web_search'>
  creditsUsed: number
}> => {
  const {
    previousToolCallFinished,
    toolCall,

    agentStepId,
    apiKey,
    clientSessionId,
    fingerprintId,
    logger,
    repoId,
    repoUrl,
    userId,
    userInputId,

    fetch,
    clientEnv,
    ciEnv,
  } = params
  const { query, depth } = toolCall.input

  const searchStartTime = Date.now()
  const searchContext = {
    toolCallId: toolCall.toolCallId,
    query,
    depth,
    userId,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    repoId,
  }

  await previousToolCallFinished

  let creditsUsed = 0

  // Check if backend API is available (has base URL and API key)
  const hasBackend = Boolean(
    clientEnv.NEXT_PUBLIC_LEVELCODE_APP_URL && ciEnv.LEVELCODE_API_KEY,
  )

  // If no backend available, use local search providers with automatic fallback
  if (!hasBackend) {
    logger.info(
      { ...searchContext, method: 'local-search-providers' },
      'No LevelCode backend, using local search providers',
    )
    const searchResult = await searchWithFallback({
      query,
      depth,
      fetch,
      logger,
    })
    const searchDuration = Date.now() - searchStartTime
    const formattedResult = formatSearchResults(searchResult)
    logger.info(
      { ...searchContext, searchDuration, provider: searchResult.provider, resultCount: searchResult.results.length },
      `Local search completed via ${searchResult.provider}`,
    )
    return { output: jsonToolResult({ result: formattedResult }), creditsUsed: 0 }
  }

  try {
    const webApi = await callWebSearchAPI({
      query,
      depth,
      repoUrl: repoUrl ?? null,
      fetch,
      logger,
      apiKey,
      env: { clientEnv, ciEnv },
    })

    if (webApi.error) {
      const searchDuration = Date.now() - searchStartTime
      logger.warn(
        {
          ...searchContext,
          searchDuration,
          usedWebApi: true,
          success: false,
          error: webApi.error,
        },
        'Web API search returned error, falling back to local search',
      )

      // Fallback to local search providers when backend fails
      const fallbackResult = await searchWithFallback({ query, depth, fetch, logger })
      if (fallbackResult.results.length > 0 || fallbackResult.answer) {
        const formattedResult = formatSearchResults(fallbackResult)
        return { output: jsonToolResult({ result: formattedResult }), creditsUsed: 0 }
      }

      return {
        output: jsonToolResult({
          errorMessage: webApi.error,
        }),
        creditsUsed,
      }
    }
    const searchDuration = Date.now() - searchStartTime
    const resultLength = webApi.result?.length || 0
    const hasResults = Boolean(webApi.result && webApi.result.trim())

    // Capture credits used from the API response
    if (typeof webApi.creditsUsed === 'number') {
      creditsUsed = webApi.creditsUsed
    }

    logger.info(
      {
        ...searchContext,
        searchDuration,
        resultLength,
        hasResults,
        usedWebApi: true,
        creditsCharged: 'server',
        creditsUsed,
        success: true,
      },
      'Search completed via web API',
    )

    return {
      output: jsonToolResult({ result: webApi.result ?? '' }),
      creditsUsed,
    }
  } catch (error) {
    const searchDuration = Date.now() - searchStartTime
    logger.warn(
      {
        ...searchContext,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : error,
        searchDuration,
      },
      'Backend web search failed, trying local search providers fallback',
    )

    // Fallback to local search providers
    try {
      const fallbackResult = await searchWithFallback({ query, depth, fetch, logger })
      if (fallbackResult.results.length > 0 || fallbackResult.answer) {
        const formattedResult = formatSearchResults(fallbackResult)
        logger.info(
          { ...searchContext, method: 'local-providers-fallback', provider: fallbackResult.provider },
          'Local fallback search succeeded',
        )
        return { output: jsonToolResult({ result: formattedResult }), creditsUsed: 0 }
      }
    } catch {
      // Local fallback also failed
    }

    const errorMessage = `Error performing web search for "${query}": ${
      error instanceof Error ? error.message : 'Unknown error'
    }`
    logger.error(
      {
        ...searchContext,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        searchDuration,
        success: false,
      },
      'All search methods failed',
    )
    return { output: jsonToolResult({ errorMessage }), creditsUsed }
  }
}) satisfies LevelCodeToolHandlerFunction<'web_search'>
