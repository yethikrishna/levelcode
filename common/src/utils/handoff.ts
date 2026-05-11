import type { SwarmState } from './swarm-state'
import type { SwarmTaskState } from './swarm-state'
import { getBibleContext } from './memory-bible'
import { formatBibleStats } from './memory-bible'
import { calculateHealthScore } from './swarm-state'

// ============================================================================
// Handoff Pack — Concise Summary for Human Takeover
// ============================================================================

export interface HandoffPack {
  teamName: string
  phase: string
  generatedAt: number
  state: 'ready' | 'paused' | 'blocked'
  summary: string
  keyEvidence: Array<{ type: string; content: string }>
  recommendedActions: string[]
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  estimatedEffort: string  // e.g., "2-3 hours", "1-2 days"
  nextPhase?: string
  blockers?: string[]
  metrics: {
    tasksCompleted: number
    tasksRemaining: number
    tokensUsed: number
    healthScore: number
  }
}

// ============================================================================
// Generate Handoff Pack
// ============================================================================

export function generateHandoffPack(state: SwarmState): HandoffPack {
  const phase = state.phase
  const completed = state.tasks.filter(t => t.status === 'completed').length
  const remaining = state.tasks.filter(t => t.status !== 'completed').length
  const blocked = state.tasks.filter(t => t.status === 'blocked').length

  const healthScore = calculateHealthScore(state)
  let riskLevel: HandoffPack['riskLevel'] = 'low'
  if (healthScore < 40) riskLevel = 'critical'
  else if (healthScore < 60) riskLevel = 'high'
  else if (healthScore < 80) riskLevel = 'medium'

  const evidence: Array<{ type: string; content: string }> = []

  // Key evidence
  // 1. Failed tasks
  const failed = state.tasks.filter(t => t.iterationCount >= t.maxIterations)
  for (const task of failed) {
    evidence.push({
      type: 'failed-task',
      content: `${task.taskId}: ${task.subject} (${task.iterationCount} iterations)`,
    })
  }

  // 2. Stuck agents
  const stuck = state.agents.filter(a => a.status === 'stuck' || a.status === 'failed')
  for (const agent of stuck) {
    evidence.push({
      type: 'stuck-agent',
      content: `${agent.agentId}: ${agent.status} (${agent.tokensUsed} tokens)`,
    })
  }

  // 3. Token budget
  if (state.metrics.totalTokens > 80000) {
    evidence.push({
      type: 'token-burn',
      content: `High token usage: ${state.metrics.totalTokens.toLocaleString()} tokens, $${state.metrics.totalCost.toFixed(2)}`,
    })
  }

  // 4. Bible stats
  const bibleContext = getBibleContext(state.teamName)
  if (bibleContext && !bibleContext.includes('No approved')) {
    evidence.push({
      type: 'bible-context',
      content: bibleContext.slice(0, 200),
    })
  }

  // Recommendations
  const recommendedActions: string[] = []

  if (blocked > 0) {
    recommendedActions.push(`Resolve ${blocked} blocked task(s) before proceeding`)
  }

  if (failed.length > 0) {
    recommendedActions.push(`Review ${failed.length} failed task(s) and consider breaking them into smaller pieces`)
  }

  if (state.metrics.totalTokens > 80000) {
    recommendedActions.push('Review token budget — consider trimming agent context windows')
  }

  recommendedActions.push('Review pending bible entries that need human approval')
  recommendedActions.push('Verify all reviewer approvals are complete before phase transition')

  // Estimate effort
  let estimatedEffort = '30 min - 1 hour'
  if (remaining > 10) estimatedEffort = '2-3 hours'
  if (remaining > 20) estimatedEffort = '1-2 days'
  if (riskLevel === 'critical') estimatedEffort = '2-3 days'

  // Determine next phase
  const phases: string[] = ['planning', 'pre-alpha', 'alpha', 'beta', 'production', 'mature']
  const currentIdx = phases.indexOf(phase)
  const nextPhase = currentIdx >= 0 && currentIdx < phases.length - 1
    ? phases[currentIdx + 1]
    : undefined

  // Summary
  const summary = `Swarm "${state.teamName}" is in ${phase} phase with ${completed}/${state.tasks.length} tasks completed. ` +
    `Health score: ${healthScore}%. ` +
    `${evidence.length > 0 ? `${evidence.length} critical items need attention.` : 'No critical issues.'}`

  return {
    teamName: state.teamName,
    phase,
    generatedAt: Date.now(),
    state: blocked > 0 ? 'blocked' : healthScore < 60 ? 'paused' : 'ready',
    summary,
    keyEvidence: evidence,
    recommendedActions,
    riskLevel,
    estimatedEffort,
    nextPhase,
    blockers: blocked > 0 ? state.tasks.filter(t => t.status === 'blocked').map(t => t.taskId) : undefined,
    metrics: {
      tasksCompleted: completed,
      tasksRemaining: remaining,
      tokensUsed: state.metrics.totalTokens,
      healthScore,
    },
  }
}

// ============================================================================
// Format Handoff Pack
// ============================================================================

export function formatHandoffPack(pack: HandoffPack): string {
  const riskIcon = pack.riskLevel === 'critical' ? '🔴' :
                  pack.riskLevel === 'high' ? '🟡' :
                  pack.riskLevel === 'medium' ? '🟡' : '✅'

  const lines = [
    `=== Handoff Pack: ${pack.teamName} ===`,
    '',
    `Phase: ${pack.phase}`,
    `Generated: ${new Date(pack.generatedAt).toLocaleString()}`,
    `State: ${pack.state.toUpperCase()}`,
    `Risk: ${riskIcon} ${pack.riskLevel.toUpperCase()}`,
    `Estimated Effort: ${pack.estimatedEffort}`,
    '',
    '=== Summary ===',
    pack.summary,
    '',
  ]

  if (pack.keyEvidence.length > 0) {
    lines.push('=== Key Evidence ===', '')
    for (const ev of pack.keyEvidence) {
      lines.push(`[${ev.type.toUpperCase()}] ${ev.content}`)
    }
    lines.push('')
  }

  lines.push('=== Recommended Actions ===', '')
  for (const [i, action] of pack.recommendedActions.entries()) {
    lines.push(`${i + 1}. ${action}`)
  }

  lines.push('', '=== Metrics ===')
  lines.push(`Tasks: ${pack.metrics.tasksCompleted} completed, ${pack.metrics.tasksRemaining} remaining`)
  lines.push(`Tokens: ${pack.metrics.tokensUsed.toLocaleString()}`)
  lines.push(`Health: ${pack.metrics.healthScore}%`)

  if (pack.nextPhase) {
    lines.push('', `Next Phase: ${pack.nextPhase}`)
  }

  return lines.join('\n')
}

// ============================================================================
// Quick Handoff Summary (one-liner)
// ============================================================================

export function quickHandoff(state: SwarmState): string {
  const pack = generateHandoffPack(state)
  return `[HANDOFF] ${pack.teamName} | ${pack.phase} | ${pack.metrics.tasksCompleted}/${state.tasks.length} tasks | Risk: ${pack.riskLevel} | ${pack.estimatedEffort}`
}
