import { z } from 'zod'

/**
 * Lifecycle hooks — config-defined commands that run at well-defined points
 * of the agent loop (PreToolUse, PostToolUse, SessionStart, Stop).
 *
 * Shape intentionally mirrors the Claude Code / Codex hooks convention so
 * ecosystem knowledge transfers: events map to matchers mapping to command
 * handlers. Handlers receive a JSON payload on stdin and may return a JSON
 * decision on stdout.
 */

export const HOOK_EVENT_NAMES = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'Stop',
] as const

export type HookEventName = (typeof HOOK_EVENT_NAMES)[number]

const hookHandlerSchema = z.object({
  type: z.literal('command').default('command'),
  /** Shell command string (executed via sh/cmd). */
  command: z.string().min(1).optional(),
  /** Direct argv (no shell) — preferred for portability and tests. */
  argv: z.array(z.string()).min(1).optional(),
  /** Timeout in seconds (default 10). The process is killed on expiry. */
  timeout: z.number().int().positive().max(600).optional(),
})

const hookMatcherSchema = z.object({
  /** Regex string matched against the tool name. Omit to match all tools. */
  matcher: z.string().optional(),
  hooks: z.array(hookHandlerSchema).min(1),
})

export const hooksConfigSchema = z.partialRecord(
  z.enum(HOOK_EVENT_NAMES),
  z.array(hookMatcherSchema),
)

// Config-facing types use z.input: the `type` field is defaulted by the
// schema, so user-written configs (and tests) may omit it.
export type HookHandler = z.input<typeof hookHandlerSchema>
export type HookMatcher = z.input<typeof hookMatcherSchema>
export type HooksConfig = z.input<typeof hooksConfigSchema>

/** Payload piped to a hook handler's stdin (JSON). */
export type HookPayload = {
  event: HookEventName
  sessionId?: string
  /** Project root the agent is working in. */
  cwd: string
  /** PreToolUse / PostToolUse only. */
  tool_name?: string
  tool_input?: Record<string, unknown>
  /** PostToolUse only — truncated tool output summary. */
  tool_result?: string
}

/** Structured decision a PreToolUse handler may print to stdout. */
export type HookDecision = {
  /** "block" prevents the action; "allow"/omitted proceeds. */
  decision?: 'block' | 'allow' | undefined
  reason?: string | undefined
  /** Injected into the caller's context/logs (PostToolUse, SessionStart). */
  additionalContext?: string | undefined
}

export type HookRunResult = {
  /**argv/command label used for logs */
  label: string
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  /** Spawn itself failed (command not found, etc.). */
  spawnError?: string | undefined
}

export type HookEventOutcome = {
  /** PreToolUse only: a handler blocked the action. */
  blocked: boolean
  /** Reason supplied by the blocking handler (or stderr on exit 2). */
  reason?: string | undefined
  /** Concatenated additionalContext from all handlers that supplied one. */
  additionalContext: string
  results: HookRunResult[]
}
