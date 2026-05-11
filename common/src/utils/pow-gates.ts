import type { SwarmState, SwarmTaskState } from './swarm-state'
import { runSwarmReview } from './reviewer-swarm'
import { getBibleContext } from './memory-bible'

// ============================================================================
// Proof-of-Work Gates
// ============================================================================

export interface POWGateConfig {
  requireCI: boolean
  minMutationScore: number    // 0-100, default 80
  minCoverage: number      // 0-100, default 70
  maxIterations: number     // default 3
  requiredReviewers: number // default 1
  allowSelfApproval: boolean // default false
}

const DEFAULT_POW: POWGateConfig = {
  requireCI: true,
  minMutationScore: 80,
  minCoverage: 70,
  maxIterations: 3,
  requiredReviewers: 1,
  allowSelfApproval: false,
}

export type GateResult = {
  passed: boolean
  gate: string
  reason?: string
  evidence?: string
}

// ============================================================================
// Check All Gates for a Task
// ============================================================================

export async function checkAllGates(
  state: SwarmState,
  taskId: string,
  options?: {
    testFile?: string
    ciPassed?: boolean
    mutationScore?: number
    coverage?: number
    reviewerApprovals?: number
  },
): Promise<{ passed: boolean; gates: GateResult[] }> {
  const gates: GateResult[] = []

  // Gate 1: Max iterations
  const task = state.tasks.find(t => t.taskId === taskId)
  if (task) {
    const gate = checkIterationGate(task, DEFAULT_POW.maxIterations)
    gates.push(gate)
  }

  // Gate 2: CI passed
  if (DEFAULT_POW.requireCI) {
    const ciPassed = options?.ciPassed ?? false
    gates.push({
      passed: ciPassed,
      gate: 'ci',
      reason: ciPassed ? undefined : 'CI checks must pass before promotion',
    })
  }

  // Gate 3: Mutation score
  if (options?.mutationScore !== undefined) {
    gates.push(checkMutationGate(options.mutationScore, DEFAULT_POW.minMutationScore))
  }

  // Gate 4: Coverage
  if (options?.coverage !== undefined) {
    gates.push(checkCoverageGate(options.coverage, DEFAULT_POW.minCoverage))
  }

  // Gate 5: Review approvals
  if (options?.reviewerApprovals !== undefined) {
    gates.push(checkReviewGate(options.reviewerApprovals, DEFAULT_POW.requiredReviewers))
  }

  const passed = gates.every(g => g.passed)
  return { passed, gates }
}

// ============================================================================
// Individual Gates
// ============================================================================

export function checkIterationGate(
  task: SwarmTaskState,
  maxIterations = DEFAULT_POW.maxIterations,
): GateResult {
  const passed = task.iterationCount <= maxIterations
  return {
    passed,
    gate: 'iteration-limit',
    reason: passed ? undefined : `Exceeded max iterations: ${task.iterationCount}/${maxIterations}`,
  }
}

export function checkMutationGate(
  score: number,
  minScore = DEFAULT_POW.minMutationScore,
): GateResult {
  const passed = score >= minScore
  return {
    passed,
    gate: 'mutation-score',
    reason: passed ? undefined : `Mutation score ${score}% < minimum ${minScore}%`,
    evidence: `Score: ${score}%, Minimum: ${minScore}%`,
  }
}

export function checkCoverageGate(
  coverage: number,
  minCoverage = DEFAULT_POW.minCoverage,
): GateResult {
  const passed = coverage >= minCoverage
  return {
    passed,
    gate: 'test-coverage',
    reason: passed ? undefined : `Coverage ${coverage}% < minimum ${minCoverage}%`,
    evidence: `Coverage: ${coverage}%, Minimum: ${minCoverage}%`,
  }
}

export function checkReviewGate(
  approvals: number,
  required = DEFAULT_POW.requiredReviewers,
): GateResult {
  const passed = approvals >= required
  return {
    passed,
    gate: 'review-approval',
    reason: passed ? undefined : `Need ${required} reviewer approvals, got ${approvals}`,
    evidence: `${approvals}/${required} approvals`,
  }
}

export function checkBibleCompliance(
  teamName: string,
  taskId: string,
): GateResult {
  const context = getBibleContext(teamName)
  const passed = context.length > 0 && !context.includes('No approved bible entries')

  return {
    passed,
    gate: 'bible-compliance',
    reason: passed ? undefined : 'No approved bible entries for context',
    evidence: context.slice(0, 200),
  }
}

// ============================================================================
// State Update on Gate Failure
// ============================================================================

export function recordGateFailure(
  state: SwarmState,
  taskId: string,
  gate: GateResult,
): void {
  const task = state.tasks.find(t => t.taskId === taskId)
  if (!task) return

  if (!state.healthWarnings) state.healthWarnings = []
  state.healthWarnings.push(
    `Gate failed: ${gate.gate} - ${gate.reason || 'unknown reason'}`,
  )
}

// ============================================================================
// Formatting
// ============================================================================

export function formatGateResults(result: { passed: boolean; gates: GateResult[] }): string {
  const lines = [
    `=== Proof-of-Work Gates: ${result.passed ? 'PASSED' : 'FAILED'} ===`,
    '',
  ]

  for (const gate of result.gates) {
    const icon = gate.passed ? '✅' : '❌'
    lines.push(`${icon} ${gate.gate.toUpperCase()}`)
    if (!gate.passed && gate.reason) {
      lines.push(`   ${gate.reason}`)
    }
    if (gate.evidence) {
      lines.push(`   Evidence: ${gate.evidence}`)
    }
  }

  return lines.join('\n')
}
