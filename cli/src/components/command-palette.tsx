import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'

import { Clickable } from './clickable'
import { HighlightedSubsequenceText } from './highlighted-text'
import { COMMAND_REGISTRY } from '../commands/command-registry'
import { useTheme } from '../hooks/use-theme'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { BORDER_CHARS } from '../utils/ui-constants'
import { fuzzyScoreFields } from '../utils/fuzzy-match'
import { usePaletteStore, type PaletteAction } from '../state/palette-store'
import { useCycleTheme } from '../hooks/use-theme'

import type { CommandDefinition } from '../commands/command-registry'
import type { KeyEvent } from '@opentui/core'
import type { ReactNode } from 'react'

interface CommandPaletteProps {
  /** Execute a slash command through the chat pipeline (no-arg commands). */
  onExecuteCommand?: (commandString: string) => void | Promise<void>
  /** Place a command (with trailing space) into the chat input for args. */
  onPrefillInput?: (commandString: string) => void
}

/** Uniform terminal-native glyph — one column wide, theme-colored. */
const COMMAND_GLYPH = '\u25C6' // ◆
const QUICK_GLYPH = '\u2192' // →

/** Slash commands exposed as one-keystroke quick actions. */
type QuickActionSpec = {
  id: string
  label: string
  command?: string
  direct?: () => void
}

const buildQuickActionSpecs = (cycleTheme: () => void): QuickActionSpec[] => [
  { id: 'quick-new-chat', label: 'New chat', command: '/new' },
  { id: 'quick-switch-model', label: 'Switch model', command: '/model:list' },
  { id: 'quick-cost', label: 'Cost dashboard', command: '/cost' },
  { id: 'quick-toggle-theme', label: 'Toggle theme', direct: cycleTheme },
  { id: 'quick-help', label: 'Keyboard shortcuts', command: '/help' },
]

/** Derive a readable label from a command name ("checkpoint:create" → "Checkpoint · Create"). */
function humanizeCommandName(name: string): string {
  return name
    .split(':')
    .map((segment) =>
      segment.length === 0
        ? segment
        : segment.charAt(0).toUpperCase() + segment.slice(1),
    )
    .join(' \u00B7 ')
}

/** Group key for a command: the namespace before ":", else "general". */
function commandNamespace(name: string): string {
  const idx = name.indexOf(':')
  return idx === -1 ? 'general' : name.slice(0, idx)
}

const NAMESPACE_LABELS: Record<string, string> = {
  general: 'General',
  team: 'Teams',
  model: 'Models',
  provider: 'Providers',
  session: 'Sessions',
  market: 'Marketplace',
  bible: 'Memory',
  checkpoint: 'Checkpoints',
  trajectory: 'Trajectory',
  codemap: 'Code Map',
  policy: 'Policies',
  rbac: 'Access Control',
  vault: 'Vault',
  bg: 'Background Tasks',
  collab: 'Collaboration',
  memory: 'Memory',
}

const namespaceLabel = (namespace: string): string =>
  NAMESPACE_LABELS[namespace] ??
  namespace.charAt(0).toUpperCase() + namespace.slice(1)

function registryToActions(
  registry: CommandDefinition[],
  handlers: {
    onExecuteCommand?: (commandString: string) => void | Promise<void>
    onPrefillInput?: (commandString: string) => void
  },
): PaletteAction[] {
  return registry.map((def) => ({
    id: `cmd-${def.name}`,
    icon: COMMAND_GLYPH,
    label: humanizeCommandName(def.name),
    description: `/${def.name}`,
    shortcut: def.aliases.length > 0 ? `/${def.aliases[0]}` : undefined,
    takesArgs: def.acceptsArgs,
    section: 'commands' as const,
    action: () => {
      const commandString = `/${def.name}`
      if (def.acceptsArgs) {
        if (handlers.onPrefillInput) {
          handlers.onPrefillInput(`${commandString} `)
        } else {
          void handlers.onExecuteCommand?.(commandString)
        }
      } else {
        void handlers.onExecuteCommand?.(commandString)
      }
    },
  }))
}

interface PaletteRow {
  key: string
  kind: 'header' | 'item'
  /** Header title, or the item payload for kind === 'item'. */
  title?: string
  item?: PaletteAction
  matchIndices?: number[] | null
}

const CHROME_ROWS = 6 // input row + 2 dividers + footer + border padding

