import { TextAttributes } from '@opentui/core'
import React, { memo, useMemo } from 'react'

import { Clickable } from './clickable'
import { useTheme } from '../hooks/use-theme'
import { ICON } from '../utils/icons'

interface WelcomeScreenProps {
  onSuggestionClick?: (text: string) => void
  version?: string
}

interface SuggestionChip {
  icon: string
  label: string
  prompt: string
}

const SUGGESTIONS: SuggestionChip[] = [
  { icon: ICON.nav.search, label: 'Explain this codebase', prompt: 'Explain this codebase and give me an overview of the architecture' },
  { icon: ICON.status.error, label: 'Fix bugs', prompt: 'Find and fix bugs in the codebase' },
  { icon: ICON.kind.taskDone, label: 'Add tests', prompt: 'Add comprehensive tests for the codebase' },
  { icon: ICON.arrow.next, label: 'Refactor', prompt: 'Refactor the code to improve quality and maintainability' },
  { icon: ICON.status.warning, label: 'Security audit', prompt: 'Perform a security audit and identify vulnerabilities' },
  { icon: ICON.kind.file, label: 'Add docs', prompt: 'Add documentation to the codebase' },
]

export const WelcomeScreen = memo(function WelcomeScreen({
  onSuggestionClick,
  version = '0.3.9',
}: WelcomeScreenProps) {
  const theme = useTheme()

  const titleGradient = useMemo(() => {
    return (
      <text style={{ wrapMode: 'none' }} attributes={TextAttributes.BOLD}>
        <span fg={theme.primary}>{'\u2588\u2580\u2580 '}</span>
        <span fg={theme.accent}>{'LevelCode'}</span>
        <span fg={theme.primary}>{' \u2580\u2580\u2588'}</span>
      </text>
    )
  }, [theme.primary, theme.accent])

  return (
    <box
      style={{
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flexGrow: 1,
        gap: 0,
        paddingLeft: 2,
        paddingRight: 2,
        paddingTop: 2,
        paddingBottom: 2,
      }}
    >
      <box style={{ height: 2 }} />

      {titleGradient}

      <box style={{ height: 0 }} />

      <text
        style={{
          fg: theme.foregroundMuted ?? theme.muted,
          attributes: TextAttributes.ITALIC,
        }}
      >
        The Open-Source AI Coding Agent
      </text>

      <box style={{ height: 1 }} />

      <box style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 1, maxWidth: 80 }}>
        {SUGGESTIONS.map((chip) => (
          <Clickable
            key={chip.label}
            onMouseDown={() => onSuggestionClick?.(chip.prompt)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 1,
              paddingLeft: 1,
              paddingRight: 1,
              paddingTop: 0,
              paddingBottom: 0,
              borderStyle: 'single',
              borderColor: theme.border,
              backgroundColor: theme.surface,
            }}
          >
            <text style={{ wrapMode: 'none' }}>{chip.icon}</text>
            <text style={{ fg: theme.foregroundMuted ?? theme.foreground, wrapMode: 'none' }}>
              {chip.label}
            </text>
          </Clickable>
        ))}
      </box>

      <box style={{ height: 2 }} />

      <box style={{ flexDirection: 'row', gap: 0, alignItems: 'center' }}>
        <text style={{ fg: theme.foregroundSubtle ?? theme.muted }}>
          <span fg={theme.primary} attributes={TextAttributes.BOLD}>{'\u2039\u2318K\u203A'}</span>
          <span> Commands  </span>
          <span fg={theme.primary} attributes={TextAttributes.BOLD}>{'\u2039/\u203A'}</span>
          <span> Slash commands  </span>
          <span fg={theme.primary} attributes={TextAttributes.BOLD}>{'\u2039I\u203A'}</span>
          <span> Input mode</span>
        </text>
      </box>

      <box style={{ flexGrow: 1 }} />

      <text style={{ fg: theme.foregroundSubtle ?? theme.muted, attributes: TextAttributes.DIM }}>
        v{version}  {'·'}  Type{' '}
        <span fg={theme.primary}>/help</span> for commands
      </text>
    </box>
  )
})
