/**
 * `levelcode agents` — a fast, TUI-free view of every team and agent on
 * this machine, read straight from the on-disk team configs.
 *
 * Lives in the CLI fast path (dynamic import from index.tsx, like doctor):
 * no agent runtime, no renderer. CI-friendly exit codes (0 = rendered,
 * 1 = named team not found).
 */

import type { TeamConfig, TeamMember, TeamTask } from '@levelcode/common/types/team-config'

export type ComplianceTailEntry = {
  eventType: string
  agentId?: string
  timestamp: number
}

export type ComplianceSummary = {
  entries: ComplianceTailEntry[]
  totalEvents: number
  toolCalls: number
  fileChanges: number
}

export type AgentsConsoleData = {
  teams: Array<{
    name: string
    config: TeamConfig
    tasks: TeamTask[]
    isLastActive: boolean
  }>
}

export type ConsoleTheme = {
  green: (s: string) => string
  red: (s: string) => string
  yellow: (s: string) => string
  cyan: (s: string) => string
  dim: (s: string) => string
  bold: (s: string) => string
}

/** No-color theme for tests and NO_COLOR environments. */
export const plainTheme: ConsoleTheme = {
  green: (s) => s,
  red: (s) => s,
  yellow: (s) => s,
  cyan: (s) => s,
  dim: (s) => s,
  bold: (s) => s,
}

/** ANSI theme honoring NO_COLOR and non-TTY output. */
export function ansiTheme(colorEnabled: boolean): ConsoleTheme {
  if (!colorEnabled) return plainTheme
  const wrap = (code: string) => (s: string) => `\x1b[${code}m${s}\x1b[0m`
  return {
    green: wrap('32'),
    red: wrap('31'),
    yellow: wrap('33'),
    cyan: wrap('36'),
    dim: wrap('2'),
    bold: wrap('1'),
  }
}

const MEMBER_GLYPH: Record<TeamMember['status'], string> = {
  active: '●',
  working: '◉',
  idle: '○',
  blocked: '◌',
  completed: '✓',
  failed: '✗',
}

const MEMBER_COLOR: Record<TeamMember['status'], keyof ConsoleTheme> = {
  active: 'green',
  working: 'cyan',
  idle: 'dim',
  blocked: 'yellow',
  completed: 'green',
  failed: 'red',
}

/**
 * Summarize a team's compliance log from raw events (last `tailCount` entries,
 * plus aggregate counts). Pure — the disk reader is injected by the caller.
 */
export function summarizeCompliance(
  events: Array<{ eventType?: string; type?: string; agentId?: string; timestamp: number }>,
  tailCount = 5,
): ComplianceSummary {
  const normalized = events.map((e) => ({
    eventType: e.eventType ?? e.type ?? 'unknown',
    agentId: e.agentId,
    timestamp: e.timestamp,
  }))
  return {
    entries: normalized.slice(-tailCount),
    totalEvents: normalized.length,
    toolCalls: normalized.filter((e) => e.eventType === 'tool-call' || e.eventType === 'tool_use').length,
    fileChanges: normalized.filter((e) => e.eventType === 'file_change').length,
  }
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length)
}

function countTasks(tasks: TeamTask[]): Record<TeamTask['status'], number> {
  const counts: Record<TeamTask['status'], number> = {
    pending: 0,
    in_progress: 0,
    blocked: 0,
    completed: 0,
  }
  for (const task of tasks) counts[task.status]++
  return counts
}

/**
 * Overview: one block per team — members with live status glyphs and the
 * task they own, then a task summary line.
 */
