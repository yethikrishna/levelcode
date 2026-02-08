import path from 'path'
import { createAnthropic } from '@ai-sdk/anthropic'
import {
  OpenAICompatibleChatLanguageModel,
  VERSION,
} from '@levelcode/internal/openai-compatible/index'
import { getProviderDefinition } from '@levelcode/common/providers/provider-registry'
import { loadProviderConfig } from '@levelcode/common/providers/provider-fs'
import type { ProviderEntry, ProviderDefinition, ResolvedModel } from '@levelcode/common/providers/provider-types'
import type { LanguageModel } from 'ai'

/**
 * Create a LanguageModel instance for a given provider and model.
 *
 * Routes to the appropriate SDK based on the provider's API format:
 * - 'anthropic' format uses @ai-sdk/anthropic
 * - All others (including 'openai-compatible') use OpenAICompatibleChatLanguageModel
 */
export function createProviderModel(
  providerId: string,
  modelId: string,
  apiKey?: string,
  baseUrl?: string,
): LanguageModel {
  const definition = getProviderDefinition(providerId)

  const effectiveBaseUrl = baseUrl ?? definition?.baseUrl ?? ''
  const effectiveApiKey = apiKey

  if (definition?.apiFormat === 'anthropic') {
    const anthropic = createAnthropic({ apiKey: effectiveApiKey })
    return anthropic(modelId) as unknown as LanguageModel
  }

  // Default: openai-compatible (also handles undefined apiFormat)
  return new OpenAICompatibleChatLanguageModel(modelId, {
    provider: providerId,
    url: ({ path: endpoint }) => new URL(endpoint, effectiveBaseUrl).toString(),
    headers: () => {
      const h: Record<string, string | undefined> = {}
      if (definition?.authType === 'bearer' && effectiveApiKey) {
        h['Authorization'] = `Bearer ${effectiveApiKey}`
      } else if (definition?.authType === 'x-api-key' && effectiveApiKey) {
        h['x-api-key'] = effectiveApiKey
      }
      // Add default headers from definition
      if (definition?.defaultHeaders) {
        Object.assign(h, definition.defaultHeaders)
      }
      h['user-agent'] = `ai-sdk/openai-compatible/${VERSION}/levelcode`
      return h
    },
    supportsStructuredOutputs: true,
  })
}

/**
 * Resolve a model ID to a specific provider entry from the user's providers.json config.
 *
 * Resolution strategy:
 * 1. If modelId contains '/' (e.g. "anthropic/claude-sonnet-4.5"), split and look up that provider directly.
 * 2. Otherwise, search all enabled providers in preferred order, then remaining providers,
 *    to find one whose `models` or `customModelIds` includes the modelId.
 */
export async function resolveModelFromProviders(modelId: string): Promise<ResolvedModel | null> {
  const config = await loadProviderConfig()

  // Case 1: Explicit provider prefix (e.g. "anthropic/claude-sonnet-4.5")
  if (modelId.includes('/')) {
    const [providerId, ...rest] = modelId.split('/')
    const actualModelId = rest.join('/')
    const providerEntry = config.providers[providerId]

    if (providerEntry && providerEntry.enabled) {
      return {
        providerId,
        modelId: actualModelId,
        providerEntry,
        providerDefinition: getProviderDefinition(providerId),
      }
    }
  }

  // Case 2: Search all enabled providers for a matching model
  const allProviderIds = Object.keys(config.providers)
  const preferredOrder = config.settings.preferredProviderOrder ?? []

  // Build ordered list: preferred providers first, then remaining
  const orderedProviderIds: string[] = []
  for (const id of preferredOrder) {
    if (allProviderIds.includes(id)) {
      orderedProviderIds.push(id)
    }
  }
  for (const id of allProviderIds) {
    if (!orderedProviderIds.includes(id)) {
      orderedProviderIds.push(id)
    }
  }

  for (const providerId of orderedProviderIds) {
    const entry = config.providers[providerId]
    if (!entry || !entry.enabled) continue

    const hasModel =
      entry.models.includes(modelId) || entry.customModelIds.includes(modelId)

    if (hasModel) {
      return {
        providerId,
        modelId,
        providerEntry: entry,
        providerDefinition: getProviderDefinition(providerId),
      }
    }
  }

  return null
}

/**
 * High-level helper: resolve the model and create a LanguageModel in one step.
 * Returns null if no matching provider is configured.
 */
export async function getProviderModelForRequest(
  modelId: string,
): Promise<{ model: LanguageModel; providerId: string } | null> {
  const resolved = await resolveModelFromProviders(modelId)
  if (!resolved) {
    return null
  }

  const model = createProviderModel(
    resolved.providerId,
    resolved.modelId,
    resolved.providerEntry.apiKey,
    resolved.providerEntry.baseUrl,
  )

  return { model, providerId: resolved.providerId }
}
