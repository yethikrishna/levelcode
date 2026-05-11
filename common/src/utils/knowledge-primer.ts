import type { SwarmState, SwarmAgentState } from './swarm-state'
import fs from 'fs'
import path from 'path'
import { getBibleContext } from './memory-bible'

// ============================================================================
// Context Building
// ============================================================================

/**
 * Build a compact context brief for an agent before it starts a task.
 * This reduces token usage by only providing relevant context.
 */
export function buildAgentContext(
  agentId: string,
  state: SwarmState,
  taskDescription?: string,
): string {
  const agent = state.agents.find(a => a.agentId === agentId)
  if (!agent) return ''

  const parts: string[] = []

  // 1. Agent role and current status
  parts.push(`Role: ${agent.role}`)
  parts.push(`Status: ${agent.status}`)
  if (taskDescription) {
    parts.push(`Task: ${taskDescription}`)
  }

  // 2. Recent knowledge entries (last 5 relevant to this agent)
  if (state.knowledge && state.knowledge.length > 0) {
    const relevant = state.knowledge
      .filter(k => k.sourceAgentId === agentId || k.sourceAgentId === 'system')
      .slice(-5)

    if (relevant.length > 0) {
      parts.push('', '--- Past Lessons ---')
      for (const entry of relevant) {
        parts.push(`[${new Date(entry.timestamp).toLocaleTimeString()}] ${entry.content}`)
      }
    }
  }

  // 3. Failure patterns for this agent
  const failures = getFailurePatterns(state, agentId)
  if (failures) {
    parts.push('', '--- Common Pitfalls ---')
    parts.push(failures)
  }

  // 4. Project architecture summary (if exists)
  const archPath = path.join(process.cwd(), 'ARCHITECTURE.md')
  if (fs.existsSync(archPath)) {
    const archContent = fs.readFileSync(archPath, 'utf-8')
    // Only include first 500 chars to save tokens
    const summary = archContent.length > 500
      ? archContent.slice(0, 500) + '...'
      : archContent
    parts.push('', '--- Architecture ---')
    parts.push(summary)
  }

  return parts.join('\n')
}

// ============================================================================
// Failure Pattern Analysis
// ============================================================================

/**
 * Analyze past failed tasks for an agent and return compact failure patterns.
 */
export function getFailurePatterns(
  state: SwarmState,
  agentId?: string,
): string | null {
  const tasks = state.tasks.filter(t => t.status === 'pending' || t.iterationCount > 1)

  if (tasks.length === 0) return null

  const patterns: string[] = []

  // Check for common issues
  const stuckAgents = state.agents.filter(a => a.status === 'stuck' || a.status === 'failed')
  if (stuckAgents.length > 0) {
    patterns.push('Avoid getting stuck - check for infinite loops or blocked dependencies')
  }

  const highIterationTasks = tasks.filter(t => t.iterationCount >= 2)
  if (highIterationTasks.length > 0) {
    patterns.push(`Tasks with multiple iterations: ${highIterationTasks.map(t => t.taskId).join(', ')}`)
    patterns.push('Consider breaking down complex tasks into smaller pieces')
  }

  if (agentId) {
    const agentTasks = state.tasks.filter(t => t.owner === agentId && t.iterationCount > 1)
    if (agentId.includes('test') && agentTasks.length > 0) {
      patterns.push('Test generation tip: Ensure tests actually validate behavior, not just syntax')
    }
    if (agentId.includes('review') && agentTasks.length > 0) {
      patterns.push('Review tip: Focus on security and maintainability, not style preferences')
    }
  }

  return patterns.length > 0 ? patterns.join('\n') : null
}

// ============================================================================
// Knowledge Extraction (Reflection Phase)
// ============================================================================

/**
 * Called after a task is completed.
 * Extracts lessons learned and adds to knowledge base.
 */
export function extractLessonsLearned(
  agentId: string,
  taskId: string,
  state: SwarmState,
): string {
  const task = state.tasks.find(t => t.taskId === taskId)
  if (!task) return 'Task not found'

  const agent = state.agents.find(a => a.agentId === agentId)
  const parts: string[] = []

  parts.push(`Task ${taskId} (${task.subject})`)
  parts.push(`Status: ${task.status}, Iterations: ${task.iterationCount}`)

  if (agent) {
    parts.push(`Agent: ${agent.name} (${agent.role})`)
    parts.push(`Tokens used: ${agent.tokensUsed}`)
  }

  // Suggest improvements
  const suggestions: string[] = []

  if (task.iterationCount > 2) {
    suggestions.push('Consider breaking this task into smaller, more manageable pieces')
  }
  if (task.status === 'completed' && task.iterationCount === 1) {
    suggestions.push('Well done! This task was completed efficiently')
  }
  if (task.lastReview?.confidence && task.lastReview.confidence < 50) {
    suggestions.push('Low review confidence - may need clearer requirements or better context')
  }

  if (suggestions.length > 0) {
    parts.push('', 'Suggestions:')
    for (const s of suggestions) {
      parts.push(`- ${s}`)
    }
  }

  const summary = parts.join('\n')

  // Add to knowledge base
  if (!state.knowledge) state.knowledge = []
  state.knowledge.push({
    sourceAgentId: agentId,
    content: summary,
    timestamp: Date.now(),
  })

  return summary
}

/**
 * Suggest improvements to TEAM.md or CLAUDE.md based on accumulated knowledge.
 */
export function suggestDocumentationUpdates(state: SwarmState): string[] {
  const suggestions: string[] = []

  if (!state.knowledge || state.knowledge.length < 3) return suggestions

  // Analyze patterns
  const allContent = state.knowledge.map(k => k.content).join(' ').toLowerCase()

  if (allContent.includes('import') && allContent.includes('error')) {
    suggestions.push('Add a section on common import patterns and how to handle import errors')
  }
  if (allContent.includes('test') && allContent.includes('fail')) {
    suggestions.push('Document testing patterns that have been causing failures')
  }
  if (allContent.includes('dependency') || allContent.includes('blocked')) {
    suggestions.push('Add a dependency map to help agents understand project structure')
  }

  return suggestions
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format knowledge entries as a compact brief for agent context.
 */
export function formatKnowledgeBrief(entries: Array<{ content: string; timestamp: number }>): string {
  if (entries.length === 0) return 'No previous knowledge entries.'

  return entries
    .slice(-10) // Last 10 entries
    .map(e => {
      const time = new Date(e.timestamp).toLocaleTimeString()
      const content = e.content.length > 100 ? e.content.slice(0, 100) + '...' : e.content
      return `[${time}] ${content}`
    })
    .join('\n')
}
