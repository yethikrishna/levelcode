import { TextAttributes } from '@opentui/core'
import React, { memo, useState, useEffect } from 'react'

import { useTheme } from '../../hooks/use-theme'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  resultCount?: number
}

export const SearchInput = memo(function SearchInput({
  value,
  placeholder = 'Type to search...',
  resultCount,
}: SearchInputProps) {
  const theme = useTheme()

  // Blinking cursor effect
  const [cursorVisible, setCursorVisible] = useState(true)
  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((v) => !v), 530)
    return () => clearInterval(interval)
  }, [])

  return (
    <box style={{ flexDirection: 'row', gap: 1, paddingLeft: 1 }}>
      <text style={{ fg: theme.muted }}>{'\u2315'}</text>
      <text style={{ fg: value ? theme.foreground : theme.muted, attributes: value ? TextAttributes.BOLD : undefined }}>
        {value || placeholder}
      </text>
      {/* Blinking cursor when active (has value or focused) */}
      <text style={{ fg: theme.primary }}>
        {cursorVisible ? '\u258D' : ' '}
      </text>
      {/* Clear indicator when text is present */}
      {value && (
        <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
          {'\u00D7'}
        </text>
      )}
      {resultCount !== undefined && (
        <text style={{ fg: theme.muted }}>
          {'('}{resultCount}{' results)'}
        </text>
      )}
    </box>
  )
})
