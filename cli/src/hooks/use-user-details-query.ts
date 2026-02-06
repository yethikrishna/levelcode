import { useQuery } from '@tanstack/react-query'
import { isStandaloneMode } from '@levelcode/sdk'

import { getAuthToken } from '../utils/auth'
import { getApiClient, setApiClientAuthToken } from '../utils/levelcode-api'
import { logger as defaultLogger } from '../utils/logger'

import type {
  LevelCodeApiClient,
  UserField,
  UserDetails,
} from '../utils/levelcode-api'
import type { Logger } from '@levelcode/common/types/contracts/logger'

// Re-export types for backwards compatibility
export type { UserField, UserDetails }

// Query keys for type-safe cache management
export const userDetailsQueryKeys = {
  all: ['userDetails'] as const,
  fields: (fields: readonly UserField[]) =>
    [...userDetailsQueryKeys.all, ...fields] as const,
}

interface FetchUserDetailsParams<T extends UserField> {
  authToken: string
  fields: readonly T[]
  logger?: Logger
  apiClient?: LevelCodeApiClient
}

/**
 * Fetches specific user details from the /api/v1/me endpoint.
 * In standalone mode, returns mock user details without hitting the backend.
 */
export async function fetchUserDetails<T extends UserField>({
  authToken,
  fields,
  logger = defaultLogger,
  apiClient: providedApiClient,
}: FetchUserDetailsParams<T>): Promise<UserDetails<T> | null> {
  if (isStandaloneMode()) {
    const mock = {} as Record<string, string | null>
    for (const field of fields) {
      if (field === 'id') mock[field] = 'standalone-user'
      else if (field === 'email') mock[field] = 'standalone@local'
      else mock[field] = null
    }
    return mock as UserDetails<T>
  }

  const apiClient =
    providedApiClient ??
    (() => {
      setApiClientAuthToken(authToken)
      return getApiClient()
    })()

  const response = await apiClient.me(fields)

  if (!response.ok) {
    logger.error(
      { status: response.status, fields },
      'Failed to fetch user details from /api/v1/me',
    )
    throw new Error(`Failed to fetch user details (HTTP ${response.status})`)
  }

  return response.data ?? null
}

export interface UseUserDetailsQueryDeps<T extends UserField> {
  fields: readonly T[]
  logger?: Logger
  enabled?: boolean
}

/**
 * Hook to fetch specific user details
 */
export function useUserDetailsQuery<T extends UserField>({
  fields,
  logger = defaultLogger,
  enabled = true,
}: UseUserDetailsQueryDeps<T>) {
  const authToken = getAuthToken()
  const standalone = isStandaloneMode()

  return useQuery({
    queryKey: userDetailsQueryKeys.fields(fields),
    queryFn: async () => {
      if (!authToken && !standalone) {
        throw new Error('No auth token available')
      }
      return fetchUserDetails({ authToken: authToken ?? '', fields, logger })
    },
    enabled: enabled && (standalone || !!authToken),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
