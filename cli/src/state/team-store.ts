import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import {
  loadTeamConfig,
  saveTeamConfig,
  listTasks,
} from '@levelcode/common/utils/team-fs'

import type {
  TeamConfig,
  TeamMember,
  DevPhase,
} from '@levelcode/common/types/team-config'
import type { TeamProtocolMessage } from '@levelcode/common/types/team-protocol'

interface TeamState {
  activeTeam: TeamConfig | null
  members: TeamMember[]
  currentPhase: DevPhase
  tasks: { pending: number; inProgress: number; completed: number; blocked: number }
  messages: TeamProtocolMessage[]
  swarmEnabled: boolean
}

interface TeamActions {
  setActiveTeam: (team: TeamConfig | null) => void
  updateMember: (agentId: string, updates: Partial<TeamMember>) => void
  setPhase: (phase: DevPhase) => void
  updateTaskCounts: (counts: TeamState['tasks']) => void
  addMessage: (message: TeamProtocolMessage) => void
  clearMessages: () => void
  setSwarmEnabled: (enabled: boolean) => void
  reset: () => void
}

type TeamStore = TeamState & TeamActions

const initialState: TeamState = {
  activeTeam: null,
  members: [],
  currentPhase: 'planning',
  tasks: { pending: 0, inProgress: 0, completed: 0, blocked: 0 },
  messages: [],
  swarmEnabled: false,
}

export const useTeamStore = create<TeamStore>()(
  immer((set) => ({
    ...initialState,

    setActiveTeam: (team) =>
      set((state) => {
        state.activeTeam = team
        if (team) {
          state.members = team.members
          state.currentPhase = team.phase
        } else {
          state.members = []
          state.currentPhase = 'planning'
        }
      }),

    updateMember: (agentId, updates) =>
      set((state) => {
        const member = state.members.find((m) => m.agentId === agentId)
        if (member) {
          Object.assign(member, updates)
        }
      }),

    setPhase: (phase) =>
      set((state) => {
        state.currentPhase = phase
      }),

    updateTaskCounts: (counts) =>
      set((state) => {
        state.tasks = counts
      }),

    addMessage: (message) =>
      set((state) => {
        state.messages.push(message)
      }),

    clearMessages: () =>
      set((state) => {
        state.messages = []
      }),

    setSwarmEnabled: (enabled) =>
      set((state) => {
        state.swarmEnabled = enabled
      }),

    reset: () =>
      set(() => ({
        ...initialState,
        members: [],
        messages: [],
        tasks: { pending: 0, inProgress: 0, completed: 0, blocked: 0 },
      })),
  })),
)

// ── Filesystem sync helpers ──────────────────────────────────────────

/**
 * Load team config from disk into the store and refresh task counts.
 * Returns the loaded config, or null if the team was not found on disk.
 */
export function syncFromDisk(teamName: string): TeamConfig | null {
  const config = loadTeamConfig(teamName)
  if (!config) {
    return null
  }

  const { setActiveTeam, updateTaskCounts } = useTeamStore.getState()
  setActiveTeam(config)

  const tasks = listTasks(teamName)
  updateTaskCounts({
    pending: tasks.filter((t) => t.status === 'pending').length,
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    blocked: tasks.filter((t) => t.status === 'blocked').length,
  })

  return config
}

/**
 * Write the current store state back to disk.
 * No-op if there is no active team.
 */
export function syncToDisk(): void {
  const { activeTeam, members, currentPhase } = useTeamStore.getState()
  if (!activeTeam) {
    return
  }

  const updated: TeamConfig = {
    ...activeTeam,
    members,
    phase: currentPhase,
  }
  saveTeamConfig(activeTeam.name, updated)
}

let pollingTimer: ReturnType<typeof setInterval> | null = null

/**
 * Start polling disk at the given interval and sync changes into the store.
 * Calling this while already polling will stop the previous timer first.
 */
export function startPolling(teamName: string, intervalMs = 3000): void {
  stopPolling()
  pollingTimer = setInterval(() => {
    syncFromDisk(teamName)
  }, intervalMs)
}

/**
 * Stop the disk-sync polling interval.
 */
export function stopPolling(): void {
  if (pollingTimer !== null) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

// ── React hook ───────────────────────────────────────────────────────

/**
 * React hook that syncs the team store with the filesystem.
 *
 * On mount:
 *   - Calls syncFromDisk to load the latest state
 *   - Starts polling every `intervalMs` (default 3000ms) to pick up changes
 *     made by other agents
 *
 * On unmount:
 *   - Stops the polling interval
 *
 * @param teamName  The team to sync. Pass null/undefined to skip syncing.
 * @param intervalMs  Polling interval in milliseconds (default 3000).
 */
export function useTeamSync(
  teamName: string | null | undefined,
  intervalMs = 3000,
): void {
  const teamNameRef = useRef(teamName)
  teamNameRef.current = teamName

  useEffect(() => {
    if (!teamNameRef.current) {
      return
    }

    const name = teamNameRef.current
    syncFromDisk(name)
    startPolling(name, intervalMs)

    return () => {
      stopPolling()
    }
  }, [teamName, intervalMs])
}
