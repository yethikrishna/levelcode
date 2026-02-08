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
  oauthAccessToken?: string,
): LanguageModel {
  const definition = getProviderDefinition(providerId)

  const effectiveBaseUrl = baseUrl ?? definition?.baseUrl ?? ''
  const effectiveApiKey = oauthAccessToken ?? apiKey

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
  // Only treat as provider/model split if the prefix matches a known configured provider
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
  // This also handles OpenRouter-style model IDs like "moonshotai/kimi-k2.5"
  // where the slash is part of the model ID, not a provider separator
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

    // Check if the provider has this exact model ID (including slash-formatted IDs like "moonshotai/kimi-k2.5")
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

  // Case 3: For OpenRouter-style model IDs (org/model), try aggregator providers
  // These providers (openrouter, together, etc.) accept model IDs with slashes as-is
  if (modelId.includes('/')) {
    const aggregatorProviders = ['openrouter', 'together', 'deepinfra', 'fireworks-ai']
    for (const providerId of aggregatorProviders) {
      const entry = config.providers[providerId]
      if (!entry?.enabled) continue
      // Aggregators can route any model — they have thousands of models
      // If the provider is configured, assume it can handle the model
      const definition = getProviderDefinition(providerId)
      if (definition) {
        return {
          providerId,
          modelId, // Pass the full model ID including slash
          providerEntry: entry,
          providerDefinition: definition,
        }
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

  const oauthAccessToken = resolved.providerEntry.oauthToken?.accessToken
  const model = createProviderModel(
    resolved.providerId,
    resolved.modelId,
    resolved.providerEntry.apiKey,
    resolved.providerEntry.baseUrl,
    oauthAccessToken,
  )

  return { model, providerId: resolved.providerId }
}

/**
 * Get the default (best available) model from configured providers.
 * Priority: activeModel from config > first model from preferred provider > first model from any provider.
 * Returns null if no providers are configured with models.
 */
export async function getDefaultModel(): Promise<ResolvedModel | null> {
  const config = await loadProviderConfig()

  // 1. Try the user's active model
  if (config.activeProvider && config.activeModel) {
    const entry = config.providers[config.activeProvider]
    if (entry?.enabled) {
      return {
        providerId: config.activeProvider,
        modelId: config.activeModel,
        providerEntry: entry,
        providerDefinition: getProviderDefinition(config.activeProvider),
      }
    }
  }

  // 2. Try first model from preferred providers
  const preferredOrder = config.settings.preferredProviderOrder ?? []
  for (const providerId of preferredOrder) {
    const entry = config.providers[providerId]
    if (!entry?.enabled) continue
    const firstModel = entry.models[0] ?? entry.customModelIds[0]
    if (firstModel) {
      return {
        providerId,
        modelId: firstModel,
        providerEntry: entry,
        providerDefinition: getProviderDefinition(providerId),
      }
    }
  }

  // 3. Try any enabled provider with models
  for (const [providerId, entry] of Object.entries(config.providers)) {
    if (!entry.enabled) continue
    const firstModel = entry.models[0] ?? entry.customModelIds[0]
    if (firstModel) {
      return {
        providerId,
        modelId: firstModel,
        providerEntry: entry,
        providerDefinition: getProviderDefinition(providerId),
      }
    }
  }

  return null
}

/**
 * Get all available models from configured and enabled providers.
 * Returns a flat list of { providerId, modelId } pairs.
 */
export async function getAvailableModels(): Promise<Array<{ providerId: string; modelId: string }>> {
  const config = await loadProviderConfig()
  const models: Array<{ providerId: string; modelId: string }> = []

  for (const [providerId, entry] of Object.entries(config.providers)) {
    if (!entry.enabled) continue
    for (const modelId of entry.models) {
      models.push({ providerId, modelId })
    }
    for (const modelId of entry.customModelIds) {
      models.push({ providerId, modelId })
    }
  }

  return models
}

/**
 * Check if a specific model is available from any configured provider.
 */
export async function isModelAvailable(modelId: string): Promise<boolean> {
  const resolved = await resolveModelFromProviders(modelId)
  return resolved !== null
}
