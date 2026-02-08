import { TextAttributes } from '@opentui/core'
import React, { memo, useCallback } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { Button } from '../button'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export const Switch = memo(function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: SwitchProps) {
  const theme = useTheme()

  const handleClick = useCallback(() => {
    if (!disabled) {
      onChange(!checked)
    }
  }, [checked, onChange, disabled])

  const indicator = checked ? '\u25C9' : '\u25CB'
  const stateLabel = checked ? 'ON' : 'OFF'
  const stateColor = checked ? theme.success : theme.muted
  const dimAttr = disabled ? TextAttributes.DIM : 0

  return (
    <Button onClick={handleClick}>
      <box style={{ flexDirection: 'row', gap: 1 }}>
        <text
          style={{
            fg: stateColor,
            attributes: TextAttributes.BOLD | dimAttr,
          }}
        >
          {indicator}
        </text>
        <text
          style={{
            fg: stateColor,
            attributes: dimAttr,
          }}
        >
          {stateLabel}
        </text>
        {label && (
          <text
            style={{
              fg: disabled ? theme.muted : theme.foreground,
              attributes: dimAttr,
            }}
          >
            {label}
          </text>
        )}
      </box>
    </Button>
  )
})
