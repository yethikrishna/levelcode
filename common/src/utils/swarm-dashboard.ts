import type { SwarmState, SwarmTaskState } from '../utils/swarm-state'
import { formatDependencyTree } from '../utils/dependency-graph'
import { getAgentHealth } from '../utils/timeout-manager'
import { checkTokenBudget } from '../utils/token-budget'

// ============================================================================
// Dashboard Configuration
// ============================================================================

export interface DashboardConfig {
  showTree: boolean        // Show dependency tree (default true)
  showAgents: boolean     // Show agent status (default true)
  showMetrics: boolean   // Show metrics (default true)
  showBudget: boolean   // Show token budget (default true)
  refreshInterval: number // ms between refreshes (default 5000)
  maxTasksToShow: number  // Max tasks in list (default 20)
}

const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  showTree: true,
  showAgents: true,
  showMetrics: true,
  showBudget: true,
  refreshInterval: 5000,
  maxTasksToShow: 20,
}

// ============================================================================
// Status Dashboard
// ============================================================================

export function buildDashboard(
  state: SwarmState,
  config?: Partial<DashboardConfig>,
): string {
  const cfg = { ...DEFAULT_DASHBOARD_CONFIG, ...config }
  const lines: string[] = []

  // Header
  lines.push('═'.repeat(60))
  lines.push(`  Swarm: ${state.teamName}  |  Phase: ${state.phase}`)
  lines.push('═'.repeat(60))

  // Phase progress
  const phaseTasks = state.tasks.filter(t => t.phase === state.phase)
  const completed = phaseTasks.filter(t => t.status === 'completed').length
  const total = phaseTasks.length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  lines.push(`Phase progress: ${completed}/${total} (${progress}%)`)

  if (cfg.showTree) {
    lines.push('', '--- Task Summary ---')
    lines.push(`Total: ${state.tasks.length} tasks`)
    lines.push(`Completed: ${state.tasks.filter(t => t.status === 'completed').length}`)
    lines.push(`In Progress: ${state.tasks.filter(t => t.status === 'in_progress').length}`)
    lines.push(`Blocked: ${state.tasks.filter(t => t.status === 'blocked').length}`)
    lines.push(`Pending: ${state.tasks.filter(t => t.status === 'pending').length}`)
  }

  if (cfg.showAgents) {
    lines.push('', '--- Agents ---')
    for (const agent of state.agents) {
      const health = getAgentHealth(agent.agentId, state)
      const icon = health.status === 'healthy' ? '🟢' :
                  health.status === 'warning' ? '🟡' : '🔴'
      lines.push(
        `${icon} ${agent.agentId.padEnd(15)} ${agent.status.padEnd(12)} ${agent.role}`,
      )
      if (health.reason) {
        lines.push(`   └─ ${health.reason}`)
      }
    }
  }

  if (cfg.showMetrics) {
    lines.push('', '--- Metrics ---')
    lines.push(`Tasks: ${state.metrics.tasksCompleted} completed, ${state.metrics.tasksFailed} failed`)
    lines.push(`Tokens: ${state.metrics.totalTokens.toLocaleString()}`)
    lines.push(`Avg time: ${state.metrics.averageTaskTime}ms`)
    lines.push(`Health: ${state.metrics.healthScore}%`)
  }

  if (cfg.showBudget) {
    lines.push('', '--- Budget ---')
    const budget = checkTokenBudget(state)
    const icon = budget === 'ok' ? '✅' :
                budget === 'warning' ? '⚠️' :
                budget === 'critical' ? '🔴' : '⛔'
    lines.push(`${icon} Token budget: ${budget}`)
  }

  // Warning messages
  const warnings = getWarnings(state)
  if (warnings.length > 0) {
    lines.push('', '--- Warnings ---')
    for (const warning of warnings) {
      lines.push(`⚠️ ${warning}`)
    }
  }

  lines.push('═'.repeat(60))

  return lines.join('\n')
}

// ============================================================================
// Task Table
// ============================================================================

