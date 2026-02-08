import { TextAttributes } from '@opentui/core'
import React, { memo } from 'react'

import { useTheme } from '../../hooks/use-theme'

interface KeyHintEntry {
  key: string
  label: string
}

interface KeyHintProps {
  hints: KeyHintEntry[]
}

export const KeyHint = memo(function KeyHint({ hints }: KeyHintProps) {
  const theme = useTheme()

  return (
    <box style={{ flexDirection: 'row', gap: 0 }}>
      {hints.map((hint, idx) => (
        <box key={hint.key} style={{ flexDirection: 'row', gap: 0 }}>
          {idx > 0 && (
            <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
              {' \u00B7 '}
            </text>
          )}
          <text style={{ fg: theme.muted, attributes: TextAttributes.BOLD }}>
            {'\u2039'}{hint.key}{'\u203A'}
          </text>
          <text style={{ fg: theme.border }}>{' '}{hint.label}</text>
        </box>
      ))}
    </box>
  )
})
