/**
 * Per-Agent Scratchpad
 *
 * A lightweight, in-memory (with optional disk persistence) markdown scratchpad
 * that lets each agent maintain working notes during a session. When agents
 * hand off to teammates or to a human, the scratchpad is summarized and fed
 * into the handoff pack so context is not lost.
 *
 * Scratchpads use markdown so agents can write structured notes (headings,
 * lists, todos, code blocks) that are easy to render and summarize.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A single entry in an agent's scratchpad.
 */
export interface ScratchpadEntry {
  /** ISO timestamp of the entry */
  timestamp: string
  /** Markdown content */
  content: string
  /** Optional section heading to organize entries */
  section?: string
}

/**
 * Summary of an agent's scratchpad suitable for handoff.
 */
export interface ScratchpadHandoffSummary {
  /** The agent id this summary belongs to */
  agentId: string
  /** When the summary was generated */
  generatedAt: string
  /** Total number of entries in the scratchpad */
  entryCount: number
  /** A condensed markdown summary (key findings, open questions, next steps) */
  summaryMarkdown: string
  /** Raw entries for reference */
  entries: ScratchpadEntry[]
}

// ============================================================================
// AgentScratchpad
// ============================================================================

/**
 * Manages per-agent markdown scratchpads.
 *
 * Each agent gets its own scratchpad identified by `agentId`. The scratchpad
 * supports writing (overwrite), appending, reading, and generating a handoff
 * summary that condenses the notes for downstream agents or human review.
 *
 * By default the scratchpad is in-memory only; call `persistToDisk(cwd)` to
 * write scratchpads to `.levelcode/scratchpads/<agentId>.md` so they survive
 * process restarts within a project.
 */
export class AgentScratchpad {
  /** In-memory storage: agentId -> ordered entries */
  private pads: Map<string, ScratchpadEntry[]> = new Map()
  /** Optional on-disk persistence root */
  private persistDir: string | null = null

  constructor() {}

  /**
   * Enable on-disk persistence. Scratchpads are written as markdown files
   * under `<cwd>/.levelcode/scratchpads/<agentId>.md`.
   *
   * @param cwd - Working directory that contains the `.levelcode` folder
   */
  persistToDisk(cwd: string): void {
    this.persistDir = `${cwd}/.levelcode/scratchpads`.replace(/\\/g, '/')
  }

  /**
   * Overwrite the scratchpad for an agent with the given markdown content.
   * Replaces all previous entries with a single entry.
   *
   * @param agentId - Identifier for the agent (e.g. "editor", "reviewer", "cto")
   * @param content - Full markdown content to set as the scratchpad
   * @param section - Optional section heading
   */
  write(agentId: string, content: string, section?: string): void {
    const entry: ScratchpadEntry = {
      timestamp: new Date().toISOString(),
      content: content.trim(),
      section,
    }
    this.pads.set(agentId, [entry])
    this.flushToDisk(agentId)
  }

  /**
   * Append markdown content to an agent's scratchpad. If the scratchpad does
   * not exist yet, it is created.
   *
   * @param agentId - Identifier for the agent
   * @param content - Markdown content to append
   * @param section - Optional section heading (adds a `## <section>` header before content)
   */
  append(agentId: string, content: string, section?: string): void {
    const trimmed = content.trim()
    if (!trimmed) return

    const entry: ScratchpadEntry = {
      timestamp: new Date().toISOString(),
      content: trimmed,
      section,
    }

    if (!this.pads.has(agentId)) {
      this.pads.set(agentId, [])
    }
    this.pads.get(agentId)!.push(entry)
    this.flushToDisk(agentId)
  }

  /**
   * Read the full markdown content of an agent's scratchpad.
   *
   * @param agentId - Identifier for the agent
   * @returns Combined markdown content, or empty string if no scratchpad exists
   */
  read(agentId: string): string {
    const entries = this.pads.get(agentId) ?? []
    if (entries.length === 0) return ''
    return this.renderMarkdown(entries)
  }

