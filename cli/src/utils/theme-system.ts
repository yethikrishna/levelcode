import { existsSync, readFileSync, readdirSync, statSync, watch } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'

import { getCliEnv } from './env'

import type { MarkdownPalette } from './markdown-renderer'
import type { CliEnv } from '../types/env'
import type {
  ChatTheme,
  MarkdownHeadingLevel,
  MarkdownThemeOverrides,
  ThemeName,
} from '../types/theme-system'

/**
 * Check if the terminal supports truecolor (24-bit color).
 * Terminals like macOS Terminal.app only support 256 colors and cannot
 * render hex colors properly - they need ANSI color name fallbacks.
 */
// Cache the truecolor support result since it won't change during runtime
let _truecolorSupport: boolean | null = null

export function supportsTruecolor(env: CliEnv = getCliEnv()): boolean {
  if (_truecolorSupport !== null) {
    return _truecolorSupport
  }
  
  const termProgram = env.TERM_PROGRAM?.toLowerCase() ?? ''
  
  // Terminal.app (Apple_Terminal) does NOT support truecolor - only 256 colors
  if (termProgram === 'apple_terminal') {
    _truecolorSupport = false
    return false
  }
  
  const colorterm = env.COLORTERM?.toLowerCase()
  if (colorterm === 'truecolor' || colorterm === '24bit') {
    _truecolorSupport = true
    return true
  }
  
  // Some terminals that are known to support truecolor
  const truecolorTerminals = [
    'iterm.app',
    'hyper',
    'wezterm',
    'alacritty',
    'kitty',
    'ghostty',
    'vscode',
  ]
  
  if (truecolorTerminals.some(t => termProgram.includes(t))) {
    _truecolorSupport = true
    return true
  }
  
  // Check TERM for known truecolor-capable values
  const term = env.TERM?.toLowerCase() ?? ''
  if (term.includes('truecolor') || term.includes('24bit')) {
    _truecolorSupport = true
    return true
  }
  
  // xterm-kitty, alacritty, etc.
  if (term === 'xterm-kitty' || term === 'alacritty' || term.includes('ghostty')) {
    _truecolorSupport = true
    return true
  }
  
  _truecolorSupport = false
  return false
}

const IDE_THEME_INFERENCE = {
  dark: [
    'dark',
    'midnight',
    'solar',
    'matrix',
    'night',
    'noir',
    'black',
    'charcoal',
    'dim',
    'dracula',
    'darcula',
    'moon',
    'nebula',
    'obsidian',
    'shadow',
    'storm',
    'monokai',
    'ayu mirage',
    'material darker',
    'tokyo',
    'abyss',
    'zed dark',
    'vs dark',
  ],
  light: [
    'light',
    'day',
    'dawn',
    'bright',
    'paper',
    'sun',
    'snow',
    'cloud',
    'white',
    'solarized light',
    'pastel',
    'cream',
    'zed light',
    'vs light',
  ],
} as const

const VS_CODE_PRODUCT_DIRS = [
  'Code',
  'Code - Insiders',
  'Code - OSS',
  'VSCodium',
  'VSCodium - Insiders',
  'Cursor',
] as const

const normalizeThemeName = (themeName: string): string =>
  themeName.trim().toLowerCase()

const inferThemeFromName = (themeName: string): ThemeName | null => {
  const normalized = normalizeThemeName(themeName)

  for (const hint of IDE_THEME_INFERENCE.dark) {
    if (normalized.includes(hint)) {
      return 'midnight'
    }
  }

  for (const hint of IDE_THEME_INFERENCE.light) {
    if (normalized.includes(hint)) {
      return 'light'
    }
  }

  return null
}

const stripJsonStyleComments = (raw: string): string =>
  raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const safeReadFile = (filePath: string): string | null => {
  try {
    return readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

const collectExistingPaths = (candidates: string[]): string[] => {
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      if (existsSync(candidate)) {
        seen.add(candidate)
      }
    } catch {
      // Ignore filesystem errors when probing paths
    }
  }
  return [...seen]
}

const resolveVSCodeSettingsPaths = (
  env: CliEnv = getCliEnv(),
): string[] => {
  const settings: string[] = []
  const home = homedir()

  if (process.platform === 'darwin') {
    const base = join(home, 'Library', 'Application Support')
    for (const product of VS_CODE_PRODUCT_DIRS) {
      settings.push(join(base, product, 'User', 'settings.json'))
    }
  } else if (process.platform === 'win32') {
    const appData = env.APPDATA
    if (appData) {
      for (const product of VS_CODE_PRODUCT_DIRS) {
        settings.push(join(appData, product, 'User', 'settings.json'))
      }
    }
  } else {
    const configDir = env.XDG_CONFIG_HOME ?? join(home, '.config')
    for (const product of VS_CODE_PRODUCT_DIRS) {
      settings.push(join(configDir, product, 'User', 'settings.json'))
    }
  }

  return settings
}