export function formatAgentsOverview(data: AgentsConsoleData, theme: ConsoleTheme): string {
  const lines: string[] = []
  lines.push('')
  lines.push(`  ${theme.bold('LevelCode agents')}`)
  lines.push(`  ${'─'.repeat(46)}`)

  if (data.teams.length === 0) {
    lines.push(`  ${theme.dim('No teams found.')}`)
    lines.push(
      `  ${theme.dim('Create one inside a session: /team:create <name> — or via the team_create tool.')}`,
    )
    lines.push('')
    return lines.join('\n')
  }

  let totalAgents = 0
  let totalOpenTasks = 0

  for (const team of data.teams) {
    const { config, tasks } = team
    const leadName =
      config.members.find((m) => m.agentId === config.leadAgentId)?.name ??
      config.leadAgentId
    const counts = countTasks(tasks)
    const open = counts.pending + counts.in_progress + counts.blocked
    totalOpenTasks += open
    totalAgents += config.members.length

    const lastActive = team.isLastActive ? theme.cyan('  ← last active') : ''
    lines.push(
      `  ${theme.bold(config.name)}${lastActive}` +
        `  ${theme.dim(`phase: ${config.phase} · lead: ${leadName}`)}`,
    )

    if (config.members.length === 0) {
      lines.push(`    ${theme.dim('(no members)')}`)
    }
    for (const member of config.members) {
      const glyph = MEMBER_COLOR[member.status]
        ? theme[MEMBER_COLOR[member.status]](MEMBER_GLYPH[member.status])
        : MEMBER_GLYPH[member.status]
      const ownedTask = tasks.find(
        (t) => t.owner === member.agentId && t.status === 'in_progress',
      )
      const workingOn = ownedTask
        ? theme.dim(`  → #${ownedTask.id} ${ownedTask.subject}`)
        : ''
      const role = pad(member.role, 16)
      lines.push(
        `    ${glyph} ${pad(member.name, 18)} ${theme.dim(role)} ${member.status}${workingOn}`,
      )
    }

    lines.push(
      `    ${theme.dim(
        `tasks: ${counts.pending} pending · ${counts.in_progress} in progress · ${counts.blocked} blocked · ${counts.completed} completed`,
      )}`,
    )
    lines.push('')
  }

  lines.push(
    `  ${'─'.repeat(46)}`,
    `  ${data.teams.length} team${data.teams.length === 1 ? '' : 's'} · ${totalAgents} agent${totalAgents === 1 ? '' : 's'} · ${totalOpenTasks} open task${totalOpenTasks === 1 ? '' : 's'}`,
    '',
  )
  return lines.join('\n')
}

/**
 * Detail view for a single team: members plus every task with owner and
 * blockers.
 */
export function formatTeamDetail(
  teamName: string,
  config: TeamConfig,
  tasks: TeamTask[],
  isLastActive: boolean,
  theme: ConsoleTheme,
  complianceSummary?: ComplianceSummary,
): string {
  const lines: string[] = []
  lines.push('')
  lines.push(
    `  ${theme.bold(teamName)}${isLastActive ? theme.cyan('  ← last active') : ''}` +
      `  ${theme.dim(`phase: ${config.phase}`)}`,
  )
  lines.push(`  ${theme.dim(`created: ${new Date(config.createdAt).toISOString()}`)}`)
  lines.push('')

  lines.push(`  ${theme.bold('Members')}`)
  if (config.members.length === 0) {
    lines.push(`    ${theme.dim('(none)')}`)
  }
  for (const member of config.members) {
    const isLead = member.agentId === config.leadAgentId
    const glyph = MEMBER_COLOR[member.status]
      ? theme[MEMBER_COLOR[member.status]](MEMBER_GLYPH[member.status])
      : MEMBER_GLYPH[member.status]
    lines.push(
      `    ${glyph} ${pad(member.name, 18)} ${theme.dim(pad(member.agentType, 14))}` +
        ` ${member.status}${isLead ? theme.cyan('  (lead)') : ''}`,
    )
  }

  lines.push('')
  lines.push(`  ${theme.bold('Tasks')}`)
  if (tasks.length === 0) {
    lines.push(`    ${theme.dim('(none)')}`)
  }
  const statusColor: Record<TeamTask['status'], keyof ConsoleTheme> = {
    pending: 'yellow',
    in_progress: 'cyan',
    blocked: 'red',
    completed: 'green',
  }
  for (const task of tasks) {
    const status = theme[statusColor[task.status]](pad(task.status, 12))
    const owner = task.owner ? theme.dim(` @${task.owner}`) : theme.dim(' (unowned)')
    const blockedBy =
      task.blockedBy.length > 0 ? theme.red(`  ⛔ blocked by ${task.blockedBy.join(', ')}`) : ''
    lines.push(`    #${pad(task.id, 5)} ${status} ${task.subject}${owner}${blockedBy}`)
  }

  if (complianceSummary && complianceSummary.totalEvents > 0) {
    lines.push('')
    lines.push(`  ${theme.bold('Compliance')}`)
    lines.push(
      `    ${theme.dim(
        `${complianceSummary.totalEvents} signed events · ${complianceSummary.toolCalls} tool calls · ${complianceSummary.fileChanges} file changes`,
      )}`,
    )
    for (const entry of complianceSummary.entries) {
      const when = new Date(entry.timestamp).toLocaleTimeString()
      const agent = entry.agentId ? theme.dim(` @${entry.agentId}`) : ''
      lines.push(`    ${theme.dim(when)}  ${entry.eventType}${agent}`)
    }
  }

  lines.push('')
  return lines.join('\n')
}
