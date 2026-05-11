import type { TeamTask, DevPhase } from '../types/team-config'

// ============================================================================
// Graph Structures
// ============================================================================

interface GraphNode {
  taskId: string
  dependencies: string[]  // task IDs this task depends on
  dependents: string[]   // task IDs that depend on this task
  depth: number        // -1 if not computable
}

export interface GraphCycle {
  path: string[]  // ordered task IDs forming a cycle
}

// ============================================================================
// Graph Construction
// ============================================================================

/**
 * Build a dependency graph from a list of tasks.
 * Each node tracks its dependencies and dependents.
 */
export function buildDependencyGraph(tasks: TeamTask[]): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>()

  // Initialize all nodes
  for (const task of tasks) {
    graph.set(task.id, {
      taskId: task.id,
      dependencies: [...task.blockedBy],
      dependents: [],
      depth: -1,
    })
  }

  // Build reverse edges (dependents)
  for (const [taskId, node] of graph) {
    for (const depId of node.dependencies) {
      const depNode = graph.get(depId)
      if (depNode) {
        depNode.dependents.push(taskId)
      }
    }
  }

  return graph
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get tasks that are ready to execute (all dependencies completed).
 */
export function getExecutableTasks(tasks: TeamTask[]): TeamTask[] {
  return tasks.filter((task) => {
    if (task.status === 'completed' || task.status === 'blocked') return false
    // Check if all dependencies are completed
    for (const depId of task.blockedBy) {
      const dep = tasks.find((t) => t.id === depId)
      if (!dep || dep.status !== 'completed') {
        return false
      }
    }
    return true
  })
}

/**
 * Get tasks that are blocked (waiting on dependencies).
 */
export function getBlockedTasks(tasks: TeamTask[]): TeamTask[] {
  return tasks.filter((task) => {
    if (task.status === 'completed') return false
    for (const depId of task.blockedBy) {
      const dep = tasks.find((t) => t.id === depId)
      if (!dep || dep.status !== 'completed') {
        return true
      }
    }
    return false
  })
}

/**
 * Calculate the "depth" of a task (how many levels deep in the dependency tree).
 * Tasks with no dependencies have depth 0.
 */
export function getTaskDepth(taskId: string, tasks: TeamTask[]): number {
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return -1
  if (task.blockedBy.length === 0) return 0

  let maxDepth = 0
  for (const depId of task.blockedBy) {
    const depDepth = getTaskDepth(depId, tasks)
    maxDepth = Math.max(maxDepth, depDepth + 1)
  }
  return maxDepth
}

/**
 * Get all tasks that depend on a given task (directly or transitively).
 */
export function getDependents(taskId: string, tasks: TeamTask[]): TeamTask[] {
  const result: TeamTask[] = []
  const visited = new Set<string>()

  function walk(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    for (const task of tasks) {
      if (task.blockedBy.includes(id)) {
        result.push(task)
        walk(task.id)
      }
    }
  }

  walk(taskId)
  return result
}

// ============================================================================
// Cycle Detection
// ============================================================================

/**
 * Detect if there are any cycles in the dependency graph.
 * Returns the cycle path if found, null if no cycle.
 */
export function detectCycle(tasks: TeamTask[]): GraphCycle | null {
  const graph = buildDependencyGraph(tasks)
  const visited = new Set<string>()
  const recStack = new Set<string>()
  const path: string[] = []

  function dfs(nodeId: string): boolean {
    visited.add(nodeId)
    recStack.add(nodeId)
    path.push(nodeId)

    const node = graph.get(nodeId)
    if (!node) return false

    for (const depId of node.dependencies) {
      if (!visited.has(depId)) {
        if (dfs(depId)) return true
      } else if (recStack.has(depId)) {
        // Found a cycle
        path.push(depId)
        return true
      }
    }

    recStack.delete(nodeId)
    path.pop()
    return false
  }

  for (const [nodeId] of graph) {
    if (!visited.has(nodeId)) {
      if (dfs(nodeId)) {
        return { path }
      }
    }
  }

  return null
}

// ============================================================================
// Topological Sort
// ============================================================================

/**
 * Sort tasks in topological order (dependencies first, then dependents).
 * Tasks in the same "level" can be executed in parallel.
 */
export function topologicalSort(tasks: TeamTask[]): TeamTask[][] {
  const graph = buildDependencyGraph(tasks)
  const result: TeamTask[][] = []
  const completed = new Set<string>()

  // Initialize depths
  for (const [taskId, node] of graph) {
    node.depth = getTaskDepth(taskId, tasks)
  }

  let remaining = tasks.filter((t) => t.status !== 'completed')

  while (remaining.length > 0) {
    // Find all tasks whose dependencies are all completed
    const ready = remaining.filter((task) => {
      return task.blockedBy.every((depId) => completed.has(depId))
    })

    if (ready.length === 0) {
      // Circular dependency or all remaining are blocked
      break
    }

    result.push(ready)
    for (const task of ready) {
      completed.add(task.id)
    }

    remaining = remaining.filter((t) => !completed.has(t.id))
  }

  return result
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Generate a visual dependency tree for display.
 */
export function formatDependencyTree(tasks: TeamTask[]): string {
  const lines: string[] = []
  const sorted = topologicalSort(tasks)

  for (let level = 0; level < sorted.length; level++) {
    const tasksAtLevel = sorted[level]
    for (const task of tasksAtLevel) {
      const indent = '  '.repeat(level)
      const statusIcon =
        task.status === 'completed' ? '✅' :
        task.status === 'in_progress' ? '🔄' :
        task.status === 'blocked' ? '⏸️' : '⏹️'
      lines.push(`${indent}${statusIcon} [${task.id}] ${task.subject}`)
      if (task.blockedBy.length > 0) {
        lines.push(`${indent}  └─ depends on: ${task.blockedBy.join(', ')}`)
      }
    }
    if (level < sorted.length - 1) {
      lines.push('')
    }
  }

  return lines.join('\n')
}

/**
 * Validate a new dependency addition.
 * Returns error message if invalid, null if valid.
 */
export function validateDependency(
  taskId: string,
  newDepId: string,
  tasks: TeamTask[],
): string | null {
  if (taskId === newDepId) {
    return 'A task cannot depend on itself'
  }

  const task = tasks.find((t) => t.id === taskId)
  if (!task) return `Task ${taskId} not found`

  if (task.blockedBy.includes(newDepId)) {
    return `Dependency ${newDepId} already exists`
  }

  // Check if this would create a cycle
  const testTasks = tasks.map((t) => {
    if (t.id === taskId) {
      return { ...t, blockedBy: [...t.blockedBy, newDepId] }
    }
    return t
  })

  const cycle = detectCycle(testTasks)
  if (cycle) {
    return `Adding this dependency would create a cycle: ${cycle.path.join(' -> ')}`
  }

  return null
}
