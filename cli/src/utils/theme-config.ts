/**
 * Theme Configuration System
 *
 * Provides plugin system and customization support for themes
 */

import type { ChatTheme, ThemeName } from '../types/theme-system'

/**
 * Plugin interface for extending theme system
 * Plugins can modify themes at runtime
 */
export interface ThemePlugin {
  /** Unique plugin name */
  name: string
  /**
   * Apply plugin modifications to a theme
   * @param theme - The base theme
   * @param mode - The detected light/dark mode
   * @returns Partial theme to merge
   */
  apply: (
    theme: ChatTheme,
    mode: 'dark' | 'light',
  ) => Partial<ChatTheme>
}

/**
 * Main theme configuration interface
 */
export interface ThemeConfig {
  /** Global color overrides applied to themes */
  customColors?: Partial<ChatTheme>
  /** Registered plugins for theme extensions */
  plugins?: ThemePlugin[]
}

/**
 * Default theme configuration
 */
export const defaultThemeConfig: ThemeConfig = {
  customColors: {},
  plugins: [],
}

/**
 * Active theme configuration
 * Can be modified at runtime for customization
 */
export let themeConfig: ThemeConfig = defaultThemeConfig

/**
 * Update the active theme configuration
 * @param config - New configuration (will be merged with defaults)
 */
export const setThemeConfig = (config: Partial<ThemeConfig>): void => {
  themeConfig = {
    ...defaultThemeConfig,
    ...config,
    plugins: [...(defaultThemeConfig.plugins ?? []), ...(config.plugins ?? [])],
  }
}

/**
 * Register a theme plugin
 * @param plugin - Plugin to register
 */
export const registerThemePlugin = (plugin: ThemePlugin): void => {
  if (!themeConfig.plugins) {
    themeConfig.plugins = []
  }
  if (themeConfig.plugins.some((p) => p.name === plugin.name)) {
    console.warn(`Theme plugin "${plugin.name}" is already registered`)
    return
  }
  themeConfig.plugins.push(plugin)
}

/**
 * Resolve 'default' color values to fallback colors
 */
const resolveThemeColors = (theme: ChatTheme, mode: 'dark' | 'light'): void => {
  const defaultFallback = mode === 'dark' ? '#ffffff' : '#000000'

  const resolve = (value: string, fallback: string = defaultFallback): string => {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === 'default' || normalized.length === 0) {
        return fallback
      }
      return value
    }
    return fallback
  }

  theme.foreground = resolve(theme.foreground)
  theme.muted = resolve(theme.muted)
  theme.inputFg = resolve(theme.inputFg)
  theme.inputFocusedFg = resolve(theme.inputFocusedFg)
}

/**
 * Build a complete theme by applying custom colors and plugins
 */
export const buildTheme = (
  baseTheme: ChatTheme,
  themeName: ThemeName,
  customColors?: Partial<ChatTheme>,
  plugins?: ThemePlugin[],
): ChatTheme => {
  const theme = { ...baseTheme }
  const mode: 'dark' | 'light' = themeName === 'light' ? 'light' : 'dark'

  if (customColors) {
    Object.assign(theme, customColors)
  }

  if (plugins) {
    for (const plugin of plugins) {
      const pluginOverrides = plugin.apply(theme, mode)
      Object.assign(theme, pluginOverrides)
    }
  }

  resolveThemeColors(theme, mode)
  theme.name = themeName

  return theme
}
