import { describe, it, expect } from 'bun:test'

import {
  isRetryableStepError,
  withTransientStepRetry,
  STEP_RETRY_DELAYS_MS,
  MAX_STEP_RETRIES,
} from '../step-retry'
import type { StepRetryOptions } from '../step-retry'

function errorWithStatus(statusCode: number, message = 'model call failed'): Error {
  return Object.assign(new Error(message), { statusCode })
}

const noopLogger = { warn: (_obj: Record<string, unknown>, _msg: string) => {} }

function makeOptions(overrides: Partial<StepRetryOptions> = {}): StepRetryOptions {
  return {
    logger: noopLogger,
    rollback: () => {},
    delayFn: async () => {},
    ...overrides,
  }
}

describe('isRetryableStepError', () => {
  it('classifies server/rate-limit statuses as retryable', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableStepError(errorWithStatus(status))).toBe(true)
    }
  })

  it('classifies deterministic statuses as non-retryable', () => {
    for (const status of [400, 401, 402, 403, 404, 422]) {
      expect(isRetryableStepError(errorWithStatus(status))).toBe(false)
    }
  })

  it('classifies network-flavored messages as retryable', () => {
    expect(isRetryableStepError(new Error('fetch failed'))).toBe(true)
    expect(isRetryableStepError(new Error('connect ECONNREFUSED 127.0.0.1:80'))).toBe(true)
    expect(isRetryableStepError(new Error('socket hang up'))).toBe(true)
    expect(isRetryableStepError(new Error('Connection refused (os error 111)'))).toBe(true)
  })

  it('classifies unrelated errors as non-retryable', () => {
    expect(isRetryableStepError(new Error('unexpected token in JSON'))).toBe(false)
    expect(isRetryableStepError('not even an error')).toBe(false)
    expect(isRetryableStepError(new Error('Agent template not found for type: x'))).toBe(false)
  })

  it('sees through AI SDK RetryError lastError wrapping', () => {
    const retryError = Object.assign(new Error('Queue full'), {
      lastError: errorWithStatus(503, 'overloaded'),
    })
    expect(isRetryableStepError(retryError)).toBe(true)

    const networkRetry = Object.assign(new Error('Queue full'), {
      lastError: new Error('ECONNRESET'),
    })
    expect(isRetryableStepError(networkRetry)).toBe(true)

    const fatalRetry = Object.assign(new Error('Queue full'), {
      lastError: errorWithStatus(400),
    })
    expect(isRetryableStepError(fatalRetry)).toBe(false)
  })

  it('never retries when the signal is aborted', () => {
    const controller = new AbortController()
    controller.abort()
    expect(isRetryableStepError(errorWithStatus(429), controller.signal)).toBe(false)
    const abortError = Object.assign(new Error('This operation was aborted'), {
      name: 'AbortError',
    })
    expect(isRetryableStepError(abortError, undefined)).toBe(false)
  })
})

describe('withTransientStepRetry', () => {
  it('returns the step result without rollback on first-try success', async () => {
    let calls = 0
    let rollbacks = 0
    const result = await withTransientStepRetry(
      async () => {
        calls++
        return 'done'
      },
      makeOptions({ rollback: () => rollbacks++ }),
    )
    expect(result).toBe('done')
    expect(calls).toBe(1)
    expect(rollbacks).toBe(0)
  })

  it('retries a transient failure after rolling back and succeeds', async () => {
    let calls = 0
    let rollbacks = 0
    const delays: number[] = []
    const result = await withTransientStepRetry(
      async () => {
        calls++
        if (calls === 1) throw errorWithStatus(429)
        return 'recovered'
      },
      makeOptions({
        rollback: () => rollbacks++,
        delayFn: async (ms) => {
          delays.push(ms)
        },
      }),
    )
    expect(result).toBe('recovered')
    expect(calls).toBe(2)
    expect(rollbacks).toBe(1)
    expect(delays).toEqual([STEP_RETRY_DELAYS_MS[0]])
  })

  it('rethrows after exhausting the retry budget', async () => {
    let calls = 0
    let rollbacks = 0
    const lastError = errorWithStatus(503)
    await expect(
      withTransientStepRetry(
        async () => {
          calls++
          throw lastError
        },
        makeOptions({ rollback: () => rollbacks++ }),
      ),
    ).rejects.toBe(lastError)
    expect(calls).toBe(MAX_STEP_RETRIES + 1)
    expect(rollbacks).toBe(MAX_STEP_RETRIES)
  })

  it('fails immediately on a deterministic error', async () => {
    let calls = 0
    let rollbacks = 0
    const badRequest = errorWithStatus(400)
    await expect(
      withTransientStepRetry(
        async () => {
          calls++
          throw badRequest
        },
        makeOptions({ rollback: () => rollbacks++ }),
      ),
    ).rejects.toBe(badRequest)
    expect(calls).toBe(1)
    expect(rollbacks).toBe(0)
  })

  it('aborts without another attempt when the signal flips during backoff', async () => {
    const controller = new AbortController()
    let calls = 0
    let rollbacks = 0
    const rateLimited = errorWithStatus(429)
    await expect(
      withTransientStepRetry(
        async () => {
          calls++
          throw rateLimited
        },
        makeOptions({
          signal: controller.signal,
          rollback: () => rollbacks++,
          delayFn: async () => {
            controller.abort()
          },
        }),
      ),
    ).rejects.toBe(rateLimited)
    expect(calls).toBe(1)
    expect(rollbacks).toBe(1)
  })
})
