import type { SwarmState } from './swarm-state'
import { loadSwarmState, saveSwarmState } from './swarm-state'
import { createAgentWorktree, removeAgentWorktree } from './worktree-isolation'
import path from 'path'
import fs from 'fs'
import { getConfigDir } from './auth'

// ============================================================================
// Swarm-of-Swarms: Hierarchical Coordinator
// ============================================================================

export interface SubSwarmConfig {
  id: string
  name: string
  epic: string              // Epic/feature this sub-swarm handles
  parentSwarm: string       // Parent swarm team name
  worktreePath?: string
  agentIds: string[]
  taskIds: string[]
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: SubSwarmStatus
  createdAt: number
  completedAt?: number
  report?: SubSwarmReport
}

export type SubSwarmStatus =
  | 'initializing'
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed'

export interface SubSwarmReport {
  subSwarmId: string
  status: SubSwarmStatus
  tasksCompleted: number
  tasksFailed: number
  tokensUsed: number
  healthScore: number
  summary: string
  recommendations: string[]
  digest: string            // Aggregated summary for parent
}

export interface CoordinatorState {
  coordinatorId: string
  parentSwarm: string
  subSwarms: SubSwarmConfig[]
  routingTable: RoutingRule[]
  globalBudget: {
    totalTokens: number
    totalCost: number
    maxTokens: number
    maxCost: number
  }
  createdAt: number
  status: 'active' | 'paused' | 'scaling' | 'completed'
}

export interface RoutingRule {
  id: string
  pattern: string           // e.g., 'security-*', 'ui-*'
  targetSubSwarm: string  // sub-swarm ID
  priority: number         // higher = more preferred
  conditions?: {
    minHealthScore?: number
    maxTokenUsage?: number
    requiredSpecialization?: string[]
  }
}

// ============================================================================
// Coordinator Management
// ============================================================================

const COORDINATORS = new Map<string, CoordinatorState>()

export function createCoordinator(
  parentSwarm: string,
  options?: {
    maxTokens?: number
    maxCost?: number
  },
): CoordinatorState {
  const coordinatorId = `coord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const coordinator: CoordinatorState = {
    coordinatorId,
    parentSwarm,
    subSwarms: [],
    routingTable: [],
    globalBudget: {
      totalTokens: 0,
      totalCost: 0,
      maxTokens: options?.maxTokens ?? 500000,
      maxCost: options?.maxCost ?? 200.0,
    },
    createdAt: Date.now(),
    status: 'active',
  }

  COORDINATORS.set(coordinatorId, coordinator)
  saveCoordinatorState(coordinator)
  return coordinator
}

export function getCoordinator(coordinatorId: string): CoordinatorState | null {
  return COORDINATORS.get(coordinatorId) || loadCoordinatorState(coordinatorId)
}

export function pauseCoordinator(coordinatorId: string): boolean {
  const coordinator = COORDINATORS.get(coordinatorId)
  if (!coordinator) return false
  coordinator.status = 'paused'
  saveCoordinatorState(coordinator)
  return true
}

export function resumeCoordinator(coordinatorId: string): boolean {
  const coordinator = COORDINATORS.get(coordinatorId)
  if (!coordinator) return false
  coordinator.status = 'active'
  saveCoordinatorState(coordinator)
  return true
}

// ============================================================================
// Sub-Swarm Management
// ============================================================================

export function spawnSubSwarm(
  coordinatorId: string,
  config: {
    name: string
    epic: string
    agentIds: string[]
    taskIds: string[]
    priority?: 'low' | 'medium' | 'high' | 'critical'
    repoRoot?: string
  },
): { success: boolean; subSwarmId?: string; message: string } {
  const coordinator = COORDINATORS.get(coordinatorId)
  if (!coordinator) {
    return { success: false, message: 'Coordinator not found' }
  }

  if (coordinator.status !== 'active') {
    return { success: false, message: `Coordinator is ${coordinator.status}` }
  }

  // Check global budget
  if (coordinator.globalBudget.totalTokens >= coordinator.globalBudget.maxTokens) {
    return { success: false, message: 'Global token budget exhausted' }
  }

  const subSwarmId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  // Create isolated worktree for this sub-swarm
  let worktreePath: string | undefined
  if (config.repoRoot) {
    try {
      const result = createAgentWorktree(
        config.repoRoot,
        subSwarmId,
        undefined,
      )
      worktreePath = result.path // WorktreeInfo uses 'path' property
    } catch (error) {
      return { success: false, message: `Failed to create worktree: ${error}` }
    }
  }

  const subSwarm: SubSwarmConfig = {
    id: subSwarmId,
    name: config.name,
    epic: config.epic,
    parentSwarm: coordinator.parentSwarm,
    worktreePath,
    agentIds: [...config.agentIds],
    taskIds: [...config.taskIds],
    priority: config.priority ?? 'medium',
    status: 'initializing',
    createdAt: Date.now(),
  }

  coordinator.subSwarms.push(subSwarm)
  saveCoordinatorState(coordinator)

  // Initialize sub-swarm state
  initializeSubSwarmState(coordinator.parentSwarm, subSwarm)

  return { success: true, subSwarmId, message: `Sub-swarm ${config.name} spawned` }
}

function initializeSubSwarmState(
  parentTeam: string,
  subSwarm: SubSwarmConfig,
): void {
  const statePath = path.join(
    getConfigDir(),
    'swarm',
    parentTeam,
    'sub-swarms',
    `${subSwarm.id}.json`,
  )

  const dir = path.dirname(statePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const initialState: SwarmState = {
    version: 1,
    teamName: `${parentTeam}-${subSwarm.id}`,
    phase: 'planning',
    updatedAt: Date.now(),
    agents: [],
    tasks: [],
    metrics: {
      totalTokens: 0,
      totalCost: 0,
      totalDuration: 0,
      startTime: Date.now(),
      tasksCompleted: 0,
      tasksFailed: 0,
      testsGenerated: 0,
      reviewsCompleted: 0,
      averageTaskTime: 0,
      healthScore: 100,
    },
  }

  fs.writeFileSync(statePath, JSON.stringify(initialState, null, 2), 'utf-8')
}

// ============================================================================
// Dynamic Routing
// ============================================================================

export function addRoutingRule(
  coordinatorId: string,
  rule: Omit<RoutingRule, 'id'>,
): string {
  const coordinator = COORDINATORS.get(coordinatorId)
  if (!coordinator) return ''

  const ruleId = `route-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  coordinator.routingTable.push({ ...rule, id: ruleId })
  saveCoordinatorState(coordinator)
  return ruleId
}

