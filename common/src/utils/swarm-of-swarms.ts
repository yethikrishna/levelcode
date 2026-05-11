import type { SwarmState } from './swarm-state'
import type { TeamConfig } from '../types/team-config'
import fs from 'fs'
import path from 'path'
import { getConfigDir } from './auth'

// ============================================================================
// Swarm-of-Swarms: Hierarchical Supervisor Pattern
// ============================================================================

export interface SupervisorConfig {
  maxSubSwarms: number
  autoSpwan: boolean
  supervisorPrompt: string
  loadBalanceStrategy: 'round-robin' | 'least-loaded' | 'specialization'
}

const DEFAULT_SUPERVISOR: SupervisorConfig = {
  maxSubSwarms: 5,
  autoSpwan: true,
  supervisorPrompt: `You are a Swarm Supervisor. Your job:
1. Analyze epics and break them into sub-swarms
2. Assign sub-swarms based on specialization
3. Monitor sub-swarm health and aggregate digests
4. Escalate blockers to human when needed
5. Maintain overall architectural consistency`,
  loadBalanceStrategy: 'least-loaded',
}

export interface SubSwarm {
  id: string
  name: string
  epicId: string
  worktreePath: string
  status: 'active' | 'paused' | 'completed' | 'failed'
  agents: string[]           // agent IDs in this sub-swarm
  tasksCompleted: number
  tasksTotal: number
  tokenBudget: number
  tokensUsed: number
  createdAt: number
  completedAt?: number
}

export interface SupervisorState {
  supervisorId: string
  config: SupervisorConfig
  subSwarms: SubSwarm[]
  digestInterval: number     // ms between digests
  lastDigest?: number
}

// ============================================================================
// Persistence
// ============================================================================

function getSupervisorPath(teamName: string): string {
  return path.join(getConfigDir(), 'swarm', teamName, 'supervisor.json')
}

export function loadSupervisorState(teamName: string): SupervisorState | null {
  try {
    const filePath = getSupervisorPath(teamName)
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

export function saveSupervisorState(
  teamName: string,
  state: SupervisorState,
): void {
  const filePath = getSupervisorPath(teamName)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')
}

// ============================================================================
// Sub-Swarm Management
// ============================================================================

export function createSubSwarm(
  supervisor: SupervisorState,
  epicId: string,
  name: string,
  worktreeBase: string,
): SubSwarm | null {
  if (supervisor.subSwarms.length >= supervisor.config.maxSubSwarms) {
    return null
  }

  const id = `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const worktreePath = path.join(worktreeBase, id)

  const subSwarm: SubSwarm = {
    id,
    name,
    epicId,
    worktreePath,
    status: 'active',
    agents: [],
    tasksCompleted: 0,
    tasksTotal: 0,
    tokenBudget: 50000,
    tokensUsed: 0,
    createdAt: Date.now(),
  }

  supervisor.subSwarms.push(subSwarm)
  return subSwarm
}

export function updateSubSwarmStatus(
  supervisor: SupervisorState,
  subSwarmId: string,
  status: SubSwarm['status'],
): boolean {
  const sub = supervisor.subSwarms.find(s => s.id === subSwarmId)
  if (!sub) return false
  sub.status = status
  if (status === 'completed' || status === 'failed') {
    sub.completedAt = Date.now()
  }
  return true
}

export function getSubSwarm(subSwarmId: string): SubSwarm | undefined {
  // Load from individual sub-swarm file
  // Simplified: return undefined for now
  return undefined
}

// ============================================================================
// Load Balancing
// ============================================================================

export function selectSubSwarmForTask(
  supervisor: SupervisorState,
  taskTags?: string[],
): SubSwarm | null {
  const active = supervisor.subSwarms.filter(s => s.status === 'active')
  if (active.length === 0) return null

  switch (supervisor.config.loadBalanceStrategy) {
    case 'round-robin': {
      // Simple: pick the one with fewest agents
      return active.sort((a, b) => a.agents.length - b.agents.length)[0]
    }
    case 'least-loaded': {
      // Pick the one with lowest token usage % of budget
      return active.sort((a, b) =>
        (a.tokensUsed / a.tokenBudget) - (b.tokensUsed / b.tokenBudget)
      )[0]
    }
    case 'specialization': {
      // Pick based on task tags matching sub-swarm name/epic
      if (taskTags && taskTags.length > 0) {
        const matched = active.find(s =>
          taskTags.some(t => s.name.toLowerCase().includes(t.toLowerCase()))
        )
        if (matched) return matched
      }
      return active[0]
    }
    default:
      return active[0]
  }
}

// ============================================================================
// Digest & Reporting
// ============================================================================

export function generateDigest(supervisor: SupervisorState): string {
  const lines = [
    '=== Swarm-of-Swarms Digest ===',
    '',
    `Sub-Swarms: ${supervisor.subSwarms.length} (${supervisor.subSwarms.filter(s => s.status === 'active').length} active)`,
    '',
  ]

  for (const sub of supervisor.subSwarms) {
    const progress = sub.tasksTotal > 0
      ? Math.round((sub.tasksCompleted / sub.tasksTotal) * 100)
      : 0
    const budgetPct = Math.round((sub.tokensUsed / sub.tokenBudget) * 100)

    const icon = sub.status === 'active' ? '🟢' :
                  sub.status === 'completed' ? '✅' :
                  sub.status === 'failed' ? '❌' : '⏸️'

    lines.push(
      `${icon} ${sub.name} (${sub.id})`,
      `   Progress: ${sub.tasksCompleted}/${sub.tasksTotal} (${progress}%)`,
      `   Budget: ${budgetPct}% used (${sub.tokensUsed}/${sub.tokenBudget})`,
      `   Agents: ${sub.agents.length}`,
      '',
    )
  }

  return lines.join('\n')
}

// ============================================================================
// Formatting
// ============================================================================

export function formatSupervisorState(state: SupervisorState): string {
  const lines = [
    '=== Supervisor State ===',
    '',
    `Supervisor: ${state.supervisorId}`,
    `Strategy: ${state.config.loadBalanceStrategy}`,
    `Sub-Swarms: ${state.subSwarms.length}/${state.config.maxSubSwarms}`,
    `Auto-spawn: ${state.config.autoSpwan ? 'ON' : 'OFF'}`,
  ]

  if (state.lastDigest) {
    lines.push(`Last digest: ${new Date(state.lastDigest).toLocaleString()}`)
  }

  return lines.join('\n')
}
