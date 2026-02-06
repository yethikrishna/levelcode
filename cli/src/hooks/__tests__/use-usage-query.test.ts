import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'

import {
  resetActivityQueryCache,
  getActivityQueryData,
  setActivityQueryData,
  invalidateActivityQuery,
  removeActivityQuery,
} from '../use-activity-query'
import {
  fetchUsageData,
  usageQueryKeys,
} from '../use-usage-query'


beforeEach(() => {
  resetActivityQueryCache()
})

describe('fetchUsageData', () => {
  afterEach(() => {
    mock.restore()
  })

  test('should return mock usage data in standalone mode', async () => {
    const result = await fetchUsageData({ authToken: 'test-token' })

    expect(result.type).toBe('usage-response')
    expect(result.usage).toBe(0)
    expect(result.remainingBalance).toBe(999999)
    expect(result.autoTopupEnabled).toBe(false)
  })

  test('should return consistent mock data regardless of auth token', async () => {
    const result1 = await fetchUsageData({ authToken: 'token-1' })
    const result2 = await fetchUsageData({ authToken: 'token-2' })

    expect(result1).toEqual(result2)
  })

  test('should return data with expected shape', async () => {
    const result = await fetchUsageData({ authToken: 'test-token' })

    expect(result).toEqual({
      type: 'usage-response',
      usage: 0,
      remainingBalance: 999999,
      balanceBreakdown: {
        free: 999999,
        paid: 0,
      },
      next_quota_reset: null,
      autoTopupEnabled: false,
    })
  })
})

describe('usageQueryKeys', () => {
  test('all returns base query key', () => {
    expect(usageQueryKeys.all).toEqual(['usage'])
  })

  test('current returns extended query key', () => {
    expect(usageQueryKeys.current()).toEqual(['usage', 'current'])
  })

  test('current returns new array instance each call', () => {
    const first = usageQueryKeys.current()
    const second = usageQueryKeys.current()
    expect(first).not.toBe(second)
    expect(first).toEqual(second)
  })

  test('query keys can be used for cache operations', () => {
    const mockData = {
      type: 'usage-response' as const,
      usage: 50,
      remainingBalance: 200,
      next_quota_reset: null,
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toEqual(mockData)
  })
})

describe('useRefreshUsage behavior', () => {
  // Note: useRefreshUsage is a React hook that wraps invalidateActivityQuery.
  // We can't call it directly outside a component, but we can test the
  // underlying invalidation behavior it uses.

  afterEach(() => {
    mock.restore()
    resetActivityQueryCache()
  })

  test('invalidating usage query preserves cached data', () => {
    const mockData = {
      type: 'usage-response' as const,
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    // Pre-populate cache
    setActivityQueryData(usageQueryKeys.current(), mockData)
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toEqual(mockData)

    // Call the underlying invalidation function (what useRefreshUsage wraps)
    invalidateActivityQuery(usageQueryKeys.current())

    // Data should still exist (invalidation doesn't remove data)
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toEqual(mockData)
  })

  test('invalidation marks data as stale for refetching', () => {
    const mockData = {
      type: 'usage-response' as const,
      usage: 200,
      remainingBalance: 300,
      next_quota_reset: '2024-03-01T00:00:00.000Z',
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)
    invalidateActivityQuery(usageQueryKeys.current())

    // Data is still accessible (stale but usable)
    const cached = getActivityQueryData<typeof mockData>(
      usageQueryKeys.current(),
    )
    expect(cached?.usage).toBe(200)
    expect(cached?.remainingBalance).toBe(300)
  })
})

describe('usage query cache behavior', () => {
  afterEach(() => {
    mock.restore()
    resetActivityQueryCache()
  })

  test('should store and retrieve usage data from cache', () => {
    const mockData = {
      type: 'usage-response' as const,
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toEqual(mockData)
  })

  test('should update cache when new data is set', () => {
    const initialData = {
      type: 'usage-response' as const,
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    const updatedData = {
      type: 'usage-response' as const,
      usage: 150,
      remainingBalance: 450,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    setActivityQueryData(usageQueryKeys.current(), initialData)
    expect(
      getActivityQueryData<typeof initialData>(usageQueryKeys.current())?.usage,
    ).toBe(100)

    setActivityQueryData(usageQueryKeys.current(), updatedData)
    expect(
      getActivityQueryData<typeof initialData>(usageQueryKeys.current())?.usage,
    ).toBe(150)
  })

  test('should preserve data after invalidation', () => {
    const mockData = {
      type: 'usage-response' as const,
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)
    invalidateActivityQuery(usageQueryKeys.current())

    // Data should still be accessible
    const cached = getActivityQueryData<typeof mockData>(
      usageQueryKeys.current(),
    )
    expect(cached).toEqual(mockData)
  })

  test('should handle cache removal', () => {
    const mockData = {
      type: 'usage-response' as const,
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toBeDefined()

    removeActivityQuery(usageQueryKeys.current())
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toBeUndefined()
  })

  test('should handle zero and null values correctly', () => {
    const mockData = {
      type: 'usage-response' as const,
      usage: 0,
      remainingBalance: 0,
      balanceBreakdown: { free: 0, paid: 0 },
      next_quota_reset: null,
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)
    const cached = getActivityQueryData<typeof mockData>(
      usageQueryKeys.current(),
    )

    expect(cached?.usage).toBe(0)
    expect(cached?.remainingBalance).toBe(0)
    expect(cached?.next_quota_reset).toBeNull()
  })

  test('reset clears usage cache', () => {
    const mockData = {
      type: 'usage-response' as const,
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: null,
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toBeDefined()

    resetActivityQueryCache()
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toBeUndefined()
  })

  test('multiple invalidations preserve data', () => {
    const mockData = {
      type: 'usage-response' as const,
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)

    // Invalidate multiple times
    invalidateActivityQuery(usageQueryKeys.current())
    invalidateActivityQuery(usageQueryKeys.current())
    invalidateActivityQuery(usageQueryKeys.current())

    // Data should still be there
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toEqual(mockData)
  })
})