export function buildTaskTable(tasks: SwarmTaskState[], maxTasks = 20): string {
  const lines: string[] = []

  // Header
  lines.push('ID'.padEnd(20), 'Status', 'Owner', 'Iterations')
  lines.push('-'.repeat(60))

  for (const task of tasks.slice(0, maxTasks)) {
    const icon = task.status === 'completed' ? '✅' :
                task.status === 'in_progress' ? '🔄' :
                task.status === 'blocked' ? '⏸️' : '⏹️'

    lines.push(
      `${icon} ${task.taskId}`.slice(0, 20).padEnd(20),
      task.status.padEnd(8),
      (task.owner || '-').padEnd(15),
      task.iterationCount.toString(),
    )
  }

  return lines.join('\n')
}

// ============================================================================
// Build Compact Status
// ============================================================================

export function buildCompactStatus(state: SwarmState): string {
  const completed = state.tasks.filter(t => t.status === 'completed').length
  const failed = state.tasks.filter(t => t.iterationCount >= t.maxIterations).length  // exceeded retries
  const working = state.agents.filter(a => a.status === 'working').length

  const parts = [
    `T:${completed}/${state.tasks.length}`,
    `A:${working}/${state.agents.length}`,
  ]

  if (failed > 0) {
    parts.push(`F:${failed}`)
  }

  const health = state.metrics.healthScore
  parts.push(`H:${health}%`)

  return parts.join(' ')
}

// ============================================================================
// Warnings & Alerts
// ============================================================================

export function getWarnings(state: SwarmState): string[] {
  const warnings: string[] = []

  // Check stuck agents
  for (const agent of state.agents) {
    if (agent.status === 'stuck' || agent.status === 'failed') {
      warnings.push(`Agent ${agent.agentId} is ${agent.status}`)
    }
  }

  // Check blocked tasks
  const blocked = state.tasks.filter(t => t.status === 'blocked')
  if (blocked.length > 0) {
    warnings.push(`${blocked.length} tasks blocked`)
  }

  // Check high iteration tasks
  const retrying = state.tasks.filter(
    t => t.iterationCount > 2 && t.status !== 'completed',
  )
  if (retrying.length > 0) {
    warnings.push(`${retrying.length} tasks retrying (>2 iterations)`)
  }

  // Check budget
  const budget = checkTokenBudget(state)
  if (budget !== 'ok') {
    warnings.push(`Token budget: ${budget}`)
  }

  return warnings
}

// ============================================================================
// Live Console Rendering
// ============================================================================

const CLEAR_LINE = '\x1b[2K\r'
const MOVE_UP = '\x1b[1A'

export function renderDashboard(state: SwarmState): string {
  const dashboard = buildDashboard(state)
  // For console - would use ANSI codes in practice
  return dashboard
}

export function clearConsoleLines(count: number): string {
  let result = ''
  for (let i = 0; i < count; i++) {
    result += MOVE_UP + CLEAR_LINE
  }
  return result
}

// ============================================================================
// Export for Web/UI
// ============================================================================

export interface DashboardSnapshot {
  teamName: string
  phase: string
  progress: { completed: number; total: number; percent: number }
  agents: Array<{
    id: string
    status: string
    role: string
    health: string
  }>
  tasks: Array<{
    id: string
    status: string
    phase: string
    owner?: string
    iterationCount: number
  }>
  metrics: {
    tokensUsed: number
    tasksCompleted: number
    tasksFailed: number
    healthScore: number
  }
  warnings: string[]
}

export function buildDashboardSnapshot(state: SwarmState): DashboardSnapshot {
  const phaseTasks = state.tasks.filter(t => t.phase === state.phase)
  const completed = phaseTasks.filter(t => t.status === 'completed').length

  return {
    teamName: state.teamName,
    phase: state.phase,
    progress: {
      completed,
      total: phaseTasks.length,
      percent: phaseTasks.length > 0 ? Math.round((completed / phaseTasks.length) * 100) : 0,
    },
    agents: state.agents.map(a => ({
      id: a.agentId,
      status: a.status,
      role: a.role,
      health: getAgentHealth(a.agentId, state).status,
    })),
    tasks: state.tasks.map(t => ({
      id: t.taskId,
      status: t.status,
      phase: t.phase,
      owner: t.owner,
      iterationCount: t.iterationCount,
    })),
    metrics: {
      tokensUsed: state.metrics.totalTokens,
      tasksCompleted: state.metrics.tasksCompleted,
      tasksFailed: state.metrics.tasksFailed,
      healthScore: state.metrics.healthScore,
    },
    warnings: getWarnings(state),
  }
}