import type { ProviderTestResult, ProviderDefinition } from './provider-types'
import { getProviderDefinition } from './provider-registry'

/**
 * Truncate an error message to avoid returning huge HTML bodies.
 * Keeps the first 200 chars of the error text.
 */
function truncateErrorMessage(text: string, maxLen = 200): string {
  // If it looks like HTML, extract any useful text
  if (text.includes('<!DOCTYPE') || text.includes('<html')) {
    // Try to extract a title or heading
    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (titleMatch) {
      return `Server returned HTML page: "${titleMatch[1]?.trim()}" — check baseUrl configuration`
    }
    return 'Server returned an HTML page (not a JSON API response) — likely wrong baseUrl or proxy intercepting requests'
  }

  // If it contains JSON error, try to extract the message
  try {
    const json = JSON.parse(text)
    if (json.error?.message) return json.error.message
    if (json.message) return json.message
    if (json.detail) return json.detail
  } catch {
    // Not JSON, use raw text
  }

  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

/**
 * Tests connectivity to a provider by making a lightweight API request.
 *
 * For Anthropic-format providers, sends a minimal messages request.
 * For OpenAI-compatible (and all other) providers, fetches the /models endpoint.
 */
export async function testProvider(
  providerId: string,
  apiKey?: string,
  baseUrl?: string,
  oauthAccessToken?: string,
): Promise<ProviderTestResult> {
  const startTime = performance.now()
  const effectiveApiKey = oauthAccessToken ?? apiKey

  // 1. Look up definition; create a minimal one for custom/unknown providers.
  let definition: ProviderDefinition | undefined = getProviderDefinition(providerId)

  if (!definition) {
    definition = {
      id: providerId,
      name: providerId,
      baseUrl: baseUrl ?? '',
      envVars: [],
      apiFormat: 'openai-compatible',
      authType: effectiveApiKey ? 'bearer' : 'none',
      category: 'custom',
    }
  }

  // 2. Determine effective base URL; validate it's not empty for non-local providers
  const effectiveBaseUrl = baseUrl ?? definition.baseUrl

  if (!effectiveBaseUrl && definition.category !== 'free-local') {
    return {
      success: false,
      latencyMs: performance.now() - startTime,
      error: `No baseUrl configured for provider "${providerId}". Provide a baseUrl in the provider config or environment.`,
      providerName: definition.name ?? providerId,
    }
  }

  // 3. Abort controller with 10-second timeout.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    let models: string[] | undefined
    let response: Response

    if (definition.apiFormat === 'anthropic') {
      // ------------------------------------------------------------------
      // Anthropic format: POST /messages with a minimal payload
      // ------------------------------------------------------------------
      const url = effectiveBaseUrl.endsWith('/')
        ? effectiveBaseUrl + 'messages'
        : effectiveBaseUrl + '/messages'

      response = await globalThis.fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': effectiveApiKey ?? '',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
        signal: controller.signal,
      })

      // 200 = full success; 400 = invalid request but auth succeeded
      if (response.status !== 200 && response.status !== 400) {
        const text = await response.text().catch(() => '')
        const msg = truncateErrorMessage(text)
        throw new Error(`HTTP ${response.status}: ${msg}`)
      }
    } else {
      // ------------------------------------------------------------------
      // OpenAI-compatible (and all others): GET /models
      // ------------------------------------------------------------------
      // Build URL via string concatenation to avoid new URL() edge cases
      // with relative URLs when baseUrl is empty.
      const url = effectiveBaseUrl.endsWith('/')
        ? effectiveBaseUrl + 'models'
        : effectiveBaseUrl + '/models'

      const headers: Record<string, string> = {}

      // Only set auth headers when an actual API key is present
      switch (definition.authType) {
        case 'bearer':
        case 'aws-credentials':
          if (effectiveApiKey) {
            headers['Authorization'] = `Bearer ${effectiveApiKey}`
          }
          break
        case 'x-api-key':
          if (effectiveApiKey) {
            headers['x-api-key'] = effectiveApiKey
          }
          break
        case 'none':
        default:
          break
      }

      response = await globalThis.fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        const msg = truncateErrorMessage(text)
        throw new Error(`HTTP ${response.status}: ${msg}`)
      }

      const json = (await response.json()) as { data?: { id: string }[] }

      if (Array.isArray(json.data)) {
        models = json.data.map((m) => m.id)
      }
    }

    const latencyMs = performance.now() - startTime

    return {
      success: true,
      latencyMs,
      models,
      providerName: definition.name ?? providerId,
    }
  } catch (error: unknown) {
    const latencyMs = performance.now() - startTime
    let message = error instanceof Error ? error.message : String(error)

    // Detect network-level errors and provide actionable guidance
    if (message.includes('fetch') || message.includes('ENOTFOUND') || message.includes('ECONNREFUSED')) {
      message = `Cannot reach provider endpoint. Check that the baseUrl is correct and the service is running.`
    } else if (message.includes('terminated') || message.includes('aborted')) {
      message = `Connection timed out after 10s — check that the baseUrl is reachable`
    }

    return {
      success: false,
      latencyMs,
      error: message,
      providerName: definition?.name ?? providerId,
    }
  } finally {
    clearTimeout(timeout)
  }
}
