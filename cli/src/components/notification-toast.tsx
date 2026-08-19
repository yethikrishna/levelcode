import { TextAttributes } from '@opentui/core'
import React, { memo, useEffect, useState, useCallback } from 'react'

import { Clickable } from './clickable'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'
import { useToastStore, type ToastItem, type ToastVariant } from '../state/toast-store'

import type { ReactNode } from 'react'

const VARIANT_ICONS: Record<ToastVariant, string> = {
  success: '\u2713',
  error: '\u2715',
  warning: '\u26A0',
  info: '\u2139',
}

function getVariantColor(theme: ReturnType<typeof useTheme>, variant: ToastVariant): string {
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

const TOAST_WIDTH = 50

interface ToastItemViewProps {
  toast: ToastItem
  onDismiss: () => void
}

const ToastItemView = memo(function ToastItemView({ toast, onDismiss }: ToastItemViewProps) {
  const theme = useTheme()
  const [progress, setProgress] = useState(1)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (toast.duration <= 0) return
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const p = Math.max(0, 1 - elapsed / toast.duration)
      setProgress(p)
      if (p <= 0) {
        clearInterval(interval)
        onDismiss()
      }
    }, 50)
    return () => clearInterval(interval)
  }, [toast.duration, onDismiss])

  const color = getVariantColor(theme, toast.variant)
  const icon = VARIANT_ICONS[toast.variant]
  const progressFilled = Math.max(0, Math.min(TOAST_WIDTH - 2, Math.floor(progress * (TOAST_WIDTH - 2))))

  return (
    <box
      style={{
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: color,
        customBorderChars: BORDER_CHARS,
        backgroundColor: theme.surfaceRaised ?? theme.surface,
        width: TOAST_WIDTH,
        marginTop: 0,
        marginBottom: 1,
        opacity: visible ? 1 : 0,
      }}
    >
      <box
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 1,
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
        }}
      >
        <text style={{ fg: color, attributes: TextAttributes.BOLD, wrapMode: 'none' }}>
          {icon}
        </text>
        <box style={{ flexDirection: 'column', flexGrow: 1, gap: 0 }}>
          <text
            style={{
              fg: theme.foreground,
              attributes: TextAttributes.BOLD,
              wrapMode: 'none',
            }}
          >
            {toast.title}
          </text>
          {toast.message && (
            <text
              style={{
                fg: theme.foregroundMuted ?? theme.muted,
                wrapMode: 'word',
              }}
            >
              {toast.message}
            </text>
          )}
        </box>
        {toast.actionLabel && toast.onAction && (
          <Clickable
            onMouseDown={() => {
              toast.onAction?.()
              onDismiss()
            }}
            style={{
              paddingLeft: 1,
              paddingRight: 1,
              flexShrink: 0,
            }}
          >
            <text style={{ fg: color, attributes: TextAttributes.BOLD }}>
              {toast.actionLabel}
            </text>
          </Clickable>
        )}
        <Clickable onMouseDown={onDismiss} style={{ paddingLeft: 1, flexShrink: 0 }}>
          <text style={{ fg: theme.foregroundSubtle ?? theme.muted }}>{'\u00D7'}</text>
        </Clickable>
      </box>
      {toast.duration > 0 && (
        <box style={{ flexDirection: 'row', height: 1, paddingLeft: 0, paddingRight: 0 }}>
          <text style={{ wrapMode: 'none', fg: color }}>
            {'\u2588'.repeat(progressFilled)}
          </text>
          <text style={{ wrapMode: 'none', fg: theme.borderSubtle ?? theme.border }}>
            {'\u2500'.repeat(Math.max(0, TOAST_WIDTH - 2 - progressFilled))}
          </text>
        </box>
      )}
    </box>
  )
})

export const ToastContainer = memo(function ToastContainer(): ReactNode {
  const theme = useTheme()
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  const handleDismiss = useCallback(
    (id: string) => {
      removeToast(id)
    },
    [removeToast],
  )

  if (toasts.length === 0) return null

  return (
    <box
      style={{
        flexDirection: 'column',
        position: 'absolute',
        right: 1,
        top: 1,
        zIndex: 200,
        alignItems: 'flex-end',
      }}
    >
      {toasts.map((t) => (
        <ToastItemView key={t.id} toast={t} onDismiss={() => handleDismiss(t.id)} />
      ))}
    </box>
  )
})