export function routeTask(
  coordinatorId: string,
  task: { id: string; tags?: string[]; type?: string },
): string | null {
  const coordinator = COORDINATORS.get(coordinatorId)
  if (!coordinator) return null

  // Find matching routing rules, sorted by priority
  const matchingRules = coordinator.routingTable
    .filter(rule => {
      // Simple pattern matching (can be extended to glob/regex)
      if (rule.pattern === '*') return true
      if (rule.pattern.endsWith('*')) {
        const prefix = rule.pattern.slice(0, -1)
        return task.id.startsWith(prefix) || task.tags?.some(t => t.startsWith(prefix)) || false
      }
      return task.id === rule.pattern
    })
    .sort((a, b) => b.priority - a.priority)

  for (const rule of matchingRules) {
    const subSwarm = coordinator.subSwarms.find(s => s.id === rule.targetSubSwarm)
    if (!subSwarm) continue

    // Check conditions
    if (rule.conditions) {
      if (rule.conditions.minHealthScore !== undefined) {
        const report = getSubSwarmReport(coordinator.parentSwarm, subSwarm.id)
        if (report && report.healthScore < rule.conditions.minHealthScore) {
          continue // Try next rule
        }
      }
    }

    return subSwarm.id
  }

  // Default: return the sub-swarm with least load
  const activeSubSwarms = coordinator.subSwarms.filter(s => s.status === 'active')
  if (activeSubSwarms.length === 0) return null

  return activeSubSwarms.reduce((least, current) =>
    (least.taskIds.length <= current.taskIds.length) ? least : current
  ).id
}

// ============================================================================
// Sub-Swarm Lifecycle
// ============================================================================

export function updateSubSwarmStatus(
  coordinatorId: string,
  subSwarmId: string,
  status: SubSwarmStatus,
): boolean {
  const coordinator = COORDINATORS.get(coordinatorId)
  if (!coordinator) return false

  const subSwarm = coordinator.subSwarms.find(s => s.id === subSwarmId)
  if (!subSwarm) return false

  subSwarm.status = status
  if (status === 'completed' || status === 'failed') {
    subSwarm.completedAt = Date.now()
  }

  saveCoordinatorState(coordinator)
  return true
}

