import type { KeyEvent } from '@opentui/core'

const TAB_WIDTH = 4

/**
 * Find the start of the current line (position after previous \n or 0).
 */
export function findLineStart(text: string, cursor: number): number {
  let pos = Math.max(0, Math.min(cursor, text.length))
  while (pos > 0 && text[pos - 1] !== '\n') {
    pos--
  }
  return pos
}

/**
 * Find the end of the current line (position of next \n or text.length).
 */
export function findLineEnd(text: string, cursor: number): number {
  let pos = Math.max(0, Math.min(cursor, text.length))
  while (pos < text.length && text[pos] !== '\n') {
    pos++
  }
  return pos
}

/**
 * Find previous word boundary for Alt+Left navigation.
 */
export function findPreviousWordBoundary(text: string, cursor: number): number {
  let pos = Math.max(0, Math.min(cursor, text.length))

  // Skip whitespace backwards
  while (pos > 0 && /\s/.test(text[pos - 1])) {
    pos--
  }

  // Skip word characters backwards
  while (pos > 0 && !/\s/.test(text[pos - 1])) {
    pos--
  }

  return pos
}

/**
 * Find next word boundary for Alt+Right navigation.
 */
export function findNextWordBoundary(text: string, cursor: number): number {
  let pos = Math.max(0, Math.min(cursor, text.length))

  // Skip non-whitespace forwards
  while (pos < text.length && !/\s/.test(text[pos])) {
    pos++
  }

  // Skip whitespace forwards
  while (pos < text.length && /\s/.test(text[pos])) {
    pos++
  }

  return pos
}

/**
 * Check if a key event represents printable character input.
 */
export function isPrintableCharacterKey(key: KeyEvent): boolean {
  const name = key.name

  if (!name) return true
  if (name.length === 1) return true
  if (name === 'space') return true
  return false
}

/**
 * Convert render position (tab-expanded) to original text position.
 */
export function renderPositionToOriginal(text: string, renderPos: number): number {
  let originalPos = 0
  let currentRenderPos = 0

  while (originalPos < text.length && currentRenderPos < renderPos) {
    if (text[originalPos] === '\t') {
      currentRenderPos += TAB_WIDTH
    } else {
      currentRenderPos += 1
    }
    originalPos++
  }

  return Math.min(originalPos, text.length)
}

type KeyWithPreventDefault =
  | {
      preventDefault?: () => void
    }
  | null
  | undefined

export function preventKeyDefault(key: KeyWithPreventDefault) {
  key?.preventDefault?.()
}

/**
 * Check for alt-like modifier keys.
 */
export function isAltModifier(key: KeyEvent): boolean {
  const ESC = '\x1b'
  return Boolean(
    key.option ||
      (key.sequence?.length === 2 &&
        key.sequence[0] === ESC &&
        key.sequence[1] !== '['),
  )
}
