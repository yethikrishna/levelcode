import type { HookDecision } from './types'

/**
 * Parse a hook handler's stdout into a structured decision.
 * Only well-formed JSON objects are accepted — plain text stdout is ignored
 * (hooks may print human logs without intending decisions).
 * Huge or non-JSON output must never throw.
 */
export function parseHookDecision(stdout: string): HookDecision | null {
  const trimmed = stdout.trim()
  if (!trimmed || trimmed.length > 16 * 1024) return null
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    const record = parsed as Record<string, unknown>
    const decision: HookDecision = {}
    if (record.decision === 'block' || record.decision === 'allow') {
      decision.decision = record.decision
    }
    if (typeof record.reason === 'string') {
      decision.reason = record.reason
    }
    if (typeof record.additionalContext === 'string') {
      decision.additionalContext = record.additionalContext
    }
    if (
      decision.decision === undefined &&
      decision.reason === undefined &&
      decision.additionalContext === undefined
    ) {
      return null
    }
    return decision
  } catch {
    return null
  }
}
