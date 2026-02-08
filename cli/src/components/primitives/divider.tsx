import { TextAttributes } from '@opentui/core'
import React, { memo } from 'react'

import { useTheme } from '../../hooks/use-theme'

type DividerStyle = 'solid' | 'dashed' | 'dotted'

interface DividerProps {
  label?: string
  style?: DividerStyle
}

const STYLE_CHARS: Record<DividerStyle, string> = {
  solid: '\u2500',
  dashed: '\u2504',
  dotted: '\u2508',
}

export const Divider = memo(function Divider({
  label,
  style: dividerStyle = 'solid',
}: DividerProps) {
  const theme = useTheme()
  const char = STYLE_CHARS[dividerStyle]

  if (!label) {
    return (
      <box style={{ width: '100%' }}>
        <text style={{ fg: theme.border }}>
          {char.repeat(60)}
        </text>
      </box>
    )
  }

  return (
    <box style={{ flexDirection: 'row', width: '100%', gap: 0 }}>
      <text style={{ fg: theme.border }}>
        {char.repeat(4)}
      </text>
      <text style={{ fg: theme.muted, attributes: TextAttributes.BOLD }}>
        {' '}{label}{' '}
      </text>
      <text style={{ fg: theme.border }}>
        {char.repeat(40)}
      </text>
    </box>
  )
})
