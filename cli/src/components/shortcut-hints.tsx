import { TextAttributes } from '@opentui/core'
import React, { memo } from 'react'

import { useTheme } from '../hooks/use-theme'

interface ShortcutHintsProps {
  hints?: ShortcutHint[]
}

export interface ShortcutHint {
  key: string
  label: string
}

const DEFAULT_HINTS: ShortcutHint[] = [
  { key: 'Enter', label: 'Send' },
  { key: 'Shift+Enter', label: 'New line' },
  { key: '/', label: 'Commands' },
  { key: 'Ctrl+K', label: 'Palette' },
  { key: 'Esc', label: 'Cancel' },
]

export const ShortcutHints = memo(function ShortcutHints({ hints = DEFAULT_HINTS }: ShortcutHintsProps) {
  const theme = useTheme()

  return (
    <box
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 0,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        backgroundColor: theme.statusBarBg ?? theme.surface,
        border: ['top'],
        borderColor: theme.border,
        height: 1,
      }}
    >
      {hints.map((hint, idx) => (
        <box key={hint.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
          {idx > 0 && (
            <text style={{ fg: theme.foregroundSubtle ?? theme.muted, attributes: TextAttributes.DIM }}>
              {' \u00B7 '}
            </text>
          )}
          <text style={{ fg: theme.foregroundMuted ?? theme.muted, wrapMode: 'none' }}>
            {'\u2039'}
          </text>
          <text
            style={{
              fg: theme.primary,
              attributes: TextAttributes.BOLD,
              wrapMode: 'none',
            }}
          >
            {hint.key}
          </text>
          <text style={{ fg: theme.foregroundMuted ?? theme.muted, wrapMode: 'none' }}>
            {'\u203A'}
          </text>
          <text style={{ fg: theme.foregroundSubtle ?? theme.muted, wrapMode: 'none' }}>
            {' '}{hint.label}
          </text>
        </box>
      ))}
    </box>
  )
})
