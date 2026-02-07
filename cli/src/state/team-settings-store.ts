import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface TeamSettingsScreenState {
  settingsMode: boolean
  openSettingsScreen: () => void
  closeSettingsScreen: () => void
}

export const useTeamSettingsStore = create<TeamSettingsScreenState>()(
  immer((set) => ({
    settingsMode: false,
    openSettingsScreen: () => {
      set((state) => {
        state.settingsMode = true
      })
    },
    closeSettingsScreen: () => {
      set((state) => {
        state.settingsMode = false
      })
    },
  })),
)