const resolveJetBrainsLafPaths = (
  env: CliEnv = getCliEnv(),
): string[] => {
  const candidates: string[] = []

  // Check IDE config dirs
  if (env.IDE_CONFIG_DIR) {
    candidates.push(join(env.IDE_CONFIG_DIR, 'options', 'laf.xml'))
  }
  if (env.JB_IDE_CONFIG_DIR) {
    candidates.push(join(env.JB_IDE_CONFIG_DIR, 'options', 'laf.xml'))
  }

  const home = homedir()

  const baseDirs: string[] = []
  if (process.platform === 'darwin') {
    baseDirs.push(join(home, 'Library', 'Application Support', 'JetBrains'))
  } else if (process.platform === 'win32') {
    const appData = env.APPDATA
    if (appData) {
      baseDirs.push(join(appData, 'JetBrains'))
    }
  } else {
    baseDirs.push(join(home, '.config', 'JetBrains'))
    baseDirs.push(join(home, '.local', 'share', 'JetBrains'))
  }

  for (const base of baseDirs) {
    try {
      if (!existsSync(base)) continue
      const entries = readdirSync(base)
      for (const entry of entries) {
        const dirPath = join(base, entry)
        try {
          if (!statSync(dirPath).isDirectory()) continue
        } catch {
          continue
        }

        candidates.push(join(dirPath, 'options', 'laf.xml'))
      }
    } catch {
      // Ignore unreadable directories
    }
  }

  return candidates
}

const resolveZedSettingsPaths = (
  env: CliEnv = getCliEnv(),
): string[] => {
  const home = homedir()
  const paths: string[] = []

  const configDirs = new Set<string>()

  const xdgConfig = env.XDG_CONFIG_HOME ?? join(home, '.config')
  configDirs.add(join(xdgConfig, 'zed'))
  configDirs.add(join(xdgConfig, 'dev.zed.Zed'))

  if (process.platform === 'darwin') {
    configDirs.add(join(home, 'Library', 'Application Support', 'Zed'))
    configDirs.add(join(home, 'Library', 'Application Support', 'dev.zed.Zed'))
  } else if (process.platform === 'win32') {
    const appData = env.APPDATA
    if (appData) {
      configDirs.add(join(appData, 'Zed'))
      configDirs.add(join(appData, 'dev.zed.Zed'))
    }
  } else {
    configDirs.add(join(home, '.config', 'zed'))
    configDirs.add(join(home, '.config', 'dev.zed.Zed'))
    configDirs.add(join(home, '.local', 'share', 'zed'))
    configDirs.add(join(home, '.local', 'share', 'dev.zed.Zed'))
  }

  const legacyConfig = join(home, '.zed')
  configDirs.add(legacyConfig)

  for (const dir of configDirs) {
    paths.push(join(dir, 'settings.json'))
  }

  return paths
}

const extractVSCodeTheme = (content: string): ThemeName | null => {
  // Try standard colorTheme setting
  const colorThemeMatch = content.match(
    /"workbench\.colorTheme"\s*:\s*"([^"]+)"/i,
  )
  if (colorThemeMatch) {
    const inferred = inferThemeFromName(colorThemeMatch[1])
    if (inferred) return inferred
  }

  // Check if auto-detect is enabled and try preferred themes
  const autoDetectMatch = content.match(
    /"window\.autoDetectColorScheme"\s*:\s*(true|false)/i,
  )
  const autoDetectEnabled = autoDetectMatch?.[1]?.toLowerCase() === 'true'

  if (autoDetectEnabled) {
    // Try to extract both preferred themes and infer from their names
    const preferredDarkMatch = content.match(
      /"workbench\.preferredDarkColorTheme"\s*:\s*"([^"]+)"/i,
    )
    if (preferredDarkMatch) {
      const inferred = inferThemeFromName(preferredDarkMatch[1])
      if (inferred) return inferred
    }

    const preferredLightMatch = content.match(
      /"workbench\.preferredLightColorTheme"\s*:\s*"([^"]+)"/i,
    )
    if (preferredLightMatch) {
      const inferred = inferThemeFromName(preferredLightMatch[1])
      if (inferred) return inferred
    }
  }

  return null
}

const extractJetBrainsTheme = (content: string): ThemeName | null => {
  // Check if autodetect is enabled (Sync with OS setting)
  const autodetectMatch = content.match(
    /<component[^>]+name="LafManager"[^>]+autodetect="(true|false)"/i,
  )
  if (autodetectMatch?.[1]?.toLowerCase() === 'true') {
    // When syncing with OS, return null to trigger platform detection
    return null
  }

  const normalized = content.toLowerCase()
  if (normalized.includes('darcula') || normalized.includes('dark')) {
    return 'midnight'
  }

  if (normalized.includes('light')) {
    return 'light'
  }

  return null
}

const isVSCodeFamilyTerminal = (
  env: CliEnv = getCliEnv(),
): boolean => {
  if (env.TERM_PROGRAM?.toLowerCase() === 'vscode') {
    return true
  }

  // Check VS Code family env keys
  if (
    env.VSCODE_GIT_IPC_HANDLE ||
    env.VSCODE_PID ||
    env.VSCODE_CWD ||
    env.VSCODE_NLS_CONFIG ||
    env.CURSOR_PORT ||
    env.CURSOR
  ) {
    return true
  }

  return false
}

const isJetBrainsTerminal = (
  env: CliEnv = getCliEnv(),
): boolean => {
  if (env.TERMINAL_EMULATOR?.toLowerCase().includes('jetbrains')) {
    return true
  }

  // Check JetBrains env keys
  if (
    env.JETBRAINS_REMOTE_RUN ||
    env.IDEA_INITIAL_DIRECTORY ||
    env.IDE_CONFIG_DIR ||
    env.JB_IDE_CONFIG_DIR
  ) {
    return true
  }

  return false
}

