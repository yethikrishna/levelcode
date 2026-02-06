import { describe, test, expect, beforeEach, mock } from 'bun:test'

import { fetchAndUpdateUsage } from '../fetch-usage'

import type { LevelCodeApiClient } from '../levelcode-api'
import type { FetchAndUpdateUsageParams } from '../fetch-usage'
import type { Logger } from '@levelcode/common/types/contracts/logger'

describe('fetchAndUpdateUsage (standalone mode - no-op)', () => {
  let setInputModeMock: ReturnType<typeof mock>
  let getAuthTokenMock: ReturnType<typeof mock>
  let loggerMock: Logger
  let apiClientMock: LevelCodeApiClient

  const createMockApiClient = (
    usageMock: ReturnType<typeof mock>,
  ): LevelCodeApiClient => ({
    get: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as LevelCodeApiClient['get'],
    post: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as LevelCodeApiClient['post'],
    put: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as LevelCodeApiClient['put'],
    patch: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as LevelCodeApiClient['patch'],
    delete: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as LevelCodeApiClient['delete'],
    request: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as LevelCodeApiClient['request'],
    me: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as LevelCodeApiClient['me'],
    usage: usageMock as LevelCodeApiClient['usage'],
    loginCode: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as LevelCodeApiClient['loginCode'],
    loginStatus: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as LevelCodeApiClient['loginStatus'],
    referral: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as LevelCodeApiClient['referral'],
    publish: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as LevelCodeApiClient['publish'],
    logout: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as LevelCodeApiClient['logout'],
    baseUrl: 'https://test.levelcode.com',
    authToken: 'test-auth-token',
  })

  const createDefaultParams = (
    overrides: Partial<FetchAndUpdateUsageParams> = {},
  ): FetchAndUpdateUsageParams => ({
    getAuthToken: getAuthTokenMock,
    getChatStore: () => ({
      sessionCreditsUsed: 150,
      setInputMode: setInputModeMock,
    }),
    logger: loggerMock,
    apiClient: apiClientMock,
    ...overrides,
  })

  beforeEach(() => {
    setInputModeMock = mock(() => {})
    getAuthTokenMock = mock(() => 'test-auth-token')
    loggerMock = {
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
      debug: mock(() => {}),
    }
    const usageMock = mock(async () => ({
      ok: true,
      status: 200,
      data: {
        type: 'usage-response',
        usage: 100,
        remainingBalance: 500,
        next_quota_reset: '2024-02-01T00:00:00.000Z',
      },
    }))
    apiClientMock = createMockApiClient(usageMock)
  })

  test('always returns true (no-op in standalone mode)', async () => {
    const result = await fetchAndUpdateUsage(createDefaultParams())
    expect(result).toBe(true)
  })

  test('does not call setInputMode', async () => {
    const result = await fetchAndUpdateUsage(createDefaultParams())
    expect(result).toBe(true)
    expect(setInputModeMock).not.toHaveBeenCalled()
  })

  test('returns true even with showBanner parameter', async () => {
    const result = await fetchAndUpdateUsage(
      createDefaultParams({ showBanner: true }),
    )
    expect(result).toBe(true)
  })

  test('does not call the API', async () => {
    const usageMock = mock(async () => ({
      ok: true,
      status: 200,
      data: {
        type: 'usage-response',
        usage: 100,
        remainingBalance: 500,
        next_quota_reset: '2024-02-01T00:00:00.000Z',
      },
    }))
    const client = createMockApiClient(usageMock)

    await fetchAndUpdateUsage(createDefaultParams({ apiClient: client }))
    expect(usageMock).not.toHaveBeenCalled()
  })

  test('returns true when user is not authenticated', async () => {
    getAuthTokenMock.mockReturnValue(undefined)
    const result = await fetchAndUpdateUsage(createDefaultParams())
    expect(result).toBe(true)
  })

  test('returns true on any input parameters', async () => {
    const usageMock = mock(async () => {
      throw new Error('Network connection failed')
    })
    const client = createMockApiClient(usageMock)

    const result = await fetchAndUpdateUsage(
      createDefaultParams({ apiClient: client }),
    )
    expect(result).toBe(true)
  })

  test('returns true for concurrent calls', async () => {
    const results = await Promise.all([
      fetchAndUpdateUsage(createDefaultParams()),
      fetchAndUpdateUsage(createDefaultParams()),
      fetchAndUpdateUsage(createDefaultParams({ showBanner: true })),
    ])
    expect(results).toEqual([true, true, true])
  })

  test('returns true with zero session credits', async () => {
    const result = await fetchAndUpdateUsage(
      createDefaultParams({
        getChatStore: () => ({
          sessionCreditsUsed: 0,
          setInputMode: setInputModeMock,
        }),
      }),
    )
    expect(result).toBe(true)
  })
})
