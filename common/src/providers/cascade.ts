/**
 * Model cascading & automatic fallback.
 *
 * A `ModelCascade` holds an ordered list of model identifiers (e.g.
 * `['anthropic/claude-opus', 'deepseek/deepseek-v3', 'ollama/qwen2.5-coder']`)
 * and executes a request against each model in order until one succeeds.
 *
 * Failures that trigger fallback:
 *  - HTTP 429 (rate limit)
 *  - HTTP 5xx (server errors)
 *  - AbortError / timeout (request took longer than configured threshold)
 *  - Any error classified as "transient" by the caller via `isRetryable`
 *
 * Failures that do NOT trigger fallback (hard errors):
 *  - HTTP 401/403 (auth)
 *  - HTTP 400 (bad request / prompt too long)
 *  - Other 4xx errors
 */

// ============================================================================
// Types
// ============================================================================

/** Classifies why a model call failed so the cascade can decide whether to fall back. */
export type FailureReason =
  | 'rate-limit'
  | 'server-error'
  | 'timeout'
  | 'network-error'
  | 'context-length'
  | 'auth-error'
  | 'bad-request'
  | 'unknown'

export interface FailureRecord {
  model: string
  reason: FailureReason
  message: string
  timestamp: number
  httpStatus?: number
}

export interface CascadeResult<T> {
  /** The successfully returned value. */
  value: T
  /** The model identifier that produced the value. */
  model: string
  /** Ordered list of failures encountered before success (if any). */
  failures: FailureRecord[]
  /** Index (0-based) of the winning model in the cascade array. */
  winnerIndex: number
}

export interface CascadeOptions<T> {
  /** Optional abort signal that cancels all fallback attempts. */
  signal?: AbortSignal
  /** Per-attempt timeout in milliseconds. Defaults to 60 000. */
  timeoutMs?: number
  /** Maximum number of retry attempts per model (before falling through). Defaults to 1. */
  maxRetriesPerModel?: number
  /** Backoff between retries for the same model, in ms. Defaults to 1000. */
  retryBackoffMs?: number
  /**
   * Custom predicate to decide whether an error should be treated as retryable
   * (triggering a retry on the same model) or fatal (falling through to the next model).
   * If not supplied, default heuristics based on HTTP status are used.
   */
  isRetryable?: (err: unknown, attempt: number) => boolean
  /**
   * Custom predicate to decide whether a failure should trigger fallback to the
   * next model. Returning false will throw instead of falling back.
   */
  shouldFallback?: (failure: FailureRecord) => boolean
  /** Callback invoked every time a model fails; useful for logging/metrics. */
  onFailure?: (record: FailureRecord) => void
  /** Callback invoked when a model succeeds. */
  onSuccess?: (model: string, value: T) => void
}

/** Shape of the executor function passed to `execute()` — it runs a single model call. */
export type ModelExecutor<T> = (model: string, attemptCtx: { attempt: number; signal: AbortSignal }) => Promise<T>

// ============================================================================
// Failure classification helpers
// ============================================================================

/**
 * Inspect an error and classify it into a `FailureReason`.
 * Handles HTTP errors (with `status` field), AbortError/timeouts, network errors, etc.
 */
export function classifyError(err: unknown): FailureReason {
  if (!err) return 'unknown'

  const status = extractHttpStatus(err)
  if (status !== undefined) {
    if (status === 429) return 'rate-limit'
    if (status === 401 || status === 403) return 'auth-error'
    if (status === 400) return 'bad-request'
    if (status === 413 || status === 400) {
      const msg = extractMessage(err).toLowerCase()
      if (msg.includes('context') || msg.includes('length') || msg.includes('token')) {
        return 'context-length'
      }
      return 'bad-request'
    }
    if (status >= 500 && status < 600) return 'server-error'
    return 'bad-request'
  }

  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'timeout'
  }

  const msg = extractMessage(err).toLowerCase()
  if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout'
  if (msg.includes('enotfound') || msg.includes('econnrefused') || msg.includes('fetch') || msg.includes('network')) {
    return 'network-error'
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) return 'rate-limit'

  return 'unknown'
}

function extractHttpStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const anyErr = err as { status?: number; statusCode?: number; httpStatus?: number; response?: { status?: number } }
    if (typeof anyErr.status === 'number') return anyErr.status
    if (typeof anyErr.statusCode === 'number') return anyErr.statusCode
    if (typeof anyErr.httpStatus === 'number') return anyErr.httpStatus
    if (anyErr.response && typeof anyErr.response.status === 'number') return anyErr.response.status
  }
  return undefined
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in (err as object)) {
    return String((err as { message?: unknown }).message ?? '')
  }
  return String(err)
}

/**
 * Default fallback predicate: fall back for transient errors (rate-limit, server-error, timeout, network-error).
 * Do NOT fall back for auth errors, bad requests, or context-length errors (these won't change by switching models
 * in most cases — though context-length CAN benefit from fallback, so we allow it here as well since a smaller
 * model may have a larger limit or a cheaper model may handle it differently).
 */
export function defaultShouldFallback(reason: FailureReason): boolean {
  switch (reason) {
    case 'rate-limit':
    case 'server-error':
    case 'timeout':
    case 'network-error':
    case 'context-length':
    case 'unknown':
      return true
    case 'auth-error':
    case 'bad-request':
      return false
  }
}

// ============================================================================
// ModelCascade
// ============================================================================

/**
 * An ordered cascade of models with automatic fallback on transient failures.
 *
 * Usage:
 * ```ts
 * const cascade = new ModelCascade([
 *   'anthropic/claude-opus-4',
 *   'deepseek/deepseek-v3',
 *   'ollama/qwen2.5-coder',
 * ])
 *
 * const result = await cascade.execute(
 *   async (model, { signal }) => {
 *     return await llm.chat(model, messages, { signal })
 *   },
 * )
 * console.log(`Got reply from ${result.model}:`, result.value)
 * ```
 */
export class ModelCascade {
  private readonly models: readonly string[]
  private readonly failureLog: Map<string, FailureRecord[]> = new Map()
  private readonly cooldowns: Map<string, { until: number; reason: FailureReason }> = new Map()
  private readonly cooldownMs: number

  /**
   * @param models     - Ordered list of model identifiers (most preferred first).
   * @param cooldownMs - How long to skip a failing model after recording a failure (default 60 000 ms).
   */
  constructor(models: string[], cooldownMs = 60_000) {
    if (models.length === 0) {
      throw new Error('ModelCascade requires at least one model in the cascade list')
    }
    this.models = [...models]
    this.cooldownMs = cooldownMs
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Return the ordered list of models in this cascade. */
  getModels(): string[] {
    return [...this.models]
  }

  /**
   * Record a failure for a given model without executing anything.
   * Useful when failures are observed outside of `execute()` (e.g. from streaming errors).
   */
  recordFailure(model: string, reason: FailureReason, message?: string, httpStatus?: number): FailureRecord {
    const record: FailureRecord = {
      model,
      reason,
      message: message ?? reason,
      timestamp: Date.now(),
      httpStatus,
    }
    const existing = this.failureLog.get(model) ?? []
    existing.push(record)
    this.failureLog.set(model, existing)

    if (defaultShouldFallback(reason)) {
      this.cooldowns.set(model, { until: Date.now() + this.cooldownMs, reason })
    }

    return record
  }

  /** Return all failure records for a given model, ordered oldest-first. */
  getFailures(model?: string): FailureRecord[] {
    if (model) {
      return [...(this.failureLog.get(model) ?? [])]
    }
    const all: FailureRecord[] = []
    for (const records of this.failureLog.values()) {
      all.push(...records)
    }
    return all.sort((a, b) => a.timestamp - b.timestamp)
  }

  /** Return the count of failures per model. */
  getFailureCounts(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const [model, records] of this.failureLog) {
      counts[model] = records.length
    }
    return counts
  }