const isZedTerminal = (
  env: CliEnv = getCliEnv(),
): boolean => {
  const termProgram = env.TERM_PROGRAM?.toLowerCase()
  return termProgram === 'zed' || false
}

const detectVSCodeTheme = (
  env: CliEnv = getCliEnv(),
): ThemeName | null => {
  if (!isVSCodeFamilyTerminal(env)) {
    return null
  }

  const settingsPaths = collectExistingPaths(resolveVSCodeSettingsPaths(env))

  for (const settingsPath of settingsPaths) {
    const content = safeReadFile(settingsPath)
    if (!content) continue
    const theme = extractVSCodeTheme(content)
    if (theme) {
      return theme
    }

    // If extractVSCodeTheme returned null but auto-detect is enabled,
    // use platform theme as fallback
    const autoDetectMatch = content.match(
      /"window\.autoDetectColorScheme"\s*:\s*(true|false)/i,
    )
    if (autoDetectMatch?.[1]?.toLowerCase() === 'true') {
      return detectPlatformTheme()
    }
  }

  const themeKindEnv =
    env.VSCODE_THEME_KIND ?? env.VSCODE_COLOR_THEME_KIND
  if (themeKindEnv) {
    const normalized = themeKindEnv.trim().toLowerCase()
    if (normalized === 'dark' || normalized === 'hc') return 'midnight'
    if (normalized === 'light') return 'light'
  }

  return null
}

const detectJetBrainsTheme = (
  env: CliEnv = getCliEnv(),
): ThemeName | null => {
  if (!isJetBrainsTerminal(env)) {
    return null
  }

  const lafPaths = collectExistingPaths(resolveJetBrainsLafPaths(env))

  for (const lafPath of lafPaths) {
    const content = safeReadFile(lafPath)
    if (!content) continue
    const theme = extractJetBrainsTheme(content)
    if (theme) {
      return theme
    }

    // If extractJetBrainsTheme returned null, check if autodetect is enabled
    // and fall back to platform detection
    const autodetectMatch = content.match(
      /<component[^>]+name="LafManager"[^>]+autodetect="(true|false)"/i,
    )
    if (autodetectMatch?.[1]?.toLowerCase() === 'true') {
      return detectPlatformTheme()
    }
  }

  return null
}

const extractZedTheme = (content: string): ThemeName | null => {
  try {
    const sanitized = stripJsonStyleComments(content)
    const parsed = JSON.parse(sanitized) as Record<string, unknown>
    const candidates: unknown[] = []

    const themeSetting = parsed.theme
    if (typeof themeSetting === 'string') {
      candidates.push(themeSetting)
    } else if (themeSetting && typeof themeSetting === 'object') {
      const themeConfig = themeSetting as Record<string, unknown>
      const modeRaw = themeConfig.mode
      if (typeof modeRaw === 'string') {
        const mode = modeRaw.toLowerCase()
        // If mode is 'system', return null to trigger platform detection
        if (mode === 'system') {
          return null
        }
        if (mode === 'dark' || mode === 'light') {
          candidates.push(mode)
          const modeTheme = themeConfig[mode]
          if (typeof modeTheme === 'string') {
            candidates.push(modeTheme)
          }
        }
      }

      const darkTheme = themeConfig.dark
      if (typeof darkTheme === 'string') {
        candidates.push(darkTheme)
      }

      const lightTheme = themeConfig.light
      if (typeof lightTheme === 'string') {
        candidates.push(lightTheme)
      }
    }

    const appearance = parsed.appearance
    if (appearance && typeof appearance === 'object') {
      const appearanceTheme = (appearance as Record<string, unknown>).theme
      if (typeof appearanceTheme === 'string') {
        candidates.push(appearanceTheme)
      }

      const preference = (appearance as Record<string, unknown>)
        .theme_preference
      if (typeof preference === 'string') {
        candidates.push(preference)
      }
    }

    const ui = parsed.ui
    if (ui && typeof ui === 'object') {
      const uiTheme = (ui as Record<string, unknown>).theme
      if (typeof uiTheme === 'string') {
        candidates.push(uiTheme)
      }
    }

    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue

      const inferred = inferThemeFromName(candidate)
      if (inferred) {
        return inferred
      }
    }
  } catch {
    // Ignore malformed or partially written files
  }

  return null
}

