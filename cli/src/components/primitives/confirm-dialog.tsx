import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useState, useCallback, memo } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { BORDER_CHARS } from '../../utils/ui-constants'
import { Button } from '../button'
import { KeyHint } from './key-hint'

import type { KeyEvent } from '@opentui/core'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog = memo(function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useTheme()
  const [focused, setFocused] = useState<'confirm' | 'cancel'>('cancel')

  const confirmColor = variant === 'danger' ? theme.error : theme.primary
  const borderColor = variant === 'danger' ? theme.error : theme.border

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'left' || key.name === 'right') {
          setFocused((prev) => (prev === 'confirm' ? 'cancel' : 'confirm'))
          return
        }

        if (key.name === 'return' || key.name === 'enter') {
          if (focused === 'confirm') {
            onConfirm()
          } else {
            onCancel()
          }
          return
        }

        if (key.name === 'escape') {
          onCancel()
          return
        }

        // Y/N shortcuts
        if (key.sequence && !key.ctrl && !key.meta) {
          const ch = key.sequence.toLowerCase()
          if (ch === 'y') {
            onConfirm()
            return
          }
          if (ch === 'n') {
            onCancel()
            return
          }
        }
      },
      [focused, onConfirm, onCancel],
    ),
  )

  return (
    <box
      style={{
        borderStyle: 'single',
        borderColor,
        customBorderChars: BORDER_CHARS,
        flexDirection: 'column',
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        backgroundColor: theme.surface,
      }}
    >
      {/* Title */}
      <box style={{ flexDirection: 'column', width: '100%' }}>
        <text
          style={{
            fg: variant === 'danger' ? theme.error : theme.primary,
            attributes: TextAttributes.BOLD,
          }}
        >
          {title}
        </text>
        <text style={{ fg: theme.border, attributes: TextAttributes.DIM }}>
          {'\u2500'.repeat(40)}
        </text>
      </box>

      {/* Message */}
      <box style={{ paddingTop: 0, paddingBottom: 1 }}>
        <text style={{ fg: theme.foreground }}>{message}</text>
      </box>

      {/* Action buttons */}
      <box style={{ flexDirection: 'row', gap: 2, paddingBottom: 1 }}>
        <Button
          onClick={onConfirm}
          style={{
            flexDirection: 'row',
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor:
              focused === 'confirm' ? confirmColor : 'transparent',
          }}
        >
          <text
            style={{
              fg:
                focused === 'confirm'
                  ? theme.background
                  : theme.muted,
              attributes:
                focused === 'confirm' ? TextAttributes.BOLD : undefined,
            }}
          >
            {'['}{confirmLabel}{']'}
          </text>
        </Button>

        <Button
          onClick={onCancel}
          style={{
            flexDirection: 'row',
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor:
              focused === 'cancel' ? theme.primary : 'transparent',
          }}
        >
          <text
            style={{
              fg:
                focused === 'cancel'
                  ? theme.background
                  : theme.muted,
              attributes:
                focused === 'cancel' ? TextAttributes.BOLD : undefined,
            }}
          >
            {'['}{cancelLabel}{']'}
          </text>
        </Button>
      </box>

      {/* Key hints */}
      <KeyHint
        hints={[
          { key: 'Enter', label: 'Confirm' },
          { key: 'Esc', label: 'Cancel' },
          { key: 'Y/N', label: 'Quick select' },
        ]}
      />
    </box>
  )
})
