import type { ProviderTestResult, ProviderDefinition } from './provider-types'
import { getProviderDefinition } from './provider-registry'

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

  // 2. Determine effective base URL.
  const effectiveBaseUrl = baseUrl ?? definition.baseUrl

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
      response = await globalThis.fetch(`${effectiveBaseUrl}/messages`, {
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
        throw new Error(`HTTP ${response.status}: ${text}`)
      }
    } else {
      // ------------------------------------------------------------------
      // OpenAI-compatible (and all others): GET /models
      // ------------------------------------------------------------------
      const headers: Record<string, string> = {}

      switch (definition.authType) {
        case 'bearer':
        case 'aws-credentials':
          headers['Authorization'] = `Bearer ${effectiveApiKey}`
          break
        case 'x-api-key':
          headers['x-api-key'] = effectiveApiKey ?? ''
          break
        case 'none':
        default:
          break
      }

      response = await globalThis.fetch(`${effectiveBaseUrl}/models`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`HTTP ${response.status}: ${text}`)
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
    const message = error instanceof Error ? error.message : String(error)

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
