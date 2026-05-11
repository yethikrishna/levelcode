import type { SwarmState } from './swarm-state'
import type { TeamTask } from '../types/team-config'
import { topologicalSort } from './dependency-graph'

// ============================================================================
// Mermaid Graph Generator for Task Dependencies
// ============================================================================

export interface GraphOptions {
  orientation?: 'TD' | 'LR' | 'RL' | 'BT'
  showStatus?: boolean
  showAgent?: boolean
  showPhase?: boolean
  compact?: boolean
  maxNodes?: number
}

const DEFAULT_GRAPH_OPTIONS: GraphOptions = {
  orientation: 'TD',
  showStatus: true,
  showAgent: true,
  showPhase: false,
  compact: false,
  maxNodes: 50,
}

// ============================================================================
// Mermaid Diagram Generation
// ============================================================================

export function generateSwarmGraph(
  state: SwarmState,
  options?: GraphOptions,
): string {
  const opts = { ...DEFAULT_GRAPH_OPTIONS, ...options }
  const sorted = topologicalSort(state.tasks as any)
  const lines: string[] = []

  // Header
  lines.push(`flowchart ${opts.orientation}`)
  lines.push('')

  // Track node IDs for edges
  const nodeMap = new Map<string, string>()

  // Limit nodes
  const tasksToShow = state.tasks.slice(0, opts.maxNodes)

  // Phase grouping (optional)
  if (opts.showPhase) {
    const phases = [...new Set(state.tasks.map(t => t.phase))]
    for (const phase of phases) {
      const phaseTasks = tasksToShow.filter(t => t.phase === phase)
      if (phaseTasks.length === 0) continue

      lines.push(`  subgraph ${sanitizeId(`phase_${phase}`)} [${phase.toUpperCase()}]`)
      for (const task of phaseTasks) {
        const node = buildNode(task as any, opts)
        lines.push(`    ${node}`)
        nodeMap.set((task as any).taskId, sanitizeId((task as any).taskId))
      }
      lines.push('  end')
      lines.push('')
    }
  } else {
    for (const task of tasksToShow) {
      const node = buildNode(task as any, opts)
      lines.push(`  ${node}`)
      nodeMap.set((task as any).taskId, sanitizeId((task as any).taskId))
    }
  }

  // Add edges (dependencies)
  lines.push('')
  lines.push('  %% Dependencies')

  for (const task of tasksToShow) {
    const taskNode = nodeMap.get((task as any).taskId)
    if (!taskNode) continue

    const blockedBy = (task as any).blockedBy || []
    for (const depId of blockedBy) {
      const depNode = nodeMap.get(depId)
      if (depNode) {
        lines.push(`  ${depNode} --> ${taskNode}`)
      }
    }
  }

  return lines.join('\n')
}

function buildNode(
  task: { taskId: string; subject: string; status: string; owner?: string; phase?: string },
  opts: GraphOptions,
): string {
  const id = sanitizeId(task.taskId)
  const label = opts.compact
    ? truncate(task.taskId, 12)
    : `${task.taskId}: ${truncate(task.subject, 30)}`

  const statusIcon = getStatusIcon(task.status)

  let nodeDef = `${id}["${statusIcon} ${label}"]`

  // Add styling based on status
  const status = task.status
  if (status === 'completed') {
    nodeDef += ':::success'
  } else if (status === 'failed' || status === 'stuck') {
    nodeDef += ':::error'
  } else if (status === 'in_progress' || status === 'working') {
    nodeDef += ':::active'
  } else if (status === 'blocked') {
    nodeDef += ':::paused'
  }

  // Add click action (for interactive viewers)
  if (opts.showAgent && task.owner) {
    nodeDef += ` %% owner: ${task.owner}`
  }

  return nodeDef
}

function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    'completed': '✅',
    'in_progress': '🔄',
    'working': '🔄',
    'writing_test': '🧪',
    'reviewing': '👁',
    'blocked': '⏸️',
    'failed': '❌',
    'stuck': '🚨',
    'pending': '⏹️',
    'idle': '😴',
  }
  return icons[status] || '❓'
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str
}

// ============================================================================
// Interactive Handoff Pack (for Human Takeover)
// ============================================================================

export interface HandoffDecision {
  id: string;
  title: string;
  type: string;
}

export interface HandoffPack {
  summary: string;
  currentState: {
    phase: string;
    tasksCompleted: number;
    tasksTotal: number;
    healthScore: number;
    tokensUsed: number;
    costSoFar: number;
  };
  pendingDecisions: HandoffDecision[];
  recommendations: string[];
  nextActions: string[];
  mermaidGraph: string;
}

