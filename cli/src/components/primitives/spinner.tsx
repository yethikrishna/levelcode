import { TextAttributes } from '@opentui/core'
import React, { useState, useEffect, memo } from 'react'

import { useTheme } from '../../hooks/use-theme'

type SpinnerVariant = 'dots' | 'line' | 'arc'

interface SpinnerProps {
  text?: string
  variant?: SpinnerVariant
}

const SPINNER_FRAMES: Record<SpinnerVariant, string[]> = {
  dots: ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'],
  line: ['\u2500', '\\', '\u2502', '/'],
  arc: ['\u25DC', '\u25DD', '\u25DE', '\u25DF'],
}

const FRAME_INTERVAL = 80

export const Spinner = memo(function Spinner({
  text,
  variant = 'dots',
}: SpinnerProps) {
  const theme = useTheme()
  const frames = SPINNER_FRAMES[variant]
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length)
    }, FRAME_INTERVAL)
    return () => clearInterval(interval)
  }, [frames.length])

  return (
    <box style={{ flexDirection: 'row', gap: 1 }}>
      <text style={{ fg: theme.primary, attributes: TextAttributes.BOLD }}>
        {frames[frameIndex]}
      </text>
      {text && (
        <text style={{ fg: theme.foreground }}>{text}</text>
      )}
    </box>
  )
})
