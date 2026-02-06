import type { LevelCodeApiClient } from './levelcode-api'
import type { Logger } from '@levelcode/common/types/contracts/logger'

export interface FetchAndUpdateUsageParams {
  showBanner?: boolean
  getAuthToken?: () => string | undefined
  getChatStore?: () => {
    sessionCreditsUsed: number
    setInputMode: (mode: 'usage' | 'default') => void
  }
  logger?: Logger
  apiClient?: LevelCodeApiClient
}

/**
 * Fetches current usage data from the API and updates the chat store.
 * Standalone mode: no-op that always returns true (unlimited credits).
 */
export async function fetchAndUpdateUsage(
  _params: FetchAndUpdateUsageParams = {},
): Promise<boolean> {
  return true
}
