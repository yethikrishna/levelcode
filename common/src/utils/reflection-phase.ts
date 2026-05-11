import type { SwarmState } from './swarm-state'
import { extractLessonsLearned, suggestDocumentationUpdates } from './knowledge-primer'
import { formatKnowledgeBrief } from './knowledge-primer'

// ============================================================================
// Reflection Phase Configuration
// ============================================================================

export interface ReflectionConfig {
  enabled: boolean          // Enable reflection (default true)
  afterEveryTask: boolean   // After every task vs. phase end (default false)
  suggestDocs: boolean      // Suggest doc updates (default true)
  analyzePatterns: boolean // Analyze failure patterns (default true)
  minTasksForPatterns: number // Min tasks before pattern analysis (default 5)
}

export const DEFAULT_REFLECTION_CONFIG: ReflectionConfig = {
  enabled: true,
  afterEveryTask: false,
  suggestDocs: true,
  analyzePatterns: true,
  minTasksForPatterns: 5,
}

// ============================================================================
// Phase Outcomes
// ============================================================================

export interface PhaseOutcome {
  phase: string
  completed: number
  failed: number
  duration: number
  tokensUsed: number
  keyLearnings: string[]
  suggestions: string[]
}

export interface TaskOutcome {
  taskId: string
  status: 'completed' | 'failed' | 'blocked' | 'skipped'
  duration: number
  tokensUsed: number
  agentId: string
  iterations: number
  learnings: string
}

// ============================================================================
// Reflection Execution
// ============================================================================

export function runTaskReflection(
  state: SwarmState,
  taskId: string,
  agentId: string,
): string {
  const summary = extractLessonsLearned(agentId, taskId, state)

  // Record in state
  if (!state.reflection) {
    state.reflection = { lastReflection: Date.now(), outcomes: [] }
  }

  state.reflection.lastReflection = Date.now()

  return summary
}

export function runPhaseReflection(
  state: SwarmState,
  phase: string,
  config?: Partial<ReflectionConfig>,
): PhaseOutcome {
  const cfg = { ...DEFAULT_REFLECTION_CONFIG, ...config }

  const completedTasks = state.tasks.filter(
    t => t.phase === phase && t.status === 'completed',
  )
  const failedTasks = state.tasks.filter(
    t => t.phase === phase && t.iterationCount >= t.maxIterations,
  )

  const learnings: string[] = []
  const suggestions: string[] = []

  // Extract learnings from each task
  for (const task of completedTasks) {
    if (task.owner) {
      const summary = extractLessonsLearned(task.owner, task.taskId, state)
      if (summary) {
        learnings.push(summary)
      }
    }
  }

  // Analyze failure patterns
  if (cfg.analyzePatterns && state.tasks.length >= cfg.minTasksForPatterns) {
    const failed = state.tasks.filter(t => t.iterationCount >= t.maxIterations)
    if (failed.length > 0) {
      suggestions.push(
        `${failed.length} tasks failed in this phase - consider clearer requirements`,
      )

      // Common patterns
      const iterationHeavy = state.tasks.filter(t => t.iterationCount > 2)
      if (iterationHeavy.length > 0) {
        suggestions.push(
          `${iterationHeavy.length} tasks needed >2 iterations - break into smaller pieces`,
        )
      }
    }
  }

  // Documentation suggestions
  if (cfg.suggestDocs) {
    const docSuggestions = suggestDocumentationUpdates(state)
    suggestions.push(...docSuggestions)
  }

  const outcome: PhaseOutcome = {
    phase,
    completed: completedTasks.length,
    failed: failedTasks.length,
    duration: state.metrics.totalDuration,
    tokensUsed: state.metrics.totalTokens,
    keyLearnings: learnings,
    suggestions,
  }

  // Store outcome
  if (!state.reflection) {
    state.reflection = { lastReflection: Date.now(), outcomes: [] }
  }
  state.reflection.outcomes.push(outcome)
  state.reflection.lastReflection = Date.now()

  return outcome
}

// ============================================================================
// Reflection Formatting
// ============================================================================

export function formatReflectionBrief(state: SwarmState): string {
  if (!state.reflection || !state.knowledge) {
    return 'No reflection data yet.'
  }

  const lines = [
    '=== Reflection Brief ===',
    '',
    formatKnowledgeBrief(state.knowledge),
  ]

  if (state.reflection.outcomes.length > 0) {
    lines.push('', '--- Past Phases ---')
    for (const outcome of state.reflection.outcomes.slice(-3)) {
      lines.push(
        `${outcome.phase}: ${outcome.completed}/${outcome.completed + outcome.failed} completed`,
      )
    }
  }

  return lines.join('\n')
}

export function formatPhaseOutcome(outcome: PhaseOutcome): string {
  const lines = [
    `=== ${outcome.phase} Phase Reflection ===`,
    '',
    `Completed: ${outcome.completed}`,
    `Failed: ${outcome.failed}`,
    `Duration: ${formatDuration(outcome.duration)}`,
    `Tokens: ${outcome.tokensUsed.toLocaleString()}`,
  ]

  if (outcome.keyLearnings.length > 0) {
    lines.push('', '--- Key Learnings ---')
    for (const learning of outcome.keyLearnings.slice(0, 5)) {
      lines.push(`- ${learning}`)
    }
  }

  if (outcome.suggestions.length > 0) {
    lines.push('', '--- Suggestions ---')
    for (const suggestion of outcome.suggestions) {
      lines.push(`- ${suggestion}`)
    }
  }

  return lines.join('\n')
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

// ============================================================================
// Reflection Persistence
// ============================================================================

export function saveReflection(state: SwarmState): void {
  if (!state.reflection || state.reflection.outcomes.length === 0) {
    return
  }

  // Already persisted in state file (swarm-state.ts handles this)
  // This is for explicit external save if needed
  console.log(
    `[Reflection] Saved ${state.reflection.outcomes.length} phase outcomes`,
  )
}

export function loadReflectionHistory(
  state: SwarmState,
  limit = 10,
): PhaseOutcome[] {
  if (!state.reflection) return []
  return state.reflection.outcomes.slice(-limit)
}