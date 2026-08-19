export type ThemeName = 'midnight' | 'dark' | 'solar' | 'matrix' | 'light'

export type ThemeMode = 'dark' | 'light'

export type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

// ThemeColor is always a resolved color string (never 'default' or undefined)
export type ThemeColor = string

export interface MarkdownThemeOverrides {
  codeBackground?: string
  codeHeaderFg?: string
  inlineCodeFg?: string
  codeTextFg?: string
  headingFg?: Partial<Record<MarkdownHeadingLevel, string>>
  listBulletFg?: string
  blockquoteBorderFg?: string
  blockquoteTextFg?: string
  dividerFg?: string
  codeMonochrome?: boolean
  linkFg?: string
}

/**
 * Semantic Color Theme Interface
 * Modern IDE-inspired dark theme with GitHub Dark aesthetics
 */
export interface ChatTheme {
  /** Theme identifier */
  name: ThemeName
  /** Base mode (dark or light) for compatibility */
  mode: ThemeMode

  // ============================================================================
  // CORE SEMANTIC COLORS
  // ============================================================================

  /** Primary brand/accent color - electric cyan-blue */
  primary: string

  /** Legacy accent alias (same as primary) */
  accent?: string

  /** Secondary accent - purple/indigo */
  secondary: string

  /** Tertiary accent - for variety */
  tertiary: string

  /** Success color - green */
  success: string

  /** Error/danger color - red */
  error: string

  /** Warning color - amber */
  warning: string

  /** Info color - purple/blue */
  info: string

  /** Link color */
  link: string

  /** Directory color */
  directory: string

  // ============================================================================
  // NEUTRAL SCALE (GitHub Dark inspired)
  // ============================================================================

  /** Default text color */
  foreground: ThemeColor

  /** Muted text color */
  foregroundMuted: string

  /** Subtle text color */
  foregroundSubtle: string

  /** Base background color - deep charcoal */
  background: string

  /** Subdued/secondary text color */
  muted: ThemeColor

  /** Border and divider color */
  border: string

  /** Subtle border color */
  borderSubtle: string

  /** Surface color for panels, cards, chrome */
  surface: string

  /** Raised surface (elevated panels) */
  surfaceRaised: string

  /** Sunken/inset surface (input fields) */
  surfaceSunken: string

  /** Hover state for interactive surfaces */
  surfaceHover: string

  /** Active/selected state */
  surfaceActive: string

  /** Overlay/dim background */
  overlay: string

  // ============================================================================
  // STATUS BAR SEGMENTS
  // ============================================================================

  /** Status bar background */
  statusBarBg: string

  /** Status bar remote/branch segment background */
  statusBarRemoteBg: string

  /** Status bar errors/warnings background */
  statusBarErrorBg: string

  // ============================================================================
  // CONTEXT-SPECIFIC COLORS
  // ============================================================================

  // AI/User differentiation
  /** AI message background */
  aiMessageBg: string

  /** AI message border */
  aiMessageBorder: string

  /** User message background - accent tinted */
  userMessageBg: string

  /** User message border */
  userMessageBorder: string

  /** Agent/AI accent line */
  aiLine: string

  /** User accent line */
  userLine: string

  // Agent backgrounds
  /** Agent toggle header background */
  agentToggleHeaderBg: string

  /** Agent toggle expanded background */
  agentToggleExpandedBg: string

  /** Agent focused background */
  agentFocusedBg: string

  /** Agent content background */
  agentContentBg: string

  /** Input text color */
  inputFg: ThemeColor

  /** Focused input text color */
  inputFocusedFg: ThemeColor

  // Mode toggles
  /** Fast mode toggle background */
  modeFastBg: string

  /** Fast mode toggle text */
  modeFastText: string

  /** Max mode toggle background */
  modeMaxBg: string

  /** Max mode toggle text */
  modeMaxText: string

  /** Plan mode toggle background */
  modePlanBg: string

  /** Plan mode toggle text */
  modePlanText: string

  // Activity bar
  /** Activity bar background */
  activityBarBg: string

  /** Activity bar active item background */
  activityBarActiveBg: string

  /** Activity bar foreground */
  activityBarFg: string

  /** Activity bar active foreground */
  activityBarActiveFg: string

  // ============================================================================
  // IMAGE CARD
  // ============================================================================

  /** Image card border color */
  imageCardBorder: string

  // ============================================================================
  // CODE BLOCKS
  // ============================================================================

  /** Code block syntax colors */
  syntaxKeyword: string
  syntaxString: string
  syntaxNumber: string
  syntaxComment: string
  syntaxFunction: string
  syntaxVariable: string
  syntaxOperator: string
  syntaxPunctuation: string

  // ============================================================================
  // MARKDOWN
  // ============================================================================

  /** Markdown-specific styling */
  markdown?: MarkdownThemeOverrides

  /** Text attributes (bold, dim, etc.) */
  messageTextAttributes?: number
}

/** Theme preset metadata for UI display */
export interface ThemePreset {
  id: ThemeName
  name: string
  description: string
  mode: ThemeMode
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep charcoal dark theme (GitHub Dark inspired)',
    mode: 'dark',
  },
  {
    id: 'solar',
    name: 'Solar',
    description: 'Warm orange-accented dark theme',
    mode: 'dark',
  },
  {
    id: 'matrix',
    name: 'Matrix',
    description: 'Classic green-on-black hacker theme',
    mode: 'dark',
  },
  {
    id: 'light',
    name: 'Light',
    description: 'Clean light theme for daytime use',
    mode: 'light',
  },
]
