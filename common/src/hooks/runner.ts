import { loadHooks } from './loader'
import { parseHookDecision } from './decision'

import type {
  HookEventName,
  HookPayload,
  HookEventOutcome,
  HookMatcher,
  HooksConfig,
} from './types'

/**
 * Hook runner — executes matching command handlers for a lifecycle event.
 *
 * Protocol:
 *  - Payload JSON on stdin.
 *  - Exit 0 = proceed (stdout may carry a JSON decision).
 *  - Exit 2 = block (stderr is the reason) — matches the Claude Code convention.
 *  - Any other exit / spawn failure / timeout = log and continue (fail-open);
 *    hooks are productivity tooling, not a security boundary.
 *  - Output cap 64KB per stream, then truncated.
 */

const DEFAULT_TIMEOUT_SECONDS = 10
const MAX_OUTPUT_CHARS = 64 * 1024

function truncate(s: string): string {
  return s.length <= MAX_OUTPUT_CHARS
    ? s
    : s.slice(0, MAX_OUTPUT_CHARS) + `\n… [truncated ${s.length - MAX_OUTPUT_CHARS} chars]`
}

function shellWrap(command: string): string[] {
  return process.platform === 'win32'
    ? ['cmd.exe', '/c', command]
    : ['sh', '-c', command]
}

function matches(matcher: HookMatcher, payload: HookPayload): boolean {
  if (!matcher.matcher) return true
  try {
    return new RegExp(matcher.matcher).test(payload.tool_name ?? '')
  } catch {
    return false // Invalid regex matches nothing — never blocks everything
  }
}

export type HookRunnerOptions = {
  /** Pre-loaded config (tests); when omitted, config is loaded from disk. */
  hooks?: HooksConfig
  /** Loader warnings are appended here when config is loaded from disk. */
  onConfigWarning?: (warning: string) => void
  /** Test seam. */
  spawnImpl?: typeof Bun.spawn
}

export function createHookRunner(options: HookRunnerOptions = {}) {
  const spawn = options.spawnImpl ?? Bun.spawn
  let diskConfig: HooksConfig | null = null
  let diskConfigRoot: string | null = null

  function configFor(projectRoot: string): HooksConfig {
    if (options.hooks) return options.hooks
    if (diskConfig && diskConfigRoot === projectRoot) return diskConfig
    const loaded = loadHooks(projectRoot)
    for (const w of loaded.warnings) options.onConfigWarning?.(w)
    diskConfig = loaded.hooks
    diskConfigRoot = projectRoot
    return diskConfig
  }

  /** Invalidate the cached disk config (e.g. settings changed mid-session). */
  function invalidate(): void {
    diskConfig = null
    diskConfigRoot = null
  }

  async function runHandler(
    handler: HookMatcher['hooks'][number],
    payload: HookPayload,
  ): Promise<{
    exitCode: number | null
    stdout: string
    stderr: string
    timedOut: boolean
    spawnError?: string
  }> {
    const timeoutMs = (handler.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000
    const argv = handler.argv ?? shellWrap(handler.command ?? '')
    if (argv.length === 0) {
      return { exitCode: null, stdout: '', stderr: '', timedOut: false, spawnError: 'empty handler' }
    }

    try {
      const proc = spawn({
        cmd: argv,
        stdin: new TextEncoder().encode(JSON.stringify(payload)),
        stdout: 'pipe',
        stderr: 'pipe',
      })

      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        try {
          proc.kill()
        } catch {
          // already exited
        }
      }, timeoutMs)

      let stdout = ''
      let stderr = ''
      let exitCode: number | null
      try {
        ;[stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ])
      } finally {
        clearTimeout(timer)
      }

      return {
        exitCode,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        timedOut,
        spawnError: undefined,
      }
    } catch (error) {
      return {
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        spawnError: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async function runEvent(
    event: HookEventName,
    payload: HookPayload,
  ): Promise<HookEventOutcome> {
    const hooks = configFor(payload.cwd)
    const matchers = hooks[event] ?? []

    const outcome: HookEventOutcome = {
      blocked: false,
      additionalContext: '',
      results: [],
    }

    for (const matcher of matchers) {
      if (!matches(matcher, payload)) continue
      for (const handler of matcher.hooks) {
        const result = await runHandler(handler, payload)
        outcome.results.push({
          label: handler.argv?.join(' ') ?? handler.command ?? '(empty)',
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          timedOut: result.timedOut,
          spawnError: result.spawnError,
        })

        if (result.timedOut || result.spawnError) {
          continue // fail-open
        }

        // Exit code 2: block with stderr as the reason (Claude Code convention).
        if (event === 'PreToolUse' && result.exitCode === 2) {
          outcome.blocked = true
          outcome.reason =
            result.stderr.trim() ||
            parseHookDecision(result.stdout)?.reason ||
            `Blocked by PreToolUse hook (${handler.argv?.join(' ') ?? handler.command})`
          continue
        }

        // Structured decision on stdout (exit 0).
        const decision = parseHookDecision(result.stdout)
        if (decision) {
          if (decision.decision === 'block' && event === 'PreToolUse') {
            outcome.blocked = true
            outcome.reason = decision.reason ?? outcome.reason
          }
          if (decision.additionalContext) {
            outcome.additionalContext += decision.additionalContext + '\n'
          }
        }
      }
    }

    return outcome
  }

  return { runEvent, invalidate }
}

export type HookRunner = ReturnType<typeof createHookRunner>
