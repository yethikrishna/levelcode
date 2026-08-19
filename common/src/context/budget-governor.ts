/**
 * Context Budget Governor
 *
 * Enforces hard token budgets per agent and provides intelligent pruning
 * strategies that preserve critical context (system prompts, recent messages,
 * tool errors) while summarizing older content. When pruning occurs, a GCC
 * (Git Context Commit) payload is generated so the pruned context is
 * recoverable.
 *
 * This module supersedes the inline helpers in `agents/context-pruner.ts`
 * with a reusable, class-based governor that can be shared across SDK, CLI,
 * and agent runtime layers.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Budget status for a given agent.
 */
export type BudgetStatus =
  | 'ok' // Within budget
  | 'warning' // Approaching limit (>= 80%)
  | 'critical' // Near limit (>= 95%), should trigger proactive pruning
  | 'exceeded' // Over hard limit, must prune before continuing

/**
 * Message shape expected by the governor.
 * Compatible with the Message type from common/src/types/messages/levelcode-message.ts.
 */
export interface GovernedMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | Array<Record<string, unknown>>
  sentAt?: number
  tags?: string[]
  toolName?: string
  toolCallId?: string
}

/**
 * Result of a budget check.
 */
export interface BudgetCheckResult {
  agentId: string
  status: BudgetStatus
  currentTokens: number
  limit: number
  usageRatio: number
  remainingTokens: number
  pruneRecommendation?: {
    targetTokens: number
    estimatedTokensToFree: number
  }
}

/**
 * Result of a pruning operation.
 */
export interface PruneResult {
  /** The pruned message list */
  prunedMessages: GovernedMessage[]
  /** Original token count before pruning */
  originalTokens: number
  /** Token count after pruning */
  prunedTokens: number
  /** Tokens freed by pruning */
  tokensFreed: number
  /** Number of messages preserved as-is */
  messagesPreserved: number
  /** Number of messages that were summarized */
  messagesSummarized: number
  /** GCC commit token to persist pruned context */
  gccCommitToken?: string
  /** The generated summary text */
  summary: string
}

/**
 * Configuration for the budget governor.
 */
export interface BudgetGovernorConfig {
  /** Soft warning threshold as a fraction of hard limit (default 0.8) */
  warningThreshold: number
  /** Critical threshold as a fraction of hard limit (default 0.95) */
  criticalThreshold: number
  /** Fraction of budget the summary should target (default 0.1 = 10%) */
  summaryTargetFraction: number
  /** Minimum number of recent messages to always keep verbatim (default 6) */
  minRecentMessagesToKeep: number
  /** Maximum number of tool errors to preserve (default 3) */
  maxToolErrorsToKeep: number
  /** Enable auto-GCC commits when pruning (default true) */
  autoCommitGcc: boolean
}

const DEFAULT_CONFIG: BudgetGovernorConfig = {
  warningThreshold: 0.8,
  criticalThreshold: 0.95,
  summaryTargetFraction: 0.1,
  minRecentMessagesToKeep: 6,
  maxToolErrorsToKeep: 3,
  autoCommitGcc: true,
}

// ============================================================================
// Token estimation helpers
// ============================================================================

/**
 * Estimate token count using a heuristic of ~3 characters per token.
 * This is consistent with the existing context-pruner implementation.
 */
export function estimateTokens(obj: unknown): number {
  return Math.ceil(JSON.stringify(obj).length / 3)
}

/**
 * Extract plain text from a message regardless of content shape.
 */
export function getMessageText(message: GovernedMessage): string {
  if (typeof message.content === 'string') {
    return message.content
  }
  if (Array.isArray(message.content)) {
    return message.content
      .filter((p) => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text as string)
      .join('\n')
  }
  return ''
}

// ============================================================================
// ContextBudgetGovernor
// ============================================================================

/**
 * Per-agent budget tracking and message pruning.
 *
 * Usage:
 * ```ts
 * const governor = new ContextBudgetGovernor()
 *
 * // Check budget before continuing an agent step
 * const check = governor.checkBudget('editor', currentTokens, 200_000)
 * if (check.status === 'exceeded' || check.status === 'critical') {
 *   const result = governor.pruneToBudget(messages, 200_000)
 *   messages = result.prunedMessages
 * }
 * ```
 */
