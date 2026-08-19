import { TextAttributes } from '@opentui/core'
import React, { memo, useEffect, useState, useCallback } from 'react'

import { Button } from './button'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { getLastNVisualLines } from '../utils/text-layout'

import type { ThinkingCollapseState } from '../types/chat'

const PREVIEW_LINE_COUNT = 4

const THINKING_PHASES = [
  'Analyzing codebase...',
  'Reading files...',
  'Planning changes...',
  'Making edits...',
  'Verifying changes...',
  'Running tests...',
  'Finalizing...',
] as const

interface ThinkingProps {
  content: string
  thinkingCollapseState: ThinkingCollapseState
  isThinkingComplete: boolean
  onToggle: () => void
  availableWidth?: number
}

export const Thinking = memo(
  ({
    content,
    thinkingCollapseState,
    isThinkingComplete,
    onToggle,
    availableWidth,
  }: ThinkingProps) => {
    const theme = useTheme()
    const { contentMaxWidth } = useTerminalDimensions()
    const [phaseIndex, setPhaseIndex] = useState(0)
    const [dotCount, setDotCount] = useState(0)

    const width = Math.max(10, availableWidth ?? contentMaxWidth)
    const normalizedContent = content.replace(/\n+/g, ' ').trim()
    const effectiveWidth = width - 3
    const { lines, hasMore } = getLastNVisualLines(
      normalizedContent,
      effectiveWidth,
      PREVIEW_LINE_COUNT,
    )

    const showFull = thinkingCollapseState === 'expanded'
    const showPreview = thinkingCollapseState === 'preview' && lines.length > 0

    useEffect(() => {
      if (isThinkingComplete) return
      const phaseInterval = setInterval(() => {
        setPhaseIndex((i) => (i + 1) % THINKING_PHASES.length)
      }, 3000)
      const dotInterval = setInterval(() => {
        setDotCount((d) => (d + 1) % 4)
      }, 400)
      return () => {
        clearInterval(phaseInterval)
        clearInterval(dotInterval)
      }
    }, [isThinkingComplete])

    const toggleIndicator = !isThinkingComplete
      ? '● '
      : showFull
        ? '▾ '
        : showPreview
          ? '• '
          : '▸ '

    const phaseText = !isThinkingComplete ? THINKING_PHASES[phaseIndex] : null
    const dots = '.'.repeat(dotCount) + ' '.repeat(3 - dotCount)

    return (
      <Button
        style={{
          flexDirection: 'column',
          gap: 0,
          marginTop: 0,
          marginBottom: 0,
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
          paddingBottom: 0,
          backgroundColor: theme.surface,
        }}
        onClick={onToggle}
      >
        <box style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
          <text style={{ wrapMode: 'none' }}>
            <span fg={isThinkingComplete ? theme.muted : theme.primary}>
              {toggleIndicator}
            </span>
            <span attributes={TextAttributes.BOLD} fg={theme.foregroundMuted ?? theme.foreground}>
              {isThinkingComplete ? 'Thought' : 'Thinking'}
            </span>
            {!isThinkingComplete && phaseText && (
              <span fg={theme.muted}>
                {' '}{phaseText}{dots}
              </span>
            )}
          </text>
        </box>
        {showPreview && (
          <box style={{ paddingLeft: 2 }}>
            <text
              style={{
                wrapMode: 'none',
                fg: theme.foregroundSubtle ?? theme.muted,
              }}
              attributes={TextAttributes.ITALIC}
            >
              {hasMore ? '...' + lines.join('\n') : lines.join('\n')}
            </text>
          </box>
        )}
        {showFull && (
          <box style={{ paddingLeft: 2 }}>
            <text
              style={{
                wrapMode: 'word',
                fg: theme.foregroundMuted ?? theme.muted,
              }}
              attributes={TextAttributes.ITALIC}
            >
              {content}
            </text>
          </box>
        )}
      </Button>
    )
  },
)