  /** Clear all failure records and cooldowns. */
  resetFailures(): void {
    this.failureLog.clear()
    this.cooldowns.clear()
  }

  /** Check whether a model is currently in cooldown (e.g. just rate-limited). */
  isCooledDown(model: string): { cooledDown: boolean; until?: number; reason?: FailureReason } {
    const entry = this.cooldowns.get(model)
    if (!entry) return { cooledDown: false }
    if (Date.now() >= entry.until) {
      this.cooldowns.delete(model)
      return { cooledDown: false }
    }
    return { cooledDown: true, until: entry.until, reason: entry.reason }
  }

  /**
   * Execute a request against the cascade: try each model in order, falling back
   * on transient errors, until one succeeds or all models are exhausted.
   *
   * @param executor - Function that performs the actual model call for a given model string.
   * @param options  - Cascade options (timeout, retries, callbacks, etc.).
   * @returns The result from the first successful model.
   * @throws The last encountered error if every model in the cascade failed fatally.
   */
  async execute<T>(executor: ModelExecutor<T>, options: CascadeOptions<T> = {}): Promise<CascadeResult<T>> {
    const timeoutMs = options.timeoutMs ?? 60_000
    const maxRetriesPerModel = options.maxRetriesPerModel ?? 1
    const retryBackoffMs = options.retryBackoffMs ?? 1000
    const failures: FailureRecord[] = []
    let lastError: unknown = null

    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i]

      if (options.signal?.aborted) {
        throw new Error('Cascade aborted by caller signal')
      }

      const cooldown = this.isCooledDown(model)
      if (cooldown.cooledDown) {
        const record: FailureRecord = {
          model,
          reason: cooldown.reason ?? 'rate-limit',
          message: `Skipping model due to active cooldown until ${new Date(cooldown.until!).toISOString()}`,
          timestamp: Date.now(),
        }
        failures.push(record)
        options.onFailure?.(record)
        continue
      }

      let attempt = 0
      while (attempt <= maxRetriesPerModel) {
        if (options.signal?.aborted) {
          throw new Error('Cascade aborted by caller signal')
        }

        const attemptController = new AbortController()
        const timeout = setTimeout(() => attemptController.abort(), timeoutMs)
        const linkedSignal = options.signal
          ? anyAbort(options.signal, attemptController.signal)
          : attemptController.signal

        try {
          const value = await executor(model, { attempt, signal: linkedSignal })
          clearTimeout(timeout)
          options.onSuccess?.(model, value)
          return {
            value,
            model,
            failures,
            winnerIndex: i,
          }
        } catch (err) {
          clearTimeout(timeout)
          lastError = err

          const reason = classifyError(err)
          const record = this.recordFailure(model, reason, extractMessage(err), extractHttpStatus(err))
          failures.push(record)
          options.onFailure?.(record)

          const retryable = options.isRetryable
            ? options.isRetryable(err, attempt)
            : reason === 'rate-limit' || reason === 'server-error' || reason === 'network-error'

          if (retryable && attempt < maxRetriesPerModel) {
            attempt++
            await sleep(retryBackoffMs * attempt)
            continue
          }

          const shouldFallback = options.shouldFallback
            ? options.shouldFallback(record)
            : defaultShouldFallback(reason)

          if (shouldFallback && i < this.models.length - 1) {
            break
          }

          throw err
        } finally {
          clearTimeout(timeout)
        }
      }
    }

    throw lastError ?? new Error('All models in the cascade failed')
  }
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Combine two AbortSignals into one that aborts when either aborts.
 * Minimal implementation compatible with Node 18+, modern browsers, and Bun.
 */
function anyAbort(...signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(signals)
  }
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  for (const s of signals) {
    if (s.aborted) {
      controller.abort()
      break
    }
    s.addEventListener('abort', onAbort, { once: true })
  }
  return controller.signal
}
