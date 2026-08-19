import React from 'react'

import { useTheme } from '../hooks/use-theme'

interface SeparatorProps {
  width: number
  widthOffset?: number
  char?: string
  color?: string
  gradient?: boolean
  gradientFrom?: string
  gradientTo?: string
  vertical?: boolean
}

export const Separator: React.FC<SeparatorProps> = ({
  width,
  widthOffset = 0,
  char = '─',
  color,
  gradient = false,
  gradientFrom,
  gradientTo,
  vertical = false,
}) => {
  const theme = useTheme()
  const separatorWidth = Math.max(1, width - widthOffset)
  const fgColor = color || theme.border

  if (!gradient) {
    return (
      <box style={{ height: vertical ? separatorWidth : 1, width: vertical ? 1 : separatorWidth, flexShrink: 0 }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg={fgColor}>{vertical ? '│'.repeat(separatorWidth) : char.repeat(separatorWidth)}</span>
        </text>
      </box>
    )
  }

  const from = gradientFrom ?? theme.primary
  const to = gradientTo ?? theme.secondary

  const segments: React.ReactNode[] = []
  const segLen = Math.max(1, Math.floor(separatorWidth / 3))
  const mid = separatorWidth - segLen * 2

  if (segLen > 0) {
    segments.push(<span key="from" fg={from}>{char.repeat(segLen)}</span>)
  }
  if (mid > 0) {
    segments.push(<span key="mid" fg={fgColor}>{char.repeat(mid)}</span>)
  }
  if (segLen > 0) {
    segments.push(<span key="to" fg={to}>{char.repeat(segLen)}</span>)
  }

  return (
    <box style={{ height: 1, width: separatorWidth, flexShrink: 0 }}>
      <text style={{ wrapMode: 'none' }}>{segments}</text>
    </box>
  )
}
