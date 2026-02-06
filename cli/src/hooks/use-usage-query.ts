import { env } from '@levelcode/common/env'
import { useCallback } from 'react'

import { invalidateActivityQuery, useActivityQuery } from './use-activity-query'
import { getAuthToken } from '../utils/auth'
import { logger as defaultLogger } from '../utils/logger'

import type { ClientEnv } from '@levelcode/common/types/contracts/env'
import type { Logger } from '@levelcode/common/types/contracts/logger'

// Query keys for type-safe cache management
export const usageQueryKeys = {
  all: ['usage'] as const,
  current: () => [...usageQueryKeys.all, 'current'] as const,
}

interface UsageResponse {
  type: 'usage-response'
  usage: number
  remainingBalance: number | null
  balanceBreakdown?: {
    free: number
    paid: number
    ad?: number
    referral?: number
    admin?: number
  }
  next_quota_reset: string | null
  autoTopupEnabled?: boolean
}

interface FetchUsageParams {
  authToken: string
  logger?: Logger
  clientEnv?: ClientEnv
}

/**
 * Fetches usage data from the API
 * Standalone mode: returns mock unlimited credits data without making API calls.
 */
export async function fetchUsageData({
  authToken: _authToken,
  logger: _logger = defaultLogger,
  clientEnv: _clientEnv = env,
}: FetchUsageParams): Promise<UsageResponse> {
  return {
    type: 'usage-response',
    usage: 0,
    remainingBalance: 999999,
    balanceBreakdown: {
      free: 999999,
      paid: 0,
    },
    next_quota_reset: null,
    autoTopupEnabled: false,
  }
}

export interface UseUsageQueryDeps {
  logger?: Logger
  enabled?: boolean
  refetchInterval?: number | false
  /** Refetch stale data when user becomes active after being idle */
  refetchOnActivity?: boolean
  /** Pause polling when user is idle */
  pauseWhenIdle?: boolean
  /** Time in ms to consider user idle (default: 30 seconds) */
  idleThreshold?: number
}

/**
 * Hook to fetch usage data from the API
 * Uses the activity-aware query hook for terminal-specific optimizations
 */
export function useUsageQuery(deps: UseUsageQueryDeps = {}) {
  const {
    logger = defaultLogger,
    enabled = true,
    refetchInterval = false,
    refetchOnActivity = false,
    pauseWhenIdle = true,
    idleThreshold = 30_000,
  } = deps
  const authToken = getAuthToken()

  return useActivityQuery({
    queryKey: usageQueryKeys.current(),
    queryFn: () => fetchUsageData({ authToken: authToken!, logger }),
    enabled: enabled && !!authToken,
    staleTime: 0, // Always consider data stale for immediate refetching
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry failed usage queries
    refetchOnMount: 'always', // Always refetch on mount to get fresh data when banner opens
    refetchInterval, // Poll at specified interval (when banner is visible)
    refetchOnActivity,
    pauseWhenIdle,
    idleThreshold,
  })
}

/**
 * Hook to manually trigger a usage data refresh
 */
export function useRefreshUsage() {
  return useCallback(() => {
    invalidateActivityQuery(usageQueryKeys.current())
  }, [])
}
