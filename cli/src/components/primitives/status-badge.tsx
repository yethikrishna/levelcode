import { TextAttributes } from '@opentui/core'
import React, { memo, useState, useEffect } from 'react'

import { useTheme } from '../../hooks/use-theme'

type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'muted' | 'connected' | 'disconnected'

interface StatusBadgeProps {
  variant: StatusVariant
  label?: string
  compact?: boolean
}

const VARIANT_CONFIG: Record<StatusVariant, { dot: string; defaultLabel: string }> = {
  success: { dot: '\u25CF', defaultLabel: 'Success' },
  warning: { dot: '\u25CF', defaultLabel: 'Warning' },
  error: { dot: '\u25CF', defaultLabel: 'Error' },
  info: { dot: '\u25CF', defaultLabel: 'Info' },
  muted: { dot: '\u25CB', defaultLabel: '' },
  connected: { dot: '\u25CF', defaultLabel: 'Connected' },
  disconnected: { dot: '\u25CB', defaultLabel: 'Disconnected' },
}

function useVariantColor(variant: StatusVariant): string {
  const theme = useTheme()

  switch (variant) {
    case 'success':
    case 'connected':
      return theme.success
    case 'warning':
      return theme.warning
    case 'error':
      return theme.error
    case 'info':
      return theme.info
    case 'muted':
    case 'disconnected':
      return theme.muted
  }
}

export const StatusBadge = memo(function StatusBadge({
  variant,
  label,
  compact = false,
}: StatusBadgeProps) {
  const color = useVariantColor(variant)
  const config = VARIANT_CONFIG[variant]
  const displayLabel = label ?? config.defaultLabel

  // Pulsing effect for connected/success status
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    if (variant !== 'connected' && variant !== 'success') return
    const interval = setInterval(() => setPulse((p) => !p), 1500)
    return () => clearInterval(interval)
  }, [variant])

  // Blinking effect for error status
  const [blink, setBlink] = useState(true)
  useEffect(() => {
    if (variant !== 'error') return
    const interval = setInterval(() => setBlink((b) => !b), 800)
    return () => clearInterval(interval)
  }, [variant])

  const getDotAttr = (): number | undefined => {
    if (variant === 'connected' || variant === 'success') {
      return pulse ? TextAttributes.BOLD : TextAttributes.DIM
    }
    if (variant === 'error') {
      return blink ? TextAttributes.BOLD : TextAttributes.DIM
    }
    return undefined
  }

  const dotAttr = getDotAttr()

  if (compact) {
    return <text style={{ fg: color, attributes: dotAttr }}>{config.dot}</text>
  }

  return (
    <box style={{ flexDirection: 'row', gap: 1 }}>
      <text style={{ fg: color, attributes: dotAttr }}>{config.dot}</text>
      {displayLabel && (
        <text style={{ fg: color }}>{displayLabel}</text>
      )}
    </box>
  )
})
