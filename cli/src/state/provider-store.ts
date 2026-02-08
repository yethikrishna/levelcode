import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import {
  loadProviderConfig,
  saveProviderConfig,
  addProvider as addProviderToConfig,
  removeProvider as removeProviderFromConfig,
  setActiveModel as setActiveModelInConfig,
  updateUserSettings as updateUserSettingsInConfig,
} from '@levelcode/common/providers/provider-fs'
import {
  fetchModelCatalog,
  loadCachedCatalog,
  shouldRefreshCatalog,
} from '@levelcode/common/providers/model-catalog'
import {
  autoDetectLocalProviders,
  mergeAutoDetectedProviders,
} from '@levelcode/common/providers/auto-detect'

import type {
  ProvidersConfig,
  ProviderEntry,
  UserSettings,
  ModelCatalogEntry,
} from '@levelcode/common/providers/provider-types'
import { DEFAULT_PROVIDERS_CONFIG } from '@levelcode/common/providers/provider-types'

interface ProviderStoreState {
  config: ProvidersConfig
  catalogModels: ModelCatalogEntry[]
  isLoading: boolean
  isInitialized: boolean
}

interface ProviderStoreActions {
  loadProviders: () => Promise<void>
  addProvider: (id: string, entry: ProviderEntry) => Promise<void>
  removeProvider: (id: string) => Promise<void>
  setActiveModel: (providerId: string, modelId: string) => Promise<void>
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>
  refreshCatalog: () => Promise<void>
  runAutoDetect: () => Promise<void>
}

type ProviderStore = ProviderStoreState & ProviderStoreActions

const initialState: ProviderStoreState = {
  config: DEFAULT_PROVIDERS_CONFIG,
  catalogModels: [],
  isLoading: false,
  isInitialized: false,
}

export const useProviderStore = create<ProviderStore>()(
  immer((set, get) => ({
    ...initialState,

    loadProviders: async () => {
      set((state) => {
        state.isLoading = true
      })

      try {
        const config = await loadProviderConfig()

        set((state) => {
          state.config = config
        })

        // Load or refresh the model catalog
        let catalogModels: ModelCatalogEntry[]

        if (shouldRefreshCatalog(config.settings, config.catalogLastUpdated)) {
          catalogModels = await fetchModelCatalog()

          set((state) => {
            state.config.catalogLastUpdated = new Date().toISOString()
          })

          await saveProviderConfig(get().config)
        } else {
          catalogModels = await loadCachedCatalog()
        }

        set((state) => {
          state.catalogModels = catalogModels
        })

        // Auto-detect local providers if enabled
        if (config.settings.autoDetectLocal) {
          const detected = await autoDetectLocalProviders()
          const merged = mergeAutoDetectedProviders(get().config, detected)

          set((state) => {
            state.config = merged
          })

          await saveProviderConfig(get().config)
        }
      } finally {
        set((state) => {
          state.isInitialized = true
          state.isLoading = false
        })
      }
    },

    addProvider: async (id, entry) => {
      await addProviderToConfig(id, entry)

      set((state) => {
        state.config.providers[id] = entry
      })
    },

    removeProvider: async (id) => {
      await removeProviderFromConfig(id)

      set((state) => {
        delete state.config.providers[id]

        // Clear active provider/model if the removed provider was active
        if (state.config.activeProvider === id) {
          state.config.activeProvider = null
          state.config.activeModel = null
        }
      })
    },

    setActiveModel: async (providerId, modelId) => {
      await setActiveModelInConfig(providerId, modelId)

      set((state) => {
        state.config.activeProvider = providerId
        state.config.activeModel = modelId
      })
    },

    updateSettings: async (patch) => {
      await updateUserSettingsInConfig(patch)

      set((state) => {
        Object.assign(state.config.settings, patch)
      })
    },

    refreshCatalog: async () => {
      const catalogModels = await fetchModelCatalog()

      set((state) => {
        state.catalogModels = catalogModels
        state.config.catalogLastUpdated = new Date().toISOString()
      })

      await saveProviderConfig(get().config)
    },

    runAutoDetect: async () => {
      const detected = await autoDetectLocalProviders()
      const merged = mergeAutoDetectedProviders(get().config, detected)

      set((state) => {
        state.config = merged
      })

      await saveProviderConfig(get().config)
    },
  })),
)
