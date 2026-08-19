/**
 * Trajectory Diff Tool
 *
 * Compares two trajectory runs (sequences of agent steps) to identify
 * where they diverged, what tool choices differed, where errors occurred,
 * and produces human-readable summaries. Useful for A/B testing prompts,
 * comparing baseline vs improved agents, or diagnosing regressions.
 */

import type { TrajectoryStep, Trajectory } from './replay'

// ============================================================================
// Types
// ============================================================================

/**
 * A single divergent step between two trajectories.
 */
export interface StepDiff {
  /** Step index in trajectory A */
  indexA: number
  /** Step index in trajectory B */
  indexB: number
  /** Nature of the divergence */
  kind:
    | 'tool_mismatch'
    | 'tool_args_mismatch'
    | 'missing_in_a'
    | 'missing_in_b'
    | 'error_in_a'
    | 'error_in_b'
    | 'content_mismatch'
    | 'type_mismatch'
  /** Short description of the difference */
  summary: string
  /** Step from trajectory A (or null if missing) */
  stepA: TrajectoryStep | null
  /** Step from trajectory B (or null if missing) */
  stepB: TrajectoryStep | null
}

/**
 * A tool-choice comparison at a specific step.
 */
export interface ToolChoiceDiff {
  index: number
  toolA: string | null
  toolB: string | null
}

/**
 * An error occurrence in one of the trajectories.
 */
export interface ErrorPoint {
  index: number
  trajectory: 'a' | 'b'
  stepType: string
  message: string
}

/**
 * Full diff between two trajectories.
 */
export interface TrajectoryDiff {
  /** Session id of trajectory A */
  sessionA: string
  /** Session id of trajectory B */
  sessionB: string
  /** Total steps in A */
  stepsA: number
  /** Total steps in B */
  stepsB: number
  /** First step index where behavior diverges (-1 if identical) */
  divergenceIndex: number
  /** Per-step diffs at divergence points (only mismatching steps) */
  stepDiffs: StepDiff[]
  /** Side-by-side tool choice differences */
  toolChoiceDiffs: ToolChoiceDiff[]
  /** Points where errors occurred in either trajectory */
  errorPoints: ErrorPoint[]
  /** Whether the two trajectories are considered identical on the compared steps */
  identical: boolean
}

/**
 * High-level summary of a trajectory diff.
 */
export interface DiffSummary {
  /** Difference in total step count */
  stepCountDiff: number
  /** Number of tool-choice differences */
  toolChoiceDiffs: number
  /** Number of errors in trajectory A */
  errorsA: number
  /** Number of errors in trajectory B */
  errorsB: number
  /** First divergence index (-1 if identical) */
  firstDivergenceAt: number
  /** Whether the runs terminated identically (same final answer intent) */
  sameOutcome: boolean
  /** Short human-readable verdict */
  verdict: string
}

// ============================================================================
// Diff functions
// ============================================================================

/**
 * Find the first step index where two trajectories diverge.
 * Steps are matched by index; two steps are "the same" if they have the
 * same type and (for tool calls) same tool name.
 *
 * @param a - First trajectory
 * @param b - Second trajectory
 * @returns Step index where they first differ, or -1 if identical
 */
export function findDivergencePoint(
  a: Trajectory | TrajectoryStep[],
  b: Trajectory | TrajectoryStep[],
): number {
  const stepsA = Array.isArray(a) ? a : a.steps
  const stepsB = Array.isArray(b) ? b : b.steps
  const minLen = Math.min(stepsA.length, stepsB.length)
  for (let i = 0; i < minLen; i++) {
    if (!stepsMatch(stepsA[i]!, stepsB[i]!)) return i
  }
  if (stepsA.length !== stepsB.length) return minLen
  return -1
}

/**
 * Compute a full diff between two trajectories.
 *
 * @param a - First trajectory
 * @param b - Second trajectory
 * @returns TrajectoryDiff describing all mismatches
 */
