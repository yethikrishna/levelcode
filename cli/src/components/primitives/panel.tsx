import { TextAttributes } from '@opentui/core'
import React, { memo, useState, useEffect } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { BORDER_CHARS } from '../../utils/ui-constants'

import type { ReactNode } from 'react'

interface PanelProps {
  title?: string
  borderColor?: string
  width?: number | string
  padding?: number
  onClose?: () => void
  headerRight?: ReactNode
  children: ReactNode
}

export const Panel = memo(function Panel({
  title,
  borderColor,
  width,
  padding = 1,
  headerRight,
  children,
}: PanelProps) {
  const theme = useTheme()
  const resolvedBorderColor = borderColor ?? theme.border

  // Animated mount effect: panel starts DIM and transitions to full brightness
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const textAttr = mounted ? undefined : TextAttributes.DIM

  return (
    <box
      style={{
        width: (width ?? '100%') as number | `${number}%`,
        borderStyle: 'single',
        borderColor: mounted ? resolvedBorderColor : theme.muted,
        customBorderChars: BORDER_CHARS,
        paddingLeft: padding,
        paddingRight: padding,
        paddingTop: 0,
        paddingBottom: 0,
        flexDirection: 'column',
        backgroundColor: theme.surface,
      }}
    >
      {(title || headerRight) && (
        <box
          style={{
            flexDirection: 'column',
            width: '100%',
          }}
        >
          {/* Title row with decorative line fill */}
          <box
            style={{
              flexDirection: 'row',
              width: '100%',
              gap: 1,
            }}
          >
            {title ? (
              <text
                style={{
                  fg: theme.primary,
                  attributes: TextAttributes.BOLD | (textAttr ?? 0),
                }}
              >
                {title}
              </text>
            ) : (
              <text>{''}</text>
            )}
            {headerRight && <box style={{ flexGrow: 1 }} />}
            {headerRight && (
              <box style={{ flexDirection: 'row' }}>
                {headerRight}
              </box>
            )}
            {!headerRight && (
              <box style={{ flexGrow: 1 }}>
                <text style={{ fg: theme.border, attributes: textAttr }}>
                  {'\u2500'.repeat(40)}
                </text>
              </box>
            )}
          </box>
          {/* Thin horizontal separator below title */}
          <box style={{ width: '100%' }}>
            <text style={{ fg: theme.border, attributes: TextAttributes.DIM }}>
              {'\u2500'.repeat(80)}
            </text>
          </box>
        </box>
      )}
      {children}
    </box>
  )
})