export const CommandPalette = memo(function CommandPalette({
  onExecuteCommand,
  onPrefillInput,
}: CommandPaletteProps) {
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

  const commandActions = useMemo(
    () =>
      registryToActions(COMMAND_REGISTRY, { onExecuteCommand, onPrefillInput }),
    [onExecuteCommand, onPrefillInput],
  )

  const quickActions = useMemo<PaletteAction[]>(
    () =>
      buildQuickActionSpecs(cycleTheme).map((spec) => ({
        id: spec.id,
        icon: QUICK_GLYPH,
        label: spec.label,
        shortcut: spec.command,
        section: 'quick' as const,
        action: () => {
          if (spec.direct) {
            spec.direct()
          } else if (spec.command) {
            void onExecuteCommand?.(spec.command)
          }
        },
      })),
    [cycleTheme, onExecuteCommand],
  )

  const allActions = useMemo<PaletteAction[]>(() => {
    const lookup = [...quickActions, ...commandActions]
    const recent: PaletteAction[] = recentIds
      .map((id) => lookup.find((a) => a.id === id))
      .filter(Boolean) as PaletteAction[]

    return [
      ...recent.map((a) => ({ ...a, section: 'recent' as const })),
      ...quickActions.filter((a) => !recentIds.includes(a.id)),
      ...commandActions,
    ]
  }, [quickActions, commandActions, recentIds])

  const filteredActions = useMemo(() => {
    if (!query) return allActions
    const scored: { action: PaletteAction; score: number; indices: number[] }[] =
      []
    for (const action of allActions) {
      const fields = [action.label, action.description ?? '', action.shortcut ?? '']
      const match = fuzzyScoreFields(query, fields)
      // Exact-ish matches on the slash form get a strong boost via scoring.
      if (match) {
        const sectionBonus = action.section === 'quick' ? 15 : 0
        scored.push({
          action,
          score: match.score + sectionBonus,
          indices: match.indices,
        })
      }
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.map((s) => ({ ...s.action, matchIndices: s.indices }))
  }, [allActions, query])

  const groupedActions = useMemo(() => {
    const groups: { section: string; items: PaletteAction[] }[] = []
    const push = (section: string, items: PaletteAction[]) => {
      if (items.length > 0) groups.push({ section, items })
    }

    const recent = filteredActions.filter((a) => a.section === 'recent')
    push('Recent', recent)
    if (query) {
      // While searching, one ranked list beats scattered groups.
      const ranked = filteredActions.filter((a) => a.section !== 'recent')
      push('Results', ranked)
    } else {
      push('Quick actions', filteredActions.filter((a) => a.section === 'quick'))

      const byNamespace = new Map<string, PaletteAction[]>()
      for (const action of filteredActions) {
        if (action.section !== 'commands') continue
        const name = action.description?.slice(1) ?? action.id
        const namespace = commandNamespace(name)
        const bucket = byNamespace.get(namespace)
        if (bucket) {
          bucket.push(action)
        } else {
          byNamespace.set(namespace, [action])
        }
      }
      const namespaces = [...byNamespace.keys()].sort((a, b) =>
        a === 'general' ? -1 : b === 'general' ? 1 : a.localeCompare(b),
      )
      for (const namespace of namespaces) {
        push(namespaceLabel(namespace), byNamespace.get(namespace) ?? [])
      }
    }
    return groups
  }, [filteredActions, query])

  /** Flat render rows: headers and items interleaved, selection-indexed. */
  const rows = useMemo<PaletteRow[]>(() => {
    const out: PaletteRow[] = []
    for (const group of groupedActions) {
      out.push({ key: `header-${group.section}`, kind: 'header', title: group.section })
      for (const item of group.items) {
        out.push({
          key: item.id,
          kind: 'item',
          item,
          matchIndices: (item as PaletteAction & { matchIndices?: number[] })
            .matchIndices,
        })
      }
    }
    return out
  }, [groupedActions])

  const selectedRow = rows[selectedIndex]

  useEffect(() => {
    if (selectedIndex >= rows.length && rows.length > 0) {
      setSelectedIndex(0)
    }
  }, [rows.length, selectedIndex, setSelectedIndex])

  const executeAction = useCallback(
    (action: PaletteAction) => {
      addRecent(action.id)
      closePalette()
      action.action()
    },
    [addRecent, closePalette],
  )

  const clampOffset = useCallback(
    (index: number, current: number, visible: number): number => {
      if (index < current) return index
      if (index >= current + visible) return index - visible + 1
      return current
    },
    [],
  )

  // Scroll offset is derived from the selection, never set during render:
  // a ref carries the previous offset between renders.
  const scrollOffsetRef = React.useRef(0)
  useEffect(() => {
    scrollOffsetRef.current = 0
  }, [query])

  const panelWidth = Math.min(Math.max(60, Math.floor(terminalWidth * 0.7)), 90)
  const listHeight = Math.max(4, Math.min(18, terminalHeight - 6) - CHROME_ROWS)

  const scrollOffset = clampOffset(
    Math.min(selectedIndex, Math.max(0, rows.length - 1)),
    scrollOffsetRef.current,
    listHeight,
  )
  scrollOffsetRef.current = scrollOffset
  const visibleRows = rows.slice(scrollOffset, scrollOffset + listHeight)
  const hiddenAbove = scrollOffset
  const hiddenBelow = rows.length - (scrollOffset + visibleRows.length)

  const leftPad = Math.floor((terminalWidth - panelWidth) / 2)

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
        moveUp(rows.length)
        return
      }

      if (key.name === 'down' || (key.ctrl && (key.name === 'n' || key.sequence === 'n'))) {
        moveDown(rows.length)
        return
      }

      if (key.name === 'home') {
        setSelectedIndex(0)
        return
      }

      if (key.name === 'end') {
        setSelectedIndex(Math.max(0, rows.length - 1))
        return
      }

      if (key.name === 'return' || key.name === 'enter') {
        const row = rows[selectedIndex]
        if (row?.kind === 'item' && row.item) {
          executeAction(row.item)
        } else if (rows.length > 0) {
          // Selection landed on a header — jump to the first item after it.
          const firstItem = rows.findIndex((r, i) => i >= selectedIndex && r.kind === 'item')
          if (firstItem !== -1 && rows[firstItem]!.item) {
            setSelectedIndex(firstItem)
          }
        }
        return
      }

      if (key.ctrl && key.name === 'u') {
        setQuery('')
        return
      }

      if (key.ctrl && key.name === 'w') {
        const trimmedEnd = query.replace(/\s+$/, '')
        const next = trimmedEnd.replace(/\S*$/, '')
        setQuery(next)
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
    [
      isOpen,
      closePalette,
      moveUp,
      moveDown,
      rows,
      selectedIndex,
      executeAction,
      setQuery,
      query,
      setSelectedIndex,
    ],
  )

  useKeyboard(handleKey)

  if (!isOpen) return null

  const renderRows = (): ReactNode[] => {
    const nodes: ReactNode[] = []
    if (hiddenAbove > 0) {
      nodes.push(
        <text
          key="more-above"
          style={{ fg: theme.foregroundSubtle ?? theme.muted, paddingLeft: 1 }}
        >
          {`\u2191 ${hiddenAbove} more`}
        </text>,
      )
    }
    for (const row of visibleRows) {
      if (row.kind === 'header') {
        nodes.push(
          <text
            key={row.key}
            style={{
              fg: theme.foregroundSubtle ?? theme.muted,
              attributes: TextAttributes.DIM | TextAttributes.BOLD,
              paddingLeft: 1,
              paddingTop: 1,
            }}
          >
            {row.title?.toUpperCase()}
          </text>,
        )
        continue
      }
      const item = row.item!
      const isSelected = row.key === selectedRow?.key
      nodes.push(
        <Clickable
          key={row.key}
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
          <text style={{ fg: isSelected ? theme.primary : theme.muted }}>
            {item.icon}
          </text>
          <box style={{ flexDirection: 'row', flexGrow: 1, gap: 1 }}>
            <HighlightedSubsequenceText
              text={item.description ?? item.label}
              indices={query ? row.matchIndices : null}
              color={isSelected ? theme.foreground : theme.foregroundMuted ?? theme.foreground}
              highlightColor={theme.primary}
            />
            <text
              style={{
                fg: isSelected ? theme.foreground : theme.foregroundSubtle ?? theme.muted,
                attributes: isSelected ? TextAttributes.BOLD : TextAttributes.DIM,
              }}
            >
              {item.label}
            </text>
          </box>
          {item.takesArgs && (
            <text style={{ fg: theme.foregroundSubtle ?? theme.muted, attributes: TextAttributes.DIM }}>
              {'[args]'}
            </text>
          )}
          {item.shortcut && !item.takesArgs && (
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
    }
    if (hiddenBelow > 0) {
      nodes.push(
        <text
          key="more-below"
          style={{ fg: theme.foregroundSubtle ?? theme.muted, paddingLeft: 1 }}
        >
          {`\u2193 ${hiddenBelow} more`}
        </text>,
      )
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
              {query || `Search ${commandActions.length} commands…`}
            </text>
            <text style={{ fg: theme.primary }}>
              {cursorVisible ? '\u258D' : ' '}
            </text>
          </box>

          <text style={{ fg: theme.borderSubtle ?? theme.border }}>
            {'\u2500'.repeat(panelWidth - 2)}
          </text>

          <box style={{ flexDirection: 'column' }}>
            {rows.length === 0 ? (
              <text
                style={{
                  fg: theme.muted,
                  attributes: TextAttributes.ITALIC,
                  paddingLeft: 1,
                  paddingTop: 1,
                }}
              >
                {`No commands match "${query}"`}
              </text>
            ) : (
              renderRows()
            )}
          </box>

          <text style={{ fg: theme.borderSubtle ?? theme.border }}>
            {'\u2500'.repeat(panelWidth - 2)}
          </text>

          <box style={{ flexDirection: 'row', gap: 0, paddingBottom: 0 }}>
            <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
              {'\u2039\u2191\u2193\u203A Navigate  \u00B7  \u2039Enter\u203A Run  \u00B7  \u2039Ctrl+U\u203A Clear  \u00B7  \u2039Esc\u203A Close'}
            </text>
          </box>
        </box>
      </box>
    </box>
  )
})