export function diffTrajectories(
  a: Trajectory,
  b: Trajectory,
): TrajectoryDiff {
  const stepsA = a.steps
  const stepsB = b.steps
  const divergenceIndex = findDivergencePoint(stepsA, stepsB)
  const stepDiffs: StepDiff[] = []
  const toolChoiceDiffs: ToolChoiceDiff[] = []
  const errorPoints: ErrorPoint[] = []

  collectErrors(stepsA, 'a', errorPoints)
  collectErrors(stepsB, 'b', errorPoints)

  const maxLen = Math.max(stepsA.length, stepsB.length)
  for (let i = 0; i < maxLen; i++) {
    const sa = stepsA[i] ?? null
    const sb = stepsB[i] ?? null

    if (sa && sb) {
      if (stepsMatch(sa, sb)) {
        if (sa.name && sb.name && sa.name === sb.name && !deepEqual(sa.data, sb.data)) {
          stepDiffs.push({
            indexA: i,
            indexB: i,
            kind: 'tool_args_mismatch',
            summary: `Step ${i}: same tool (${sa.name}) called with different arguments`,
            stepA: sa,
            stepB: sb,
          })
          toolChoiceDiffs.push({ index: i, toolA: sa.name, toolB: sb.name })
        }
        continue
      }

      if (sa.type !== sb.type) {
        stepDiffs.push({
          indexA: i,
          indexB: i,
          kind: 'type_mismatch',
          summary: `Step ${i}: type differs (${sa.type} vs ${sb.type})`,
          stepA: sa,
          stepB: sb,
        })
      } else if (sa.name && sb.name && sa.name !== sb.name) {
        stepDiffs.push({
          indexA: i,
          indexB: i,
          kind: 'tool_mismatch',
          summary: `Step ${i}: different tool (${sa.name} vs ${sb.name})`,
          stepA: sa,
          stepB: sb,
        })
        toolChoiceDiffs.push({ index: i, toolA: sa.name, toolB: sb.name })
      } else if ((sa.content ?? '') !== (sb.content ?? '')) {
        stepDiffs.push({
          indexA: i,
          indexB: i,
          kind: 'content_mismatch',
          summary: `Step ${i}: content differs (${truncate(sa.content, 60)} vs ${truncate(sb.content, 60)})`,
          stepA: sa,
          stepB: sb,
        })
      }
    } else if (sa && !sb) {
      stepDiffs.push({
        indexA: i,
        indexB: -1,
        kind: 'missing_in_b',
        summary: `Step ${i} present in A (${sa.type}${sa.name ? '/' + sa.name : ''}) but missing in B`,
        stepA: sa,
        stepB: null,
      })
    } else if (!sa && sb) {
      stepDiffs.push({
        indexA: -1,
        indexB: i,
        kind: 'missing_in_a',
        summary: `Step ${i} present in B (${sb.type}${sb.name ? '/' + sb.name : ''}) but missing in A`,
        stepA: null,
        stepB: sb,
      })
    }
  }

  return {
    sessionA: a.sessionId,
    sessionB: b.sessionId,
    stepsA: stepsA.length,
    stepsB: stepsB.length,
    divergenceIndex,
    stepDiffs,
    toolChoiceDiffs,
    errorPoints,
    identical: divergenceIndex === -1 && stepDiffs.length === 0,
  }
}

/**
 * Produce a high-level summary of a diff.
 *
 * @param diff - The trajectory diff to summarize
 * @returns DiffSummary with key statistics and verdict
 */
export function summarizeDiff(diff: TrajectoryDiff): DiffSummary {
  const errorsA = diff.errorPoints.filter((e) => e.trajectory === 'a').length
  const errorsB = diff.errorPoints.filter((e) => e.trajectory === 'b').length
  const sameOutcome = diff.identical || (diff.stepDiffs.length === 0 && diff.toolChoiceDiffs.length === 0)

  let verdict: string
  if (diff.identical) verdict = 'Trajectories are identical.'
  else if (errorsA === 0 && errorsB > 0) verdict = 'A succeeded; B encountered errors.'
  else if (errorsB === 0 && errorsA > 0) verdict = 'B succeeded; A encountered errors.'
  else if (diff.stepsA - diff.stepsB < 0) verdict = 'A completed in fewer steps.'
  else if (diff.stepsA - diff.stepsB > 0) verdict = 'B completed in fewer steps.'
  else verdict = 'Trajectories diverged but completed in same number of steps.'

  return {
    stepCountDiff: diff.stepsA - diff.stepsB,
    toolChoiceDiffs: diff.toolChoiceDiffs.length,
    errorsA,
    errorsB,
    firstDivergenceAt: diff.divergenceIndex,
    sameOutcome,
    verdict,
  }
}