  /**
   * Generate a concise handoff summary from an agent's scratchpad.
   *
   * The summary extracts key findings, open questions / blockers, and
   * recommended next steps from the entries. It is formatted as compact
   * markdown suitable for injecting into a handoff pack or another agent's
   * context.
   *
   * @param agentId - Identifier for the agent
   * @returns Handoff summary object with condensed markdown
   */
  getHandoffSummary(agentId: string): ScratchpadHandoffSummary {
    const entries = this.pads.get(agentId) ?? []
    const markdown = this.read(agentId)

    // Build a condensed summary by extracting lines that look like
    // findings, decisions, blockers, questions, or next steps.
    const lines = markdown.split('\n')
    const findings: string[] = []
    const decisions: string[] = []
    const blockers: string[] = []
    const questions: string[] = []
    const nextSteps: string[] = []

    let currentSection = ''
    for (const rawLine of lines) {
      const line = rawLine.trim()

      // Track current heading for context
      const headingMatch = /^#{1,4}\s+(.+)$/.exec(line)
      if (headingMatch) {
        currentSection = headingMatch[1]!.toLowerCase()
        continue
      }

      if (!line) continue

      // Categorize bullet points / lines by keywords
      const lower = line.toLowerCase()
      const bulletContent = line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '')

      if (
        lower.includes('blocked') ||
        lower.includes('blocker') ||
        lower.includes('stuck') ||
        lower.includes('error:') ||
        lower.includes('failed') ||
        currentSection.includes('blocker') ||
        currentSection.includes('issue')
      ) {
        blockers.push(bulletContent)
      } else if (
        lower.includes('todo') ||
        lower.includes('next step') ||
        lower.includes('next:') ||
        lower.includes('follow-up') ||
        lower.includes('follow up') ||
        currentSection.includes('next') ||
        currentSection.includes('todo') ||
        currentSection.includes('plan')
      ) {
        nextSteps.push(bulletContent)
      } else if (
        lower.includes('question') ||
        lower.includes('unclear') ||
        lower.includes('?') ||
        lower.includes('needs clarification') ||
        currentSection.includes('question')
      ) {
        questions.push(bulletContent)
      } else if (
        lower.includes('decision') ||
        lower.includes('decided') ||
        lower.includes('chose') ||
        lower.includes('agreed') ||
        currentSection.includes('decision')
      ) {
        decisions.push(bulletContent)
      } else if (
        lower.includes('found') ||
        lower.includes('discovered') ||
        lower.includes('learned') ||
        lower.includes('noted') ||
        lower.includes('key finding') ||
        currentSection.includes('find') ||
        currentSection.includes('note')
      ) {
        findings.push(bulletContent)
      }
    }

    // Fall back to last few entries if we couldn't categorize anything
    if (
      findings.length === 0 &&
      decisions.length === 0 &&
      blockers.length === 0 &&
      questions.length === 0 &&
      nextSteps.length === 0 &&
      entries.length > 0
    ) {
      // Use the last 3 entries as a generic summary
      const recent = entries.slice(-3)
      for (const e of recent) {
        const firstLine = e.content.split('\n')[0]!.trim()
        findings.push(firstLine.length > 120 ? firstLine.slice(0, 120) + '…' : firstLine)
      }
    }

    const summaryParts: string[] = []
    summaryParts.push(`### Agent Scratchpad: ${agentId}`)
    summaryParts.push('')

    if (findings.length > 0) {
      summaryParts.push('**Key findings:**')
      for (const f of findings.slice(0, 5)) summaryParts.push(`- ${f}`)
      summaryParts.push('')
    }
    if (decisions.length > 0) {
      summaryParts.push('**Decisions made:**')
      for (const d of decisions.slice(0, 5)) summaryParts.push(`- ${d}`)
      summaryParts.push('')
    }
    if (blockers.length > 0) {
      summaryParts.push('**Blockers / issues:**')
      for (const b of blockers.slice(0, 5)) summaryParts.push(`- ${b}`)
      summaryParts.push('')
    }
    if (questions.length > 0) {
      summaryParts.push('**Open questions:**')
      for (const q of questions.slice(0, 5)) summaryParts.push(`- ${q}`)
      summaryParts.push('')
    }
    if (nextSteps.length > 0) {
      summaryParts.push('**Next steps:**')
      for (const n of nextSteps.slice(0, 5)) summaryParts.push(`- ${n}`)
      summaryParts.push('')
    }

