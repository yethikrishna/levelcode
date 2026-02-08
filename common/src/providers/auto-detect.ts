import { getProviderDefinition } from './provider-registry'
import type { ProvidersConfig, ProviderEntry } from './provider-types'

// ============================================================================
// Types
// ============================================================================

export interface AutoDetectedProvider {
  providerId: string
  models: string[]
}

interface LocalEndpoint {
  providerId: string
  url: string
}

// ============================================================================
// Auto-Detection
// ============================================================================

const LOCAL_ENDPOINTS: LocalEndpoint[] = [
  { providerId: 'ollama', url: 'http://localhost:11434/v1/models' },
  { providerId: 'lmstudio', url: 'http://localhost:1234/v1/models' },
]

/**
 * Scans known local provider endpoints (Ollama, LM Studio) and returns
 * any that respond successfully, along with the model IDs they report.
 */
export async function autoDetectLocalProviders(): Promise<AutoDetectedProvider[]> {
  const results = await Promise.allSettled(
    LOCAL_ENDPOINTS.map(async ({ providerId, url }): Promise<AutoDetectedProvider | null> => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2000)

      try {
        const res = await fetch(url, { signal: controller.signal })

        if (!res.ok) {
          return null
        }

        const json = await res.json()
        const models: string[] = json.data?.map((m: any) => m.id) ?? []

        return { providerId, models }
      } catch {
        // Timeout, connection refused, or any other network error — skip.
        return null
      } finally {
        clearTimeout(timeout)
      }
    }),
  )

  const detected: AutoDetectedProvider[] = []

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value !== null) {
      detected.push(result.value)
    }
  }

  return detected
}

// ============================================================================
// Merge Helper
// ============================================================================

/**
 * Merges auto-detected providers into an existing `ProvidersConfig`.
 *
 * - If a provider already exists in the config and was NOT auto-detected
 *   (i.e. the user manually configured it), it is left untouched.
 * - Otherwise the provider is upserted with `autoDetected: true`.
 *
 * The input config is not mutated; a new object is returned.
 */
export function mergeAutoDetectedProviders(
  config: ProvidersConfig,
  detected: AutoDetectedProvider[],
): ProvidersConfig {
  const updatedProviders: Record<string, ProviderEntry> = { ...config.providers }

  for (const det of detected) {
    const existing = updatedProviders[det.providerId]

    // User manually configured this provider — don't overwrite.
    if (existing && !existing.autoDetected) {
      continue
    }

    updatedProviders[det.providerId] = {
      enabled: true,
      autoDetected: true,
      models: det.models,
      customModelIds: existing?.customModelIds ?? [],
    }
  }

  return {
    ...config,
    providers: updatedProviders,
  }
}