export function getSubSwarmReport(
  parentTeam: string,
  subSwarmId: string,
): SubSwarmReport | null {
  try {
    const statePath = path.join(
      getConfigDir(),
      'swarm',
      parentTeam,
      'sub-swarms',
      `${subSwarmId}.json`,
    )

    if (!fs.existsSync(statePath)) return null

    const state: SwarmState = JSON.parse(fs.readFileSync(statePath, 'utf-8'))

    return {
      subSwarmId,
      status: 'completed', // simplified
      tasksCompleted: state.metrics.tasksCompleted,
      tasksFailed: state.metrics.tasksFailed,
      tokensUsed: state.metrics.totalTokens,
      healthScore: state.metrics.healthScore,
      summary: `Sub-swarm ${subSwarmId} report`,
      recommendations: [],
      digest: `Completed: ${state.metrics.tasksCompleted}, Failed: ${state.metrics.tasksFailed}, Health: ${state.metrics.healthScore}%`,
    }
  } catch {
    return null
  }
}

export function aggregateReports(coordinatorId: string): {
  totalSubSwarms: number
  active: number
  completed: number
  failed: number
  totalTokens: number
  totalCost: number
  overallHealth: number
  digest: string
} {
  const coordinator = COORDINATORS.get(coordinatorId)
  if (!coordinator) {
    return {
      totalSubSwarms: 0, active: 0, completed: 0, failed: 0,
      totalTokens: 0, totalCost: 0, overallHealth: 0, digest: 'No coordinator',
    }
  }

  let totalTokens = 0
  let totalCost = 0
  let totalHealth = 0
  let active = 0
  let completed = 0
  let failed = 0
  const digestLines: string[] = []

  for (const subSwarm of coordinator.subSwarms) {
    const report = getSubSwarmReport(coordinator.parentSwarm, subSwarm.id)
    if (!report) continue

    totalTokens += report.tokensUsed
    totalCost += report.tokensUsed * 0.0001 // rough estimate

    if (subSwarm.status === 'active') active++
    if (subSwarm.status === 'completed') completed++
    if (subSwarm.status === 'failed') failed++

    totalHealth += report.healthScore
    digestLines.push(`[${subSwarm.name}]: ${report.digest}`)
  }

  return {
    totalSubSwarms: coordinator.subSwarms.length,
    active,
    completed,
    failed,
    totalTokens,
    totalCost,
    overallHealth: coordinator.subSwarms.length > 0
      ? Math.round(totalHealth / coordinator.subSwarms.length)
      : 100,
    digest: digestLines.join('\n'),
  }
}

// ============================================================================
// Coordinator Persistence
// ============================================================================

function getCoordinatorPath(coordinatorId: string): string {
  return path.join(getConfigDir(), 'swarm', 'coordinators', `${coordinatorId}.json`)
}

function saveCoordinatorState(coordinator: CoordinatorState): void {
  const filePath = getCoordinatorPath(coordinator.coordinatorId)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, JSON.stringify(coordinator, null, 2), 'utf-8')
}

function loadCoordinatorState(coordinatorId: string): CoordinatorState | null {
  const filePath = getCoordinatorPath(coordinatorId)
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

// ============================================================================
// Formatting
// ============================================================================

export function formatCoordinatorStatus(coordinatorId: string): string {
  const coordinator = COORDINATORS.get(coordinatorId)
  if (!coordinator) return 'Coordinator not found'

  const agg = aggregateReports(coordinatorId)
  const lines = [
    `=== Coordinator: ${coordinator.coordinatorId} ===`,
    `Parent Swarm: ${coordinator.parentSwarm}`,
    `Status: ${coordinator.status.toUpperCase()}`,
    ``,
    `Sub-Swarms: ${agg.totalSubSwarms} (${agg.active} active, ${agg.completed} completed, ${agg.failed} failed)`,
    `Global Tokens: ${agg.totalTokens.toLocaleString()} / ${coordinator.globalBudget.maxTokens.toLocaleString()}`,
    `Global Cost: $${agg.totalCost.toFixed(2)} / $${coordinator.globalBudget.maxCost.toFixed(2)}`,
    `Overall Health: ${agg.overallHealth}%`,
    ``,
    `--- Sub-Swarms ---`,
  ]

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  const sorted = [...coordinator.subSwarms].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  )

  for (const sub of sorted) {
    const icon = sub.status === 'active' ? '🟢' :
                  sub.status === 'completed' ? '✅' :
                  sub.status === 'failed' ? '❌' : '⏸️'
    lines.push(`${icon} ${sub.name} (${sub.epic}) - ${sub.status}`)
    lines.push(`   Agents: ${sub.agentIds.length}, Tasks: ${sub.taskIds.length}`)
  }

  if (agg.digest) {
    lines.push('', '--- Aggregated Digest ---')
    lines.push(agg.digest)
  }

  return lines.join('\n')
}

// (getConfigDir is imported at top of file)