import * as fs from 'fs'
import * as path from 'path'
import { loadTeamConfig, listTasks, readInbox, getTeamsDir } from './team-fs'
import type { TeamConfig, TeamTask, TeamMember } from '../types/team-config'
import type { TeamProtocolMessage } from '../types/team-protocol'

function getInboxesDir(teamName: string): string {
  return path.join(getTeamsDir(), teamName, 'inboxes')
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

function padRight(str: string, len: number): string {
  if (str.length >= len) {
    return str.slice(0, len)
  }
  return str + ' '.repeat(len - str.length)
}

function getTaskCounts(tasks: TeamTask[]): {
  total: number
  pending: number
  in_progress: number
  completed: number
  blocked: number
} {
  return {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    blocked: tasks.filter((t) => t.status === 'blocked').length,
  }
}

function getAllInboxMessages(teamName: string, config: TeamConfig): { agent: string; messages: TeamProtocolMessage[] }[] {
  const results: { agent: string; messages: TeamProtocolMessage[] }[] = []

  // Read from known members
  for (const member of config.members) {
    try {
      const messages = readInbox(teamName, member.name)
      if (messages.length > 0) {
        results.push({ agent: member.name, messages })
      }
    } catch {
      // Skip unreadable inboxes
    }
  }

  // Also check for any extra inbox files (e.g. for the lead agent name)
  const inboxesDir = getInboxesDir(teamName)
  if (fs.existsSync(inboxesDir)) {
    const memberNames = new Set(config.members.map((m) => m.name))
    try {
      const files = fs.readdirSync(inboxesDir).filter((f) => f.endsWith('.json'))
      for (const file of files) {
        const agentName = file.replace(/\.json$/, '')
        if (!memberNames.has(agentName)) {
          try {
            const messages = readInbox(teamName, agentName)
            if (messages.length > 0) {
              results.push({ agent: agentName, messages })
            }
          } catch {
            // Skip
          }
        }
      }
    } catch {
      // Skip if directory is unreadable
    }
  }

  return results
}

function formatMessageSummary(msg: TeamProtocolMessage): string {
  switch (msg.type) {
    case 'message':
      return `[${msg.from} -> ${msg.to}] ${msg.summary ?? msg.text.slice(0, 60)}`
    case 'broadcast':
      return `[${msg.from} -> ALL] ${msg.summary ?? msg.text.slice(0, 60)}`
    case 'task_completed':
      return `[${msg.from}] Completed task: ${msg.taskSubject}`
    case 'idle_notification':
      return `[${msg.from}] Idle${msg.summary ? ': ' + msg.summary : ''}`
    case 'shutdown_request':
      return `[${msg.from}] Shutdown request${msg.reason ? ': ' + msg.reason : ''}`
    case 'shutdown_approved':
      return `[${msg.from}] Shutdown approved`
    case 'shutdown_rejected':
      return `[${msg.from}] Shutdown rejected: ${msg.reason}`
    case 'plan_approval_request':
      return `[${msg.from}] Plan approval request`
    case 'plan_approval_response':
      return `[request ${msg.requestId}] Plan ${msg.approved ? 'approved' : 'rejected'}`
  }
}

/**
 * Generates a full markdown status report for a team.
 */
export function generateTeamReport(teamName: string): string {
  const config = loadTeamConfig(teamName)
  if (!config) {
    return `# Team Report: ${teamName}\n\nTeam not found.`
  }

  const tasks = listTasks(teamName)
  const counts = getTaskCounts(tasks)
  const uptime = Date.now() - config.createdAt
  const lines: string[] = []

  // Header
  lines.push(`# Team Report: ${config.name}`)
  lines.push('')
  lines.push(`- **Phase:** ${config.phase.toUpperCase()}`)
  lines.push(`- **Uptime:** ${formatUptime(uptime)}`)
  lines.push(`- **Created:** ${new Date(config.createdAt).toISOString()}`)
  lines.push(`- **Lead Agent:** ${config.leadAgentId}`)
  lines.push(`- **Description:** ${config.description}`)
  lines.push('')

  // Member table
  lines.push('## Members')
  lines.push('')
  if (config.members.length === 0) {
    lines.push('No members.')
  } else {
    lines.push('| Role | Name | Status | Current Task |')
    lines.push('|------|------|--------|--------------|')
    for (const member of config.members) {
      const taskLabel = member.currentTaskId
        ? findTaskSubject(tasks, member.currentTaskId)
        : '-'
      lines.push(`| ${member.role} | ${member.name} | ${member.status} | ${taskLabel} |`)
    }
  }
  lines.push('')

  // Task summary
  lines.push('## Task Summary')
  lines.push('')
  lines.push(`| Metric | Count |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Total | ${counts.total} |`)
  lines.push(`| Pending | ${counts.pending} |`)
  lines.push(`| In Progress | ${counts.in_progress} |`)
  lines.push(`| Completed | ${counts.completed} |`)
  lines.push(`| Blocked | ${counts.blocked} |`)
  lines.push('')

  // Task details grouped by status
  lines.push('## Task Details')
  lines.push('')
  const statusOrder: TeamTask['status'][] = ['in_progress', 'pending', 'blocked', 'completed']
  for (const status of statusOrder) {
    const group = tasks.filter((t) => t.status === status)
    if (group.length === 0) {
      continue
    }
    lines.push(`### ${formatStatusLabel(status)} (${group.length})`)
    lines.push('')
    for (const task of group) {
      const owner = task.owner ? ` @${task.owner}` : ''
      lines.push(`- **${task.id}**: ${task.subject}${owner}`)
    }
    lines.push('')
  }

  // Recent messages summary
  const allInboxes = getAllInboxMessages(teamName, config)
  if (allInboxes.length > 0) {
    lines.push('## Recent Messages')
    lines.push('')
    const allMessages: { agent: string; msg: TeamProtocolMessage }[] = []
    for (const inbox of allInboxes) {
      for (const msg of inbox.messages) {
        allMessages.push({ agent: inbox.agent, msg })
      }
    }
    // Sort by timestamp descending, take latest 20
    allMessages.sort((a, b) => {
      const ta = new Date(a.msg.timestamp).getTime()
      const tb = new Date(b.msg.timestamp).getTime()
      return tb - ta
    })
    const recent = allMessages.slice(0, 20)
    for (const { msg } of recent) {
      lines.push(`- ${formatMessageSummary(msg)}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Generates a compact one-line status summary for a team.
 */
export function generateQuickStatus(teamName: string): string {
  const config = loadTeamConfig(teamName)
  if (!config) {
    return `Team: ${teamName} [NOT FOUND]`
  }

  const tasks = listTasks(teamName)
  const counts = getTaskCounts(tasks)
  const activeMembers = config.members.filter(
    (m) => m.status === 'active' || m.status === 'working',
  ).length

  return `Team: ${config.name} [${config.phase.toUpperCase()}] | ${config.members.length} members | ${counts.completed}/${counts.total} tasks done | ${activeMembers} active`
}

/**
 * Generates a text-based kanban board showing tasks grouped by status columns.
 */
export function generateTaskBoard(teamName: string): string {
  const config = loadTeamConfig(teamName)
  if (!config) {
    return `Task Board: ${teamName} - Team not found.`
  }

  const tasks = listTasks(teamName)
  const columns: { label: string; status: TeamTask['status'] }[] = [
    { label: 'PENDING', status: 'pending' },
    { label: 'IN PROGRESS', status: 'in_progress' },
    { label: 'COMPLETED', status: 'completed' },
    { label: 'BLOCKED', status: 'blocked' },
  ]

  const grouped: Record<string, string[]> = {}
  const colWidth = 30

  for (const col of columns) {
    const colTasks = tasks.filter((t) => t.status === col.status)
    grouped[col.label] = colTasks.map((t) => {
      const owner = t.owner ? ` @${t.owner}` : ''
      const line = `[${t.id}] ${t.subject}${owner}`
      return line.length > colWidth - 2 ? line.slice(0, colWidth - 5) + '...' : line
    })
  }

  const maxRows = Math.max(...columns.map((c) => grouped[c.label].length), 0)
  const lines: string[] = []

  // Header
  const header = columns.map((c) => padRight(c.label, colWidth)).join(' | ')
  lines.push(header)
  lines.push(columns.map(() => '-'.repeat(colWidth)).join(' | '))

  // Rows
  for (let i = 0; i < maxRows; i++) {
    const row = columns.map((c) => {
      const items = grouped[c.label]
      return padRight(i < items.length ? items[i] : '', colWidth)
    })
    lines.push(row.join(' | '))
  }

  if (maxRows === 0) {
    lines.push(columns.map(() => padRight('(empty)', colWidth)).join(' | '))
  }

  return lines.join('\n')
}

function findTaskSubject(tasks: TeamTask[], taskId: string): string {
  const task = tasks.find((t) => t.id === taskId)
  return task ? task.subject : taskId
}

function formatStatusLabel(status: TeamTask['status']): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'in_progress':
      return 'In Progress'
    case 'completed':
      return 'Completed'
    case 'blocked':
      return 'Blocked'
  }
}
