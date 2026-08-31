import { TextAttributes } from '@opentui/core'
import React, { useState, useEffect, memo } from 'react'

import { useTheme } from '../../hooks/use-theme'

type SpinnerVariant = 'dots' | 'line' | 'arc' | 'bounce'

interface SpinnerProps {
  text?: string
  variant?: SpinnerVariant
  /**
   * Frame interval in ms. Defaults follow cli-spinners standards: 80ms for
   * braille glyphs (slow enough to track, fast enough to feel alive).
   */
  intervalMs?: number
  /**
   * Set when the work completed. Renders a single ✓ line instead of an
   * animation — a finished spinner must never freeze mid-frame.
   */
  done?: boolean
}

/**
 * Frame sets are single-column glyphs only (braille, box drawing, ASCII) so
 * the spinner keeps its width while animating and never shifts layout.
 */
const SPINNER_FRAMES: Record<SpinnerVariant, string[]> = {
  dots: ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'],
  line: ['\u2500', '\\', '\u2502', '/'],
  arc: ['\u25DC', '\u25DD', '\u25DE', '\u25DF'],
  bounce: ['\u2596', '\u2598', '\u259D', '\u2597'],
}

const SPINNER_INTERVALS: Record<SpinnerVariant, number> = {
  dots: 80,
  line: 130,
  arc: 80,
  bounce: 120,
}

/**
 * Motion is a courtesy, not a requirement: terminals batch frames, and
 * recording/SSH sessions amplify flicker. LEVELCODE_SPINNER_INTERVAL_MS
 * retunes cadence globally; LEVELCODE_NO_MOTION=1 freezes on a static
 * glyph (the reduced-motion fallback for screen readers and slow links).
 */
function resolveInterval(variant: SpinnerVariant, override?: number): number {
  if (override !== undefined && override > 0) return override
  const fromEnv = Number(process.env.LEVELCODE_SPINNER_INTERVAL_MS)
  if (Number.isFinite(fromEnv) && fromEnv >= 40) return fromEnv
  return SPINNER_INTERVALS[variant]
}

const isNoMotion = () => process.env.LEVELCODE_NO_MOTION === '1'

export const Spinner = memo(function Spinner({
  text,
  variant = 'dots',
  intervalMs,
  done = false,
}: SpinnerProps) {
  const theme = useTheme()
  const frames = SPINNER_FRAMES[variant]
  const [frameIndex, setFrameIndex] = useState(0)

  const animate = !done && !isNoMotion()

  useEffect(() => {
    if (!animate) return
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length)
    }, resolveInterval(variant, intervalMs))
    return () => clearInterval(interval)
  }, [animate, frames.length, variant, intervalMs])

  if (done) {
    return (
      <box style={{ flexDirection: 'row', gap: 1 }}>
        <text style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>
          {'\u2713'}
        </text>
        {text && (
          <text style={{ fg: theme.foregroundMuted }}>{text}</text>
        )}
      </box>
    )
  }

  return (
    <box style={{ flexDirection: 'row', gap: 1 }}>
      <text style={{ fg: theme.primary, attributes: TextAttributes.BOLD }}>
        {animate ? frames[frameIndex] : frames[0]!}
      </text>
      {text && (
        <text style={{ fg: theme.foreground }}>{text}</text>
      )}
    </box>
  )
})
