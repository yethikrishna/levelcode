import fs from 'fs'
import path from 'path'

import { getConfigDir } from './auth'
import { AGENT_MODES } from './constants'
import { logger } from './logger'

import type { AgentMode } from './constants'

const DEFAULT_SETTINGS: Settings = {
  mode: 'DEFAULT' as const,
  adsEnabled: true,
  swarmEnabled: false,
}

// Note: FREE mode is now a valid AgentMode (was previously LITE)

/**
 * Settings schema - add new settings here as the product evolves
 */
export interface Settings {
  mode?: AgentMode
  adsEnabled?: boolean
  swarmEnabled?: boolean
  swarmMaxMembers?: number
  swarmAutoAssign?: boolean
  swarmDefaultPhase?: string
}

/**
 * Get the settings file path
 */
export const getSettingsPath = (): string => {
  return path.join(getConfigDir(), 'settings.json')
}

/**
 * Ensure the config directory exists, creating it if necessary
 */
const ensureConfigDirExists = (): void => {
  const configDir = getConfigDir()
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
}

/**
 * Load all settings from file system
 * @returns The saved settings object, with defaults for missing values
 */
export const loadSettings = (): Settings => {
  const settingsPath = getSettingsPath()

  if (!fs.existsSync(settingsPath)) {
    ensureConfigDirExists()
    // Create default settings file
    fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2))
    return DEFAULT_SETTINGS
  }

  try {
    const settingsFile = fs.readFileSync(settingsPath, 'utf8')
    const parsed = JSON.parse(settingsFile)
    return validateSettings(parsed)
  } catch (error) {
    logger.debug(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error reading settings',
    )
    return {}
  }
}

/**
 * Validate and sanitize settings from file
 */
const validateSettings = (parsed: unknown): Settings => {
  if (typeof parsed !== 'object' || parsed === null) {
    return {}
  }

  const settings: Settings = {}
  const obj = parsed as Record<string, unknown>

  // Validate mode
  if (
    typeof obj.mode === 'string' &&
    AGENT_MODES.includes(obj.mode as AgentMode)
  ) {
    settings.mode = obj.mode as AgentMode
  }

  // Validate adsEnabled
  if (typeof obj.adsEnabled === 'boolean') {
    settings.adsEnabled = obj.adsEnabled
  }

  // Validate swarmEnabled
  if (typeof obj.swarmEnabled === 'boolean') {
    settings.swarmEnabled = obj.swarmEnabled
  }

  // Validate swarmMaxMembers
  if (typeof obj.swarmMaxMembers === 'number' && obj.swarmMaxMembers > 0) {
    settings.swarmMaxMembers = obj.swarmMaxMembers
  }

  // Validate swarmAutoAssign
  if (typeof obj.swarmAutoAssign === 'boolean') {
    settings.swarmAutoAssign = obj.swarmAutoAssign
  }

  // Validate swarmDefaultPhase
  if (typeof obj.swarmDefaultPhase === 'string') {
    settings.swarmDefaultPhase = obj.swarmDefaultPhase
  }

  return settings
}

/**
 * Save settings to file system (merges with existing settings)
 */
export const saveSettings = (newSettings: Partial<Settings>): void => {
  const settingsPath = getSettingsPath()

  try {
    ensureConfigDirExists()

    // Load existing settings and merge
    const existingSettings = loadSettings()
    const mergedSettings = { ...existingSettings, ...newSettings }

    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2))
  } catch (error) {
    logger.debug(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error saving settings',
    )
  }
}

/**
 * Load the saved agent mode preference
 * @returns The saved mode, or 'DEFAULT' if not found or invalid
 */
export const loadModePreference = (): AgentMode => {
  const settings = loadSettings()
  return settings.mode ?? 'DEFAULT'
}

/**
 * Save the agent mode preference
 */
export const saveModePreference = (mode: AgentMode): void => {
  saveSettings({ mode })
}

/**
 * Check if swarm/team features are enabled.
 * Enabled when the setting is true OR the LEVELCODE_ENABLE_SWARMS env var is set.
 */
export const getSwarmEnabled = (): boolean => {
  const envFlag = process.env.LEVELCODE_ENABLE_SWARMS
  if (envFlag === '1' || envFlag === 'true') {
    return true
  }
  const settings = loadSettings()
  return settings.swarmEnabled ?? false
}

/**
 * Save the swarm enabled preference
 */
export const saveSwarmPreference = (enabled: boolean): void => {
  saveSettings({ swarmEnabled: enabled })
}

/**
 * Load swarm-related settings with defaults
 */
export const loadSwarmSettings = (): {
  swarmEnabled: boolean
  swarmMaxMembers: number
  swarmAutoAssign: boolean
  swarmDefaultPhase: string
} => {
  const settings = loadSettings()
  return {
    swarmEnabled: settings.swarmEnabled ?? false,
    swarmMaxMembers: settings.swarmMaxMembers ?? 20,
    swarmAutoAssign: settings.swarmAutoAssign ?? false,
    swarmDefaultPhase: settings.swarmDefaultPhase ?? 'planning',
  }
}

/**
 * Save swarm max members preference
 */
export const saveSwarmMaxMembers = (maxMembers: number): void => {
  saveSettings({ swarmMaxMembers: maxMembers })
}

/**
 * Save swarm auto-assign preference
 */
export const saveSwarmAutoAssign = (autoAssign: boolean): void => {
  saveSettings({ swarmAutoAssign: autoAssign })
}

/**
 * Save swarm default phase preference
 */
export const saveSwarmDefaultPhase = (phase: string): void => {
  saveSettings({ swarmDefaultPhase: phase })
}
