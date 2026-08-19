/**
 * Long-Horizon Task Decomposer
 *
 * Breaks large goals into DAGs of subtasks with dependency tracking,
 * ready-queue management, and disk persistence.
 */

import * as fs from 'fs'
import * as path from 'path'

export type SubtaskStatus = 'pending' | 'ready' | 'in-progress' | 'completed' | 'failed' | 'blocked'

export interface Subtask {
  id: string
  description: string
  dependencies: string[]
  estimatedSteps: number
  status: SubtaskStatus
  assignedAgent: string | null
  tags?: string[]
  result?: string
}

export interface EffortEstimate {
  steps: number
  estimatedTokens: number
  estimatedMs: number
  confidence: number
}

export interface TaskDAG {
  id: string
  goal: string
  subtasks: Map<string, Subtask>
  topologicalOrder: string[]
  createdAt: string
  updatedAt: string
}

interface SerializedDAG {
  id: string
  goal: string
  subtasks: Subtask[]
  topologicalOrder: string[]
  createdAt: string
  updatedAt: string
}

export class TaskDecomposer {
  private dags: Map<string, TaskDAG> = new Map()
  private persistDir: string | null = null

  constructor() {}

  persistToDisk(cwd: string): void {
    this.persistDir = path.join(cwd, '.levelcode', 'task-dags').replace(/\\/g, '/')
    fs.mkdirSync(this.persistDir, { recursive: true })
  }