    return {
      agentId,
      generatedAt: new Date().toISOString(),
      entryCount: entries.length,
      summaryMarkdown: summaryParts.join('\n').trim(),
      entries: [...entries],
    }
  }

  /**
   * Clear an agent's scratchpad, removing all entries.
   *
   * @param agentId - Identifier for the agent
   */
  clear(agentId: string): void {
    this.pads.delete(agentId)
    if (this.persistDir) {
      // Note: using dynamic require for fs to avoid hard dependency in browser-like environments
      try {
        const fs = require('fs') as typeof import('fs')
        const path = require('path') as typeof import('path')
        const filePath = path.join(this.persistDir, `${this.sanitizeAgentId(agentId)}.md`)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      } catch {
        // Persistence is best-effort
      }
    }
  }

  /**
   * Check whether an agent has any scratchpad entries.
   */
  has(agentId: string): boolean {
    return (this.pads.get(agentId)?.length ?? 0) > 0
  }

  /**
   * List all agent ids that have scratchpad entries.
   */
  listAgents(): string[] {
    return Array.from(this.pads.keys())
  }

  /**
   * Get handoff summaries for all agents that have scratchpad entries.
   * Useful for building a full team handoff pack.
   */
  getAllHandoffSummaries(): ScratchpadHandoffSummary[] {
    return this.listAgents().map((id) => this.getHandoffSummary(id))
  }

  /**
   * Combine all per-agent handoff summaries into a single markdown
   * document suitable for attaching to a team handoff pack.
   */
  getTeamHandoffMarkdown(): string {
    const summaries = this.getAllHandoffSummaries()
    if (summaries.length === 0) return ''

    const parts = ['## Agent Scratchpad Summaries', '']
    for (const s of summaries) {
      parts.push(s.summaryMarkdown)
      parts.push('')
      parts.push('---')
      parts.push('')
    }
    return parts.join('\n').trim()
  }

  // ============================================================================
  // Internals
  // ============================================================================

  private renderMarkdown(entries: ScratchpadEntry[]): string {
    const parts: string[] = []
    parts.push(`# Scratchpad`)
    parts.push('')

    for (const entry of entries) {
      if (entry.section) {
        parts.push(`## ${entry.section}`)
        parts.push('')
      }
      parts.push(entry.content)
      parts.push('')
    }

    return parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
  }

  private flushToDisk(agentId: string): void {
    if (!this.persistDir) return
    try {
      const fs = require('fs') as typeof import('fs')
      const path = require('path') as typeof import('path')
      if (!fs.existsSync(this.persistDir)) {
        fs.mkdirSync(this.persistDir, { recursive: true })
      }
      const filePath = path.join(this.persistDir, `${this.sanitizeAgentId(agentId)}.md`)
      fs.writeFileSync(filePath, this.read(agentId), 'utf-8')
    } catch {
      // Persistence is best-effort; swallow errors
    }
  }

  private sanitizeAgentId(agentId: string): string {
    return agentId.replace(/[^a-zA-Z0-9_-]/g, '_')
  }
}

/**
 * Singleton default instance for convenience.
 * Consumers that need isolated instances can create their own `new AgentScratchpad()`.
 */
let defaultScratchpad: AgentScratchpad | null = null

export function getDefaultScratchpad(): AgentScratchpad {
  if (!defaultScratchpad) {
    defaultScratchpad = new AgentScratchpad()
  }
  return defaultScratchpad
}

export function resetDefaultScratchpad(): void {
  if (defaultScratchpad) {
    for (const id of defaultScratchpad.listAgents()) {
      defaultScratchpad.clear(id)
    }
  }
  defaultScratchpad = null
}
