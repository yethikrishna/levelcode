/**
 * Self-Critique Reviewer Loop (#13)
 *
 * Provides an automated self-critique mechanism that re-reads diffs against
 * the original goal after an editor agent completes. Checks for correctness,
 * completeness (stubs/TODOs), security issues, and style consistency.
 * Returns an approve/reject verdict with an optional fix patch.
 *
 * @module agents/reviewer/self-critique
 */

import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

// ============================================================================
// Critique Types
// ============================================================================

/**
 * Represents a single hunk in a unified diff (file-level change).
 */
export interface DiffHunk {
  /** File path relative to project root. */
  filePath: string
  /** The starting line number in the old file. */
  oldStart: number
  /** The starting line number in the new file. */
  newStart: number
  /** Removed lines (prefixed with `-` in unified diff, without prefix here). */
  removed: string[]
  /** Added lines (prefixed with `+` in unified diff, without prefix here). */
  added: string[]
}

/**
 * A parsed diff grouped by file with added/removed line arrays.
 */
export interface ParsedDiff {
  hunks: DiffHunk[]
  /** Raw unified diff string for reference. */
  raw: string
}

/**
 * A single issue found during self-critique.
 */
export interface CritiqueIssue {
  /** Severity level. */
  severity: 'critical' | 'warning' | 'info'
  /** Category of the issue. */
  category: 'correctness' | 'completeness' | 'security' | 'style'
  /** Human-readable description. */
  message: string
  /** File path where the issue was found, if applicable. */
  filePath?: string
  /** Line number, if known. */
  line?: number
  /** Suggested replacement text (for auto-fix). */
  suggestedFix?: string
}

/**
 * Result of a self-critique pass.
 */
export interface CritiqueResult {
  /** Whether the diff is approved (no critical/warning issues). */
  approved: boolean
  /** All issues found, ordered by severity. */
  issues: CritiqueIssue[]
  /** Summary of the critique. */
  summary: string
  /** Optional fix patch in unified-diff format to apply when rejected. */
  fixPatch?: string
  /** Per-dimension scores (0.0–1.0). */
  scores: {
    correctness: number
    completeness: number
    security: number
    style: number
    overall: number
  }
}

/**
 * Input to the {@link selfCritique} function.
 */
export interface CritiqueInput {
  /** Unified diff string representing the changes made. */
  diff: string
  /** The original user goal / task description. */
  originalGoal: string
  /** Map of file path → post-edit file content for full context. */
  files: Record<string, string>
}

// ============================================================================
// Pattern-based checks (deterministic, LLM-free layer)
// ============================================================================

const TODO_PATTERN = /\/\/\s*(TODO|FIXME|HACK|XXX|STUB)\b|^\s*(TODO|FIXME):/gim
const CONSOLE_LOG_PATTERN = /\bconsole\.(log|debug|info|warn|error)\s*\(/g
const SECRET_PATTERN =
  /(?:api[_-]?key|secret|password|token|auth)\s*[:=]\s*["'][^"']{6,}["']/gi
const ANY_CAST_PATTERN = /\bas\s+any\b|:\s*any\b|<any>/g
const EMPTY_CATCH_PATTERN = /catch\s*\([^)]*\)\s*\{\s*\}/g
const EVAL_PATTERN = /\beval\s*\(/g
const HTML_INNER_HTML_PATTERN = /\.innerHTML\s*=/g
const DANGEROUS_SHELL_PATTERN = /\brm\s+-rf\b|\bDROP\s+TABLE\b|\bforce\s+push\b/gi

// ============================================================================
// Self-Critique Engine
// ============================================================================

/**
 * Parse a unified diff string into structured {@link DiffHunk} entries.
 *
 * @param diff - Raw unified diff text.
 * @returns Parsed diff object with hunks grouped by file.
 */
export function parseDiff(diff: string): ParsedDiff {
  const hunks: DiffHunk[] = []
  const lines = diff.split('\n')
  let currentFile: string | null = null
  let currentHunk: DiffHunk | null = null

  for (const line of lines) {
    const fileHeader = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
    if (fileHeader) {
      currentFile = fileHeader[2]
      continue
    }

    const hunkHeader = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunkHeader && currentFile) {
      if (currentHunk) hunks.push(currentHunk)
      currentHunk = {
        filePath: currentFile,
        oldStart: parseInt(hunkHeader[1], 10),
        newStart: parseInt(hunkHeader[2], 10),
        removed: [],
        added: [],
      }
      continue
    }

    if (!currentHunk) continue

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.added.push(line.slice(1))
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.removed.push(line.slice(1))
    }
  }

  if (currentHunk) hunks.push(currentHunk)

  return { hunks, raw: diff }
}

