import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useState, useCallback, useRef, useEffect, memo } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { Button } from '../button'
import { KeyHint } from './key-hint'

import type { KeyEvent } from '@opentui/core'
import type { ScrollBoxRenderable } from '@opentui/core'

export interface MultiSelectItem {
  key: string
  label: string
  secondary?: string
  checked?: boolean
}

interface MultiSelectProps {
  items: MultiSelectItem[]
  onSubmit: (selectedKeys: string[]) => void
  onCancel?: () => void
  maxHeight?: number
  title?: string
}

export const MultiSelect = memo(function MultiSelect({
  items,
  onSubmit,
  onCancel,
  maxHeight,
  title,
}: MultiSelectProps) {
  const theme = useTheme()
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const item of items) {
      if (item.checked) {
        initial.add(item.key)
      }
    }
    return initial
  })
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  // Scroll to focused item
  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox || items.length === 0) return

    const focusedTop = focusedIndex
    const focusedBottom = focusedTop + 1
    const viewportHeight = scrollbox.viewport.height
    const currentScroll = scrollbox.scrollTop

    if (focusedTop < currentScroll) {
      scrollbox.scrollTop = focusedTop
    } else if (focusedBottom > currentScroll + viewportHeight) {
      scrollbox.scrollTop = focusedBottom - viewportHeight
    }
    setHoveredIndex(null)
  }, [focusedIndex, items.length])

  const pageSize = maxHeight ? Math.max(1, maxHeight - 1) : 5

  const toggleItem = useCallback(
    (key: string) => {
      setCheckedKeys((prev) => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
    },
    [],
  )

  const handleSubmit = useCallback(() => {
    onSubmit(Array.from(checkedKeys))
  }, [checkedKeys, onSubmit])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape') {
          onCancel?.()
          return
        }

        if (key.name === 'up') {
          setFocusedIndex((prev) => Math.max(0, prev - 1))
          return
        }

        if (key.name === 'down') {
          setFocusedIndex((prev) => Math.min(items.length - 1, prev + 1))
          return
        }

        if (key.name === 'pageup') {
          setFocusedIndex((prev) => Math.max(0, prev - pageSize))
          return
        }

        if (key.name === 'pagedown') {
          setFocusedIndex((prev) => Math.min(items.length - 1, prev + pageSize))
          return
        }

        if (key.name === 'home') {
          setFocusedIndex(0)
          return
        }

        if (key.name === 'end') {
          setFocusedIndex(Math.max(0, items.length - 1))
          return
        }

        if (key.name === 'space') {
          const item = items[focusedIndex]
          if (item) {
            toggleItem(item.key)
          }
          return
        }

        if (key.name === 'return' || key.name === 'enter') {
          handleSubmit()
          return
        }

        // 'a' to toggle all
        if (key.sequence === 'a' && !key.ctrl && !key.meta) {
          setCheckedKeys((prev) => {
            if (prev.size === items.length) {
              return new Set()
            }
            return new Set(items.map((i) => i.key))
          })
          return
        }
      },
      [items, focusedIndex, pageSize, toggleItem, handleSubmit, onCancel],
    ),
  )

  // Compute scroll overflow indicators
  const scrollbox = scrollRef.current
  const viewportHeight = scrollbox?.viewport?.height ?? (maxHeight ?? items.length)
  const currentScroll = scrollbox?.scrollTop ?? 0
  const itemsAbove = Math.max(0, currentScroll)
  const itemsBelow = Math.max(0, items.length - currentScroll - viewportHeight)

  const selectedCount = checkedKeys.size

  return (
    <box style={{ flexDirection: 'column', width: '100%' }}>
      {/* Title */}
      {title && (
        <box style={{ paddingLeft: 1, paddingBottom: 0 }}>
          <text style={{ fg: theme.primary, attributes: TextAttributes.BOLD }}>
            {title}
          </text>
        </box>
      )}

      {/* Scroll overflow indicator: items above */}
      {itemsAbove > 0 && (
        <box style={{ paddingLeft: 2 }}>
          <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
            {'\u2191 '}{itemsAbove}{' more'}
          </text>
        </box>
      )}

      {/* Items list */}
      <scrollbox
        ref={scrollRef}
        scrollX={false}
        scrollbarOptions={{ visible: false }}
        verticalScrollbarOptions={{
          visible: true,
          trackOptions: { width: 1 },
        }}
        style={{
          height: maxHeight ?? '100%',
          flexGrow: maxHeight ? 0 : 1,
          rootOptions: {
            flexDirection: 'row',
            backgroundColor: 'transparent',
          },
          wrapperOptions: {
            border: false,
            backgroundColor: 'transparent',
            flexDirection: 'column',
          },
          contentOptions: {
            flexDirection: 'column',
            gap: 0,
            backgroundColor: 'transparent',
          },
        }}
      >
        {items.map((item, idx) => {
          const isFocused = idx === focusedIndex
          const isHovered = idx === hoveredIndex
          const isHighlighted = isFocused || isHovered
          const isChecked = checkedKeys.has(item.key)

          const backgroundColor = isHighlighted ? theme.surfaceHover : 'transparent'
          const indicator = isFocused ? '\u25B8 ' : '  '
          const checkbox = isChecked ? '[\u2713]' : '[ ]'
          const checkColor = isChecked ? theme.success : theme.muted

          return (
            <Button
              key={item.key}
              onClick={() => toggleItem(item.key)}
              onMouseOver={() => {
                setHoveredIndex(idx)
                setFocusedIndex(idx)
              }}
              onMouseOut={() => {
                if (hoveredIndex === idx) {
                  setHoveredIndex(null)
                }
              }}
              style={{
                flexDirection: 'row',
                gap: 1,
                backgroundColor,
                paddingLeft: 0,
                paddingRight: 1,
                height: 1,
                overflow: 'hidden',
              }}
            >
              <text
                style={{
                  fg: isFocused ? theme.primary : theme.muted,
                  attributes: isFocused ? TextAttributes.BOLD : undefined,
                }}
              >
                {indicator}
              </text>
              <text
                style={{
                  fg: checkColor,
                  attributes: isChecked ? TextAttributes.BOLD : TextAttributes.DIM,
                }}
              >
                {checkbox}
              </text>
              <text
                style={{
                  fg: isHighlighted ? theme.primary : theme.foreground,
                  attributes: isHighlighted ? TextAttributes.BOLD : undefined,
                }}
              >
                {item.label}
              </text>
              {item.secondary && (
                <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
                  {item.secondary}
                </text>
              )}
            </Button>
          )
        })}
      </scrollbox>

      {/* Scroll overflow indicator: items below */}
      {itemsBelow > 0 && (
        <box style={{ paddingLeft: 2 }}>
          <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
            {'\u2193 '}{itemsBelow}{' more'}
          </text>
        </box>
      )}

      {/* Selection count */}
      <box style={{ paddingLeft: 2, paddingTop: 0 }}>
        <text style={{ fg: theme.muted }}>
          {selectedCount}{' of '}{items.length}{' selected'}
        </text>
      </box>

      {/* Key hints */}
      <box style={{ paddingLeft: 2 }}>
        <KeyHint
          hints={[
            { key: 'Space', label: 'Toggle' },
            { key: 'a', label: 'Toggle all' },
            { key: 'Enter', label: 'Submit' },
            { key: 'Esc', label: 'Cancel' },
          ]}
        />
      </box>
    </box>
  )
})
