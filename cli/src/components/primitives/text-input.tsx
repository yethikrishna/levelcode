import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useState, useEffect, useCallback, memo } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { BORDER_CHARS } from '../../utils/ui-constants'

import type { KeyEvent } from '@opentui/core'

interface TextInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
  onCancel?: () => void
  placeholder?: string
  label?: string
  mask?: boolean
  autoFocus?: boolean
}

function maskValue(value: string): string {
  if (value.length <= 4) {
    return '*'.repeat(value.length)
  }
  return '*'.repeat(value.length - 4) + value.slice(-4)
}

export const TextInput = memo(function TextInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  label,
  mask = false,
}: TextInputProps) {
  const theme = useTheme()

  // Blinking cursor effect
  const [cursorVisible, setCursorVisible] = useState(true)
  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((v) => !v), 530)
    return () => clearInterval(interval)
  }, [])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape') {
          onCancel?.()
          return
        }

        if (key.name === 'return' || key.name === 'enter') {
          onSubmit?.(value)
          return
        }

        if (key.name === 'backspace' || key.name === 'delete') {
          onChange(value.slice(0, -1))
          return
        }

        // Regular character input
        if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
          onChange(value + key.sequence)
          return
        }
      },
      [value, onChange, onSubmit, onCancel],
    ),
  )

  const displayValue = mask ? maskValue(value) : value
  const showPlaceholder = !value && placeholder

  return (
    <box style={{ flexDirection: 'column', width: '100%' }}>
      {/* Label */}
      {label && (
        <box style={{ paddingBottom: 0 }}>
          <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
            {label}
          </text>
        </box>
      )}

      {/* Input container */}
      <box
        style={{
          flexDirection: 'row',
          borderStyle: 'single',
          borderColor: theme.primary,
          customBorderChars: BORDER_CHARS,
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: theme.surface,
        }}
      >
        <text
          style={{
            fg: showPlaceholder ? theme.muted : theme.foreground,
            attributes: showPlaceholder ? TextAttributes.DIM : undefined,
          }}
        >
          {showPlaceholder ? placeholder : displayValue}
        </text>
        <text style={{ fg: theme.primary }}>
          {cursorVisible ? '\u258D' : ' '}
        </text>
      </box>
    </box>
  )
})
