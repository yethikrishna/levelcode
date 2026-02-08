import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useEffect, useCallback, memo } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { BORDER_CHARS } from '../../utils/ui-constants'

import type { KeyEvent } from '@opentui/core'

type ToastVariant = 'success' | 'error' | 'warning' | 'info'

interface ToastProps {
  message: string
  variant?: ToastVariant
  duration?: number
  onDismiss: () => void
}

const VARIANT_ICONS: Record<ToastVariant, string> = {
  success: '\u2713',
  error: '\u2715',
  warning: '\u26A0',
  info: '\u2139',
}

function useVariantColor(variant: ToastVariant): string {
  const theme = useTheme()

  switch (variant) {
    case 'success':
      return theme.success
    case 'error':
      return theme.error
    case 'warning':
      return theme.warning
    case 'info':
      return theme.info
  }
}

export const Toast = memo(function Toast({
  message,
  variant = 'info',
  duration = 3000,
  onDismiss,
}: ToastProps) {
  const theme = useTheme()
  const color = useVariantColor(variant)
  const icon = VARIANT_ICONS[variant]

  // Auto-dismiss after duration
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration)
    return () => clearTimeout(timer)
  }, [duration, onDismiss])

  // Dismiss on Escape
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape') {
          onDismiss()
        }
      },
      [onDismiss],
    ),
  )

  return (
    <box
      style={{
        flexDirection: 'row',
        borderStyle: 'single',
        borderColor: color,
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: theme.surface,
        gap: 1,
      }}
    >
      <text style={{ fg: color, attributes: TextAttributes.BOLD }}>
        {icon}
      </text>
      <text style={{ fg: theme.foreground }}>{message}</text>
    </box>
  )
})
