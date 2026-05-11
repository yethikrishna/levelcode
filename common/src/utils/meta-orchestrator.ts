import type { SwarmState } from './swarm-state'
import type { SwarmPersona } from '../types/swarm-persona'
import { loadPersonas, savePersona } from './persona-manager'
import { getBibleStats, getApprovedEntries } from './memory-bible'
import { aggregateReviews } from './reviewer-swarm'
import { getBibleContext } from './memory-bible'

// ============================================================================
// Meta-Orchestrator: Evolves Team Composition & Prompts
// ============================================================================

export interface OrchestratorAnalysis {
  bottlenecks: string[]
  recommendations: string[]
  newPersonaSuggestions: Array<{
    id: string
    name: string
    reason: string
  }>
  promptImprovements: Array<{
    personaId: string
    suggestedChanges: string
    expectedImpact: 'high' | 'medium' | 'low'
  }>
  teamCompositionScore: number  // 0-100
}

export interface SessionAnalysis {
  sessionId: string
  startTime: number
  endTime: number
  totalTasks: number
  completedTasks: number
  failedTasks: number
  avgIterations: number
  topFailurePatterns: string[]
  tokenEfficiency: number
  agentPerformance: Array<{
    agentId: string
    tasksCompleted: number
    avgConfidence: number
    avgIterations: number
    score: number
  }>
}

// ============================================================================
// Analyze Past Sessions
// ============================================================================

export function analyzeSession(state: SwarmState): SessionAnalysis {
  const tasks = state.tasks
  const agents = state.agents

  const completed = tasks.filter(t => t.status === 'completed')
  const failed = tasks.filter(t => t.iterationCount >= t.maxIterations)

  const avgIterations =
    tasks.length > 0
      ? tasks.reduce((sum, t) => sum + t.iterationCount, 0) / tasks.length
      : 0

  // Failure patterns
  const patterns: string[] = []
  const iterationHeavy = tasks.filter(t => t.iterationCount > 2)
  if (iterationHeavy.length > 0) {
    patterns.push(`${iterationHeavy.length} tasks needed >2 iterations — break into smaller pieces`)
  }

  const stuckAgents = agents.filter(a => a.status === 'stuck' || a.status === 'failed')
  if (stuckAgents.length > 0) {
    patterns.push(`${stuckAgents.length} agents got stuck — check tool permissions`)
  }

  // Agent performance
  const agentPerformance = agents.map(a => {
    const agentTasks = tasks.filter(t => t.owner === a.agentId)
    const agentCompleted = agentTasks.filter(t => t.status === 'completed')
    const avgConfidence = a.confidence || 0
    const avgIters = agentTasks.length > 0
      ? agentTasks.reduce((s, t) => s + t.iterationCount, 0) / agentTasks.length
      : 0

    return {
      agentId: a.agentId,
      tasksCompleted: agentCompleted.length,
      avgConfidence,
      avgIterations: avgIters,
      score: calculateAgentScore(agentCompleted.length, agentTasks.length, avgIters, avgConfidence),
    }
  })

  const tokenEfficiency = state.metrics.totalTokens > 0
    ? (state.metrics.tasksCompleted / (state.metrics.totalTokens / 1000)) * 100
    : 0

  return {
    sessionId: `${state.teamName}-${Date.now()}`,
    startTime: state.metrics.startTime,
    endTime: Date.now(),
    totalTasks: tasks.length,
    completedTasks: completed.length,
    failedTasks: failed.length,
    avgIterations,
    topFailurePatterns: patterns,
    tokenEfficiency,
    agentPerformance,
  }
}

function calculateAgentScore(
  completed: number,
  total: number,
  avgIterations: number,
  confidence: number,
): number {
  if (total === 0) return 0
  const completionRate = completed / total
  const iterationPenalty = Math.max(0, 1 - (avgIterations - 1) * 0.2)
  return Math.round(completionRate * 50 + iterationPenalty * 30 + (confidence / 100) * 20)
}

// ============================================================================
// Generate Recommendations
// ============================================================================

export function orchestrateTeam(state: SwarmState): OrchestratorAnalysis {
  const session = analyzeSession(state)
  const bottlenecks: string[] = []
  const recommendations: string[] = []
  const newPersonaSuggestions: OrchestratorAnalysis['newPersonaSuggestions'] = []
  const promptImprovements: OrchestratorAnalysis['promptImprovements'] = []

  // Detect bottlenecks
  if (session.avgIterations > 2) {
    bottlenecks.push('High average iterations — tasks may be too large')
    recommendations.push('Break tasks into smaller, more manageable pieces')
  }

  if (session.failedTasks > session.completedTasks * 0.2) {
    bottlenecks.push('High failure rate — review task requirements and agent capabilities')
    recommendations.push('Consider adding more specialized personas for complex tasks')
  }

  // Check token efficiency
  if (session.tokenEfficiency < 10) {
    bottlenecks.push('Low token efficiency — agents may be burning tokens on irrelevant context')
    recommendations.push('Review agent context windows — trim unnecessary history')
  }

  // Agent-specific improvements
  for (const perf of session.agentPerformance) {
    if (perf.avgIterations > 2) {
      promptImprovements.push({
        personaId: perf.agentId,
        suggestedChanges: 'Add more specific error recovery instructions to system prompt',
        expectedImpact: 'medium',
      })
    }
    if (perf.avgConfidence < 70) {
      promptImprovements.push({
        personaId: perf.agentId,
        suggestedChanges: 'Include more examples of expected output format in prompt',
        expectedImpact: 'high',
      })
    }
  }

  // Suggest new personas based on patterns
  const bibleStats = getBibleStats(state.teamName)
  if (bibleStats.pending > 10) {
    newPersonaSuggestions.push({
      id: 'bible-curator',
      name: 'Bible Curator',
      reason: 'High number of pending bible entries needs dedicated review agent',
    })
  }

  const teamCompositionScore = calculateTeamScore(session)

  return {
    bottlenecks,
    recommendations,
    newPersonaSuggestions,
    promptImprovements,
    teamCompositionScore,
  }
}

