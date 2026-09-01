/**
 * Step-level retry for transient model-API failures.
 *
 * One transient blip (rate limit, provider 5xx, dropped connection) past the
 * AI SDK's own per-call retries currently kills the whole agent run — a
 * 400-step max-effort run loses everything, since state is only persisted at
 * the end. This wrapper re-runs a failed STEP with bounded exponential
 * backoff so the work already done survives.
 *
 * Only transient shapes are retried (429/5xx/timeouts, network errors);
 * deterministic failures (400, auth, payment) and user aborts fail
 * immediately. Callers provide a `rollback` that restores the agent state
 * the step may have partially mutated (runAgentStep reassigns
 * messageHistory / stepsRemaining on the passed state before the model
 * call), so a retried step starts from a clean pre-step state.
 */

/** Same statuses levelcode-web-api treats as retryable. */
export const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])

/** Backoff between attempts; MAX_STEP_RETRIES entries after the first failure. */
export const STEP_RETRY_DELAYS_MS = [2_000, 8_000, 20_000]
export const MAX_STEP_RETRIES = STEP_RETRY_DELAYS_MS.length

const NETWORK_ERROR_PATTERN =
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|socket hang up|fetch failed|terminated|network error|Connection refused|Connection closed|underlying connection/i

export function isRetryableStepError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return false
  if (!(error instanceof Error)) return false
  // User aborts surface as abort errors — never retry those.
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return false
  }
  const statusCode = (error as { statusCode?: number }).statusCode
  if (typeof statusCode === 'number') {
    // Retryable = transport/server trouble. 4xx here (400/401/402/403/404)
    // is deterministic — the same request will fail identically.
    return RETRYABLE_STATUS_CODES.has(statusCode)
  }
  // AI SDK RetryError wraps the last underlying attempt's failure.
  const lastError = (error as { lastError?: unknown }).lastError
  if (lastError instanceof Error) {
    const lastStatus = (lastError as { statusCode?: number }).statusCode
    if (typeof lastStatus === 'number') return RETRYABLE_STATUS_CODES.has(lastStatus)
    return NETWORK_ERROR_PATTERN.test(lastError.message)
  }
  return NETWORK_ERROR_PATTERN.test(error.message)
}

export type StepRetryOptions = {
  logger: {
    warn: (obj: Record<string, unknown>, msg: string) => void
  }
  signal?: AbortSignal
  /** Restore pre-step state before each retry (history, stepsRemaining). */
  rollback: () => void
  /** Injectable for tests; defaults to a real setTimeout sleep. */
  delayFn?: (ms: number) => Promise<void>
  delaySchedule?: readonly number[]
}

/**
 * Run `step`, retrying transient failures with backoff. Exhaustion rethrows
 * the last error — the loop's existing failure path then produces the
 * contract-mandated error output.
 */
export async function withTransientStepRetry<T>(
  step: () => Promise<T>,
  options: StepRetryOptions,
): Promise<T> {
  const { logger, signal, rollback } = options
  const delays = options.delaySchedule ?? STEP_RETRY_DELAYS_MS
  const sleep = options.delayFn ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  let attempt = 0
  for (;;) {
    try {
      return await step()
    } catch (error) {
      if (attempt >= delays.length || !isRetryableStepError(error, signal)) {
        throw error
      }
      const delay = delays[attempt]!
      attempt++
      rollback()
      logger.warn(
        {
          attempt,
          maxRetries: delays.length,
          delayMs: delay,
          error: error instanceof Error ? error.message : String(error),
        },
        'Transient model error — retrying agent step',
      )
      await sleep(delay)
      if (signal?.aborted) {
        throw error
      }
    }
  }
}
