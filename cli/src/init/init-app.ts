import {
  getClaudeOAuthCredentials,
  getValidClaudeOAuthCredentials,
} from '@levelcode/sdk'
import { enableMapSet } from 'immer'

import { initializeThemeStore } from '../hooks/use-theme'
import { setProjectRoot } from '../project-files'
import { useProviderStore } from '../state/provider-store'
import { initTimestampFormatter } from '../utils/helpers'
import { enableManualThemeRefresh } from '../utils/theme-system'
import { initializeDirenv } from './init-direnv'

export async function initializeApp(params: { cwd?: string }): Promise<void> {
  if (params.cwd) {
    process.chdir(params.cwd)
  }
  const baseCwd = process.cwd()
  setProjectRoot(baseCwd)

  // Initialize direnv environment before anything else
  initializeDirenv()

  enableMapSet()
  initializeThemeStore()
  enableManualThemeRefresh()
  initTimestampFormatter()

  // Load provider configuration from providers.json
  // This ensures the user's configured providers/models are available
  await useProviderStore.getState().loadProviders()

  // Refresh Claude OAuth credentials in the background if they exist
  // This ensures the subscription status is up-to-date on startup
  const claudeCredentials = getClaudeOAuthCredentials()
  if (claudeCredentials) {
    getValidClaudeOAuthCredentials().catch((error) => {
      // Log refresh errors at debug level - will be retried on next API call
      console.debug('Failed to refresh Claude OAuth credentials:', error)
    })
  }
}
