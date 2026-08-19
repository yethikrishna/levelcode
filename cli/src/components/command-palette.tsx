import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'

import { Clickable } from './clickable'
import { useTheme } from '../hooks/use-theme'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { BORDER_CHARS } from '../utils/ui-constants'
import { usePaletteStore, type PaletteAction } from '../state/palette-store'
import { useCycleTheme } from '../hooks/use-theme'

import type { KeyEvent } from '@opentui/core'
import type { ReactNode } from 'react'

const QUICK_ACTIONS: PaletteAction[] = [
  { id: 'new-chat', icon: '\u2728', label: 'New chat', shortcut: '\u2318N', section: 'quick', action: () => {} },
  { id: 'switch-model', icon: '\u{1F504}', label: 'Switch model', shortcut: '\u2318M', section: 'quick', action: () => {} },
  { id: 'toggle-theme', icon: '\u{1F313}', label: 'Toggle theme', shortcut: '\u2318J', section: 'quick', action: () => {} },
  { id: 'open-settings', icon: '\u2699\uFE0F', label: 'Open settings', shortcut: '\u2318,', section: 'quick', action: () => {} },
]

const SLASH_COMMANDS: PaletteAction[] = [
  { id: 'cmd-help', icon: '\u2753', label: 'Help', shortcut: '/help', section: 'commands', action: () => {} },
  { id: 'cmd-clear', icon: '\u{1F9F9}', label: 'Clear conversation', shortcut: '/clear', section: 'commands', action: () => {} },
  { id: 'cmd-cost', icon: '\u{1F4B0}', label: 'Token & cost dashboard', shortcut: '/cost', section: 'commands', action: () => {} },
  { id: 'cmd-model', icon: '\u{1F9E0}', label: 'Change model', shortcut: '/model', section: 'commands', action: () => {} },
  { id: 'cmd-fast', icon: '\u26A1', label: 'Fast mode', shortcut: '/fast', section: 'commands', action: () => {} },
  { id: 'cmd-max', icon: '\u{1F680}', label: 'Max mode', shortcut: '/max', section: 'commands', action: () => {} },
  { id: 'cmd-plan', icon: '\u{1F4CB}', label: 'Plan mode', shortcut: '/plan', section: 'commands', action: () => {} },
  { id: 'cmd-review', icon: '\u{1F50D}', label: 'Review code', shortcut: '/review', section: 'commands', action: () => {} },
  { id: 'cmd-commit', icon: '\u{1F4DD}', label: 'Commit changes', shortcut: '/commit', section: 'commands', action: () => {} },
]

function fuzzyMatch(query: string, label: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const l = label.toLowerCase()
  let qi = 0
  for (let li = 0; li < l.length && qi < q.length; li++) {
    if (l[li] === q[qi]) qi++
  }
  return qi === q.length
}

