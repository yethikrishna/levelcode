import { getValidOAuthToken } from '@levelcode/common/providers/oauth-storage'
import { OAUTH_CONFIGS } from '@levelcode/common/providers/oauth-configs'

let refreshInterval: ReturnType<typeof setInterval> | null = null

export function startOAuthRefreshManager(): void {
  if (refreshInterval) return

  // Check tokens every 5 minutes
  refreshInterval = setInterval(async () => {
    for (const [providerId, config] of Object.entries(OAUTH_CONFIGS)) {
      try {
        await getValidOAuthToken(providerId, config)
      } catch {
        // Silently ignore refresh errors
      }
    }
  }, 5 * 60 * 1000)
}

export function stopOAuthRefreshManager(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}