  decompose(goal: string): TaskDAG {
    const id = `dag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()

    const dag: TaskDAG = {
      id,
      goal,
      subtasks: new Map(),
      topologicalOrder: [],
      createdAt: now,
      updatedAt: now,
    }

    const researchId = `${id}_research`
    const planId = `${id}_plan`
    const implementId = `${id}_implement`
    const testId = `${id}_test`
    const docsId = `${id}_docs`

    this.addSubtask(dag, {
      id: researchId,
      description: `Research and understand existing code relevant to: ${goal}`,
      dependencies: [],
      estimatedSteps: 3,
      status: 'pending',
      assignedAgent: null,
      tags: ['research'],
    })
    this.addSubtask(dag, {
      id: planId,
      description: `Plan implementation approach for: ${goal}`,
      dependencies: [researchId],
      estimatedSteps: 2,
      status: 'pending',
      assignedAgent: null,
      tags: ['planning'],
    })
    this.addSubtask(dag, {
      id: implementId,
      description: `Implement changes for: ${goal}`,
      dependencies: [planId],
      estimatedSteps: 8,
      status: 'pending',
      assignedAgent: null,
      tags: ['implementation'],
    })
    this.addSubtask(dag, {
      id: testId,
      description: `Write and run tests for: ${goal}`,
      dependencies: [implementId],
      estimatedSteps: 4,
      status: 'pending',
      assignedAgent: null,
      tags: ['testing'],
    })
    this.addSubtask(dag, {
      id: docsId,
      description: `Update documentation for: ${goal}`,
      dependencies: [implementId],
      estimatedSteps: 2,
      status: 'pending',
      assignedAgent: null,
      tags: ['docs'],
    })

    this.dags.set(id, dag)
    this.recomputeTopologicalOrder(dag)
    return dag
  }

  addSubtask(dag: TaskDAG, subtask: Subtask): void {
    if (dag.subtasks.has(subtask.id)) {
      throw new Error(`Subtask ${subtask.id} already exists in DAG ${dag.id}`)
    }
    for (const depId of subtask.dependencies) {
      if (!dag.subtasks.has(depId)) {
        throw new Error(`Dependency ${depId} not found in DAG ${dag.id}`)
      }
    }
    dag.subtasks.set(subtask.id, subtask)
    dag.updatedAt = new Date().toISOString()
    this.recomputeTopologicalOrder(dag)
  }

  estimateEffort(subtask: Subtask): EffortEstimate {
    const steps = subtask.estimatedSteps
    const tokensPerStep = 2000
    const msPerStep = 15000
    const hasTests = subtask.tags?.includes('testing') ?? false
    const hasResearch = subtask.tags?.includes('research') ?? false
    const multiplier = hasTests ? 1.3 : hasResearch ? 0.8 : 1.0
    return {
      steps,
      estimatedTokens: Math.round(steps * tokensPerStep * multiplier),
      estimatedMs: Math.round(steps * msPerStep * multiplier),
      confidence: 0.6,
    }
  }

  getNextReadyTasks(dag: TaskDAG): Subtask[] {
    const ready: Subtask[] = []
    for (const sub of dag.subtasks.values()) {
      if (sub.status !== 'pending' && sub.status !== 'blocked') continue
      const depsMet = sub.dependencies.every((depId) => {
        const dep = dag.subtasks.get(depId)
        return dep?.status === 'completed'
      })
      if (depsMet) {
        sub.status = 'ready'
        ready.push(sub)
      }
    }
    return ready
  }

  markComplete(dag: TaskDAG, taskId: string, result?: string): void {
    const sub = dag.subtasks.get(taskId)
    if (!sub) throw new Error(`Subtask ${taskId} not found in DAG ${dag.id}`)
    sub.status = 'completed'
    if (result) sub.result = result
    dag.updatedAt = new Date().toISOString()
    for (const other of dag.subtasks.values()) {
      if (other.status === 'blocked') {
        const depsMet = other.dependencies.every((depId) => {
          const dep = dag.subtasks.get(depId)
          return dep?.status === 'completed'
        })
        if (depsMet) other.status = 'ready'
      }
    }
  }

  markFailed(dag: TaskDAG, taskId: string, reason: string): void {
    const sub = dag.subtasks.get(taskId)
    if (!sub) throw new Error(`Subtask ${taskId} not found in DAG ${dag.id}`)
    sub.status = 'failed'
    sub.result = reason
    dag.updatedAt = new Date().toISOString()
    for (const other of dag.subtasks.values()) {
      if (other.dependencies.includes(taskId)) {
        other.status = 'blocked'
      }
    }
  }

  assignTask(dag: TaskDAG, taskId: string, agentId: string | null): void {
    const sub = dag.subtasks.get(taskId)
    if (!sub) throw new Error(`Subtask ${taskId} not found in DAG ${dag.id}`)
    sub.assignedAgent = agentId
    if (agentId && sub.status === 'ready') sub.status = 'in-progress'
    dag.updatedAt = new Date().toISOString()
  }

  isComplete(dag: TaskDAG): boolean {
    for (const sub of dag.subtasks.values()) {
      if (sub.status !== 'completed') return false
    }
    return true
  }

  getProgress(dag: TaskDAG) {
    const counts = { total: 0, completed: 0, ready: 0, inProgress: 0, failed: 0, blocked: 0, pending: 0 }
    for (const sub of dag.subtasks.values()) {
      counts.total++
      counts[sub.status === 'in-progress' ? 'inProgress' : sub.status]++
    }
    return counts
  }

  persistDag(dag: TaskDAG, filePath?: string): void {
    const dir = this.persistDir
    if (!dir && !filePath) {
      throw new Error('No persistence directory configured; call persistToDisk() first or supply filePath')
    }
    const target = filePath ?? path.join(dir!, `${dag.id}.json`)
    const serialized: SerializedDAG = {
      id: dag.id,
      goal: dag.goal,
      subtasks: Array.from(dag.subtasks.values()),
      topologicalOrder: dag.topologicalOrder,
      createdAt: dag.createdAt,
      updatedAt: dag.updatedAt,
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, JSON.stringify(serialized, null, 2), 'utf-8')
  }

  loadDag(filePath: string): TaskDAG {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as SerializedDAG
    const dag: TaskDAG = {
      id: data.id,
      goal: data.goal,
      subtasks: new Map(data.subtasks.map((s: Subtask) => [s.id, s])),
      topologicalOrder: data.topologicalOrder,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    }
    this.dags.set(dag.id, dag)
    return dag
  }

  loadAllDags(): TaskDAG[] {
    if (!this.persistDir) return []
    if (!fs.existsSync(this.persistDir)) return []
    const files = fs.readdirSync(this.persistDir).filter((f: string) => f.endsWith('.json'))
    return files.map((f: string) => this.loadDag(path.join(this.persistDir!, f)))
  }

  private recomputeTopologicalOrder(dag: TaskDAG): void {
    const inDegree: Map<string, number> = new Map()
    const adj: Map<string, string[]> = new Map()
    for (const id of dag.subtasks.keys()) {
      inDegree.set(id, 0)
      adj.set(id, [])
    }
    for (const sub of dag.subtasks.values()) {
      for (const depId of sub.dependencies) {
        adj.get(depId)!.push(sub.id)
        inDegree.set(sub.id, (inDegree.get(sub.id) ?? 0) + 1)
      }
    }
    const queue: string[] = []
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id)
    }
    const order: string[] = []
    while (queue.length > 0) {
      const id = queue.shift()!
      order.push(id)
      for (const neighbor of adj.get(id) ?? []) {
        inDegree.set(neighbor, (inDegree.get(neighbor) ?? 1) - 1)
        if (inDegree.get(neighbor) === 0) queue.push(neighbor)
      }
    }
    if (order.length !== dag.subtasks.size) {
      throw new Error(`Cycle detected in DAG ${dag.id}`)
    }
    dag.topologicalOrder = order
  }
}

let defaultDecomposer: TaskDecomposer | null = null

export function getDefaultTaskDecomposer(): TaskDecomposer {
  if (!defaultDecomposer) defaultDecomposer = new TaskDecomposer()
  return defaultDecomposer
}

export function resetDefaultTaskDecomposer(): void {
  defaultDecomposer = null
}
