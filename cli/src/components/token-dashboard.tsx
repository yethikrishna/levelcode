// Live Token & Cost Dashboard TUI panel.
// Shows per-agent token usage, $ spent, p95 latency, and active model.
// Toggled via /cost slash command. Hooks into the tracing module for span data
// and maintains an in-memory cost/token accumulator (CostGuard).

import React, { useEffect, useMemo, useState } from 'react'
import { TextAttributes } from '@opentui/core'

import { Button } from './button'
import { Separator } from './separator'
import { useTheme } from '../hooks/use-theme'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'

export interface AgentCostRecord {
  agentId: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  totalCostUsd: number
  callCount: number
  latenciesMs: number[]
  lastUpdated: number
}

interface TokenDashboardProps {
  visible: boolean
  onClose: () => void
  agents?: AgentCostRecord[]
  sessionStart?: number
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)
  return sorted[idx]
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function formatCost(n: number): string {
  if (n < 0.01) return `${(n * 100).toFixed(3)}¢`
  return `$${n.toFixed(4)}`
}

function formatDuration(ms: number): string {
  if (ms === 0) return '—'
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function formatUptime(startMs: number): string {
  const elapsed = Date.now() - startMs
  const seconds = Math.floor(elapsed / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

// ============================================================================
// CostGuard — lightweight in-memory token/cost accumulator
// ============================================================================

class CostGuardImpl {
  private records = new Map<string, AgentCostRecord>()
  private sessionStart = Date.now()
  private listeners = new Set<() => void>()

  recordCall(params: {
    agentId: string
    model: string
    inputTokens: number
    outputTokens: number
    costUsd: number
    latencyMs: number
  }): void {
    const key = params.agentId
    const existing = this.records.get(key)
    const now = Date.now()

    if (existing) {
      existing.inputTokens += params.inputTokens
      existing.outputTokens += params.outputTokens
      existing.totalTokens += params.inputTokens + params.outputTokens
      existing.totalCostUsd += params.costUsd
      existing.callCount += 1
      existing.latenciesMs.push(params.latencyMs)
      if (existing.latenciesMs.length > 100) {
        existing.latenciesMs = existing.latenciesMs.slice(-100)
      }
      existing.lastUpdated = now
      existing.model = params.model
    } else {
      this.records.set(key, {
        agentId: params.agentId,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        totalTokens: params.inputTokens + params.outputTokens,
        totalCostUsd: params.costUsd,
        callCount: 1,
        latenciesMs: [params.latencyMs],
        lastUpdated: now,
      })
    }

    this.notify()
  }

  reset(): void {
    this.records.clear()
    this.sessionStart = Date.now()
    this.notify()
  }

  getRecords(): AgentCostRecord[] {
    return Array.from(this.records.values()).sort(
      (a, b) => b.totalCostUsd - a.totalCostUsd,
    )
  }

  getTotals(): {
    totalTokens: number
    totalCost: number
    totalCalls: number
    sessionStart: number
  } {
    let totalTokens = 0
    let totalCost = 0
    let totalCalls = 0
    for (const r of this.records.values()) {
      totalTokens += r.totalTokens
      totalCost += r.totalCostUsd
      totalCalls += r.callCount
    }
    return { totalTokens, totalCost, totalCalls, sessionStart: this.sessionStart }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn()
      } catch {}
    }
  }
}

export const CostGuard = new CostGuardImpl()

// ============================================================================
// TokenDashboard component
// ============================================================================

export const TokenDashboard: React.FC<TokenDashboardProps> = ({
  visible,
  onClose,
  agents: externalAgents,
  sessionStart: externalSessionStart,
}) => {
  const theme = useTheme()
  const { terminalWidth } = useTerminalDimensions()
  const [, forceUpdate] = useState(0)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!visible) return
    const unsub = CostGuard.subscribe(() => forceUpdate((n) => n + 1))
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => {
      unsub()
      clearInterval(interval)
    }
  }, [visible])

  const records = externalAgents ?? CostGuard.getRecords()
  const totals = useMemo(() => {
    if (externalAgents) {
      return {
        totalTokens: externalAgents.reduce((s, a) => s + a.totalTokens, 0),
        totalCost: externalAgents.reduce((s, a) => s + a.totalCostUsd, 0),
        totalCalls: externalAgents.reduce((s, a) => s + a.callCount, 0),
        sessionStart: externalSessionStart ?? Date.now(),
      }
    }
    return CostGuard.getTotals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalAgents, externalSessionStart, tick, records.length])

  if (!visible) return null

  const panelWidth = Math.min(terminalWidth - 4, 100)
  const colAgent = 14
  const colModel = 22
  const colTokens = 10
  const colCost = 10
  const colCalls = 7
  const colP95 = 8
  const tablePadding = 6

  return (
    <box
      style={{
        flexDirection: 'column',
        borderStyle: 'rounded',
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 1,
        marginTop: 1,
        marginBottom: 1,
        width: panelWidth,
      }}
    >
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 0,
        }}
      >
        <text style={{ fg: theme.accent }} attributes={TextAttributes.BOLD}>
          {' '}
          Token & Cost Dashboard
        </text>
        <Button onClick={onClose}>
          <text style={{ fg: theme.muted }}> [x] close </text>
        </Button>
      </box>

      <Separator width={panelWidth} widthOffset={2} />

      <box style={{ flexDirection: 'row', paddingLeft: 1, paddingRight: 1, gap: 3 }}>
        <text style={{ fg: theme.foreground }}>
          <span attributes={TextAttributes.DIM}>Session: </span>
          <span fg={theme.accent}>{formatUptime(totals.sessionStart)}</span>
        </text>
        <text style={{ fg: theme.foreground }}>
          <span attributes={TextAttributes.DIM}>Total tokens: </span>
          <span>{formatTokens(totals.totalTokens)}</span>
        </text>
        <text style={{ fg: theme.foreground }}>
          <span attributes={TextAttributes.DIM}>Spent: </span>
          <span fg={totals.totalCost > 1.0 ? '#ef4444' : totals.totalCost > 0.1 ? '#f59e0b' : '#22c55e'}>
            {formatCost(totals.totalCost)}
          </span>
        </text>
        <text style={{ fg: theme.foreground }}>
          <span attributes={TextAttributes.DIM}>Calls: </span>
          <span>{totals.totalCalls}</span>
        </text>
      </box>

      <box style={{ height: 0 }} />

      {records.length === 0 ? (
        <text style={{ fg: theme.muted, paddingLeft: 1 }} attributes={TextAttributes.ITALIC}>
          No agent calls recorded yet. Send a message to start tracking.
        </text>
      ) : (
        <box style={{ flexDirection: 'column', paddingLeft: 1 }}>
          <text
            style={{
              fg: theme.muted,
              wrapMode: 'none',
            }}
            attributes={TextAttributes.BOLD}
          >
            <span>{'Agent'.padEnd(colAgent)}</span>
            <span>{'Model'.padEnd(colModel)}</span>
            <span>{'Tokens'.padStart(colTokens)}</span>
            <span>{'$ Spent'.padStart(colCost)}</span>
            <span>{'Calls'.padStart(colCalls)}</span>
            <span>{'p95'.padStart(colP95)}</span>
          </text>
          <box style={{ flexDirection: 'column' }}>
            {records.map((r) => {
              const p95 = percentile(r.latenciesMs, 95)
              const costColor =
                r.totalCostUsd > 0.5
                  ? '#ef4444'
                  : r.totalCostUsd > 0.05
                    ? '#f59e0b'
                    : theme.muted
              return (
                <text
                  key={r.agentId}
                  style={{ fg: theme.foreground, wrapMode: 'none' }}
                >
                  <span fg={theme.accent}>{r.agentId.padEnd(colAgent)}</span>
                  <span fg={theme.muted}>
                    {r.model.slice(0, colModel - 2).padEnd(colModel)}
                  </span>
                  <span>{formatTokens(r.totalTokens).padStart(colTokens)}</span>
                  <span fg={costColor}>{formatCost(r.totalCostUsd).padStart(colCost)}</span>
                  <span fg={theme.muted}>{r.callCount.toString().padStart(colCalls)}</span>
                  <span fg={theme.muted}>{formatDuration(p95).padStart(colP95)}</span>
                </text>
              )
            })}
          </box>
        </box>
      )}
    </box>
  )
}