export const CommandPalette = memo(function CommandPalette() {
  const theme = useTheme()
  const { terminalWidth, terminalHeight } = useTerminalDimensions()
  const cycleTheme = useCycleTheme()

  const isOpen = usePaletteStore((s) => s.isOpen)
  const query = usePaletteStore((s) => s.query)
  const selectedIndex = usePaletteStore((s) => s.selectedIndex)
  const recentIds = usePaletteStore((s) => s.recentActions)
  const closePalette = usePaletteStore((s) => s.close)
  const setQuery = usePaletteStore((s) => s.setQuery)
  const setSelectedIndex = usePaletteStore((s) => s.setSelectedIndex)
  const moveDown = usePaletteStore((s) => s.moveSelectionDown)
  const moveUp = usePaletteStore((s) => s.moveSelectionUp)
  const addRecent = usePaletteStore((s) => s.addRecentAction)

  const [cursorVisible, setCursorVisible] = useState(true)
  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((v) => !v), 530)
    return () => clearInterval(interval)
  }, [])

  const allActions = useMemo<PaletteAction[]>(() => {
    const recent: PaletteAction[] = recentIds
      .map((id) => [...QUICK_ACTIONS, ...SLASH_COMMANDS].find((a) => a.id === id))
      .filter(Boolean) as PaletteAction[]

    return [
      ...recent.map((a) => ({ ...a, section: 'recent' as const })),
      ...QUICK_ACTIONS.filter((a) => !recentIds.includes(a.id)),
      ...SLASH_COMMANDS,
    ]
  }, [recentIds])

  const filteredActions = useMemo(() => {
    return allActions.filter((a) => fuzzyMatch(query, a.label) || fuzzyMatch(query, a.id))
  }, [allActions, query])

  const groupedActions = useMemo(() => {
    const groups: { section: string; items: PaletteAction[] }[] = []
    const sectionOrder = ['recent', 'quick', 'commands']
    const sectionLabels: Record<string, string> = {
      recent: 'Recent',
      quick: 'Quick actions',
      commands: 'Commands',
    }
    for (const section of sectionOrder) {
      const items = filteredActions.filter((a) => a.section === section)
      if (items.length > 0) {
        groups.push({ section: sectionLabels[section] ?? section, items })
      }
    }
    return groups
  }, [filteredActions])

  const flatFiltered = useMemo(
    () => groupedActions.flatMap((g) => g.items),
    [groupedActions],
  )

  useEffect(() => {
    if (selectedIndex >= flatFiltered.length && flatFiltered.length > 0) {
      setSelectedIndex(0)
    }
  }, [flatFiltered.length, selectedIndex, setSelectedIndex])

  const executeAction = useCallback(
    (action: PaletteAction) => {
      addRecent(action.id)
      closePalette()
      if (action.id === 'toggle-theme') {
        cycleTheme()
      }
      action.action()
    },
    [addRecent, closePalette, cycleTheme],
  )

  const handleKey = useCallback(
    (key: KeyEvent) => {
      if ((key.ctrl || key.meta) && (key.name === 'k' || key.sequence === 'k')) {
        usePaletteStore.getState().toggle()
        return
      }

      if (!isOpen) return

      if (key.name === 'escape') {
        closePalette()
        return
      }

      if (key.name === 'up' || (key.ctrl && (key.name === 'p' || key.sequence === 'p'))) {
        moveUp(flatFiltered.length)
        return
      }

      if (key.name === 'down' || (key.ctrl && (key.name === 'n' || key.sequence === 'n'))) {
        moveDown(flatFiltered.length)
        return
      }

      if (key.name === 'return' || key.name === 'enter') {
        const selected = flatFiltered[selectedIndex]
        if (selected) {
          executeAction(selected)
        }
        return
      }

      if (key.name === 'backspace' || key.name === 'delete') {
        setQuery(query.slice(0, -1))
        return
      }

      if (key.sequence && !key.ctrl && !key.meta) {
        const sanitized = key.sequence.replace(/[\x00-\x1F\x7F]/g, '')
        if (sanitized) {
          setQuery(query + sanitized)
        }
      }
    },
    [isOpen, closePalette, moveUp, moveDown, flatFiltered, selectedIndex, executeAction, setQuery, query],
  )

  useKeyboard(handleKey)

  if (!isOpen) return null

  const panelWidth = Math.min(Math.max(60, Math.floor(terminalWidth * 0.7)), 90)
  const panelHeight = Math.min(18, terminalHeight - 6)
  const leftPad = Math.floor((terminalWidth - panelWidth) / 2)

  const renderItems = (): ReactNode[] => {
    const nodes: ReactNode[] = []
    let runningIdx = 0
    for (const group of groupedActions) {
      nodes.push(
        <text
          key={`section-${group.section}`}
          style={{
            fg: theme.foregroundSubtle ?? theme.muted,
            attributes: TextAttributes.DIM | TextAttributes.BOLD,
            paddingLeft: 1,
            paddingTop: runningIdx === 0 ? 0 : 1,
          }}
        >
          {group.section}
        </text>,
      )
      for (const item of group.items) {
        const isSelected = runningIdx === selectedIndex
        nodes.push(
          <Clickable
            key={item.id}
            onMouseDown={() => executeAction(item)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 1,
              paddingRight: 1,
              paddingTop: 0,
              paddingBottom: 0,
              gap: 1,
              backgroundColor: isSelected ? theme.surfaceHover : 'transparent',
            }}
          >
            <text style={{ wrapMode: 'none', width: 2 }}>{item.icon}</text>
            <text
              style={{
                fg: isSelected ? theme.foreground : theme.foregroundMuted ?? theme.foreground,
                attributes: isSelected ? TextAttributes.BOLD : undefined,
                flexGrow: 1,
              }}
            >
              {item.label}
            </text>
            {item.shortcut && (
              <text
                style={{
                  fg: theme.foregroundSubtle ?? theme.muted,
                  attributes: TextAttributes.DIM,
                }}
              >
                {'\u2039'}{item.shortcut}{'\u203A'}
              </text>
            )}
          </Clickable>,
        )
        runningIdx++
      }
    }
    return nodes
  }

  return (
    <box
      style={{
        flexDirection: 'column',
        position: 'absolute',
        left: 0,
        top: 0,
        width: terminalWidth,
        height: terminalHeight,
        backgroundColor: theme.overlay,
        zIndex: 100,
      }}
    >
      <box
        style={{
          flexDirection: 'column',
          paddingTop: 2,
          paddingLeft: leftPad,
        }}
      >
        <box
          style={{
            flexDirection: 'column',
            width: panelWidth,
            borderStyle: 'single',
            borderColor: theme.primary,
            customBorderChars: BORDER_CHARS,
            backgroundColor: theme.surfaceRaised ?? theme.surface,
            paddingLeft: 1,
            paddingRight: 1,
            paddingTop: 0,
            paddingBottom: 0,
          }}
        >
          <box
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 1,
              paddingBottom: 0,
            }}
          >
            <text style={{ fg: theme.muted }}>{'\u2315'}</text>
            <text
              style={{
                fg: query ? theme.foreground : theme.muted,
                attributes: query ? TextAttributes.BOLD : undefined,
                flexGrow: 1,
              }}
            >
              {query || 'Type a command or search...'}
            </text>
            <text style={{ fg: theme.primary }}>
              {cursorVisible ? '\u258D' : ' '}
            </text>
            {query && (
              <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
                {'\u00D7'}
              </text>
            )}
          </box>

          <text style={{ fg: theme.borderSubtle ?? theme.border }}>
            {'\u2500'.repeat(panelWidth - 2)}
          </text>

          <box
            style={{
              flexDirection: 'column',
              maxHeight: panelHeight - 4,
              overflow: 'hidden',
            }}
          >
            {flatFiltered.length === 0 ? (
              <text
                style={{
                  fg: theme.muted,
                  attributes: TextAttributes.ITALIC,
                  paddingLeft: 1,
                  paddingTop: 1,
                }}
              >
                No matching commands
              </text>
            ) : (
              renderItems()
            )}
          </box>

          <text style={{ fg: theme.borderSubtle ?? theme.border }}>
            {'\u2500'.repeat(panelWidth - 2)}
          </text>

          <box style={{ flexDirection: 'row', gap: 0, paddingBottom: 0 }}>
            <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
              {'\u2039\u2191\u2193\u203A Navigate  \u00B7  \u2039Enter\u203A Select  \u00B7  \u2039Esc\u203A Close'}
            </text>
          </box>
        </box>
      </box>
    </box>
  )
})