const detectZedTheme = (
  env: CliEnv = getCliEnv(),
): ThemeName | null => {
  if (!isZedTerminal(env)) {
    return null
  }

  const settingsPaths = collectExistingPaths(resolveZedSettingsPaths(env))
  for (const settingsPath of settingsPaths) {
    const content = safeReadFile(settingsPath)
    if (!content) continue

    const theme = extractZedTheme(content)
    if (theme) {
      return theme
    }

    // If extractZedTheme returned null, check if theme mode is 'system'
    // and fall back to platform detection
    try {
      const sanitized = stripJsonStyleComments(content)
      const parsed = JSON.parse(sanitized) as Record<string, unknown>
      const themeSetting = parsed.theme
      if (themeSetting && typeof themeSetting === 'object') {
        const themeConfig = themeSetting as Record<string, unknown>
        const modeRaw = themeConfig.mode
        if (typeof modeRaw === 'string' && modeRaw.toLowerCase() === 'system') {
          return detectPlatformTheme()
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }

  return null
}

export const detectIDETheme = (
  env: CliEnv = getCliEnv(),
): ThemeName | null => {
  const theme = detectVSCodeTheme(env)
  if (theme) return theme
  
  const jbTheme = detectJetBrainsTheme(env)
  if (jbTheme) return jbTheme
  
  const zedTheme = detectZedTheme(env)
  if (zedTheme) return zedTheme
  
  return null
}

export const getIDEThemeConfigPaths = (
  env: CliEnv = getCliEnv(),
): string[] => {
  const paths = new Set<string>()
  for (const path of resolveVSCodeSettingsPaths(env)) {
    paths.add(path)
  }
  for (const path of resolveJetBrainsLafPaths(env)) {
    paths.add(path)
  }
  for (const path of resolveZedSettingsPaths(env)) {
    paths.add(path)
  }
  return [...paths]
}

type ChatThemeOverrides = Partial<Omit<ChatTheme, 'markdown'>> & {
  markdown?: MarkdownThemeOverrides
}

type ThemeOverrideConfig = Partial<Record<ThemeName, ChatThemeOverrides>> & {
  all?: ChatThemeOverrides
}

const mergeMarkdownOverrides = (
  base: MarkdownThemeOverrides | undefined,
  override: MarkdownThemeOverrides | undefined,
): MarkdownThemeOverrides | undefined => {
  if (!base && !override) return undefined
  if (!override)
    return base
      ? {
          ...base,
          headingFg: base.headingFg ? { ...base.headingFg } : undefined,
        }
      : undefined

  const mergedHeading = {
    ...(base?.headingFg ?? {}),
    ...(override.headingFg ?? {}),
  }

  return {
    ...(base ?? {}),
    ...override,
    headingFg:
      Object.keys(mergedHeading).length > 0
        ? (mergedHeading as Partial<Record<MarkdownHeadingLevel, string>>)
        : undefined,
  }
}

const mergeTheme = (
  base: ChatTheme,
  override?: ChatThemeOverrides,
): ChatTheme => {
  if (!override) {
    return {
      ...base,
      markdown: base.markdown
        ? {
            ...base.markdown,
            headingFg: base.markdown.headingFg
              ? { ...base.markdown.headingFg }
              : undefined,
          }
        : undefined,
    }
  }

  return {
    ...base,
    ...override,
    markdown: mergeMarkdownOverrides(base.markdown, override.markdown),
  }
}

export const parseThemeOverrides = (
  raw: string,
): Partial<Record<ThemeName, ChatThemeOverrides>> => {
  try {
    const parsed = JSON.parse(raw) as ThemeOverrideConfig
    if (!parsed || typeof parsed !== 'object') return {}

    const result: Partial<Record<ThemeName, ChatThemeOverrides>> = {}
    const common =
      typeof parsed.all === 'object' && parsed.all ? parsed.all : undefined

    for (const themeName of ['dark', 'light'] as ThemeName[]) {
      const specific =
        typeof parsed?.[themeName] === 'object' && parsed?.[themeName]
          ? parsed?.[themeName]
          : undefined

      const mergedOverrides =
        common || specific
          ? {
              ...(common ?? {}),
              ...(specific ?? {}),
              markdown: mergeMarkdownOverrides(
                common?.markdown,
                specific?.markdown,
              ),
            }
          : undefined

      if (mergedOverrides) {
        result[themeName] = mergedOverrides
      }
    }

    return result
  } catch {
    return {}
  }
}

const textDecoder = new TextDecoder()

const readSpawnOutput = (output: unknown): string => {
  if (!output) return ''
  if (typeof output === 'string') return output.trim()
  if (output instanceof Uint8Array) return textDecoder.decode(output).trim()
  return ''
}

const runSystemCommand = (command: string[]): string | null => {
  if (typeof Bun === 'undefined') return null
  if (command.length === 0) return null

  const [binary] = command
  if (!binary) return null

  const resolvedBinary =
    Bun.which(binary) ??
    (process.platform === 'win32' ? Bun.which(`${binary}.exe`) : null)
  if (!resolvedBinary) return null

  try {
    const result = Bun.spawnSync({
      cmd: [resolvedBinary, ...command.slice(1)],
      stdout: 'pipe',
      stderr: 'pipe',
    })
    if (result.exitCode !== 0) return null
    return readSpawnOutput(result.stdout)
  } catch {
    return null
  }
}

/**
 * Detect Windows PowerShell background color theme
 * Uses PowerShell's (Get-Host).UI.RawUI.BackgroundColor command
 */
function detectWindowsPowerShellTheme(): ThemeName | null {
  if (process.platform !== 'win32') return null

  const bgColor = runSystemCommand([
    'powershell',
    '-NoProfile',
    '-Command',
    '(Get-Host).UI.RawUI.BackgroundColor',
  ])

  if (!bgColor) return null

  const colorLower = bgColor.toLowerCase()

  // Dark background colors in PowerShell
  const darkColors = [
    'black',
    'darkblue',
    'darkgreen',
    'darkcyan',
    'darkred',
    'darkmagenta',
    'darkyellow',
    'darkgray',
  ]
  // Light background colors in PowerShell
  const lightColors = [
    'gray',
    'blue',
    'green',
    'cyan',
    'red',
    'magenta',
    'yellow',
    'white',
  ]

  if (darkColors.includes(colorLower)) return 'midnight'
  if (lightColors.includes(colorLower)) return 'light'

  return null
}

export const detectTerminalOverrides = (): ThemeName | null => {
  return null
}

export function detectPlatformTheme(): ThemeName {
  if (typeof Bun !== 'undefined') {
    if (process.platform === 'darwin') {
      const value = runSystemCommand([
        'defaults',
        'read',
        '-g',
        'AppleInterfaceStyle',
      ])
      if (value?.toLowerCase() === 'dark') return 'midnight'
      return 'light'
    }

    if (process.platform === 'win32') {
      // Try PowerShell background color detection first
      const powershellTheme = detectWindowsPowerShellTheme()
      if (powershellTheme) return powershellTheme

      // Fallback to Windows system theme
      const value = runSystemCommand([
        'powershell',
        '-NoProfile',
        '-Command',
        '(Get-ItemProperty -Path HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize).AppsUseLightTheme',
      ])
      if (value === '0') return 'midnight'
      if (value === '1') return 'light'
    }

    if (process.platform === 'linux') {
      const value = runSystemCommand([
        'gsettings',
        'get',
        'org.gnome.desktop.interface',
        'color-scheme',
      ])
      if (value?.toLowerCase().includes('dark')) return 'midnight'
      if (value?.toLowerCase().includes('light')) return 'light'
    }
  }

  return 'midnight'
}

const BASE_MIDNIGHT = {
  mode: 'dark' as const,
  // Core semantic colors - GitHub Dark inspired
  primary: '#58a6ff',
  accent: '#58a6ff',
  secondary: '#bc8cff',
  tertiary: '#ff7b72',
  success: '#3fb950',
  error: '#f85149',
  warning: '#d29922',
  info: '#58a6ff',
  link: '#58a6ff',
  directory: '#8b949e',

  // Neutral scale - GitHub Dark palette
  foreground: '#c9d1d9',
  foregroundMuted: '#8b949e',
  foregroundSubtle: '#6e7681',
  background: '#0d1117',
  muted: '#8b949e',
  border: '#30363d',
  borderSubtle: '#21262d',
  surface: '#161b22',
  surfaceRaised: '#21262d',
  surfaceSunken: '#0d1117',
  surfaceHover: '#30363d',
  surfaceActive: '#1f6feb33',
  overlay: '#0d1117cc',

  // Status bar segments
  statusBarBg: '#161b22',
  statusBarRemoteBg: '#1f6feb',
  statusBarErrorBg: '#da3633',

  // AI/User messages
  aiMessageBg: '#161b22',
  aiMessageBorder: '#30363d',
  userMessageBg: '#1f6feb1a',
  userMessageBorder: '#1f6feb44',
  aiLine: '#30363d',
  userLine: '#58a6ff',

  // Agent backgrounds
  agentToggleHeaderBg: '#1f6feb',
  agentToggleExpandedBg: '#238636',
  agentFocusedBg: '#30363d',
  agentContentBg: '#0d1117',
  inputFg: '#c9d1d9',
  inputFocusedFg: '#f0f6fc',

  // Mode toggles
  modeFastBg: '#d29922',
  modeFastText: '#d29922',
  modeMaxBg: '#f85149',
  modeMaxText: '#f85149',
  modePlanBg: '#1f6feb',
  modePlanText: '#1f6feb',

  // Activity bar
  activityBarBg: '#010409',
  activityBarActiveBg: '#161b22',
  activityBarFg: '#8b949e',
  activityBarActiveFg: '#58a6ff',

  // Image card
  imageCardBorder: '#30363d',

  // Syntax highlighting colors (GitHub Dark)
  syntaxKeyword: '#ff7b72',
  syntaxString: '#a5d6ff',
  syntaxNumber: '#79c0ff',
  syntaxComment: '#8b949e',
  syntaxFunction: '#d2a8ff',
  syntaxVariable: '#ffa657',
  syntaxOperator: '#ff7b72',
  syntaxPunctuation: '#c9d1d9',
}

const DEFAULT_CHAT_THEMES: Record<ThemeName, ChatTheme> = {
  midnight: {
    ...BASE_MIDNIGHT,
    name: 'midnight',
    markdown: {
      codeBackground: '#161b22',
      codeHeaderFg: '#8b949e',
      inlineCodeFg: '#79c0ff',
      codeTextFg: '#c9d1d9',
      headingFg: {
        1: '#58a6ff',
        2: '#58a6ff',
        3: '#58a6ff',
        4: '#bc8cff',
        5: '#bc8cff',
        6: '#bc8cff',
      },
      listBulletFg: '#8b949e',
      blockquoteBorderFg: '#30363d',
      blockquoteTextFg: '#8b949e',
      dividerFg: '#21262d',
      codeMonochrome: false,
      linkFg: '#58a6ff',
    },
  },
  dark: {
    ...BASE_MIDNIGHT,
    name: 'dark',
    markdown: {
      codeBackground: '#161b22',
      codeHeaderFg: '#8b949e',
      inlineCodeFg: '#79c0ff',
      codeTextFg: '#c9d1d9',
      headingFg: {
        1: '#58a6ff',
        2: '#58a6ff',
        3: '#58a6ff',
        4: '#bc8cff',
        5: '#bc8cff',
        6: '#bc8cff',
      },
      listBulletFg: '#8b949e',
      blockquoteBorderFg: '#30363d',
      blockquoteTextFg: '#8b949e',
      dividerFg: '#21262d',
      codeMonochrome: false,
      linkFg: '#58a6ff',
    },
  },
  solar: {
    ...BASE_MIDNIGHT,
    name: 'solar',
    primary: '#f0883e',
    accent: '#f0883e',
    secondary: '#d29922',
    tertiary: '#ff7b72',
    success: '#3fb950',
    error: '#f85149',
    warning: '#d29922',
    info: '#f0883e',
    link: '#f0883e',
    aiLine: '#30363d',
    userLine: '#f0883e',
    statusBarRemoteBg: '#f0883e',
    aiMessageBorder: '#f0883e33',
    userMessageBg: '#f0883e1a',
    userMessageBorder: '#f0883e44',
    agentToggleHeaderBg: '#f0883e',
    modePlanBg: '#f0883e',
    modePlanText: '#f0883e',
    activityBarActiveFg: '#f0883e',
    markdown: {
      codeBackground: '#161b22',
      codeHeaderFg: '#8b949e',
      inlineCodeFg: '#ffa657',
      codeTextFg: '#c9d1d9',
      headingFg: {
        1: '#f0883e',
        2: '#f0883e',
        3: '#f0883e',
        4: '#d29922',
        5: '#d29922',
        6: '#d29922',
      },
      listBulletFg: '#8b949e',
      blockquoteBorderFg: '#30363d',
      blockquoteTextFg: '#8b949e',
      dividerFg: '#21262d',
      codeMonochrome: false,
      linkFg: '#f0883e',
    },
  },
  matrix: {
    ...BASE_MIDNIGHT,
    name: 'matrix',
    background: '#000000',
    surface: '#001100',
    surfaceRaised: '#002200',
    surfaceSunken: '#000000',
    surfaceHover: '#003300',
    surfaceActive: '#00ff4133',
    border: '#005500',
    borderSubtle: '#003300',
    statusBarBg: '#001100',
    statusBarRemoteBg: '#008f11',
    primary: '#00ff41',
    accent: '#00ff41',
    secondary: '#008f11',
    tertiary: '#39ff14',
    success: '#00ff41',
    error: '#ff0000',
    warning: '#cccc00',
    info: '#00ff41',
    link: '#39ff14',
    foreground: '#00ff41',
    foregroundMuted: '#008f11',
    foregroundSubtle: '#005500',
    muted: '#008f11',
    directory: '#008f11',
    activityBarBg: '#000000',
    activityBarActiveBg: '#001100',
    activityBarFg: '#005500',
    activityBarActiveFg: '#00ff41',
    aiMessageBg: '#000a00',
    aiMessageBorder: '#003300',
    userMessageBg: '#00ff4111',
    userMessageBorder: '#00ff4144',
    aiLine: '#003300',
    userLine: '#00ff41',
    agentToggleHeaderBg: '#008f11',
    agentToggleExpandedBg: '#00ff41',
    agentFocusedBg: '#003300',
    agentContentBg: '#000000',
    inputFg: '#00ff41',
    inputFocusedFg: '#39ff14',
    modeFastBg: '#cccc00',
    modeFastText: '#cccc00',
    modeMaxBg: '#ff0000',
    modeMaxText: '#ff0000',
    modePlanBg: '#008f11',
    modePlanText: '#008f11',
    imageCardBorder: '#003300',
    syntaxKeyword: '#39ff14',
    syntaxString: '#00ff41',
    syntaxNumber: '#00ff41',
    syntaxComment: '#005500',
    syntaxFunction: '#00ff41',
    syntaxVariable: '#00ff41',
    syntaxOperator: '#00ff41',
    syntaxPunctuation: '#008f11',
    overlay: '#000000cc',
    markdown: {
      codeBackground: '#001100',
      codeHeaderFg: '#008f11',
      inlineCodeFg: '#39ff14',
      codeTextFg: '#00ff41',
      headingFg: {
        1: '#00ff41',
        2: '#00ff41',
        3: '#00ff41',
        4: '#39ff14',
        5: '#39ff14',
        6: '#39ff14',
      },
      listBulletFg: '#008f11',
      blockquoteBorderFg: '#003300',
      blockquoteTextFg: '#008f11',
      dividerFg: '#003300',
      codeMonochrome: false,
      linkFg: '#39ff14',
    },
  },
  light: {
    name: 'light',
    mode: 'light',
    // Core semantic colors
    primary: '#0969da',
    accent: '#0969da',
    secondary: '#8250df',
    tertiary: '#cf222e',
    success: '#1a7f37',
    error: '#cf222e',
    warning: '#9a6700',
    info: '#0969da',
    link: '#0969da',
    directory: '#57606a',

    // Neutral scale - GitHub Light
    foreground: '#1f2328',
    foregroundMuted: '#656d76',
    foregroundSubtle: '#8c959f',
    background: '#ffffff',
    muted: '#656d76',
    border: '#d0d7de',
    borderSubtle: '#eaeef2',
    surface: '#f6f8fa',
    surfaceRaised: '#ffffff',
    surfaceSunken: '#f6f8fa',
    surfaceHover: '#eaeef2',
    surfaceActive: '#0969da22',
    overlay: '#ffffffcc',

    // Status bar segments
    statusBarBg: '#f6f8fa',
    statusBarRemoteBg: '#0969da',
    statusBarErrorBg: '#cf222e',

    // AI/User messages
    aiMessageBg: '#f6f8fa',
    aiMessageBorder: '#d0d7de',
    userMessageBg: '#ddf4ff',
    userMessageBorder: '#0969da44',
    aiLine: '#d0d7de',
    userLine: '#0969da',

    // Agent backgrounds
    agentToggleHeaderBg: '#0969da',
    agentToggleExpandedBg: '#1a7f37',
    agentFocusedBg: '#eaeef2',
    agentContentBg: '#ffffff',
    inputFg: '#1f2328',
    inputFocusedFg: '#1f2328',

    // Mode toggles
    modeFastBg: '#bf8700',
    modeFastText: '#bf8700',
    modeMaxBg: '#cf222e',
    modeMaxText: '#cf222e',
    modePlanBg: '#0969da',
    modePlanText: '#0969da',

    // Activity bar
    activityBarBg: '#f6f8fa',
    activityBarActiveBg: '#ffffff',
    activityBarFg: '#656d76',
    activityBarActiveFg: '#0969da',

    // Image card
    imageCardBorder: '#d0d7de',

    // Syntax highlighting colors (GitHub Light)
    syntaxKeyword: '#cf222e',
    syntaxString: '#0a3069',
    syntaxNumber: '#0550ae',
    syntaxComment: '#6e7781',
    syntaxFunction: '#8250df',
    syntaxVariable: '#953800',
    syntaxOperator: '#cf222e',
    syntaxPunctuation: '#1f2328',

    // Markdown
    markdown: {
      codeBackground: '#f6f8fa',
      codeHeaderFg: '#656d76',
      inlineCodeFg: '#0550ae',
      codeTextFg: '#1f2328',
      headingFg: {
        1: '#0969da',
        2: '#0969da',
        3: '#0969da',
        4: '#8250df',
        5: '#8250df',
        6: '#8250df',
      },
      listBulletFg: '#656d76',
      blockquoteBorderFg: '#d0d7de',
      blockquoteTextFg: '#656d76',
      dividerFg: '#eaeef2',
      codeMonochrome: false,
      linkFg: '#0969da',
    },
  },
}

export const chatThemes = {
  midnight: DEFAULT_CHAT_THEMES.midnight,
  dark: DEFAULT_CHAT_THEMES.dark,
  solar: DEFAULT_CHAT_THEMES.solar,
  matrix: DEFAULT_CHAT_THEMES.matrix,
  light: DEFAULT_CHAT_THEMES.light,
}

export const createMarkdownPalette = (theme: ChatTheme): MarkdownPalette => {
  const headingDefaults: Record<MarkdownHeadingLevel, string> = {
    1: theme.primary,
    2: theme.primary,
    3: theme.primary,
    4: theme.primary,
    5: theme.primary,
    6: theme.primary,
  }

  const overrides = theme.markdown?.headingFg ?? {}

  return {
    inlineCodeFg: theme.markdown?.inlineCodeFg ?? theme.foreground,
    codeBackground: theme.markdown?.codeBackground ?? theme.background,
    codeHeaderFg: theme.markdown?.codeHeaderFg ?? theme.secondary,
    headingFg: {
      ...headingDefaults,
      ...overrides,
    },
    listBulletFg: theme.markdown?.listBulletFg ?? theme.secondary,
    blockquoteBorderFg: theme.markdown?.blockquoteBorderFg ?? theme.secondary,
    blockquoteTextFg: theme.markdown?.blockquoteTextFg ?? theme.foreground,
    dividerFg: theme.markdown?.dividerFg ?? theme.secondary,
    codeTextFg: theme.markdown?.codeTextFg ?? theme.foreground,
    codeMonochrome: theme.markdown?.codeMonochrome ?? true,
    linkFg: theme.markdown?.linkFg ?? theme.link,
  }
}

/**
 * Check if a theme name is a dark mode theme
 */
export const isDarkTheme = (themeName: ThemeName): boolean => {
  return themeName !== 'light'
}

/**
 * Get the block color for the logo based on theme and terminal capabilities.
 */
export function getLogoBlockColor(
  themeName: ThemeName,
  env: CliEnv = getCliEnv(),
): string {
  const isTruecolor = supportsTruecolor(env)
  if (isDarkTheme(themeName)) {
    return isTruecolor ? '#ffffff' : 'white'
  }
  return isTruecolor ? '#000000' : 'black'
}

/**
 * Get the accent color for the logo based on theme and terminal capabilities.
 */
export function getLogoAccentColor(
  themeName: ThemeName,
  env: CliEnv = getCliEnv(),
): string {
  const isTruecolor = supportsTruecolor(env)
  const theme = chatThemes[themeName] ?? chatThemes.midnight
  if (isDarkTheme(themeName)) {
    return isTruecolor ? theme.primary : 'cyan'
  }
  return isTruecolor ? theme.primary : 'blue'
}

/**
 * Exported utilities for theme system
 */

/**
 * Merge theme overrides with a base theme
 * Alias for mergeTheme to match our hook API
 */
export const mergeThemeOverrides = mergeTheme

/**
 * Clone a ChatTheme object to avoid mutations
 * Properly handles nested markdown configuration
 */
export const cloneChatTheme = (input: ChatTheme): ChatTheme => ({
  ...input,
  markdown: input.markdown
    ? {
        ...input.markdown,
        headingFg: input.markdown.headingFg
          ? { ...input.markdown.headingFg }
          : undefined,
      }
    : undefined,
})

/**
 * Resolve a theme color value with optional fallback
 * Returns undefined for 'default' values or empty strings
 */
export const resolveThemeColor = (
  color?: string,
  fallback?: string,
): string | undefined => {
  if (typeof color === 'string') {
    const normalized = color.trim().toLowerCase()
    if (normalized.length > 0 && normalized !== 'default') {
      return color
    }
  }

  if (fallback !== undefined) {
    return resolveThemeColor(fallback)
  }

  return undefined
}

/**
 * Reactive Theme Detection
 * Watches for system theme changes and updates zustand store
 */

// Debounce timing for file watcher events
const FILE_WATCHER_DEBOUNCE_MS = 250

let themeStoreUpdater: ((name: ThemeName) => void) | null = null
// OSC detections happen asynchronously and at most once.
// We cache the resolved value so synchronous theme code can read it later
// without triggering terminal I/O.
let oscDetectedTheme: ThemeName | null = null
let pendingRecomputeTimer: NodeJS.Timeout | null = null
let themeResolver: (() => ThemeName) | null = null

export const getOscDetectedTheme = (): ThemeName | null => oscDetectedTheme
export const setOscDetectedTheme = (theme: ThemeName | null): void => {
  oscDetectedTheme = theme
}
export const setThemeResolver = (resolver: () => ThemeName) => {
  themeResolver = resolver
}

/**
 * Initialize theme store updater
 * Called by theme-store on initialization to enable reactive updates
 * @param setter - Function to call when theme changes
 */
export const initializeThemeWatcher = (setter: (name: ThemeName) => void) => {
  themeStoreUpdater = setter
}

/**
 * Recompute system theme and update store if it changed
 */
const recomputeSystemTheme = () => {
  const env = getCliEnv()
  // Only recompute if theme is auto-detected (not explicitly set)
  const envPreference = env.OPEN_TUI_THEME ?? env.OPENTUI_THEME
  if (envPreference && envPreference.toLowerCase() !== 'opposite') {
    // User explicitly set theme, don't react to system changes
    return
  }

  if (!themeResolver) {
    return
  }

  const newTheme = themeResolver()

  // Always call the updater and let it decide if an update is needed
  if (themeStoreUpdater) {
    themeStoreUpdater(newTheme)
  }
}

/**
 * Debounced version of recomputeSystemTheme for file watcher events
 * Prevents excessive recomputations when files change rapidly
 */
const debouncedRecomputeSystemTheme = () => {
  if (pendingRecomputeTimer) {
    clearTimeout(pendingRecomputeTimer)
  }
  pendingRecomputeTimer = setTimeout(() => {
    pendingRecomputeTimer = null
    recomputeSystemTheme()
  }, FILE_WATCHER_DEBOUNCE_MS)
}

let lastDetectedTheme: ThemeName | null = null
export function setLastDetectedTheme(theme: ThemeName) {
  lastDetectedTheme = theme
}
export function getLastDetectedTheme(): ThemeName | null {
  return lastDetectedTheme
}

/**
 * Setup file watchers for theme changes
 * Watches parent directories which reliably catches all file modifications
 */
export const setupFileWatchers = () => {
  const watchTargets: string[] = []
  const watchedDirs = new Set<string>()

  // macOS system preferences
  if (process.platform === 'darwin') {
    watchTargets.push(
      join(homedir(), 'Library/Preferences/.GlobalPreferences.plist'),
      join(homedir(), 'Library/Preferences/com.apple.Terminal.plist'),
    )
  }

  // IDE config files - only watch for the active IDE terminal
  if (isVSCodeFamilyTerminal()) {
    watchTargets.push(...resolveVSCodeSettingsPaths())
  }
  if (isJetBrainsTerminal()) {
    watchTargets.push(...resolveJetBrainsLafPaths())
  }
  if (isZedTerminal()) {
    watchTargets.push(...resolveZedSettingsPaths())
  }

  // Watch parent directories instead of individual files
  // Directory watches are more reliable for catching all modifications including plist key deletions
  for (const target of watchTargets) {
    if (existsSync(target)) {
      const parentDir = dirname(target)

      // Only watch each directory once
      if (watchedDirs.has(parentDir)) continue
      watchedDirs.add(parentDir)

      try {
        // Watch the directory - catches all file modifications
        const watcher = watch(
          parentDir,
          { persistent: false },
          (eventType, filename) => {
            // Only respond to changes affecting our target files
            if (filename && watchTargets.some((t) => t.endsWith(filename))) {
              debouncedRecomputeSystemTheme()
            }
          },
        )

        watcher.on('error', () => {
          // Silently ignore watcher errors
        })
      } catch {
        // Silently ignore if we can't watch
      }
    }
  }
}

/**
 * SIGUSR2 signal handler for manual theme refresh
 * Users can send `kill -USR2 <pid>` to force theme recomputation
 */
export function enableManualThemeRefresh() {
  process.on('SIGUSR2', () => {
    recomputeSystemTheme()
  })
}

/**
 * OSC Terminal Theme Detection
 * 
 * OSC detection is now run synchronously at app startup in index.tsx,
 * BEFORE OpenTUI is initialized. This avoids stdin conflicts since
 * OpenTUI hasn't attached its listeners yet.
 * 
 * The detected theme is stored via setOscDetectedTheme() and retrieved
 * via getOscDetectedTheme() when building the theme.
 */
