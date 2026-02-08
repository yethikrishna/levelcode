import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import {
  getOAuthToken,
  getValidOAuthToken,
  clearOAuthToken,
  isOAuthTokenValid,
} from '@levelcode/common/providers/oauth-storage'
import { OAUTH_CONFIGS } from '@levelcode/common/providers/oauth-configs'

import type { OAuthToken } from '@levelcode/common/providers/oauth-types'

type ConnectionStatus = 'connected' | 'disconnected' | 'expired' | 'refreshing'

interface OAuthStoreState {
  connectionStatuses: Record<string, ConnectionStatus>
  activeFlowProviderId: string | null
}

interface OAuthStoreActions {
  loadConnectionStatuses: () => Promise<void>
  startOAuthFlow: (providerId: string) => void
  completeOAuthFlow: (providerId: string, token: OAuthToken) => void
  cancelOAuthFlow: () => void
  disconnectProvider: (providerId: string) => Promise<void>
  refreshAllTokens: () => Promise<void>
}

type OAuthStore = OAuthStoreState & OAuthStoreActions

const initialState: OAuthStoreState = {
  connectionStatuses: {},
  activeFlowProviderId: null,
}

export const useOAuthStore = create<OAuthStore>()(
  immer((set) => ({
    ...initialState,

    loadConnectionStatuses: async () => {
      const statuses: Record<string, ConnectionStatus> = {}
      for (const providerId of Object.keys(OAUTH_CONFIGS)) {
        const token = await getOAuthToken(providerId)
        if (!token) {
          statuses[providerId] = 'disconnected'
        } else if (isOAuthTokenValid(token)) {
          statuses[providerId] = 'connected'
        } else {
          statuses[providerId] = 'expired'
        }
      }
      set((state) => {
        state.connectionStatuses = statuses
      })
    },

    startOAuthFlow: (providerId) => {
      set((state) => {
        state.activeFlowProviderId = providerId
      })
    },

    completeOAuthFlow: (providerId, _token) => {
      set((state) => {
        state.connectionStatuses[providerId] = 'connected'
        state.activeFlowProviderId = null
      })
    },

    cancelOAuthFlow: () => {
      set((state) => {
        state.activeFlowProviderId = null
      })
    },

    disconnectProvider: async (providerId) => {
      await clearOAuthToken(providerId)
      set((state) => {
        state.connectionStatuses[providerId] = 'disconnected'
      })
    },

    refreshAllTokens: async () => {
      for (const [providerId, config] of Object.entries(OAUTH_CONFIGS)) {
        if (!config.clientId) continue
        try {
          const token = await getValidOAuthToken(providerId, config)
          set((state) => {
            state.connectionStatuses[providerId] = token ? 'connected' : 'disconnected'
          })
        } catch {
          set((state) => {
            state.connectionStatuses[providerId] = 'disconnected'
          })
        }
      }
    },
  })),
)
