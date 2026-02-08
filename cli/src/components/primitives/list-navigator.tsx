import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useState, useCallback, useRef, useEffect, memo } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { Button } from '../button'

import type { KeyEvent } from '@opentui/core'
import type { ScrollBoxRenderable } from '@opentui/core'

export interface ListNavigatorItem {
  key: string
  label: string
  secondary?: string
  icon?: string
  group?: string
  accent?: boolean
}

interface ListNavigatorProps {
  items: ListNavigatorItem[]
  onSelect: (item: ListNavigatorItem) => void
  onCancel?: () => void
  maxHeight?: number
  searchable?: boolean
  activeKey?: string
  disabled?: boolean
  /** Custom renderer for the secondary content area of each item. Overrides default plain text rendering. */
  secondaryRenderer?: (item: ListNavigatorItem) => React.ReactNode
  /** Custom renderer for group header rows. Receives group name and count of items in that group. */
  groupHeaderRenderer?: (group: string, count: number) => React.ReactNode
  /** Custom empty state renderer. Overrides the default "No items found" message. */
  emptyRenderer?: () => React.ReactNode
}

export const ListNavigator = memo(function ListNavigator({
  items,
  onSelect,
  onCancel,
  maxHeight,
  searchable = false,
  activeKey,
  disabled = false,
  secondaryRenderer,
  groupHeaderRenderer,
  emptyRenderer,
}: ListNavigatorProps) {
  const theme = useTheme()
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  const filteredItems = searchable && searchQuery
    ? items.filter(
        (item) =>
          item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.secondary?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false),
      )
    : items

  // Clamp focused index when filtered items change
  useEffect(() => {
    setFocusedIndex((prev) => Math.min(prev, Math.max(0, filteredItems.length - 1)))
  }, [filteredItems.length])

  // Scroll to focused item
  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox || filteredItems.length === 0) return

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
  }, [focusedIndex, filteredItems.length])

  const pageSize = maxHeight ? Math.max(1, maxHeight - 1) : 5

  // Compute scroll overflow indicators
  const scrollbox = scrollRef.current
  const viewportHeight = scrollbox?.viewport?.height ?? (maxHeight ?? filteredItems.length)
  const currentScroll = scrollbox?.scrollTop ?? 0
  const itemsAbove = Math.max(0, currentScroll)
  const itemsBelow = Math.max(0, filteredItems.length - currentScroll - viewportHeight)

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (disabled) return

        if (key.name === 'escape') {
          if (searchable && searchQuery) {
            setSearchQuery('')
            setFocusedIndex(0)
          } else {
            onCancel?.()
          }
          return
        }

        if (key.name === 'up') {
          setFocusedIndex((prev) => Math.max(0, prev - 1))
          return
        }

        if (key.name === 'down') {
          setFocusedIndex((prev) => Math.min(filteredItems.length - 1, prev + 1))
          return
        }

        if (key.name === 'pageup') {
          setFocusedIndex((prev) => Math.max(0, prev - pageSize))
          return
        }

        if (key.name === 'pagedown') {
          setFocusedIndex((prev) => Math.min(filteredItems.length - 1, prev + pageSize))
          return
        }

        if (key.name === 'home') {
          setFocusedIndex(0)
          return
        }

        if (key.name === 'end') {
          setFocusedIndex(Math.max(0, filteredItems.length - 1))
          return
        }

        if (key.name === 'return' || key.name === 'enter') {
          const item = filteredItems[focusedIndex]
          if (item) {
            onSelect(item)
          }
          return
        }

        if (searchable) {
          if (key.name === 'backspace' || key.name === 'delete') {
            setSearchQuery((prev) => prev.slice(0, -1))
            setFocusedIndex(0)
            return
          }

          if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
            setSearchQuery((prev) => prev + key.sequence)
            setFocusedIndex(0)
            return
          }
        }
      },
      [disabled, filteredItems, focusedIndex, onCancel, onSelect, pageSize, searchQuery, searchable],
    ),
  )

  // Track which group we've seen to render group headers
  let lastGroup: string | undefined

  return (
    <box style={{ flexDirection: 'column', width: '100%' }}>
      {searchable && (
        <box style={{ flexDirection: 'row', paddingLeft: 1, paddingBottom: 0 }}>
          <text style={{ fg: theme.muted }}>
            {'\u{1F50D} '}{searchQuery || '(type to search)'}
          </text>
          {searchQuery && (
            <text style={{ fg: theme.muted }}>
              {' ('}{filteredItems.length}{' results)'}
            </text>
          )}
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
        {filteredItems.map((item, idx) => {
          const isFocused = idx === focusedIndex
          const isHovered = idx === hoveredIndex
          const isHighlighted = isFocused || isHovered
          const isActive = item.key === activeKey

          const backgroundColor = isHighlighted ? theme.surfaceHover : 'transparent'
          const textColor = isHighlighted
            ? theme.primary
            : isActive
              ? theme.success
              : theme.muted

          // Focused item indicator
          const indicator = isFocused ? '\u25B8 ' : '  '

          // Active item badge
          const activeBadge = isActive ? ' \u2726' : ''

          // Render group header if group changed
          let groupHeader: React.ReactNode = null
          if (item.group && item.group !== lastGroup) {
            lastGroup = item.group
            const groupItemCount = filteredItems.filter((i) => i.group === item.group).length
            groupHeader = groupHeaderRenderer ? (
              <box key={`group-${item.group}`}>
                {groupHeaderRenderer(item.group, groupItemCount)}
              </box>
            ) : (
              <box
                key={`group-${item.group}`}
                style={{ paddingLeft: 1, paddingTop: idx === 0 ? 0 : 1, flexDirection: 'column' }}
              >
                <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
                  {item.group}
                </text>
                <text style={{ fg: theme.border, attributes: TextAttributes.DIM }}>
                  {'\u2500'.repeat(20)}
                </text>
              </box>
            )
          }

          return (
            <React.Fragment key={item.key}>
              {groupHeader}
              <Button
                onClick={() => onSelect(item)}
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
                {item.icon && (
                  <text style={{ fg: isHighlighted ? theme.foreground : theme.muted }}>
                    {item.icon}
                  </text>
                )}
                <text
                  style={{
                    fg: item.accent && !isHighlighted ? theme.primary : textColor,
                    attributes: isHighlighted ? TextAttributes.BOLD : undefined,
                  }}
                >
                  {item.label}
                </text>
                {item.secondary && (
                  secondaryRenderer ? (
                    <text style={{ fg: theme.muted }}>
                      {secondaryRenderer(item)}
                    </text>
                  ) : (
                    <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
                      {item.secondary}
                    </text>
                  )
                )}
                {isActive && (
                  <text style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>
                    {activeBadge}
                  </text>
                )}
              </Button>
            </React.Fragment>
          )
        })}
        {filteredItems.length === 0 && (
          emptyRenderer ? emptyRenderer() : (
            <box style={{ paddingLeft: 2, paddingTop: 1 }}>
              <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
                {'\u2205  No items found'}
              </text>
            </box>
          )
        )}
      </scrollbox>
      {/* Scroll overflow indicator: items below */}
      {itemsBelow > 0 && (
        <box style={{ paddingLeft: 2 }}>
          <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
            {'\u2193 '}{itemsBelow}{' more'}
          </text>
        </box>
      )}
    </box>
  )
})