export function generateHandoffPack(
  state: SwarmState,
  options?: GraphOptions,
): HandoffPack {
  const lines = [
    `=== Swarm Handoff Pack ===`,
    ``,
    `Team: ${state.teamName}`,
    `Phase: ${state.phase}`,
    `Generated: ${new Date().toLocaleString()}`,
    ``,
    `Progress: ${state.metrics.tasksCompleted}/${state.tasks.length} tasks (${Math.round((state.metrics.tasksCompleted / Math.max(1, state.tasks.length)) * 100)}%)`,
    `Health: ${state.metrics.healthScore}%`,
    `Tokens: ${state.metrics.totalTokens.toLocaleString()}`,
    `Cost: $${state.metrics.totalCost.toFixed(2)}`,
  ]

  // Pending items (decisions, reviews, etc.)
  const pendingDecisions: HandoffDecision[] = []

  // Collect from state
  if (state.bible) {
    const bible = state.bible
    if (bible.decisions?.pending > 0) {
      pendingDecisions.push({
        id: 'bible-decisions',
        title: `${bible.decisions.pending} pending decision(s)`,
        type: 'decision',
      })
    }
    if (bible.intelligence?.pending > 0) {
      pendingDecisions.push({
        id: 'bible-intelligence',
        title: `${bible.intelligence.pending} pending intelligence item(s)`,
        type: 'intelligence',
      })
    }
  }

  const recommendations: string[] = []
  if (state.metrics.healthScore < 70) {
    recommendations.push('Health score is below 70% - review failed tasks')
  }
  if (state.metrics.totalTokens > 50000) {
    recommendations.push('High token usage - consider optimizing agent prompts')
  }

  const nextActions = [
    '/bible:pending - Review pending bible entries',
    '/team:status - Check current swarm status',
    '/team:phase - Transition to next phase when ready',
  ]

  return {
    summary: lines.join('\n'),
    currentState: {
      phase: state.phase,
      tasksCompleted: state.metrics.tasksCompleted,
      tasksTotal: state.tasks.length,
      healthScore: state.metrics.healthScore,
      tokensUsed: state.metrics.totalTokens,
      costSoFar: state.metrics.totalCost,
    },
    pendingDecisions,
    recommendations,
    nextActions,
    mermaidGraph: generateSwarmGraph(state, options),
  }
}

// ============================================================================
// CLI Command Integration
// ============================================================================

export function formatHandoffSummary(pack: HandoffPack): string {
  const lines = [
    pack.summary,
    ``,
    `--- Pending Decisions ---`,
  ]

  if (pack.pendingDecisions.length === 0) {
    lines.push(`No pending decisions.`)
  } else {
    for (const d of pack.pendingDecisions) {
      lines.push(`  [${d.type}] ${d.title}`)
    }
  }

  if (pack.recommendations.length > 0) {
    lines.push(``, `--- Recommendations ---`)
    for (const rec of pack.recommendations) {
      lines.push(`  • ${rec}`)
    }
  }

  lines.push(``, `--- Next Actions ---`)
  for (const action of pack.nextActions) {
    lines.push(`  ${action}`)
  }

  return lines.join('\n')
}

// ============================================================================
// Enhanced Team:status with Graph
// ============================================================================

export function enhanceStatusWithGraph(
  state: SwarmState,
  showGraph = true,
): string {
  const parts: string[] = []

  // Basic status
  parts.push(`=== Swarm: ${state.teamName} ===`)
  parts.push(``)
  parts.push(`Phase: ${state.phase}`)
  parts.push(`Tasks: ${state.metrics.tasksCompleted}/${state.tasks.length} completed`)
  parts.push(`Health: ${state.metrics.healthScore}%`)
  parts.push(`Tokens: ${state.metrics.totalTokens.toLocaleString()}`)

  // Add Mermaid graph
  if (showGraph && state.tasks.length > 0) {
    parts.push(``, `--- Task Dependency Graph (Mermaid) ---`)
    parts.push(``)
    parts.push(generateSwarmGraph(state, { orientation: 'LR', compact: true }))
    parts.push(``)
    parts.push(`Render this graph at: https://mermaid.live`)
  }

  return parts.join('\n')
}

// ============================================================================
// Drag-and-Drop Task Modification (for Interactive UI)
// ============================================================================

export interface TaskDragEvent {
  taskId: string;
  newPhase?: string;
  newPriority?: string;
  newDependencies?: string[];
  action: 'move' | 'reorder' | 'reprioritize';
}

export function applyDragEvent(
  state: SwarmState,
  event: TaskDragEvent,
): { success: boolean; message: string } {
  const task = state.tasks.find(t => (t as any).taskId === event.taskId)
  if (!task) {
    return { success: false, message: `Task ${event.taskId} not found` }
  }

  if (event.newPhase) {
    (task as any).phase = event.newPhase
  }

  if (event.newPriority) {
    (task as any).priority = event.newPriority
  }

  if (event.newDependencies) {
    const validDeps = event.newDependencies.filter(
      depId => state.tasks.some(t => (t as any).taskId === depId)
    )
    ;(task as any).blockedBy = validDeps
  }

  state.updatedAt = Date.now()

  return {
    success: true,
    message: `Task ${event.taskId} updated (${event.action})`,
  }
}
