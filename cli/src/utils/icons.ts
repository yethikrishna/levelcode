/**
 * Central icon registry — one semantic glyph per concept, used everywhere.
 *
 * Terminals render text cells, not SVG, so "proper icons" here means a
 * curated single-width Unicode set that renders consistently across
 * platforms (geometric shapes, arrows, status marks) with emoji
 * presentation suppressed via U+FE0E where a codepoint defaults to emoji.
 * This replaces the ~160 scattered emoji (💬👥📁🔍…) with a coherent,
 * themeable visual language — the approach modern TUIs use.
 *
 * Usage: `import { ICON } from '../utils/icons'` then `ICON.status.success`.
 * Colors come from theme tokens at the call site, never baked here.
 */

const TEXT = '︎' // U+FE0E variation selector: force text presentation

export const ICON = {
  // Activity rail / navigation
  nav: {
    chat: '◉', // filled circle-dot — conversation
    teams: '◈', // diamond-in-diamond — swarm
    files: '▤', // lined square — document list
    search: '◎', // bullseye — find
    metrics: '▦', // grid — dashboard
    marketplace: '⬡', // hexagon — packages
    settings: `⚙${TEXT}`, // gear (text presentation)
  },

  // Lifecycle / status
  status: {
    success: '✓',
    error: '✗',
    warning: `⚠${TEXT}`,
    info: 'ⓘ',
    pending: '○', // hollow — queued
    running: '◐', // half — in flight
    done: '●', // filled — complete
    waiting: '◌', // dotted circle — waiting (replaces ⏳)
    stopped: '■', // square — stopped/killed (replaces 🛑)
    paused: '‖', // double bar — paused
    cancelled: '⊘', // slashed circle — cancelled
  },

  // Direction / affordances
  arrow: {
    right: '→',
    next: '▸', // collapsed
    expand: '▾', // expanded
    up: '↑',
    down: '↓',
    left: '←',
    launch: '↗', // open/promote (replaces ↗/🚀)
    prompt: '❯', // input caret
  },

  // Content kinds
  kind: {
    file: '≡', // text content (replaces 📄)
    image: '▣', // framed square (replaces 📷/🖼)
    folder: '▤',
    attachment: '◇', // (replaces 📎)
    link: '∞', // (replaces 🔗)
    package: '▣', // (replaces 📦)
    plugin: '⬢', // filled hexagon (replaces 🔌)
    bot: '◆', // (replaces 🤖)
    memory: '◍', // circle with vertical fill — context/memory
    task: '□', // open checkbox
    taskDone: '☑',
  },

  // Inline marks
  mark: {
    bullet: '•',
    separator: '·',
    hint: `ⓘ${TEXT}`, // (replaces 💡)
    copied: '✓', // (replaces 📋 success)
    favorite: '♥', // (replaces 💖)
    spark: '✦', // (replaces ✨)
    fire: '▲', // (replaces 🔥 — keep monochrome)
  },
} as const

/** Spinner frames — braille dots, already text-safe. */
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const
