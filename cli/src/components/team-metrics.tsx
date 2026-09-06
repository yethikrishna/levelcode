import React, { useEffect, useMemo, useState } from 'react'
import { TextAttributes } from '@opentui/core'

import { Button } from './button'
import { Separator } from './separator'
import { useTheme } from '../hooks/use-theme'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import {
  loadTeamConfig,
  listTasks,
} from '@levelcode/common/utils/team-fs'
import { resolveActiveTeam } from '../commands/command-registry'
import { listAllTeams } from '@levelcode/common/utils/team-discovery'
import { ICON } from '../utils/icons'

/**
 * Per-agent performance record.
 */
export interface AgentMetrics {
  agentId: string
  agentName: string
  role: string
  tasksAssigned: number
  tasksCompleted: number
  completionRate: number
  tokensUsed: number
  timeSpentMs: number
  errorCount: number
  errorRate: number
  utilization: number
  lastActive?: number
}

/**
 * Aggregate team performance metrics.
 */
export interface TeamMetrics {
  teamName: string
  totalAgents: number
  activeAgents: number
  totalTasksAssigned: number
  totalTasksCompleted: number
  completionRate: number
  totalTokensUsed: number
  totalTimeSpentMs: number
  totalErrors: number
  errorRate: number
  agentMetrics: AgentMetrics[]
  periodStart: number
  periodEnd: number
}

interface TeamMetricsProps {
  visible: boolean
  onClose: () => void
}

