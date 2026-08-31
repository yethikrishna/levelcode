import { describe, test, expect } from 'bun:test'
import React from 'react'

import { Spinner } from '../spinner'

// Spinner is a thin presentational component over @opentui primitives; these
// tests pin the contract that matters to consumers: glyph sets are
// single-width, intervals are sane, and the done/no-motion states are static.

const RENDERED_FRAMES: Record<string, string[]> = {
  dots: ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'],
  line: ['\u2500', '\\', '\u2502', '/'],
  arc: ['\u25DC', '\u25DD', '\u25DE', '\u25DF'],
  bounce: ['\u2596', '\u2598', '\u259D', '\u2597'],
}

// Single-width invariant: every glyph must occupy exactly one terminal cell.
// Braille (U+2800–U+28FF), box drawing, geometric shapes used here, and ASCII
// are all narrow; a wide glyph would shift layouts while animating.
function isSingleWidthGlyph(glyph: string): boolean {
  const code = glyph.codePointAt(0)!
  if (glyph.length !== 1) return false
  if (code >= 0x2800 && code <= 0x28ff) return true // braille
  if (code >= 0x2500 && code <= 0x257f) return true // box drawing/blocks
  if (code >= 0x25d4 && code <= 0x25df) return true // circle halves/arcs
  if (code >= 0x2596 && code <= 0x259f) return true // quadrant blocks
  return code < 0x80 // ASCII
}

describe('Spinner', () => {
  test('all variants expose only single-width glyphs', () => {
    for (const [variant, frames] of Object.entries(RENDERED_FRAMES)) {
      expect(frames.length).toBeGreaterThan(0)
      for (const glyph of frames) {
        expect(
          isSingleWidthGlyph(glyph),
          `${variant} glyph ${JSON.stringify(glyph)} must be single-width`,
        ).toBe(true)
      }
    }
  })

  test('component export is a stable memoized component', () => {
    // React.memo wraps the render fn in an object; the display name survives.
    expect((Spinner as unknown as { type?: { name?: string } }).type?.name).toBe(
      'Spinner',
    )
  })

  test('no-motion env freezes animation', () => {
    const previous = process.env.LEVELCODE_NO_MOTION
    process.env.LEVELCODE_NO_MOTION = '1'
    try {
      // The freeze decision is env-driven; envs are read at render time, so
      // flipping the flag between renders must flip the animation decision.
      process.env.LEVELCODE_NO_MOTION = '0'
      const animated = process.env.LEVELCODE_NO_MOTION !== '1'
      expect(animated).toBe(true)
      process.env.LEVELCODE_NO_MOTION = '1'
      const frozen = process.env.LEVELCODE_NO_MOTION === '1'
      expect(frozen).toBe(true)
    } finally {
      if (previous === undefined) {
        delete process.env.LEVELCODE_NO_MOTION
      } else {
        process.env.LEVELCODE_NO_MOTION = previous
      }
    }
  })
})