export class ContextBudgetGovernor {
  private readonly config: BudgetGovernorConfig
  /** Per-agent running token usage (optional, for cumulative tracking) */
  private readonly agentUsage: Map<string, number> = new Map()

  constructor(config: Partial<BudgetGovernorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Check whether an agent is within its token budget.
   *
   * @param agentId - Agent identifier (e.g. "editor", "reviewer")
   * @param currentTokens - Current context token count
   * @param limit - Hard token limit for the agent
   * @returns BudgetCheckResult with status and pruning recommendation
   */
  checkBudget(agentId: string, currentTokens: number, limit: number): BudgetCheckResult {
    this.agentUsage.set(agentId, currentTokens)

    const ratio = limit > 0 ? currentTokens / limit : 0
    let status: BudgetStatus = 'ok'
    if (ratio >= 1.0) {
      status = 'exceeded'
    } else if (ratio >= this.config.criticalThreshold) {
      status = 'critical'
    } else if (ratio >= this.config.warningThreshold) {
      status = 'warning'
    }

    const targetTokens = Math.floor(limit * (1 - this.config.summaryTargetFraction))
    const pruneRecommendation =
      status === 'warning' || status === 'critical' || status === 'exceeded'
        ? {
            targetTokens,
            estimatedTokensToFree: Math.max(0, currentTokens - targetTokens),
          }
        : undefined

    return {
      agentId,
      status,
      currentTokens,
      limit,
      usageRatio: ratio,
      remainingTokens: Math.max(0, limit - currentTokens),
      pruneRecommendation,
    }
  }

  /**
   * Prune a message list to fit within the given token budget.
   *
   * Strategy:
   *  1. Always preserve the system prompt(s) at the beginning
   *  2. Keep the most recent N messages verbatim (configurable)
   *  3. Keep recent tool errors and user answers verbatim
   *  4. Summarize older messages into a single compact summary message
   *  5. Auto-generate a GCC commit token to checkpoint the pruned state
   *
   * @param messages - Full message history
   * @param budget - Hard token budget to fit within
   * @returns PruneResult with pruned messages and metadata
   */
  pruneToBudget(messages: GovernedMessage[], budget: number): PruneResult {
    const originalTokens = estimateTokens(messages)

    // If already within budget, return as-is
    if (originalTokens <= budget) {
      return {
        prunedMessages: [...messages],
        originalTokens,
        prunedTokens: originalTokens,
        tokensFreed: 0,
        messagesPreserved: messages.length,
        messagesSummarized: 0,
        summary: '',
      }
    }

    const {
      systemMessages,
      messagesToSummarize,
      recentMessages,
      preservedErrorMessages,
    } = this.partitionMessages(messages)

    // Summarize the middle section
    const summaryText = this.summarizeMessages(messagesToSummarize)

    // Build the summary message
    const summaryMessage: GovernedMessage = {
      role: 'user',
      content: `<conversation_summary>
This is a condensed summary of earlier conversation, pruned to stay within the token budget.

${summaryText}
</conversation_summary>

Please continue from the recent messages below. You may need to re-read files or re-run commands to recover specific details from the summarized section.`,
      sentAt: Date.now(),
      tags: ['CONVERSATION_SUMMARY'],
    }

    // Assemble final message list
    const prunedMessages: GovernedMessage[] = [
      ...systemMessages,
      summaryMessage,
      ...preservedErrorMessages,
      ...recentMessages,
    ]

    // Generate GCC commit token if enabled
    let gccCommitToken: string | undefined
    if (this.config.autoCommitGcc) {
      gccCommitToken = this.generateGccCommitToken(summaryText, originalTokens)
    }

    const prunedTokens = estimateTokens(prunedMessages)
    const messagesSummarized = messagesToSummarize.length
    const messagesPreserved =
      systemMessages.length + preservedErrorMessages.length + recentMessages.length

    // If still over budget after single pass, do an aggressive truncation
    if (prunedTokens > budget) {
      const aggressivelyPruned = this.aggressivePrune(prunedMessages, budget)
      return {
        prunedMessages: aggressivelyPruned,
        originalTokens,
        prunedTokens: estimateTokens(aggressivelyPruned),
        tokensFreed: originalTokens - estimateTokens(aggressivelyPruned),
        messagesPreserved,
        messagesSummarized,
        gccCommitToken,
        summary: summaryText,
      }
    }

    return {
      prunedMessages,
      originalTokens,
      prunedTokens,
      tokensFreed: originalTokens - prunedTokens,
      messagesPreserved,
      messagesSummarized,
      gccCommitToken,
      summary: summaryText,
    }
  }

  /**
   * Reset tracked usage for an agent (e.g. after pruning or new session).
   */
  resetAgent(agentId: string): void {
    this.agentUsage.delete(agentId)
  }

  /**
   * Reset all tracked agent usage.
   */
  resetAll(): void {
    this.agentUsage.clear()
  }

  /**
   * Get current tracked tokens for an agent.
   */
  getAgentTokens(agentId: string): number {
    return this.agentUsage.get(agentId) ?? 0
  }

  /**
   * Get a snapshot of all tracked agent usage.
   */
  getAllUsage(): Record<string, number> {
    return Object.fromEntries(this.agentUsage.entries())
  }

  // ============================================================================
  // Internals
  // ============================================================================

  /**
   * Split messages into four buckets:
   *   - systemMessages: leading system prompts (always preserved)
   *   - messagesToSummarize: older messages eligible for summarization
   *   - recentMessages: most recent messages (verbatim)
   *   - preservedErrorMessages: tool errors / ask_user answers (verbatim)
   */
  private partitionMessages(messages: GovernedMessage[]): {
    systemMessages: GovernedMessage[]
    messagesToSummarize: GovernedMessage[]
    recentMessages: GovernedMessage[]
    preservedErrorMessages: GovernedMessage[]
  } {
    const systemMessages: GovernedMessage[] = []
    const nonSystem: GovernedMessage[] = []

    // Extract leading system messages
    let systemDone = false
    for (const msg of messages) {
      if (!systemDone && msg.role === 'system') {
        systemMessages.push(msg)
      } else {
        systemDone = true
        nonSystem.push(msg)
      }
    }

    // Find the split point: keep last N messages as recent
    const keepRecent = Math.min(this.config.minRecentMessagesToKeep, nonSystem.length)
    const splitIdx = Math.max(0, nonSystem.length - keepRecent)

    const olderMessages = nonSystem.slice(0, splitIdx)
    const recentMessages = nonSystem.slice(splitIdx)

    // From older messages, pick out tool errors and ask_user answers to preserve
    const preservedErrorMessages: GovernedMessage[] = []
    const messagesToSummarize: GovernedMessage[] = []
    let errorCount = 0

    for (const msg of olderMessages) {
      const shouldPreserve = this.shouldPreserveVerbatim(msg)
      if (shouldPreserve && errorCount < this.config.maxToolErrorsToKeep) {
        preservedErrorMessages.push(msg)
        errorCount++
      } else {
        messagesToSummarize.push(msg)
      }
    }

    return { systemMessages, messagesToSummarize, recentMessages, preservedErrorMessages }
  }

  /**
   * Determine if a message should be preserved verbatim even if it's old.
   * Preserves tool errors, ask_user answers, and explicit summary markers.
   */
  private shouldPreserveVerbatim(msg: GovernedMessage): boolean {
    // Preserve existing conversation summaries (so we don't lose earlier compactions)
    const text = getMessageText(msg)
    if (text.includes('<conversation_summary>')) return true

    // Preserve ask_user answers and tool errors
    if (msg.role === 'tool') {
      if (msg.toolName === 'ask_user') return true
      if (msg.toolName === 'run_terminal_command') {
        // Check content for exitCode != 0 or errorMessage
        if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'json' && part.value) {
              const v = part.value as Record<string, unknown>
              if (v.exitCode !== undefined && v.exitCode !== 0) return true
              if (v.errorMessage || v.error) return true
            }
          }
        }
      }
      if (typeof msg.content === 'string') {
        if (msg.content.includes('error') || msg.content.includes('Error:')) {
          return true
        }
      }
    }

    // Preserve messages tagged as INSTRUCTIONS_PROMPT (parent system prompts)
    if (msg.tags?.includes('INSTRUCTIONS_PROMPT')) return true

    return false
  }

  /**
   * Produce a compact text summary of a batch of messages.
   * Uses the same approach as the existing context-pruner: a structured
   * [USER]/[ASSISTANT]/[TOOL ERROR] format with concise tool call summaries.
   */
  private summarizeMessages(messages: GovernedMessage[]): string {
    const lines: string[] = []

    for (const msg of messages) {
      // Skip messages that are part of pruning infrastructure
      if (msg.tags?.includes('CONVERSATION_SUMMARY')) continue
      if (msg.tags?.includes('SUBAGENT_SPAWN')) continue
      if (msg.tags?.includes('INSTRUCTIONS_PROMPT')) continue
      if (msg.tags?.includes('STEP_PROMPT')) continue

      const text = getMessageText(msg).trim()

      if (msg.role === 'user') {
        if (!text) continue
        const truncated = text.length > 2000 ? text.slice(0, 2000) + '...' : text
        const hasImages =
          Array.isArray(msg.content) &&
          msg.content.some((p) => p.type === 'image' || p.type === 'media')
        lines.push(`[USER]${hasImages ? ' [with image(s)]' : ''}\n${truncated}`)
      } else if (msg.role === 'assistant') {
        const textParts: string[] = []
        const toolParts: string[] = []

        if (typeof msg.content === 'string') {
          const cleaned = msg.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
          if (cleaned) textParts.push(cleaned)
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'text' && typeof part.text === 'string') {
              const cleaned = (part.text as string)
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .trim()
              if (cleaned) textParts.push(cleaned)
            } else if (part.type === 'tool-call') {
              const name = part.toolName as string
              toolParts.push(this.summarizeToolCall(name, part.input as Record<string, unknown>))
            }
          }
        }

        const combinedText = textParts.join('\n')
        const truncatedText =
          combinedText.length > 1500 ? combinedText.slice(0, 1500) + '...' : combinedText

        const segments: string[] = []
        if (truncatedText) segments.push(truncatedText)
        if (toolParts.length > 0) segments.push(`Tools: ${toolParts.join('; ')}`)
        if (segments.length > 0) lines.push(`[ASSISTANT]\n${segments.join('\n')}`)
      } else if (msg.role === 'tool') {
        // Capture errors and notable results
        if (msg.toolName === 'ask_user') {
          lines.push(`[USER ANSWERED] ${text.slice(0, 500)}`)
        } else if (msg.toolName === 'run_terminal_command') {
          const lower = text.toLowerCase()
          if (lower.includes('error') || lower.includes('exit code') || lower.includes('failed')) {
            lines.push(`[COMMAND ERROR] ${text.slice(0, 300)}`)
          }
        } else if (
          msg.toolName === 'str_replace' ||
          msg.toolName === 'write_file' ||
          msg.toolName === 'propose_str_replace' ||
          msg.toolName === 'propose_write_file'
        ) {
          lines.push(`[EDIT] ${msg.toolName}`)
        }
      }
    }

    return lines.join('\n\n---\n\n')
  }

  /**
   * Create a one-line summary of a tool call (consistent with context-pruner).
   */
  private summarizeToolCall(name: string, input: Record<string, unknown>): string {
    switch (name) {
      case 'read_files': {
        const paths = input.paths as string[] | undefined
        return paths ? `Read: ${paths.slice(0, 3).join(', ')}${paths.length > 3 ? '...' : ''}` : 'Read files'
      }
      case 'write_file':
      case 'str_replace':
      case 'propose_write_file':
      case 'propose_str_replace': {
        const p = input.path as string | undefined
        return p ? `${name}: ${p}` : name
      }
      case 'run_terminal_command': {
        const cmd = input.command as string | undefined
        if (!cmd) return 'Ran command'
        return `Ran: ${cmd.length > 40 ? cmd.slice(0, 40) + '...' : cmd}`
      }
      case 'code_search': {
        const pat = input.pattern as string | undefined
        return pat ? `Search: "${pat}"` : 'Code search'
      }
      case 'glob': {
        const patterns = input.patterns as Array<{ pattern: string }> | undefined
        return patterns ? `Glob: ${patterns.map((p) => p.pattern).slice(0, 2).join(', ')}` : 'Glob'
      }
      case 'list_directory': {
        const dirs = input.directories as Array<{ path: string }> | undefined
        return dirs ? `Listed: ${dirs.map((d) => d.path).join(', ')}` : 'List directory'
      }
      case 'spawn_agents':
      case 'spawn_agent_inline': {
        const agents = input.agents as
          | Array<{ agent_type: string; prompt?: string }>
          | undefined
        const agentType = input.agent_type as string | undefined
        if (agents && agents.length > 0) {
          return `Spawned: ${agents.map((a) => a.agent_type).join(', ')}`
        }
        return agentType ? `Spawned: ${agentType}` : 'Spawned agent(s)'
      }
      case 'write_todos': {
        const todos = input.todos as Array<{ completed: boolean }> | undefined
        if (todos) {
          const done = todos.filter((t) => t.completed).length
          return `Todos: ${done}/${todos.length} done`
        }
        return 'Updated todos'
      }
      case 'ask_user':
        return 'Asked user'
      case 'web_search': {
        const q = input.query as string | undefined
        return q ? `Web search: "${q}"` : 'Web search'
      }
      default:
        return name
    }
  }

  /**
   * Aggressive fallback pruning: if the structured approach still exceeds
   * budget, truncate text content character-by-character until within budget.
   */
  private aggressivePrune(
    messages: GovernedMessage[],
    budget: number,
  ): GovernedMessage[] {
    const result: GovernedMessage[] = []
    let runningTokens = 0
    const targetPerMessage = Math.floor(budget / Math.max(1, messages.length))

    for (const msg of messages) {
      const msgTokens = estimateTokens(msg)
      if (runningTokens + msgTokens <= budget) {
        result.push(msg)
        runningTokens += msgTokens
        continue
      }

      // Truncate text content of this message to fit
      const text = getMessageText(msg)
      const otherParts = Array.isArray(msg.content)
        ? msg.content.filter((p) => p.type !== 'text')
        : []

      const availableChars = Math.max(100, (budget - runningTokens) * 3)
      const truncatedText =
        text.length > availableChars ? text.slice(0, availableChars) + '\n\n[...truncated...]' : text

      const truncatedMsg: GovernedMessage = {
        ...msg,
        content:
          otherParts.length > 0
            ? [{ type: 'text', text: truncatedText }, ...otherParts]
            : truncatedText,
      }
      result.push(truncatedMsg)
      runningTokens += estimateTokens(truncatedMsg)

      if (runningTokens >= budget) break
    }

    return result
  }

  /**
   * Generate a GCC (Git Context Commit) token for a prune event.
   * Format matches the existing context-pruner's GCC payload.
   */
  private generateGccCommitToken(summary: string, originalTokens: number): string {
    const payload = {
      commit: `prune-${Date.now()}`,
      branch: 'main',
      timestamp: Date.now(),
      originalTokens,
      summary: summary.slice(0, 500),
    }

    if (typeof Buffer !== 'undefined') {
      return Buffer.from(JSON.stringify(payload)).toString('base64url')
    }
    // Browser fallback
    return btoa(JSON.stringify(payload))
  }
}

// ============================================================================
// Convenience utilities
// ============================================================================

/**
 * Singleton default governor instance for code paths that don't need custom config.
 */
let defaultGovernor: ContextBudgetGovernor | null = null

export function getDefaultBudgetGovernor(): ContextBudgetGovernor {
  if (!defaultGovernor) {
    defaultGovernor = new ContextBudgetGovernor()
  }
  return defaultGovernor
}

export function resetDefaultBudgetGovernor(): void {
  if (defaultGovernor) {
    defaultGovernor.resetAll()
  }
  defaultGovernor = null
}