function formatDuration(ms: number): string {
  if (ms === 0) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function bar(value: number, max: number, width: number): string {
  if (max === 0) return '░'.repeat(width)
  const filled = Math.round((value / max) * width)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

/**
 * Metrics store: collects per-agent runtime metrics from various sources
 * (CostGuard token data, team task lists, run-state).
 */
class TeamMetricsStore {
  private records = new Map<string, AgentMetrics>()
  private listeners = new Set<() => void>()
  private lastUpdated = 0

  recordTaskCompleted(agentId: string, _durationMs: number, _tokens: number, error?: boolean): void {
    const rec = this.getOrCreate(agentId)
    rec.tasksCompleted++
    if (error) rec.errorCount++
    rec.lastActive = Date.now()
    this.recalculate()
    this.notify()
  }

  recordTaskAssigned(agentId: string, agentName?: string, role?: string): void {
    const rec = this.getOrCreate(agentId, agentName, role)
    rec.tasksAssigned++
    rec.lastActive = Date.now()
    this.recalculate()
    this.notify()
  }

  recordTokens(agentId: string, tokens: number): void {
    const rec = this.getOrCreate(agentId)
    rec.tokensUsed += tokens
    this.notify()
  }

  recordTimeSpent(agentId: string, ms: number): void {
    const rec = this.getOrCreate(agentId)
    rec.timeSpentMs += ms
    this.recalculate()
    this.notify()
  }

  recordError(agentId: string): void {
    const rec = this.getOrCreate(agentId)
    rec.errorCount++
    this.recalculate()
    this.notify()
  }

  getTeamMetrics(teamName: string, members?: Array<{ agentId: string; name: string; role: string; status: string }>): TeamMetrics {
    if (members) {
      for (const m of members) {
        if (!this.records.has(m.agentId)) {
          this.records.set(m.agentId, {
            agentId: m.agentId,
            agentName: m.name,
            role: m.role,
            tasksAssigned: 0,
            tasksCompleted: 0,
            completionRate: 0,
            tokensUsed: 0,
            timeSpentMs: 0,
            errorCount: 0,
            errorRate: 0,
            utilization: 0,
          })
        } else {
          const rec = this.records.get(m.agentId)!
          rec.agentName = m.name
          rec.role = m.role
        }
      }
    }

    const agentMetrics = Array.from(this.records.values())
    const totalAgents = agentMetrics.length
    const activeAgents = agentMetrics.filter(a =>
      a.lastActive && Date.now() - a.lastActive < 5 * 60_000,
    ).length
    const totalTasksAssigned = agentMetrics.reduce((s, a) => s + a.tasksAssigned, 0)
    const totalTasksCompleted = agentMetrics.reduce((s, a) => s + a.tasksCompleted, 0)
    const totalTokensUsed = agentMetrics.reduce((s, a) => s + a.tokensUsed, 0)
    const totalTimeSpentMs = agentMetrics.reduce((s, a) => s + a.timeSpentMs, 0)
    const totalErrors = agentMetrics.reduce((s, a) => s + a.errorCount, 0)

    return {
      teamName,
      totalAgents,
      activeAgents,
      totalTasksAssigned,
      totalTasksCompleted,
      completionRate: totalTasksAssigned > 0 ? totalTasksCompleted / totalTasksAssigned : 0,
      totalTokensUsed,
      totalTimeSpentMs,
      totalErrors,
      errorRate: totalTasksCompleted > 0 ? totalErrors / Math.max(totalTasksCompleted, 1) : 0,
      agentMetrics: agentMetrics.sort((a, b) => b.tasksCompleted - a.tasksCompleted),
      periodStart: this.lastUpdated || Date.now(),
      periodEnd: Date.now(),
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  reset(): void {
    this.records.clear()
    this.lastUpdated = Date.now()
    this.notify()
  }

  private getOrCreate(agentId: string, name?: string, role?: string): AgentMetrics {
    let rec = this.records.get(agentId)
    if (!rec) {
      rec = {
        agentId,
        agentName: name ?? agentId,
        role: role ?? 'member',
        tasksAssigned: 0,
        tasksCompleted: 0,
        completionRate: 0,
        tokensUsed: 0,
        timeSpentMs: 0,
        errorCount: 0,
        errorRate: 0,
        utilization: 0,
        lastActive: Date.now(),
      }
      this.records.set(agentId, rec)
      this.lastUpdated = Date.now()
    }
    if (name) rec.agentName = name
    if (role) rec.role = role
    return rec
  }

  private recalculate(): void {
    for (const rec of this.records.values()) {
      rec.completionRate = rec.tasksAssigned > 0 ? rec.tasksCompleted / rec.tasksAssigned : 0
      rec.errorRate = rec.tasksCompleted > 0 ? rec.errorCount / rec.tasksCompleted : 0
      const totalTasks = Array.from(this.records.values()).reduce((s, r) => s + r.tasksAssigned, 0)
      rec.utilization = totalTasks > 0 ? rec.tasksAssigned / totalTasks : 0
    }
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try { fn() } catch {}
    }
  }
}

export const TeamMetricsStoreInstance = new TeamMetricsStore()

/**
 * Team Performance Metrics Dashboard TUI panel.
 * Shows per-agent completion rate, tokens used, time spent,
 * tasks assigned/completed, error rate, and utilization.
 */
export const TeamMetricsPanel: React.FC<TeamMetricsProps> = ({ visible, onClose }) => {
  const theme = useTheme()
  const { terminalWidth } = useTerminalDimensions()
  const [, forceUpdate] = useState(0)
  const [tick, setTick] = useState(0)
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    const unsub = TeamMetricsStoreInstance.subscribe(() => forceUpdate(n => n + 1))
    const interval = setInterval(() => setTick(t => t + 1), 2000)
    return () => {
      unsub()
      clearInterval(interval)
    }
  }, [visible])

  const metrics = useMemo(() => {
    const active = selectedTeam
      ? loadTeamConfig(selectedTeam)
      : resolveActiveTeam()

    if (!active) {
      const teams = listAllTeams()
      if (teams.length === 0) return null
      const fallback = loadTeamConfig(teams[0]!.name)
      if (!fallback) return null
      return TeamMetricsStoreInstance.getTeamMetrics(fallback.name, fallback.members)
    }

    return TeamMetricsStoreInstance.getTeamMetrics(active.name, active.members)
  }, [visible, selectedTeam, tick])

  if (!visible) return null

  const panelWidth = Math.min(terminalWidth - 4, 110)
  const colName = 18
  const colRole = 14
  const colAssigned = 9
  const colDone = 9
  const colRate = 8
  const colTokens = 10
  const colTime = 8
  const colErrors = 8
  const colBar = 12

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
        <text style={{ fg: theme.primary }} attributes={TextAttributes.BOLD}>
          {' '}
          ▦ Team Performance Metrics
        </text>
        <Button onClick={onClose}>
          <text style={{ fg: theme.muted }}> [x] close </text>
        </Button>
      </box>

      <Separator width={panelWidth} widthOffset={2} />

      {!metrics ? (
        <text style={{ fg: theme.muted, paddingLeft: 1 }} attributes={TextAttributes.ITALIC}>
          No team data available. Create or select a team to view metrics.
        </text>
      ) : (
        <box style={{ flexDirection: 'column' }}>
          <box style={{ flexDirection: 'row', paddingLeft: 1, paddingRight: 1, gap: 3, flexWrap: 'wrap' }}>
            <text style={{ fg: theme.foreground }}>
              <span attributes={TextAttributes.DIM}>Team: </span>
              <span fg={theme.primary}>{metrics.teamName}</span>
            </text>
            <text style={{ fg: theme.foreground }}>
              <span attributes={TextAttributes.DIM}>Agents: </span>
              <span>{metrics.activeAgents}/{metrics.totalAgents} active</span>
            </text>
            <text style={{ fg: theme.foreground }}>
              <span attributes={TextAttributes.DIM}>Tasks: </span>
              <span>{metrics.totalTasksCompleted}/{metrics.totalTasksAssigned} done</span>
            </text>
            <text style={{ fg: theme.foreground }}>
              <span attributes={TextAttributes.DIM}>Completion: </span>
              <span fg={metrics.completionRate >= 0.8 ? '#22c55e' : metrics.completionRate >= 0.5 ? '#f59e0b' : '#ef4444'}>
                {formatPercent(metrics.completionRate)}
              </span>
            </text>
            <text style={{ fg: theme.foreground }}>
              <span attributes={TextAttributes.DIM}>Tokens: </span>
              <span>{formatTokens(metrics.totalTokensUsed)}</span>
            </text>
            <text style={{ fg: theme.foreground }}>
              <span attributes={TextAttributes.DIM}>Time: </span>
              <span>{formatDuration(metrics.totalTimeSpentMs)}</span>
            </text>
            <text style={{ fg: theme.foreground }}>
              <span attributes={TextAttributes.DIM}>Error rate: </span>
              <span fg={metrics.errorRate > 0.2 ? '#ef4444' : metrics.errorRate > 0.05 ? '#f59e0b' : '#22c55e'}>
                {formatPercent(metrics.errorRate)}
              </span>
            </text>
          </box>

          <box style={{ height: 0 }} />

          <box style={{ flexDirection: 'column', paddingLeft: 1 }}>
            <text
              style={{ fg: theme.muted, wrapMode: 'none' }}
              attributes={TextAttributes.BOLD}
            >
              <span>{'Agent'.padEnd(colName)}</span>
              <span>{'Role'.padEnd(colRole)}</span>
              <span>{'Assigned'.padStart(colAssigned)}</span>
              <span>{'Done'.padStart(colDone)}</span>
              <span>{'Rate'.padStart(colRate)}</span>
              <span>{'Tokens'.padStart(colTokens)}</span>
              <span>{'Time'.padStart(colTime)}</span>
              <span>{'Errors'.padStart(colErrors)}</span>
              <span>{'Util'.padStart(colBar)}</span>
            </text>

            {metrics.agentMetrics.length === 0 ? (
              <text style={{ fg: theme.muted, paddingTop: 1 }} attributes={TextAttributes.ITALIC}>
                No agents have recorded metrics yet. Start a team task to begin tracking.
              </text>
            ) : (
              <box style={{ flexDirection: 'column' }}>
                {metrics.agentMetrics.map((a) => {
                  const rateColor = a.completionRate >= 0.8 ? '#22c55e'
                    : a.completionRate >= 0.5 ? '#f59e0b'
                    : '#ef4444'
                  const errColor = a.errorRate > 0.2 ? '#ef4444'
                    : a.errorRate > 0.05 ? '#f59e0b'
                    : '#22c55e'
                  return (
                    <text key={a.agentId} style={{ fg: theme.foreground, wrapMode: 'none' }}>
                      <span fg={theme.primary}>{a.agentName.slice(0, colName - 1).padEnd(colName)}</span>
                      <span fg={theme.muted}>{a.role.slice(0, colRole - 1).padEnd(colRole)}</span>
                      <span>{a.tasksAssigned.toString().padStart(colAssigned)}</span>
                      <span>{a.tasksCompleted.toString().padStart(colDone)}</span>
                      <span fg={rateColor}>{formatPercent(a.completionRate).padStart(colRate)}</span>
                      <span fg={theme.muted}>{formatTokens(a.tokensUsed).padStart(colTokens)}</span>
                      <span fg={theme.muted}>{formatDuration(a.timeSpentMs).padStart(colTime)}</span>
                      <span fg={errColor}>{a.errorCount.toString().padStart(colErrors)}</span>
                      <span fg={theme.primary}>{bar(a.utilization, 1, colBar)}</span>
                    </text>
                  )
                })}
              </box>
            )}
          </box>
        </box>
      )}
    </box>
  )
}
