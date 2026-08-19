import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type PermissionProfileName = 'readonly' | 'sandboxed' | 'trusted' | 'godmode'

interface PermissionProfileState {
  activeProfile: PermissionProfileName
  pendingDiffGate: {
    id: string
    toolName: string
    filePath?: string
    diff?: string
    timestamp: number
  } | null
  telemetryEnabled: boolean
  sandboxActive: boolean
}

interface PermissionProfileActions {
  setActiveProfile: (profile: PermissionProfileName) => void
  setPendingDiffGate: (gate: PermissionProfileState['pendingDiffGate']) => void
  approvePendingDiffGate: () => void
  denyPendingDiffGate: () => void
  toggleTelemetry: () => void
  setTelemetryEnabled: (enabled: boolean) => void
  setSandboxActive: (active: boolean) => void
  reset: () => void
}

type PermissionProfileStore = PermissionProfileState & PermissionProfileActions

const DEFAULT_PROFILE: PermissionProfileName = 'sandboxed'

const initialState: PermissionProfileState = {
  activeProfile: DEFAULT_PROFILE,
  pendingDiffGate: null,
  telemetryEnabled: false,
  sandboxActive: true,
}

export const usePermissionProfileStore = create<PermissionProfileStore>()(
  immer((set) => ({
    ...initialState,

    setActiveProfile: (profile) =>
      set((state) => {
        state.activeProfile = profile
        state.sandboxActive = profile === 'sandboxed' || profile === 'readonly'
      }),

    setPendingDiffGate: (gate) =>
      set((state) => {
        state.pendingDiffGate = gate
      }),

    approvePendingDiffGate: () =>
      set((state) => {
        state.pendingDiffGate = null
      }),

    denyPendingDiffGate: () =>
      set((state) => {
        state.pendingDiffGate = null
      }),

    toggleTelemetry: () =>
      set((state) => {
        state.telemetryEnabled = !state.telemetryEnabled
      }),

    setTelemetryEnabled: (enabled) =>
      set((state) => {
        state.telemetryEnabled = enabled
      }),

    setSandboxActive: (active) =>
      set((state) => {
        state.sandboxActive = active
      }),

    reset: () =>
      set((state) => {
        state.activeProfile = initialState.activeProfile
        state.pendingDiffGate = initialState.pendingDiffGate
        state.telemetryEnabled = initialState.telemetryEnabled
        state.sandboxActive = initialState.sandboxActive
      }),
  })),
)