function calculateTeamScore(session: SessionAnalysis): number {
  let score = 100
  score -= (session.failedTasks / Math.max(session.totalTasks, 1)) * 40
  score -= Math.min(session.avgIterations - 1, 3) * 10
  score += Math.min(session.tokenEfficiency, 20)
  return Math.max(0, Math.round(score))
}

// ============================================================================
// Evolve Prompts Based on Performance
// ============================================================================

export function evolvePrompts(
  state: SwarmState,
  lowPerfomanceThreshold = 70,
): Array<{ personaId: string; oldPrompt: string; newPrompt: string }> {
  const analysis = orchestrateTeam(state)
  const evolutions: Array<{ personaId: string; oldPrompt: string; newPrompt: string }> = []

  const personas = loadPersonas(state.teamName)

  for (const improvement of analysis.promptImprovements) {
    if (improvement.expectedImpact === 'low') continue

    const persona = personas[improvement.personaId]
    if (!persona) continue

    const oldPrompt = persona.systemPrompt
    let newPrompt = oldPrompt

    if (improvement.suggestedChanges.includes('error recovery')) {
      newPrompt += '\n\nAdditional: When encountering errors, try alternative approaches before retrying the same method.'
    }
    if (improvement.suggestedChanges.includes('examples')) {
      newPrompt += '\n\nProvide at least 2 concrete examples in your responses.'
    }

    if (newPrompt !== oldPrompt) {
      evolutions.push({
        personaId: improvement.personaId,
        oldPrompt,
        newPrompt,
      })

      // Save the evolved prompt
      persona.systemPrompt = newPrompt
      savePersona(state.teamName, persona)
    }
  }

  return evolutions
}

// ============================================================================
// Formatting
// ============================================================================

export function formatOrchestratorReport(analysis: OrchestratorAnalysis): string {
  const lines = [
    '=== Meta-Orchestrator Analysis ===',
    '',
    `Team Composition Score: ${analysis.teamCompositionScore}%`,
    '',
  ]

  if (analysis.bottlenecks.length > 0) {
    lines.push('Bottlenecks:')
    for (const b of analysis.bottlenecks) {
      lines.push(`  ⚠️ ${b}`)
    }
    lines.push('')
  }

  if (analysis.recommendations.length > 0) {
    lines.push('Recommendations:')
    for (const r of analysis.recommendations) {
      lines.push(`  • ${r}`)
    }
    lines.push('')
  }

  if (analysis.promptImprovements.length > 0) {
    lines.push('Prompt Improvements:')
    for (const p of analysis.promptImprovements) {
      lines.push(`  [${p.expectedImpact.toUpperCase()}] ${p.personaId}: ${p.suggestedChanges}`)
    }
    lines.push('')
  }

  if (analysis.newPersonaSuggestions.length > 0) {
    lines.push('Suggested New Personas:')
    for (const s of analysis.newPersonaSuggestions) {
      lines.push(`  + ${s.name} (${s.id}): ${s.reason}`)
    }
  }

  return lines.join('\n')
}

export function formatSessionAnalysis(session: SessionAnalysis): string {
  const lines = [
    `=== Session Analysis: ${session.sessionId} ===`,
    '',
    `Duration: ${Math.round((session.endTime - session.startTime) / 60000)} minutes`,
    `Tasks: ${session.completedTasks}/${session.totalTasks} completed, ${session.failedTasks} failed`,
    `Avg iterations: ${session.avgIterations.toFixed(1)}`,
    `Token efficiency: ${session.tokenEfficiency.toFixed(1)} tasks per 1K tokens`,
    '',
    'Agent Performance:',
  ]

  for (const agent of session.agentPerformance) {
    lines.push(
      `  ${agent.agentId}: score=${agent.score}, completed=${agent.tasksCompleted}, confidence=${Math.round(agent.avgConfidence)}%`,
    )
  }

  if (session.topFailurePatterns.length > 0) {
    lines.push('', 'Failure Patterns:')
    for (const p of session.topFailurePatterns) {
      lines.push(`  - ${p}`)
    }
  }

  return lines.join('\n')
}
