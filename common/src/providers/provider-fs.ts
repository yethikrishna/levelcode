import fs from 'fs'
import path from 'path'
import { homedir } from 'os'
import {
  ProvidersConfig,
  ProvidersConfigSchema,
  DEFAULT_PROVIDERS_CONFIG,
  ProviderEntry,
  UserSettings,
} from './provider-types'

export function getProviderConfigPath(): string {
  return path.join(homedir(), '.config', 'levelcode', 'providers.json')
}

export async function loadProviderConfig(): Promise<ProvidersConfig> {
  try {
    const configPath = getProviderConfigPath()
    const raw = await fs.promises.readFile(configPath, 'utf-8')
    const parsed = JSON.parse(raw)
    const validated = ProvidersConfigSchema.parse(parsed)
    return validated
  } catch {
    return DEFAULT_PROVIDERS_CONFIG
  }
}

export async function saveProviderConfig(config: ProvidersConfig): Promise<void> {
  const configPath = getProviderConfigPath()
  const tmpPath = configPath + '.tmp'
  const dir = path.dirname(configPath)

  fs.mkdirSync(dir, { recursive: true })

  await fs.promises.writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf-8')
  await fs.promises.rename(tmpPath, configPath)
}

export async function addProvider(id: string, entry: ProviderEntry): Promise<ProvidersConfig> {
  const config = await loadProviderConfig()
  config.providers[id] = entry
  await saveProviderConfig(config)
  return config
}

export async function removeProvider(id: string): Promise<ProvidersConfig> {
  const config = await loadProviderConfig()
  delete config.providers[id]

  if (config.activeProvider === id) {
    config.activeProvider = null
    config.activeModel = null
  }

  await saveProviderConfig(config)
  return config
}

export async function updateProvider(
  id: string,
  patch: Partial<ProviderEntry>,
): Promise<ProvidersConfig> {
  const config = await loadProviderConfig()
  config.providers[id] = { ...config.providers[id], ...patch }
  await saveProviderConfig(config)
  return config
}

export async function getActiveModel(): Promise<{
  providerId: string | null
  modelId: string | null
}> {
  const config = await loadProviderConfig()
  return { providerId: config.activeProvider, modelId: config.activeModel }
}

export async function setActiveModel(providerId: string, modelId: string): Promise<void> {
  const config = await loadProviderConfig()
  config.activeProvider = providerId
  config.activeModel = modelId
  await saveProviderConfig(config)
}

export async function getUserSettings(): Promise<UserSettings> {
  const config = await loadProviderConfig()
  return config.settings
}

export async function updateUserSettings(
  patch: Partial<UserSettings>,
): Promise<ProvidersConfig> {
  const config = await loadProviderConfig()
  config.settings = { ...config.settings, ...patch }
  await saveProviderConfig(config)
  return config
}

export async function addCustomModelId(providerId: string, modelId: string): Promise<void> {
  const config = await loadProviderConfig()
  const provider = config.providers[providerId]

  if (provider && !provider.customModelIds.includes(modelId)) {
    provider.customModelIds.push(modelId)
    await saveProviderConfig(config)
  }
}

export async function removeCustomModelId(providerId: string, modelId: string): Promise<void> {
  const config = await loadProviderConfig()
  const provider = config.providers[providerId]

  if (provider) {
    provider.customModelIds = provider.customModelIds.filter((id) => id !== modelId)
    await saveProviderConfig(config)
  }
}
