import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useMemo, useCallback, memo, useState } from 'react'

import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'
import { KeyHint } from './primitives/key-hint'

import type { KeyEvent } from '@opentui/core'

/**
 * Agent node data for topology visualization.
 */
export interface TopologyAgent {
  id: string
  displayName: string
  role: string
  status: 'running' | 'waiting' | 'error' | 'idle' | 'completed'
  currentTask?: string
  phase?: string
}

/**
 * Directed edge between agents representing message flow or task delegation.
 */
export interface TopologyEdge {
  from: string
  to: string
  label?: string
  type: 'message' | 'delegation' | 'response'
}

/**
 * Props for the SwarmTopology component.
 */
export interface SwarmTopologyProps {
  /** Agents currently in the swarm */
  agents: TopologyAgent[]
  /** Directed edges for message flow / delegation */
  edges: TopologyEdge[]
  /** Current phase indicator */
  phase?: string
  /** Called when the user closes the topology view */
  onClose: () => void
  /** Optional width in characters */
  width?: number
  /** Optional height in characters */
  height?: number
}

const STATUS_COLORS = {
  running: { fg: '#7ACC35', label: 'RUN', symbol: '●' },
  waiting: { fg: '#E5C07B', label: 'WAIT', symbol: '◐' },
  error: { fg: '#E06C75', label: 'ERR', symbol: '✖' },
  idle: { fg: '#61AFEF', label: 'IDLE', symbol: '○' },
  completed: { fg: '#5C6370', label: 'DONE', symbol: '✓' },
} as const

/**
 * Truncate a string to a given width, adding ellipsis if needed.
 */
function truncate(str: string, width: number): string {
  if (str.length <= width) return str
  if (width <= 1) return '…'
  return str.slice(0, width - 1) + '…'
}

/**
 * Layout agents in a simple grid: root/coordinator at top, others in rows below.
 */
function layoutAgents(
  agents: TopologyAgent[],
  canvasWidth: number,
): { x: number; y: number; agent: TopologyAgent }[] {
  if (agents.length === 0) return []

  const positions: { x: number; y: number; agent: TopologyAgent }[] = []
  const nodeWidth = 18
  const nodeHeight = 3
  const hGap = 4
  const vGap = 2

  const coordinator = agents.find((a) =>
    a.role === 'coordinator' || a.id === 'coordinator' || a.role === 'director',
  )
  const rest = agents.filter((a) => a !== coordinator)

  let row = 0
  let col = 0

  if (coordinator) {
    const colsInRow = Math.max(1, Math.floor((canvasWidth - 2) / (nodeWidth + hGap)))
    positions.push({
      x: Math.floor((canvasWidth - nodeWidth) / 2),
      y: row * (nodeHeight + vGap),
      agent: coordinator,
    })
    row++
  }

  const colsInRow = Math.max(1, Math.floor((canvasWidth - 2) / (nodeWidth + hGap)))
  for (const agent of rest) {
    const x = col * (nodeWidth + hGap) + 2
    const y = row * (nodeHeight + vGap)
    positions.push({ x, y, agent })
    col++
    if (col >= colsInRow) {
      col = 0
      row++
    }
  }

  return positions
}

/**
 * Build a string grid for rendering connections between nodes.
 */
function renderEdges(
  positions: { x: number; y: number; agent: TopologyAgent }[],
  edges: TopologyEdge[],
  width: number,
  height: number,
): { ch: string; fg: string }[][] {
  const grid: { ch: string; fg: string }[][] = []
  for (let y = 0; y < height; y++) {
    grid[y] = []
    for (let x = 0; x < width; x++) {
      grid[y][x] = { ch: ' ', fg: '' }
    }
  }

  const posMap = new Map<string, { x: number; y: number }>()
  const nodeWidth = 18
  const nodeHeight = 3
  for (const p of positions) {
    posMap.set(p.agent.id, {
      x: p.x + Math.floor(nodeWidth / 2),
      y: p.y + nodeHeight,
    })
  }

  for (const edge of edges) {
    const from = posMap.get(edge.from)
    const to = posMap.get(edge.to)
    if (!from || !to) continue

    const startX = from.x
    const startY = from.y
    const endX = to.x
    const endY = to.y - nodeHeight

    const color = edge.type === 'delegation' ? '#61AFEF' : edge.type === 'response' ? '#7ACC35' : '#5C6370'

    const midY = Math.floor((startY + endY) / 2)

    for (let y = startY + 1; y < midY; y++) {
      if (y >= 0 && y < height && startX >= 0 && startX < width) {
        if (grid[y][startX].ch === ' ') {
          grid[y][startX] = { ch: '│', fg: color }
        } else if (grid[y][startX].ch !== '│') {
          grid[y][startX] = { ch: '┼', fg: color }
        }
      }
    }

    const minX = Math.min(startX, endX)
    const maxX = Math.max(startX, endX)
    for (let x = minX + 1; x < maxX; x++) {
      if (midY >= 0 && midY < height && x >= 0 && x < width) {
        if (grid[midY][x].ch === ' ') {
          grid[midY][x] = { ch: '─', fg: color }
        }
      }
    }

    if (startX !== endX) {
      if (midY >= 0 && midY < height && startX >= 0 && startX < width) {
        grid[midY][startX] = { ch: startX < endX ? '┌' : '┐', fg: color }
      }
      if (midY >= 0 && midY < height && endX >= 0 && endX < width) {
        grid[midY][endX] = { ch: startX < endX ? '┐' : '┌', fg: color }
      }
    }

    for (let y = midY + 1; y < endY; y++) {
      if (y >= 0 && y < height && endX >= 0 && endX < width) {
        if (grid[y][endX].ch === ' ') {
          grid[y][endX] = { ch: '│', fg: color }
        }
      }
    }

    if (endY >= 0 && endY < height && endX >= 0 && endX < width) {
      grid[endY][endX] = { ch: '▼', fg: color }
    }
  }

  return grid
}

