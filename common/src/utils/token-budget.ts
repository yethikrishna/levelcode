import type { SwarmState } from './swarm-state'

// ============================================================================
// Token Budget Configuration
// ============================================================================

export interface TokenBudgetConfig {
  budget: number        // Soft warning threshold (default 100,000)
  hardLimit: number     // Hard limit - kill swarm (default 200,000)
  costBudget: number     // Cost budget in USD (default 50.0)
  warningThreshold: number // 0.0-1.0, when to trigger warning (default 0.8)
}

const DEFAULT_BUDGET: TokenBudgetConfig = {
  budget: 100_000,
  hardLimit: 200_000,
  costBudget: 50.0,
  warningThreshold: 0.8,
}

// ============================================================================
// Budget I/O (persisted to settings)
// ============================================================================

import { getConfigDir } from '../utils/auth'
import fs from 'fs'
import path from 'path'

function getBudgetPath(teamName: string): string {
  return path.join(getConfigDir(), 'swarm', `${teamName}-budget.json`)
}

export function loadTokenBudget(teamName: string): TokenBudgetConfig {
  try {
    const filePath = getBudgetPath(teamName)
    if (!fs.existsSync(filePath)) {
      return { ...DEFAULT_BUDGET }
    }
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_BUDGET, ...parsed }
  } catch {
    return { ...DEFAULT_BUDGET }
  }
}

export function saveTokenBudget(teamName: string, config: Partial<TokenBudgetConfig>): void {
  const filePath = getBudgetPath(teamName)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const existing = loadTokenBudget(teamName)
  const updated = { ...existing, ...config }
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8')
}

// ============================================================================
// Budget Checking
// ============================================================================

export type BudgetStatus = 'ok' | 'warning' | 'critical' | 'exceeded'

export function checkTokenBudget(state: SwarmState, config?: TokenBudgetConfig): BudgetStatus {
  const budget = config ?? DEFAULT_BUDGET
  const used = state.metrics.totalTokens
  const cost = state.metrics.totalCost

  if (used >= budget.hardLimit || cost >= budget.costBudget) {
    return 'exceeded'
  }

  if (used >= budget.budget || cost >= budget.costBudget * budget.warningThreshold) {
    return 'critical'
  }

  if (used >= budget.budget * budget.warningThreshold) {
    return 'warning'
  }

  return 'ok'
}

export function recordTokenUsage(
  state: SwarmState,
  agentId: string,
  tokens: number,
  cost: number,
): void {
  state.metrics.totalTokens += tokens
  state.metrics.totalCost += cost

  // Update agent's token usage
  const agent = state.agents.find(a => a.agentId === agentId)
  if (agent) {
    agent.tokensUsed += tokens
  }
}

// ============================================================================
// Reporting
// ============================================================================

export function formatBudgetReport(state: SwarmState, config?: TokenBudgetConfig): string {
  const budget = config ?? DEFAULT_BUDGET
  const status = checkTokenBudget(state, budget)
  const used = state.metrics.totalTokens
  const cost = state.metrics.totalCost
  const remaining = Math.max(0, budget.budget - used)

  const lines = [
    `Token Budget Status: ${status.toUpperCase()}`,
    ``,
    `Tokens used:   ${used.toLocaleString()} / ${budget.budget.toLocaleString()}`,
    `Remaining:    ${remaining.toLocaleString()}`,
    `Cost so far:  $${cost.toFixed(2)} / $${budget.costBudget.toFixed(2)}`,
    `Health score:  ${state.metrics.healthScore}%`,
    ``,
    `Tasks completed: ${state.metrics.tasksCompleted}`,
    `Tasks failed:    ${state.metrics.tasksFailed}`,
    `Tests generated: ${state.metrics.testsGenerated}`,
    `Reviews completed: ${state.metrics.reviewsCompleted}`,
  ]

  return lines.join('\n')
}

export function calculateAverageTaskTime(state: SwarmState): number {
  if (state.metrics.tasksCompleted === 0) return 0
  return state.metrics.averageTaskTime
}
