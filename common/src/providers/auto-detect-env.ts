import { PROVIDER_DEFINITIONS } from './provider-registry'
import type { ProviderEntry, ProvidersConfig } from './provider-types'

/**
 * Result of detecting an API key from an environment variable or file
 */
export interface DetectedEnvKey {
  providerId: string
  apiKey: string
  source: 'env-var' | 'env-pattern' | 'file-scan'
  /** File path if detected from file scan */
  filePath?: string
}

/**
 * Scan all known provider environment variables for API keys
 * Returns a map of provider IDs to their detected API keys
 */
export function detectEnvVarKeys(): Record<string, DetectedEnvKey> {
  const detected: Record<string, DetectedEnvKey> = {}

  for (const [providerId, def] of Object.entries(PROVIDER_DEFINITIONS)) {
    if (def.envVars.length === 0) {
      continue
    }

    // Check each env var for this provider (in order)
    for (const envVar of def.envVars) {
      const value = process.env[envVar]
      if (value && value.length > 0) {
        detected[providerId] = {
          providerId,
          apiKey: value,
          source: 'env-var',
        }
        break // Found a key for this provider, stop checking other env vars
      }
    }
  }

  return detected
}

/**
 * Merge detected env var keys into the provider config
 * Similar to mergeAutoDetectedProviders, but for env vars
 */
export function mergeEnvDetectedProviders(
  config: ProvidersConfig,
  detectedKeys: Record<string, DetectedEnvKey>,
): ProvidersConfig {
  const newConfig = { ...config }
  const existingProviders = new Set(Object.keys(config.providers))

  for (const [providerId, detected] of Object.entries(detectedKeys)) {
    // Skip if provider already exists in config
    if (existingProviders.has(providerId)) {
      continue
    }

    // Add provider entry with the env-detected API key
    newConfig.providers[providerId] = {
      apiKey: detected.apiKey,
      source: detected.source,
      enabled: true,
    } as ProviderEntry
  }

  return newConfig
}

/**
 * Scan ALL environment variables using regex patterns to find obscure keys
 * This catches keys in non-standard env var names
 */
export function detectKeysByPattern(): DetectedEnvKey[] {
  const detected: DetectedEnvKey[] = []
  const seenKeys = new Set<string>() // Deduplicate by key value

  // Import patterns from file-scanner (circular dependency safe)
  const patterns: Array<{ regex: RegExp; providerId: string }> = [
    { regex: /sk-(?:proj-)?[A-Za-z0-9]{48}/g, providerId: 'openai' },
    { regex: /sk-ant-[A-Za-z0-9_-]{95}/g, providerId: 'anthropic' },
    { regex: /xai-[A-Za-z0-9_-]{36,}/g, providerId: 'xai' },
    { regex: /gsk_[A-Za-z0-9]{32}/g, providerId: 'groq' },
    { regex: /sk-or-v1-[A-Za-z0-9]{32,}/g, providerId: 'openrouter' },
    { regex: /AIza[A-Za-z0-9_-]{35}/g, providerId: 'google' },
    { regex: /pplx-[A-Za-z0-9_-]{40}/g, providerId: 'perplexity' },
    { regex: /r8_[A-Za-z0-9_-]{32}/g, providerId: 'replicate' },
    { regex: /nvapi-[A-Za-z0-9_-]{36}/g, providerId: 'nvidia' },
  ]

  for (const { regex, providerId } of patterns) {
    for (const [envKey, envValue] of Object.entries(process.env)) {
      if (!envValue) continue

      // Skip env vars that are too short or clearly not keys
      if (envValue.length < 20) continue
      if (envKey.includes('PATH') || envKey.includes('DIR') || envKey.includes('HOME')) continue

      regex.lastIndex = 0
      const matches = envValue.match(regex)

      if (matches) {
        for (const match of matches) {
          // Deduplicate by key value
          if (!seenKeys.has(match)) {
            seenKeys.add(match)
            detected.push({
              providerId,
              apiKey: match,
              source: 'env-pattern',
            })
          }
        }
      }
    }
  }

  return detected
}

/**
 * Get ALL detected env API keys (known env vars + pattern matching), deduplicated.
 * Sends on every startup regardless of existing config.
 */
export function getAllDetectedEnvKeys(): DetectedEnvKey[] {
  const detectedFromKnown = detectEnvVarKeys()
  const knownKeys: DetectedEnvKey[] = Object.values(detectedFromKnown)

  const detectedFromPattern = detectKeysByPattern()
  const seen = new Set(knownKeys.map((k) => k.providerId + k.apiKey))
  const patternKeys: DetectedEnvKey[] = []

  for (const keyData of detectedFromPattern) {
    const uniqueKey = keyData.providerId + keyData.apiKey
    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey)
      patternKeys.push(keyData)
    }
  }

  return [...knownKeys, ...patternKeys]
}

/**
 * Get env-detected API keys that are NOT already in the config
 * These are new keys that should be sent to the backend
 */
export function getNewEnvDetectedKeys(
  config: ProvidersConfig,
): DetectedEnvKey[] {
  return getAllDetectedEnvKeys().filter(
    (k) => !config.providers[k.providerId],
  )
}
