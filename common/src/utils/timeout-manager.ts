import type { SwarmState, AgentStatus } from './swarm-state'
import { rollbackWorktree } from './worktree-isolation'
import { getConfigDir } from '../utils/auth'
import path from 'path'
import { execSync } from 'child_process'

// ============================================================================
// Timeout Configuration
// ============================================================================

export interface TimeoutConfig {
  agentTimeout: number      // ms before agent is "stuck" (default 300,000 = 5 min)
  maxIterations: number     // max task retries before auto-rollback (default 3)
  autoPause: boolean        // auto-pause swarm on critical failure (default true)
  killMode: 'graceful' | 'force' | 'rollback'
}

const DEFAULT_TIMEOUT: TimeoutConfig = {
  agentTimeout: 300_000,
  maxIterations: 3,
  autoPause: true,
  killMode: 'rollback',
}

function getTimeoutPath(teamName: string): string {
  return path.join(getConfigDir(), 'swarm', `${teamName}-timeout.json`)
}

export function loadTimeoutConfig(teamName: string): TimeoutConfig {
  try {
    const filePath = getTimeoutPath(teamName)
    if (!require('fs').existsSync(filePath)) return { ...DEFAULT_TIMEOUT }
    const raw = require('fs').readFileSync(filePath, 'utf-8')
    return { ...DEFAULT_TIMEOUT, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_TIMEOUT }
  }
}

export function saveTimeoutConfig(teamName: string, config: Partial<TimeoutConfig>): void {
  const filePath = getTimeoutPath(teamName)
  const dir = path.dirname(filePath)
  if (!require('fs').existsSync(dir)) {
    require('fs').mkdirSync(dir, { recursive: true })
  }
  const existing = loadTimeoutConfig(teamName)
  const updated = { ...existing, ...config }
  require('fs').writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8')
}

// ============================================================================
// Detection
// ============================================================================

export function checkStuckAgents(
  state: SwarmState,
  timeoutMs?: number,
): string[] {
  const config = loadTimeoutConfig(state.teamName)
  const timeout = timeoutMs ?? config.agentTimeout
  const now = Date.now()
  const stuck: string[] = []

  for (const agent of state.agents) {
    if (agent.status === 'stuck' || agent.status === 'failed') {
      stuck.push(agent.agentId)
      continue
    }
    if (agent.status === 'working' || agent.status === 'writing_test' || agent.status === 'reviewing') {
      if (now - agent.lastEventTime > timeout) {
        stuck.push(agent.agentId)
      }
    }
  }

  return stuck
}

export function checkDeadAgents(
  state: SwarmState,
  maxIterations = DEFAULT_TIMEOUT.maxIterations,
): string[] {
  const dead: string[] = []

  for (const task of state.tasks) {
    if (task.iterationCount >= maxIterations && task.status !== 'completed') {
      if (task.owner) {
        dead.push(task.owner)
      }
    }
  }

  return dead
}

export function getAgentHealth(agentId: string, state: SwarmState): {
  status: 'healthy' | 'warning' | 'critical'
  reason?: string
} {
  const agent = state.agents.find(a => a.agentId === agentId)
  if (!agent) return { status: 'critical', reason: 'Agent not found' }

  if (agent.status === 'stuck' || agent.status === 'failed') {
    return { status: 'critical', reason: `Agent is ${agent.status}` }
  }

  if (agent.status === 'blocked') {
    return { status: 'warning', reason: 'Agent is blocked' }
  }

  const now = Date.now()
  const config = loadTimeoutConfig(state.teamName)
  if (now - agent.lastEventTime > config.agentTimeout * 0.8) {
    return { status: 'warning', reason: 'Approaching timeout' }
  }

  return { status: 'healthy' }
}

// ============================================================================
// Actions
// ============================================================================

export function killAgent(
  agentId: string,
  state: SwarmState,
  mode: 'graceful' | 'force' | 'rollback' = 'rollback',
): { success: boolean; message: string } {
  const agent = state.agents.find(a => a.agentId === agentId)
  if (!agent) {
    return { success: false, message: `Agent ${agentId} not found` }
  }

  // Update agent status
  agent.status = 'failed'

  // Find agent's worktree and clean up
  try {
    const repoRoot = process.cwd() // Assume repo root
    const worktreeBase = path.join(repoRoot, '.claude', 'worktrees')
    const worktreePath = path.join(worktreeBase, agentId)

    if (mode === 'rollback' && require('fs').existsSync(worktreePath)) {
      // Rollback to previous commit
      try {
        execSync(`git reset --hard HEAD~1`, { cwd: worktreePath, stdio: 'pipe' })
        return { success: true, message: `Agent ${agentId} rolled back and stopped` }
      } catch {
        // If rollback fails, just remove worktree
      }
    }

    // Remove worktree
    try {
      execSync(`git worktree remove -f "${worktreePath}"`, { cwd: repoRoot, stdio: 'pipe' })
    } catch {
      // Ignore cleanup errors
    }
  } catch {
    // Ignore filesystem errors
  }

  return { success: true, message: `Agent ${agentId} has been ${mode === 'rollback' ? 'rolled back' : 'stopped'}` }
}

export function autoPauseIfNeeded(state: SwarmState): boolean {
  const config = loadTimeoutConfig(state.teamName)
  if (!config.autoPause) return false

  const stuck = checkStuckAgents(state)
  const dead = checkDeadAgents(state)

  if (stuck.length > 0 || dead.length > 0) {
    return true // Signal to pause the swarm
  }

  return false
}

// ============================================================================
// Integration with polling
// ============================================================================

export function runTimeoutCheck(state: SwarmState): {
  paused: boolean
  killedAgents: string[]
  warnings: string[]
} {
  const killedAgents: string[] = []
  const warnings: string[] = []

  // Check for stuck agents
  const stuck = checkStuckAgents(state)
  for (const agentId of stuck) {
    const result = killAgent(agentId, state, loadTimeoutConfig(state.teamName).killMode)
    if (result.success) {
      killedAgents.push(agentId)
      warnings.push(`Agent ${agentId}: ${result.message}`)
    }
  }

  // Check for dead agents (too many iterations)
  const dead = checkDeadAgents(state)
  for (const agentId of dead) {
    if (!killedAgents.includes(agentId)) {
      const result = killAgent(agentId, state, 'rollback')
      if (result.success) {
        killedAgents.push(agentId)
        warnings.push(`Agent ${agentId}: Exceeded max iterations, rolled back`)
      }
    }
  }

  const paused = autoPauseIfNeeded(state)

  return { paused, killedAgents, warnings }
}
