import { TextAttributes } from '@opentui/core'
import React, { memo, useMemo } from 'react'

import { useTheme } from '../../hooks/use-theme'

export interface TableColumn {
  key: string
  label: string
  width?: number
  align?: 'left' | 'right'
  color?: string
}

interface TableProps {
  columns: TableColumn[]
  rows: Record<string, string | React.ReactNode>[]
  compact?: boolean
  striped?: boolean
  emptyMessage?: string
}

/**
 * Resolve the display width of a value.
 * ReactNode cells fall back to the column label length.
 */
function cellTextLength(value: string | React.ReactNode): number {
  if (typeof value === 'string') {
    return value.length
  }
  return 0
}

function padCell(text: string, width: number, align: 'left' | 'right'): string {
  const truncated = text.length > width ? text.slice(0, width) : text
  return align === 'right'
    ? truncated.padStart(width)
    : truncated.padEnd(width)
}

export const Table = memo(function Table({
  columns,
  rows,
  compact = false,
  striped = false,
  emptyMessage = 'No data',
}: TableProps) {
  const theme = useTheme()

  // Compute resolved widths: fixed width or max(label, longest value)
  const resolvedColumns = useMemo(() => {
    return columns.map((col) => {
      if (col.width) {
        return { ...col, resolvedWidth: col.width }
      }
      let maxLen = col.label.length
      for (const row of rows) {
        const val = row[col.key]
        const len = cellTextLength(val)
        if (len > maxLen) {
          maxLen = len
        }
      }
      return { ...col, resolvedWidth: maxLen }
    })
  }, [columns, rows])

  if (rows.length === 0) {
    return (
      <box style={{ flexDirection: 'column' }}>
        <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
          {emptyMessage}
        </text>
      </box>
    )
  }

  return (
    <box style={{ flexDirection: 'column' }}>
      {/* Header row */}
      <box style={{ flexDirection: 'row', gap: 2 }}>
        {resolvedColumns.map((col) => (
          <text
            key={col.key}
            style={{
              fg: theme.muted,
              attributes: TextAttributes.BOLD,
            }}
          >
            {padCell(col.label, col.resolvedWidth, col.align ?? 'left')}
          </text>
        ))}
      </box>

      {/* Separator */}
      {!compact && (
        <box style={{ flexDirection: 'row', gap: 2 }}>
          {resolvedColumns.map((col) => (
            <text
              key={col.key}
              style={{ fg: theme.border, attributes: TextAttributes.DIM }}
            >
              {'\u2500'.repeat(col.resolvedWidth)}
            </text>
          ))}
        </box>
      )}

      {/* Data rows */}
      {rows.map((row, rowIdx) => {
        const rowFg =
          striped && rowIdx % 2 === 1 ? theme.muted : theme.foreground

        return (
          <box key={rowIdx} style={{ flexDirection: 'row', gap: 2 }}>
            {resolvedColumns.map((col) => {
              const value = row[col.key]
              const align = col.align ?? 'left'
              const fg = col.color ?? rowFg

              // ReactNode cells are rendered directly without padding
              if (typeof value !== 'string') {
                return (
                  <box
                    key={col.key}
                    style={{ width: col.resolvedWidth }}
                  >
                    {value}
                  </box>
                )
              }

              return (
                <text key={col.key} style={{ fg }}>
                  {padCell(value, col.resolvedWidth, align)}
                </text>
              )
            })}
          </box>
        )
      })}
    </box>
  )
})