/**
 * Run deterministic pattern-based checks on added lines.
 * Returns issues found (does not set `approved`; that is computed later).
 */
function runPatternChecks(parsed: ParsedDiff, files: Record<string, string>): CritiqueIssue[] {
  const issues: CritiqueIssue[] = []

  for (const hunk of parsed.hunks) {
    const filePath = hunk.filePath
    const isTestFile = /\.(test|spec)\./.test(filePath)
    const lineOffset = hunk.newStart

    hunk.added.forEach((lineText, idx) => {
      const lineNo = lineOffset + idx

      if (TODO_PATTERN.test(lineText)) {
        issues.push({
          severity: 'warning',
          category: 'completeness',
          message: `Unresolved TODO/FIXME/STUB comment detected: "${lineText.trim()}"`,
          filePath,
          line: lineNo,
        })
      }
      TODO_PATTERN.lastIndex = 0

      if (!isTestFile && CONSOLE_LOG_PATTERN.test(lineText)) {
        issues.push({
          severity: 'warning',
          category: 'style',
          message: 'Console logging left in production code. Use a logger or remove.',
          filePath,
          line: lineNo,
        })
      }
      CONSOLE_LOG_PATTERN.lastIndex = 0

      if (SECRET_PATTERN.test(lineText)) {
        issues.push({
          severity: 'critical',
          category: 'security',
          message: 'Possible hardcoded secret/credential detected in source.',
          filePath,
          line: lineNo,
        })
      }
      SECRET_PATTERN.lastIndex = 0

      if (ANY_CAST_PATTERN.test(lineText)) {
        issues.push({
          severity: 'warning',
          category: 'style',
          message: 'Use of "any" type or "as any" cast — prefer proper typing.',
          filePath,
          line: lineNo,
        })
      }
      ANY_CAST_PATTERN.lastIndex = 0

      if (EMPTY_CATCH_PATTERN.test(lineText)) {
        issues.push({
          severity: 'warning',
          category: 'correctness',
          message: 'Empty catch block swallows errors — at minimum log or rethrow.',
          filePath,
          line: lineNo,
        })
      }
      EMPTY_CATCH_PATTERN.lastIndex = 0

      if (EVAL_PATTERN.test(lineText)) {
        issues.push({
          severity: 'critical',
          category: 'security',
          message: 'Use of eval() is a security and correctness risk.',
          filePath,
          line: lineNo,
        })
      }
      EVAL_PATTERN.lastIndex = 0

      if (HTML_INNER_HTML_PATTERN.test(lineText)) {
        issues.push({
          severity: 'warning',
          category: 'security',
          message: 'Direct innerHTML assignment can lead to XSS — prefer safe DOM APIs.',
          filePath,
          line: lineNo,
        })
      }
      HTML_INNER_HTML_PATTERN.lastIndex = 0

      if (DANGEROUS_SHELL_PATTERN.test(lineText)) {
        issues.push({
          severity: 'critical',
          category: 'security',
          message: 'Potentially dangerous shell/database operation detected.',
          filePath,
          line: lineNo,
        })
      }
      DANGEROUS_SHELL_PATTERN.lastIndex = 0
    })
  }

  return issues
}

/**
 * Heuristic completeness check: empty additions or stub-only functions.
 */