/**
 * Format a TrajectoryDiff as human-readable Markdown.
 *
 * @param diff - Diff to format
 * @returns Markdown string
 */
export function formatDiff(diff: TrajectoryDiff): string {
  const summary = summarizeDiff(diff)
  const lines: string[] = []

  lines.push('# Trajectory Diff')
  lines.push('')
  lines.push(`- **A**: \`${diff.sessionA}\` (${diff.stepsA} steps)`)
  lines.push(`- **B**: \`${diff.sessionB}\` (${diff.stepsB} steps)`)
  lines.push(`- **Verdict**: ${summary.verdict}`)
  lines.push('')

  if (diff.identical) {
    lines.push('The two trajectories are byte-for-byte equivalent across compared steps.')
    return lines.join('\n')
  }

  lines.push('## Divergence')
  lines.push('')
  if (diff.divergenceIndex === -1) {
    lines.push('No step-level divergence; differences are in argument content only.')
  } else {
    lines.push(`First divergence at step **${diff.divergenceIndex}**.`)
  }
  lines.push('')

  if (diff.toolChoiceDiffs.length > 0) {
    lines.push('## Tool choice differences')
    lines.push('')
    lines.push('| Step | A | B |')
    lines.push('|------|---|---|')
    for (const tcd of diff.toolChoiceDiffs) {
      lines.push(`| ${tcd.index} | ${tcd.toolA ?? '(none)'} | ${tcd.toolB ?? '(none)'} |`)
    }
    lines.push('')
  }

  if (diff.errorPoints.length > 0) {
    lines.push('## Errors')
    lines.push('')
    for (const ep of diff.errorPoints) {
      lines.push(`- **${ep.trajectory.toUpperCase()}** step ${ep.index} (${ep.stepType}): ${truncate(ep.message, 200)}`)
    }
    lines.push('')
  }

  if (diff.stepDiffs.length > 0) {
    lines.push('## Step-by-step differences')
    lines.push('')
    const shown = diff.stepDiffs.slice(0, 20)
    for (const sd of shown) {
      lines.push(`### Step ${sd.indexA >= 0 ? sd.indexA : sd.indexB} — ${sd.kind}`)
      lines.push(sd.summary)
      lines.push('')
    }
    if (diff.stepDiffs.length > 20) {
      lines.push(`_...and ${diff.stepDiffs.length - 20} more differences._`)
    }
  }

  lines.push('## Summary')
  lines.push('')
  lines.push(`- Step count difference: ${summary.stepCountDiff > 0 ? '+' : ''}${summary.stepCountDiff}`)
  lines.push(`- Tool choice differences: ${summary.toolChoiceDiffs}`)
  lines.push(`- Errors in A: ${summary.errorsA}`)
  lines.push(`- Errors in B: ${summary.errorsB}`)

  return lines.join('\n')
}

// ============================================================================
// Helpers
// ============================================================================

function stepsMatch(a: TrajectoryStep, b: TrajectoryStep): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'tool_call') {
    return a.name === b.name
  }
  return true
}

function collectErrors(
  steps: TrajectoryStep[],
  trajectory: 'a' | 'b',
  out: ErrorPoint[],
): void {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!
    if (s.type === 'tool_result') {
      const data = s.data as Record<string, unknown> | undefined
      if (data && (data.isError || data.error)) {
        out.push({
          index: i,
          trajectory,
          stepType: s.type,
          message: String(data.error ?? data.content ?? 'tool error'),
        })
      }
    }
    if (s.name === 'run-terminal-command' && typeof s.data === 'object' && s.data) {
      const d = s.data as Record<string, unknown>
      if (d.exitCode && d.exitCode !== 0) {
        out.push({
          index: i,
          trajectory,
          stepType: 'terminal-error',
          message: `exit code ${d.exitCode}`,
        })
      }
    }
  }
}

function truncate(s: string | undefined, n: number): string {
  if (!s) return ''
  return s.length <= n ? s : s.slice(0, n) + '…'
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b
  if (typeof a !== 'object') return a === b
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  const ak = Object.keys(a as Record<string, unknown>)
  const bk = Object.keys(b as Record<string, unknown>)
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false
  }
  return true
}
