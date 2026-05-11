import type { SwarmState, SwarmAgentState } from './swarm-state'
import type { SwarmTaskState } from './swarm-state'
import fs from 'fs'
import path from 'path'
import { getConfigDir } from './auth'

// ============================================================================
// Dynamic Routing & Load Balancing
// ============================================================================

export type RoutingStrategy = 'round-robin' | 'least-loaded' | 'specialization' | 'health-based'

export interface RoutingConfig {
  strategy: RoutingStrategy
  healthThreshold: number      // minimum health score (0-100)
  maxTokensPerAgent: number  // token budget per agent
  specializationBoost: number // boost for matching specialization (0-1)
}

const DEFAULT_ROUTING: RoutingConfig = {
  strategy: 'health-based',
  healthThreshold: 70,
  maxTokensPerAgent: 100000,
  specializationBoost: 0.3,
}

// ============================================================================
// Agent Health & Performance Scoring
// ============================================================================

export function calculateAgentScore(agent: SwarmAgentState, state: SwarmState): number {
  let score = agent.tokensUsed > 0
    ? Math.max(0, 100 - (agent.tokensUsed / DEFAULT_ROUTING.maxTokensPerAgent) * 100)
    : 100

  // Health status
  if (agent.status === 'stuck' || agent.status === 'failed') score -= 50
  if (agent.status === 'blocked') score -= 20

  // Confidence
  if (agent.confidence) {
    score += (agent.confidence - 50) * 0.5
  }

  // Recent activity
  const idleTime = Date.now() - agent.lastEventTime
  if (idleTime > 300000) score += 10 // boost idle agents

  return Math.max(0, Math.min(100, Math.round(score)))
}

// ============================================================================
// Route Task to Best Agent
// ============================================================================

export function routeTask(
  state: SwarmState,
  task: SwarmTaskState,
  config?: Partial<RoutingConfig>,
): string | null {
  const cfg = { ...DEFAULT_ROUTING, ...config }
  const available = state.agents.filter(a =>
    a.status === 'idle' || a.status === 'working'
  )

  if (available.length === 0) return null

  const scored = available.map(agent => ({
    agent,
    score: calculateAgentScore(agent, state),
    health: agent.health,
  }))

  switch (cfg.strategy) {
    case 'round-robin': {
      // Pick agent with fewest tasks
      const taskCounts = state.tasks.reduce((acc, t) => {
        if (t.owner) acc[t.owner] = (acc[t.owner] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      return scored.sort((a, b) =>
        (taskCounts[a.agent.agentId] || 0) - (taskCounts[b.agent.agentId] || 0)
      )[0]?.agent.agentId || null
    }

    case 'least-loaded': {
      // Pick agent with lowest token usage
      return scored.sort((a, b) =>
        a.agent.tokensUsed - b.agent.tokensUsed
      )[0]?.agent.agentId || null
    }

    case 'specialization': {
      // Boost agents whose role matches task phase
      const phaseToRole: Record<string, string> = {
        'discovery': 'researcher',
        'planning': 'architect',
        'alpha': 'implementer',
        'beta': 'reviewer',
        'production': 'reviewer',
      }

      const desiredRole = phaseToRole[task.phase] || 'implementer'
      const withBoost = scored.map(s => {
        let score = s.score
        if (s.agent.role === desiredRole) {
          score += cfg.specializationBoost * 100
        }
        return { ...s, score }
      })

      return withBoost.sort((a, b) => b.score - a.score)[0]?.agent.agentId || null
    }

    case 'health-based':
    default: {
      // Pick healthiest agent above threshold
      const healthy = scored.filter(s => s.score >= cfg.healthThreshold)
      if (healthy.length === 0 && scored.length > 0) {
        return scored.sort((a, b) => b.score - a.score)[0].agent.agentId
      }
      return healthy.sort((a, b) => b.score - a.score)[0]?.agent.agentId || null
    }
  }
}

// ============================================================================
// Load Balancing Stats
// ============================================================================

export function getLoadBalanceStats(state: SwarmState): {
  agents: Array<{ id: string; score: number; tasks: number; tokens: number }>
  averageScore: number
  recommendedRebalance: boolean
} {
  const agents = state.agents.map(agent => {
    const taskCount = state.tasks.filter(t => t.owner === agent.agentId).length
    const score = calculateAgentScore(agent, state)

    return {
      id: agent.agentId,
      score,
      tasks: taskCount,
      tokens: agent.tokensUsed,
    }
  })

  const totalScore = agents.reduce((sum, a) => sum + a.score, 0)
  const avg = agents.length > 0 ? totalScore / agents.length : 0

  // Recommend rebalance if any agent has >2x the tasks of another
  const maxTasks = Math.max(...agents.map(a => a.tasks))
  const minTasks = Math.min(...agents.map(a => a.tasks))
  const rebalance = maxTasks > minTasks * 2 && agents.length > 1

  return { agents, averageScore: Math.round(avg), recommendedRebalance: rebalance }
}

// ============================================================================
// Formatting
// ============================================================================

export function formatRoutingDecision(
  agentId: string,
  taskId: string,
  score: number,
): string {
  return `[ROUTING] Task ${taskId} → ${agentId} (score: ${score})`
}

export function formatLoadBalanceStats(stats: ReturnType<typeof getLoadBalanceStats>): string {
  const lines = [
    '=== Load Balancing Stats ===',
    '',
    `Average Score: ${stats.averageScore}%`,
    `Rebalance Recommended: ${stats.recommendedRebalance ? 'YES' : 'NO'}`,
    '',
    'Agents:',
  ]

  for (const a of stats.agents) {
    const icon = a.score >= 70 ? '🟢' : a.score >= 40 ? '🟡' : '🔴'
    lines.push(`  ${icon} ${a.id}: score=${a.score}, tasks=${a.tasks}, tokens=${a.tokens}`)
  }

  return lines.join('\n')
}
