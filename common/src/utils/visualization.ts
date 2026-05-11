import type { TeamTask } from '../types/team-config'
import type { SwarmTaskState } from './swarm-state'
import { getTaskDepth } from './dependency-graph'

function getTaskId(task: TeamTask | SwarmTaskState): string {
  return (task as any).taskId || (task as any).id || ''
}

function getTaskStatus(task: TeamTask | SwarmTaskState): string {
  return (task as any).status || 'unknown'
}

function getTaskSubject(task: TeamTask | SwarmTaskState): string {
  return (task as any).subject || (task as any).id || ''
}

function getTaskPhase(task: TeamTask | SwarmTaskState): string {
  return (task as any).phase || ''
}

function getTaskBlockedBy(task: TeamTask | SwarmTaskState): string[] {
  return (task as any).blockedBy || []
}

// ============================================================================
// Mermaid Graph Generation
// ============================================================================

/**
 * Generate a Mermaid flowchart for task dependencies.
 * Can be rendered in any Mermaid-compatible viewer (e.g., GitHub, Notion, CLI).
 */
export function generateMermaidTaskGraph(
  tasks: Array<TeamTask | SwarmTaskState>,
  options?: {
    showStatus?: boolean
    showPhase?: boolean
    direction?: 'TB' | 'LR' | 'BT' | 'RL' // Top-Bottom, Left-Right, etc.
  },
): string {
  const dir = options?.direction || 'TB'
  const lines = [
    `flowchart ${dir}`,
    '',
  ]

  // Add nodes
  for (const task of tasks) {
    const nodeId = sanitizeId(getTaskId(task))
    const label = task.subject || getTaskId(task)
    const statusIcon = getStatusIcon(task.status)
    const phase = options?.showPhase && 'phase' in task ? ` [${task.phase}]` : ''
    lines.push(`    ${nodeId}["${statusIcon} ${label}${phase}"]`)
  }

  lines.push('')

  // Add edges (dependencies)
  for (const task of tasks) {
    const nodeId = sanitizeId(getTaskId(task))
    const blockedBy = 'blockedBy' in task ? (task as TeamTask).blockedBy : []
    for (const depId of blockedBy) {
      const depNodeId = sanitizeId(depId)
      lines.push(`    ${depNodeId} --> ${nodeId}`)
    }
  }

  return lines.join('\n')
}

/**
 * Generate a Mermaid Gantt chart for task scheduling.
 */
export function generateMermaidGantt(
  tasks: Array<TeamTask | SwarmTaskState>,
): string {
  const lines = [
    'gantt',
    '    title Swarm Task Schedule',
    '    dateFormat YYYY-MM-DD',
    '',
  ]

  // Group by phase
  const phases = [...new Set(tasks.map(t => t.phase).filter(Boolean))] as string[]

  for (const phase of phases) {
    lines.push(`    section ${phase}`)
    const phaseTasks = tasks.filter(t => t.phase === phase)
    for (const task of phaseTasks) {
      const status = task.status === 'completed' ? 'done' :
                       task.status === 'in_progress' ? 'active' :
                       task.status === 'blocked' ? 'crit' : ''
      const taskId = sanitizeId(getTaskId(task))
      lines.push(`    ${taskId} ${task.subject || getTaskId(task)} :${status}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ============================================================================
// Interactive Planning Helpers
// ============================================================================

/**
 * Generate a simple text-based kanban board.
 * Useful for CLI display.
 */
export function generateKanbanBoard(
  tasks: Array<TeamTask | SwarmTaskState>,
): string {
  const columns = {
    'pending': [] as Array<TeamTask | SwarmTaskState>,
    'in_progress': [] as Array<TeamTask | SwarmTaskState>,
    'completed': [] as Array<TeamTask | SwarmTaskState>,
    'blocked': [] as Array<TeamTask | SwarmTaskState>,
  }

  for (const task of tasks) {
    const status = task.status
    if (status === 'pending' || status === 'in_progress' || status === 'completed' || status === 'blocked') {
      columns[status].push(task)
    }
  }

  const lines = ['=== Task Board ===', '']

  for (const [column, tasksInColumn] of Object.entries(columns)) {
    const icon = column === 'pending' ? '⏹️' :
                 column === 'in_progress' ? '🔄' :
                 column === 'completed' ? '✅' : '⏸️'
    lines.push(`${icon} ${column.toUpperCase()} (${tasksInColumn.length})`)
    for (const task of tasksInColumn) {
      lines.push(`  [${getTaskId(task)}] ${task.subject}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Generate a drag-and-drop ready JSON structure.
 * This can be consumed by a frontend (React DnD, etc.) for visual planning.
 */
export function generateDragDropData(
  tasks: Array<TeamTask | SwarmTaskState>,
): {
  nodes: Array<{
    id: string
    label: string
    status: string
    phase: string
    depth: number
    x?: number
    y?: number
  }>
  edges: Array<{
    from: string
    to: string
  }>
} {
  const nodes: Array<{
    id: string; label: string; status: string; phase: string; depth: number; x?: number; y?: number
  }> = tasks.map(task => ({
    id: getTaskId(task),
    label: task.subject || getTaskId(task),
    status: task.status,
    phase: task.phase,
    depth: getTaskDepth(getTaskId(task), tasks as TeamTask[]),
  }))

  const edges: Array<{ from: string; to: string }> = []
  for (const task of tasks) {
    const blockedBy = 'blockedBy' in task ? (task as TeamTask).blockedBy : []
    for (const depId of blockedBy) {
      edges.push({ from: depId, to: getTaskId(task) })
    }
  }

  // Simple auto-layout: arrange by depth
  const depthMap = new Map<number, typeof nodes>()
  for (const node of nodes) {
    if (!depthMap.has(node.depth)) depthMap.set(node.depth, [])
    depthMap.get(node.depth)!.push(node)
  }

  let y = 0
  for (const [depth, nodesAtDepth] of depthMap.entries()) {
    const x = depth * 200
    for (let i = 0; i < nodesAtDepth.length; i++) {
      nodesAtDepth[i].x = x
      nodesAtDepth[i].y = y + i * 100
    }
    y += nodesAtDepth.length * 100
  }

  return { nodes, edges }
}

// ============================================================================
// Formatting Helpers
// ============================================================================

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed': return '✅'
    case 'in_progress': return '🔄'
    case 'blocked': return '⏸️'
    case 'failed': return '❌'
    case 'pending': return '⏹️'
    case 'reviewing': return '👀'
    case 'writing_test': return '✏️'
    default: return '🟢'
  }
}

// ============================================================================
// CLI Export (for use in commands)
// ============================================================================

export function handleVisualizationCommand(
  tasks: Array<TeamTask | SwarmTaskState>,
  format: 'mermaid' | 'kanban' | 'gantt' | 'json' = 'mermaid',
): string {
  switch (format) {
    case 'mermaid':
      return generateMermaidTaskGraph(tasks)
    case 'kanban':
      return generateKanbanBoard(tasks)
    case 'gantt':
      return generateMermaidGantt(tasks)
    case 'json':
      return JSON.stringify(generateDragDropData(tasks), null, 2)
    default:
      return generateMermaidTaskGraph(tasks)
  }
}
