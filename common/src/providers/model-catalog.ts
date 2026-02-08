import fs from 'fs'
import path from 'path'
import { homedir } from 'os'
import { ModelCatalogEntry, UserSettings } from './provider-types'

// ============================================================================
// Cache Path
// ============================================================================

export function getCatalogCachePath(): string {
  return path.join(homedir(), '.config', 'levelcode', 'models-cache.json')
}

// ============================================================================
// Fetch & Parse
// ============================================================================

export async function fetchModelCatalog(): Promise<ModelCatalogEntry[]> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    const response = await fetch('https://models.dev/api.json', {
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const raw: unknown = await response.json()

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error('Unexpected response shape from models.dev')
    }

    const catalog = parseModelCatalog(raw as Record<string, unknown>)

    // Persist to cache
    const cachePath = getCatalogCachePath()
    const cacheDir = path.dirname(cachePath)
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }
    fs.writeFileSync(cachePath, JSON.stringify(catalog, null, 2), 'utf-8')

    return catalog
  } catch {
    return loadCachedCatalog()
  }
}

function parseModelCatalog(data: Record<string, unknown>): ModelCatalogEntry[] {
  const entries: ModelCatalogEntry[] = []

  for (const [providerId, providerValue] of Object.entries(data)) {
    if (typeof providerValue !== 'object' || providerValue === null || Array.isArray(providerValue)) {
      continue
    }

    const providerData = providerValue as Record<string, unknown>

    for (const [modelKey, modelValue] of Object.entries(providerData)) {
      if (typeof modelValue !== 'object' || modelValue === null || Array.isArray(modelValue)) {
        continue
      }

      const model = modelValue as Record<string, unknown>

      const entry: ModelCatalogEntry = {
        id: modelKey,
        name: typeof model.name === 'string' ? model.name : modelKey,
        providerId,
      }

      // Map optional family field
      if (typeof model.family === 'string') {
        entry.family = model.family
      }

      // Map cost fields
      const costInput = toNumberOrUndefined(model.input_cost ?? model.cost_input)
      const costOutput = toNumberOrUndefined(model.output_cost ?? model.cost_output)
      if (costInput !== undefined && costOutput !== undefined) {
        entry.cost = { input: costInput, output: costOutput }
      }

      // Map limit fields
      const contextLimit = toNumberOrUndefined(model.context ?? model.context_length ?? model.context_window)
      const outputLimit = toNumberOrUndefined(model.output ?? model.max_output ?? model.output_length)
      if (contextLimit !== undefined && outputLimit !== undefined) {
        entry.limit = { context: contextLimit, output: outputLimit }
      }

      // Map capabilities
      const capabilities: Record<string, boolean> = {}
      let hasCapabilities = false
      for (const cap of ['reasoning', 'tool_call', 'vision', 'function_calling', 'json_output']) {
        if (typeof model[cap] === 'boolean') {
          capabilities[cap] = model[cap] as boolean
          hasCapabilities = true
        }
      }
      if (hasCapabilities) {
        entry.capabilities = capabilities as ModelCatalogEntry['capabilities']
      }

      // Map modalities
      if (Array.isArray(model.modalities)) {
        const modalities = model.modalities.filter((m): m is string => typeof m === 'string')
        if (modalities.length > 0) {
          entry.modalities = modalities
        }
      }

      entries.push(entry)
    }
  }

  return entries
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value
  }
  return undefined
}

// ============================================================================
// Cache Loading
// ============================================================================

export async function loadCachedCatalog(): Promise<ModelCatalogEntry[]> {
  try {
    const cachePath = getCatalogCachePath()
    if (!fs.existsSync(cachePath)) {
      return []
    }
    const raw = fs.readFileSync(cachePath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed as ModelCatalogEntry[]
  } catch {
    return []
  }
}

// ============================================================================
// Refresh Logic
// ============================================================================

export function shouldRefreshCatalog(
  settings: Pick<UserSettings, 'catalogRefreshHours'>,
  lastUpdated: string | null,
): boolean {
  if (lastUpdated === null) {
    return true
  }

  const lastDate = new Date(lastUpdated)
  if (Number.isNaN(lastDate.getTime())) {
    return true
  }

  const elapsed = Date.now() - lastDate.getTime()
  const threshold = settings.catalogRefreshHours * 3600 * 1000

  return elapsed > threshold
}

// ============================================================================
// Query Helpers
// ============================================================================

export function getModelsForProvider(
  catalog: ModelCatalogEntry[],
  providerId: string,
): ModelCatalogEntry[] {
  return catalog.filter((entry) => entry.providerId === providerId)
}

export function searchModels(
  catalog: ModelCatalogEntry[],
  query: string,
  filters?: { providerId?: string; capability?: string },
): ModelCatalogEntry[] {
  const lowerQuery = query.toLowerCase()

  return catalog.filter((entry) => {
    const matchesQuery =
      entry.id.toLowerCase().includes(lowerQuery) ||
      entry.name.toLowerCase().includes(lowerQuery)

    if (!matchesQuery) {
      return false
    }

    if (filters?.providerId && entry.providerId !== filters.providerId) {
      return false
    }

    if (filters?.capability) {
      const cap = filters.capability as keyof NonNullable<ModelCatalogEntry['capabilities']>
      if (!entry.capabilities?.[cap]) {
        return false
      }
    }

    return true
  })
}

export function getModelInfo(
  catalog: ModelCatalogEntry[],
  providerId: string,
  modelId: string,
): ModelCatalogEntry | undefined {
  return catalog.find(
    (entry) => entry.providerId === providerId && entry.id === modelId,
  )
}

export function findDuplicateModels(
  catalog: ModelCatalogEntry[],
  modelName: string,
): ModelCatalogEntry[] {
  const normalizedTarget = extractModelBaseName(modelName).toLowerCase()

  return catalog.filter((entry) => {
    const normalizedEntry = extractModelBaseName(entry.id).toLowerCase()
    return normalizedEntry === normalizedTarget
  })
}

function extractModelBaseName(modelId: string): string {
  const parts = modelId.split('/')
  return parts[parts.length - 1]
}

export function getAllAvailableModels(
  catalog: ModelCatalogEntry[],
  configuredProviderIds: string[],
): ModelCatalogEntry[] {
  const providerSet = new Set(configuredProviderIds)
  return catalog.filter((entry) => providerSet.has(entry.providerId))
}
