import { useCallback } from 'react'

import { usePermissionProfileStore, type PermissionProfileName } from '../state/permission-profile-store'

export const PERMISSION_PROFILES: { name: PermissionProfileName; label: string; description: string }[] = [
  { name: 'readonly', label: 'Read Only', description: 'No file modifications, no command execution' },
  { name: 'sandboxed', label: 'Sandboxed', description: 'Commands in sandbox, file edits require approval' },
  { name: 'trusted', label: 'Trusted', description: 'Direct file edits, sandboxed network commands' },
  { name: 'godmode', label: 'God Mode', description: 'Full access, no restrictions' },
]

export function usePermissionProfile() {
  const activeProfile = usePermissionProfileStore((state) => state.activeProfile)
  const pendingDiffGate = usePermissionProfileStore((state) => state.pendingDiffGate)
  const telemetryEnabled = usePermissionProfileStore((state) => state.telemetryEnabled)
  const sandboxActive = usePermissionProfileStore((state) => state.sandboxActive)

  const setActiveProfile = usePermissionProfileStore((state) => state.setActiveProfile)
  const setPendingDiffGate = usePermissionProfileStore((state) => state.setPendingDiffGate)
  const approvePendingDiffGate = usePermissionProfileStore((state) => state.approvePendingDiffGate)
  const denyPendingDiffGate = usePermissionProfileStore((state) => state.denyPendingDiffGate)
  const toggleTelemetry = usePermissionProfileStore((state) => state.toggleTelemetry)
  const setTelemetryEnabled = usePermissionProfileStore((state) => state.setTelemetryEnabled)
  const setSandboxActive = usePermissionProfileStore((state) => state.setSandboxActive)

  const activeProfileInfo = PERMISSION_PROFILES.find((p) => p.name === activeProfile) ?? PERMISSION_PROFILES[1]

  const handleSetProfile = useCallback(
    (profile: PermissionProfileName) => {
      setActiveProfile(profile)
    },
    [setActiveProfile],
  )

  return {
    activeProfile,
    activeProfileInfo,
    availableProfiles: PERMISSION_PROFILES,
    pendingDiffGate,
    telemetryEnabled,
    sandboxActive,
    setActiveProfile: handleSetProfile,
    setPendingDiffGate,
    approvePendingDiffGate,
    denyPendingDiffGate,
    toggleTelemetry,
    setTelemetryEnabled,
    setSandboxActive,
  }
}