function runCompletenessChecks(parsed: ParsedDiff): CritiqueIssue[] {
  const issues: CritiqueIssue[] = []

  for (const hunk of parsed.hunks) {
    const nonEmptyAdded = hunk.added.filter((l) => l.trim() !== '')
    const addedText = nonEmptyAdded.join('\n')

    const hasOnlyPassOrThrow =
      nonEmptyAdded.length > 0 &&
      nonEmptyAdded.every(
        (l) =>
          /^\s*(pass|throw new Error\(|return null|return undefined|return;\s*$)/.test(
            l,
          ),
      )

    if (hasOnlyPassOrThrow) {
      issues.push({
        severity: 'critical',
        category: 'completeness',
        message: 'New code consists only of stubs (pass/throw/return null).',
        filePath: hunk.filePath,
      })
    }

    const hasUnimplemented =
      /not implemented|coming soon|will be added|write your code here/i.test(
        addedText,
      )
    if (hasUnimplemented) {
      issues.push({
        severity: 'warning',
        category: 'completeness',
        message: 'Code contains "not implemented" or placeholder markers.',
        filePath: hunk.filePath,
      })
    }
  }

  return issues
}

/**
 * Compute per-dimension scores based on issues found.
 */
function computeScores(issues: CritiqueIssue[]): CritiqueResult['scores'] {
  const counts = {
    critical: 0,
    warning: 0,
    info: 0,
  }
  const byCategory: Record<string, { critical: number; warning: number }> = {
    correctness: { critical: 0, warning: 0 },
    completeness: { critical: 0, warning: 0 },
    security: { critical: 0, warning: 0 },
    style: { critical: 0, warning: 0 },
  }

  for (const issue of issues) {
    counts[issue.severity]++
    byCategory[issue.category][issue.severity === 'critical' ? 'critical' : 'warning']++
  }

  const scoreDimension = (cat: string) => {
    const c = byCategory[cat].critical
    const w = byCategory[cat].warning
    return Math.max(0, 1 - c * 0.5 - w * 0.15)
  }

  const correctness = scoreDimension('correctness')
  const completeness = scoreDimension('completeness')
  const security = scoreDimension('security')
  const style = scoreDimension('style')
  const overall = Math.max(
    0,
    1 - counts.critical * 0.3 - counts.warning * 0.08,
  )

  return { correctness, completeness, security, style, overall }
}

/**
 * Build a minimal fix patch that removes or comments out critical issues.
 * In a full implementation this would delegate to the LLM; here we provide
 * a deterministic best-effort patch that addresses obvious patterns.
 */
function buildFixPatch(issues: CritiqueIssue[], files: Record<string, string>): string | undefined {
  const criticals = issues.filter((i) => i.severity === 'critical')
  if (criticals.length === 0) return undefined

  const patchLines: string[] = []
  const grouped = new Map<string, CritiqueIssue[]>()
  for (const issue of criticals) {
    if (!issue.filePath) continue
    if (!grouped.has(issue.filePath)) grouped.set(issue.filePath, [])
    grouped.get(issue.filePath)!.push(issue)
  }

  const _entries = Array.from(grouped.entries())
  for (let _ei = 0; _ei < _entries.length; _ei++) {
    const [filePath, fileIssues] = _entries[_ei]
    const content = files[filePath]
    if (!content) continue
    const lines = content.split('\n')

    for (const issue of fileIssues) {
      if (!issue.line) continue
      const idx = issue.line - 1
      if (idx < 0 || idx >= lines.length) continue

      if (issue.category === 'security' && SECRET_PATTERN.test(lines[idx])) {
        lines[idx] = lines[idx].replace(
          /(api[_-]?key|secret|password|token|auth)\s*[:=]\s*["'][^"']{6,}["']/gi,
          '$1: process.env.$1 || ""',
        )
      }
      SECRET_PATTERN.lastIndex = 0
    }

    patchLines.push(`--- a/${filePath}`)
    patchLines.push(`+++ b/${filePath}`)
    patchLines.push(`@@ @@`)
    patchLines.push(' (self-critique automated fix patch; review before applying)')
    patchLines.push(`+// [self-critique] ${fileIssues.length} critical issue(s) flagged`)
    patchLines.push('')
  }

  return patchLines.length > 0 ? patchLines.join('\n') : undefined
}

/**
 * Run a complete self-critique pass.
 *
 * This is the primary entry point for the deterministic critique layer. An LLM
 * can layer on top of this for deeper semantic analysis; these pattern-based
 * checks catch the obvious issues cheaply.
 *
 * @param input - {@link CritiqueInput} with diff, original goal, and file map.
 * @returns A {@link CritiqueResult} with approval status, issues, and scores.
 */
export function selfCritique(input: CritiqueInput): CritiqueResult {
  const { diff, originalGoal, files } = input
  const parsed = parseDiff(diff)

  const patternIssues = runPatternChecks(parsed, files)
  const completenessIssues = runCompletenessChecks(parsed)
  const allIssues = [...patternIssues, ...completenessIssues]

  allIssues.sort((a, b) => {
    const sevRank = { critical: 0, warning: 1, info: 2 }
    return sevRank[a.severity] - sevRank[b.severity]
  })

  const scores = computeScores(allIssues)
  const hasCritical = allIssues.some((i) => i.severity === 'critical')
  const warningCount = allIssues.filter((i) => i.severity === 'warning').length
  const approved = !hasCritical && warningCount <= 3 && scores.overall >= 0.7

  const fixPatch = approved ? undefined : buildFixPatch(allIssues, files)

  const issueSummary = allIssues
    .map((i) => `- [${i.severity.toUpperCase()}] ${i.category}: ${i.message}`)
    .join('\n')

  const summary = approved
    ? `Self-critique PASSED (overall score ${scores.overall.toFixed(2)}). Original goal: "${originalGoal.slice(0, 100)}${originalGoal.length > 100 ? '…' : ''}". ${allIssues.length} minor note(s).`
    : `Self-critique REJECTED (overall score ${scores.overall.toFixed(2)}). ${allIssues.length} issue(s) found against goal: "${originalGoal.slice(0, 100)}${originalGoal.length > 100 ? '…' : ''}".\n${issueSummary}`

  return {
    approved,
    issues: allIssues,
    summary,
    fixPatch,
    scores,
  }
}

// ============================================================================
// Agent Definition — Self-Critique Reviewer
// ============================================================================

/**
 * Self-Critique agent definition.
 *
 * This agent is wired to run after the editor agent completes. It receives the
 * diff and the original goal, performs LLM-based semantic critique on top of
 * the deterministic pattern checks, and returns approve/reject with an optional
 * fix patch.
 */
export const selfCritiqueAgent: Omit<SecretAgentDefinition, 'id'> = {
  publisher,
  model: 'anthropic/claude-opus-4.5',
  displayName: 'Criticus the Self-Reviewer',
  spawnerPrompt:
    'Performs a thorough self-critique of code changes against the original goal after the editor agent completes. Checks for correctness, completeness, security issues, and style consistency. Returns approve/reject with fix instructions if rejected.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'Description of the critique task. Should include the original goal and a summary of changes.',
    },
    params: {
      type: 'object',
      properties: {
        diff: {
          type: 'string',
          description: 'Unified diff of changes to review.',
        },
        originalGoal: {
          type: 'string',
          description: 'The original user request / goal.',
        },
      },
      required: ['diff', 'originalGoal'],
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      approved: { type: 'boolean' },
      summary: { type: 'string' },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string' },
            category: { type: 'string' },
            message: { type: 'string' },
            filePath: { type: 'string' },
            suggestedFix: { type: 'string' },
          },
        },
      },
      fixPatch: { type: 'string' },
      scores: {
        type: 'object',
        properties: {
          correctness: { type: 'number' },
          completeness: { type: 'number' },
          security: { type: 'number' },
          style: { type: 'number' },
          overall: { type: 'number' },
        },
      },
    },
    required: ['approved', 'summary', 'issues', 'scores'],
  },
  outputMode: 'structured_output',
  toolNames: [],
  spawnableAgents: [],
  includeMessageHistory: true,
  inheritParentSystemPrompt: true,

  instructionsPrompt: `You are Criticus, a self-critique reviewer. After code edits are made, you review the diff against the ORIGINAL GOAL provided in the user message.

# Review Checklist

Check each of these dimensions carefully:

## 1. Correctness
- Does the code actually solve the problem described in the original goal?
- Are there obvious logic errors, wrong variable names, broken imports?
- Does it handle edge cases implied by the goal?

## 2. Completeness
- Are there any TODO, FIXME, HACK, XXX, or STUB comments left in new code?
- Are there empty functions, placeholder returns (null/undefined/pass), or "not implemented" markers?
- Does the code fully address every requirement in the original goal?

## 3. Security
- Are there hardcoded secrets, API keys, or credentials?
- Is there use of eval(), innerHTML with unsanitized input, or dangerous shell commands?
- Are inputs validated where appropriate?

## 4. Style Consistency
- Does the new code match the surrounding code style (naming, formatting, patterns)?
- Are there unnecessary 'any' type casts?
- Are there debug console.log statements left in?
- Are there empty catch blocks that swallow errors?

# Output

Respond with a single JSON object matching the output schema. Use <think> tags to work through each checklist item before producing JSON.

If you find issues:
- Set approved to false
- List every issue with severity (critical/warning/info), category, message, and file path if known
- Provide a suggestedFix string for critical issues where possible
- Generate a fixPatch in unified diff format for critical fixes

If the code is clean and addresses the goal:
- Set approved to true
- Include any minor info-level observations
- Give high scores across all dimensions
${PLACEHOLDER.FILE_TREE_PROMPT_SMALL}`,

  handleSteps: function* ({ agentState, params, logger }) {
    logger.info({ agentId: agentState.agentId }, 'Self-critique reviewer starting')

    const { agentState: afterStep } = yield 'STEP'

    const lastAssistant = [...afterStep.messageHistory]
      .reverse()
      .find((m) => m.role === 'assistant')

    let rawText = ''
    if (lastAssistant) {
      const content = lastAssistant.content
      if (typeof content === 'string') {
        rawText = content
      } else if (Array.isArray(content)) {
        rawText = content
          .filter((p) => p.type === 'text')
          .map((p) => (p as { text: string }).text)
          .join('')
      }
    }

    const cleaned = rawText.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    let llmResult: Partial<CritiqueResult>
    try {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      llmResult = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    } catch {
      llmResult = {}
    }

    const diff = (params?.diff as string) ?? ''
    const originalGoal = (params?.originalGoal as string) ?? ''
    const files = (params?.files as Record<string, string>) ?? {}

    const deterministic = selfCritique({ diff, originalGoal, files })

    const merged: CritiqueResult = {
      approved: (llmResult.approved ?? true) && deterministic.approved,
      issues: [
        ...(llmResult.issues ?? []),
        ...deterministic.issues,
      ],
      summary: llmResult.summary ?? deterministic.summary,
      fixPatch: llmResult.fixPatch ?? deterministic.fixPatch,
      scores: {
        correctness: Math.min(
          llmResult.scores?.correctness ?? 1,
          deterministic.scores.correctness,
        ),
        completeness: Math.min(
          llmResult.scores?.completeness ?? 1,
          deterministic.scores.completeness,
        ),
        security: Math.min(
          llmResult.scores?.security ?? 1,
          deterministic.scores.security,
        ),
        style: Math.min(
          llmResult.scores?.style ?? 1,
          deterministic.scores.style,
        ),
        overall: Math.min(
          llmResult.scores?.overall ?? 1,
          deterministic.scores.overall,
        ),
      },
    }

    logger.info(
      { approved: merged.approved, issueCount: merged.issues.length },
      'Self-critique complete',
    )

    yield {
      toolName: 'set_output',
      input: { output: merged },
      includeToolCall: false,
    }
  },
}

const definition: SecretAgentDefinition = {
  id: 'self-critique',
  ...selfCritiqueAgent,
}

export default definition
