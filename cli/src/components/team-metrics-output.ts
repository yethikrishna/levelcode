import {
  loadTeamConfig,
  listTasks,
} from '@levelcode/common/utils/team-fs'
import { resolveActiveTeam } from '../commands/command-registry'
import { listAllTeams } from '@levelcode/common/utils/team-discovery'
import type { TeamConfig, TeamTask } from '@levelcode/common/types/team-config'
import { TeamMetricsStoreInstance } from '../components/team-metrics'

/**
 * Build a formatted text summary of team performance metrics.
 * Used by the /team:metrics command to print stats in chat
 * (and also feeds the TeamMetricsPanel TUI component).
 */
export function formatTeamMetrics(team?: TeamConfig | null): string {
  const active = team ?? resolveActiveTeam()
  if (!active) {
    const teams = listAllTeams()
    if (teams.length === 0) {
      return 'No teams found. Create a team with /team:create first.'
    }
    return formatTeamMetricsForConfig(loadTeamConfig(teams[0]!.name))
  }
  return formatTeamMetricsForConfig(active)
}

function formatTeamMetricsForConfig(team: TeamConfig | null): string {
  if (!team) return 'Team not found.'

  const tasks: TeamTask[] = (() => {
    try { return listTasks(team.name) } catch { return [] }
  })()

  const now = Date.now()
  const metrics = TeamMetricsStoreInstance.getTeamMetrics(team.name, team.members)

  const completedTasks = tasks.filter(t => t.status === 'completed')
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress')
  const totalTasks = tasks.length

  const roleCounts = new Map<string, number>()
  for (const m of team.members) {
    roleCounts.set(m.role, (roleCounts.get(m.role) ?? 0) + 1)
  }

  const lines: string[] = []
  lines.push(`=== Team: ${team.name} ===`)
  lines.push(`Phase: ${team.phase}`)
  lines.push(`Members: ${team.members.length} (${Array.from(roleCounts.entries()).map(([r, c]) => `${c}×${r}`).join(', ')})`)
  lines.push(`Tasks: ${completedTasks.length} done / ${inProgressTasks.length} in progress / ${totalTasks} total`)
  lines.push('')

  if (metrics.agentMetrics.length === 0) {
    lines.push('No agent runtime metrics collected yet.')
    lines.push('Run team tasks to populate per-agent performance stats.')
  } else {
    lines.push('Per-Agent Performance:')
    lines.push('')
    lines.push(
      'Agent'.padEnd(18) +
      'Role'.padEnd(14) +
      'Done'.padStart(6) +
      'Rate'.padStart(8) +
      'Tokens'.padStart(10) +
      'Errors'.padStart(8),
    )
    lines.push('─'.repeat(64))
    for (const a of metrics.agentMetrics) {
      lines.push(
        a.agentName.slice(0, 17).padEnd(18) +
        a.role.slice(0, 13).padEnd(14) +
        a.tasksCompleted.toString().padStart(6) +
        `${(a.completionRate * 100).toFixed(0)}%`.padStart(8) +
        (a.tokensUsed >= 1000 ? `${(a.tokensUsed / 1000).toFixed(1)}K` : a.tokensUsed.toString()).padStart(10) +
        a.errorCount.toString().padStart(8),
      )
    }
    lines.push('')
    lines.push(`Aggregate: ${formatPercent(metrics.completionRate)} completion, ${metrics.totalErrors} errors, ${formatTokens(metrics.totalTokensUsed)} tokens used`)
  }

  if (completedTasks.length > 0) {
    lines.push('')
    lines.push('Recently completed tasks:')
    for (const t of completedTasks.slice(-5).reverse()) {
      lines.push(`  ✓ ${t.subject ?? t.id}`)
    }
  }

  return lines.join('\n')
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}