/**
 * Swarm Topology Visualization.
 *
 * Ink/React TUI component that renders active agents as a graph with
 * directed edges for message flow and task delegation.
 *
 * Agent status colors:
 * - green (#7ACC35): running/working
 * - yellow (#E5C07B): waiting/blocked
 * - red (#E06C75): error/failed
 * - blue (#61AFEF): idle
 * - gray (#5C6370): completed
 *
 * Accessible via `/topology` command or keybinding.
 * Uses box-drawing characters (│ ─ ┌ ┐ └ ┘ ┼ ▼) for connections.
 */
export const SwarmTopology = memo(function SwarmTopology({
  agents,
  edges,
  phase,
  onClose,
  width: propWidth,
  height: propHeight,
}: SwarmTopologyProps) {
  const theme = useTheme()
  const [selectedIdx, setSelectedIdx] = useState(0)
  const canvasWidth = propWidth ?? 80
  const canvasHeight = propHeight ?? 24

  const positions = useMemo(
    () => layoutAgents(agents, canvasWidth),
    [agents, canvasWidth],
  )

  const edgeGrid = useMemo(
    () => renderEdges(positions, edges, canvasWidth, canvasHeight),
    [positions, edges, canvasWidth, canvasHeight],
  )

  const handleKey = useCallback(
    (key: KeyEvent) => {
      if (key.name === 'escape' || key.sequence === 'q') {
        onClose()
        return
      }
      if (key.name === 'left' || key.name === 'up') {
        setSelectedIdx((i) => (i - 1 + agents.length) % Math.max(1, agents.length))
        return
      }
      if (key.name === 'right' || key.name === 'down' || key.name === 'tab') {
        setSelectedIdx((i) => (i + 1) % Math.max(1, agents.length))
        return
      }
    },
    [onClose, agents.length],
  )

  useKeyboard(handleKey)

  const nodeWidth = 18
  const nodeHeight = 3

  const lines: React.ReactNode[] = []

  for (let y = 0; y < Math.min(canvasHeight, positions.length > 0
    ? Math.max(...positions.map((p) => p.y)) + nodeHeight + 2
    : 6); y++) {
    const cells: React.ReactNode[] = []

    if (edgeGrid[y]) {
      for (let x = 0; x < canvasWidth; x++) {
        const cell = edgeGrid[y][x]
        if (cell && cell.ch !== ' ') {
          cells.push(
            <span key={`e-${x}-${y}`} fg={cell.fg || theme.border}>
              {cell.ch}
            </span>,
          )
        } else {
          cells.push(<span key={`e-${x}-${y}`}>{' '}</span>)
        }
      }
    }

    for (const pos of positions) {
      const relY = y - pos.y
      if (relY < 0 || relY >= nodeHeight) continue

      const nodeX = pos.x
      const statusStyle = STATUS_COLORS[pos.agent.status] || STATUS_COLORS.idle
      const isSelected = agents[selectedIdx]?.id === pos.agent.id

      for (let rx = 0; rx < nodeWidth; rx++) {
        const absX = nodeX + rx
        if (absX < 0 || absX >= canvasWidth) continue

        let ch = ' '
        let fg = theme.foreground
        let attrs: number | undefined
        let bg: string | undefined

        if (relY === 0) {
          if (rx === 0) ch = BORDER_CHARS.topLeft
          else if (rx === nodeWidth - 1) ch = BORDER_CHARS.topRight
          else ch = BORDER_CHARS.horizontal
          fg = isSelected ? statusStyle.fg : theme.border
          bg = isSelected ? `${statusStyle.fg}22` : undefined
        } else if (relY === 1) {
          if (rx === 0) ch = BORDER_CHARS.vertical
          else if (rx === nodeWidth - 1) ch = BORDER_CHARS.vertical
          else if (rx === 1) {
            ch = statusStyle.symbol
            fg = statusStyle.fg
          } else if (rx === 2) ch = ' '
          else {
            const nameStart = 3
            const nameMax = nodeWidth - 4
            const nameStr = truncate(pos.agent.displayName, nameMax)
            const nameIdx = rx - nameStart
            if (nameIdx >= 0 && nameIdx < nameStr.length) {
              ch = nameStr[nameIdx]
              fg = isSelected ? statusStyle.fg : theme.foreground
              attrs = isSelected ? TextAttributes.BOLD : undefined
            } else {
              ch = ' '
            }
          }
          bg = isSelected ? `${statusStyle.fg}15` : undefined
        } else if (relY === 2) {
          if (rx === 0) ch = BORDER_CHARS.bottomLeft
          else if (rx === nodeWidth - 1) ch = BORDER_CHARS.bottomRight
          else {
            const taskStr = pos.agent.currentTask
              ? truncate(pos.agent.currentTask, nodeWidth - 2)
              : `[${pos.agent.role}]`
            const taskIdx = rx - 1
            if (taskIdx >= 0 && taskIdx < taskStr.length) {
              ch = taskStr[taskIdx]
              fg = theme.muted
              attrs = TextAttributes.DIM
            } else {
              ch = BORDER_CHARS.horizontal
              fg = theme.border
            }
          }
          bg = isSelected ? `${statusStyle.fg}15` : undefined
        }

        cells[absX] = (
          <span key={`n-${pos.agent.id}-${absX}-${y}`} fg={fg} attributes={attrs}>
            {ch}
          </span>
        )
      }
    }

    const lineText = cells
      .map((c, i) => {
        if (c) return c
        return <span key={`f-${i}`}>{' '}</span>
      })

    lines.push(
      <text key={`line-${y}`} style={{ wrapMode: 'none' }}>
        {lineText}
      </text>,
    )
  }

  const selected = agents[selectedIdx]

  return (
    <box
      style={{
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: theme.primary,
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        backgroundColor: theme.surface,
        width: canvasWidth,
      }}
    >
      {/* Title */}
      <box style={{ flexDirection: 'row', width: '100%' }}>
        <text style={{ fg: theme.primary, attributes: TextAttributes.BOLD }}>
          Swarm Topology
        </text>
        {phase && (
          <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
            {'  '}[{phase.toUpperCase()}]
          </text>
        )}
        <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
          {'  '}{agents.length} agents, {edges.length} links
        </text>
      </box>

      <text style={{ fg: theme.border, attributes: TextAttributes.DIM }}>
        {'─'.repeat(Math.min(canvasWidth - 2, 78))}
      </text>

      {/* Legend */}
      <box style={{ flexDirection: 'row', gap: 2 }}>
        {(Object.entries(STATUS_COLORS) as [keyof typeof STATUS_COLORS, typeof STATUS_COLORS[keyof typeof STATUS_COLORS]][]).map(
          ([key, style]) => (
            <text key={key}>
              <span fg={style.fg}>{style.symbol} </span>
              <span fg={theme.muted}>{style.label}</span>
            </text>
          ),
        )}
      </box>

      {/* Topology canvas */}
      <box
        style={{
          flexDirection: 'column',
          flexGrow: 1,
          minHeight: Math.min(canvasHeight - 8, 12),
          overflow: 'hidden',
        }}
      >
        {lines.length > 0 ? lines : (
          <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
            No agents active in the swarm.
          </text>
        )}
      </box>

      {/* Selected agent detail */}
      {selected && (
        <box style={{ flexDirection: 'column' }}>
          <text style={{ fg: theme.border, attributes: TextAttributes.DIM }}>
            {'─'.repeat(Math.min(canvasWidth - 2, 78))}
          </text>
          <text style={{ wrapMode: 'none' }}>
            <span fg={STATUS_COLORS[selected.status]?.fg || theme.muted}>
              {STATUS_COLORS[selected.status]?.symbol || '○'}{' '}
            </span>
            <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
              {selected.displayName}
            </span>
            <span fg={theme.muted}> ({selected.role})</span>
          </text>
          {selected.currentTask && (
            <text style={{ fg: theme.muted, wrapMode: 'none' }}>
              Task: {selected.currentTask}
            </text>
          )}
        </box>
      )}

      {/* Edge legend */}
      <box style={{ flexDirection: 'row', gap: 2 }}>
        <text>
          <span fg="#61AFEF">───</span>
          <span fg={theme.muted}> delegation  </span>
        </text>
        <text>
          <span fg="#7ACC35">───</span>
          <span fg={theme.muted}> response  </span>
        </text>
        <text>
          <span fg={theme.border}>───</span>
          <span fg={theme.muted}> message</span>
        </text>
      </box>

      {/* Key hints */}
      <KeyHint
        hints={[
          { key: '←/→/↑/↓', label: 'Navigate' },
          { key: 'Tab', label: 'Next agent' },
          { key: 'Q/Esc', label: 'Close' },
        ]}
      />
    </box>
  )
})
