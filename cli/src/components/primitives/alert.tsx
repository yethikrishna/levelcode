import { TextAttributes } from '@opentui/core'
import React, { memo } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { DASHED_BORDER_CHARS } from '../../utils/ui-constants'

import type { ReactNode } from 'react'

interface AlertProps {
  variant: 'info' | 'success' | 'warning' | 'error'
  title?: string
  children: ReactNode
  compact?: boolean
}

const VARIANT_ICONS: Record<AlertProps['variant'], string> = {
  info: '\u2139',
  success: '\u2713',
  warning: '\u26A0',
  error: '\u2715',
}

const VARIANT_LABELS: Record<AlertProps['variant'], string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
}

export const Alert = memo(function Alert({
  variant,
  title,
  children,
  compact = false,
}: AlertProps) {
  const theme = useTheme()

  const variantColor =
    variant === 'info'
      ? theme.info
      : variant === 'success'
        ? theme.success
        : variant === 'warning'
          ? theme.warning
          : theme.error

  const icon = VARIANT_ICONS[variant]
  const label = title ?? VARIANT_LABELS[variant]

  // Compact mode: single line with icon + text
  if (compact) {
    return (
      <box style={{ flexDirection: 'row', gap: 1 }}>
        <text style={{ fg: variantColor, attributes: TextAttributes.BOLD }}>
          {icon}
        </text>
        <text style={{ fg: variantColor, attributes: TextAttributes.BOLD }}>
          {label}
        </text>
        <text style={{ fg: theme.foreground }}>{children}</text>
      </box>
    )
  }

  // Full mode: bordered box with dashed border
  return (
    <box
      style={{
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: variantColor,
        customBorderChars: DASHED_BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        width: '100%' as unknown as `${number}%`,
      }}
    >
      {/* Title row with icon */}
      <box style={{ flexDirection: 'row', gap: 1 }}>
        <text style={{ fg: variantColor }}>
          {icon}
        </text>
        <text style={{ fg: variantColor, attributes: TextAttributes.BOLD }}>
          {label}
        </text>
      </box>

      {/* Body */}
      <box style={{ flexDirection: 'column' }}>
        <text style={{ fg: theme.foreground }}>{children}</text>
      </box>
    </box>
  )
})
