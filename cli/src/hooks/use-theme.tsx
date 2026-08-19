/**
 * Theme Hooks
 *
 * Simple hooks for accessing theme from zustand store
 */

import { create } from 'zustand'

import { getCliEnv } from '../utils/env'
import { themeConfig, buildTheme } from '../utils/theme-config'
import {
  chatThemes,
  cloneChatTheme,
  detectIDETheme,
  detectPlatformTheme,
  detectTerminalOverrides,
  getOscDetectedTheme,
  initializeThemeWatcher,
  isDarkTheme,
  setThemeResolver,
  setLastDetectedTheme,
  setupFileWatchers,
} from '../utils/theme-system'

import type { ChatTheme, ThemeName } from '../types/theme-system'
import type { StoreApi, UseBoundStore } from 'zustand'

type ThemeStore = {
  theme: ChatTheme
  setThemeName: (name: ThemeName) => void
  cycleTheme: () => void
}

export let useThemeStore: UseBoundStore<StoreApi<ThemeStore>> = (() => {
  throw new Error('useThemeStore not initialized')
}) as any
let themeStoreInitialized = false

const THEME_CYCLE_ORDER: ThemeName[] = ['midnight', 'solar', 'matrix', 'light']

type ThemeDetector = {
  description: string
  detect: () => ThemeName | null
}

const THEME_PRIORITY: ThemeDetector[] = [
  {
    description: 'Terminal override (e.g., OPEN_TUI_THEME)',
    detect: detectTerminalOverrides,
  },
  {
    description: 'IDE configuration (VS Code, JetBrains, Zed)',
    detect: detectIDETheme,
  },
  {
    description: 'OSC terminal colors',
    detect: () => getOscDetectedTheme(),
  },
  {
    description: 'Operating system theme',
    detect: detectPlatformTheme,
  },
]

const resolveEnvTheme = (envPreference: string | undefined): ThemeName | null => {
  if (!envPreference) return null
  const normalized = envPreference.trim().toLowerCase()

  if (normalized === 'midnight') return 'midnight'
  if (normalized === 'solar') return 'solar'
  if (normalized === 'matrix') return 'matrix'
  if (normalized === 'light') return 'light'
  if (normalized === 'dark') return 'midnight'

  return null
}

export const detectSystemTheme = (): ThemeName => {
  const env = getCliEnv()
  const envPreference = env.OPEN_TUI_THEME ?? env.OPENTUI_THEME
  const normalizedEnv = envPreference?.toLowerCase()

  const explicitTheme = resolveEnvTheme(envPreference)
  if (explicitTheme) {
    return explicitTheme
  }

  const preferredTheme = (): ThemeName => {
    for (const detector of THEME_PRIORITY) {
      const result = detector.detect()
      if (result) {
        return result
      }
    }
    return 'midnight'
  }

  const resolved = preferredTheme()

  if (normalizedEnv === 'opposite') {
    return isDarkTheme(resolved) ? 'light' : 'midnight'
  }

  return resolved
}

export function initializeThemeStore() {
  if (themeStoreInitialized) {
    return
  }
  themeStoreInitialized = true

  setThemeResolver(detectSystemTheme)
  setupFileWatchers()

  const initialThemeName = detectSystemTheme()
  setLastDetectedTheme(initialThemeName)
  const initialTheme = buildTheme(
    cloneChatTheme(chatThemes[initialThemeName] ?? chatThemes.midnight),
    initialThemeName,
    themeConfig.customColors,
    themeConfig.plugins,
  )

  useThemeStore = create<ThemeStore>((set, get) => ({
    theme: initialTheme,

    setThemeName: (name: ThemeName) => {
      const currentTheme = get().theme

      if (currentTheme.name === name) {
        return
      }

      const baseTheme = cloneChatTheme(chatThemes[name] ?? chatThemes.midnight)
      const theme = buildTheme(
        baseTheme,
        name,
        themeConfig.customColors,
        themeConfig.plugins,
      )
      set({ theme })
    },

    cycleTheme: () => {
      const current = get().theme.name
      const currentIdx = THEME_CYCLE_ORDER.indexOf(current)
      const nextIdx = (currentIdx + 1) % THEME_CYCLE_ORDER.length
      const nextName = THEME_CYCLE_ORDER[nextIdx] ?? 'midnight'
      get().setThemeName(nextName)
    },
  }))

  initializeThemeWatcher((name: ThemeName) => {
    useThemeStore.getState().setThemeName(name)
  })
}

export const useTheme = (): ChatTheme => {
  return useThemeStore((state) => state.theme)
}

export const useSetTheme = () => {
  return useThemeStore((state) => state.setThemeName)
}

export const useCycleTheme = () => {
  return useThemeStore((state) => state.cycleTheme)
}
