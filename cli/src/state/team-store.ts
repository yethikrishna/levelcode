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

export interface TeamMetrics {
  totalTasksCompleted: number
  totalTokensUsed: number
  totalCostUsd: number
  agentUtilization: Record<string, number>
  velocityTasksPerHour: number
  avgTaskCompletionTimeMs: number
  errorRate: number
  lastUpdatedAt: number
}

interface TeamState {
  activeTeam: TeamConfig | null
  members: TeamMember[]
  currentPhase: DevPhase
  tasks: { pending: number; inProgress: number; completed: number; blocked: number }
  messages: TeamProtocolMessage[]
  swarmEnabled: boolean
  isMetricsPanelOpen: boolean
  metrics: TeamMetrics
}

interface TeamActions {
  setActiveTeam: (team: TeamConfig | null) => void
  updateMember: (agentId: string, updates: Partial<TeamMember>) => void
  setPhase: (phase: DevPhase) => void
  updateTaskCounts: (counts: TeamState['tasks']) => void
  addMessage: (message: TeamProtocolMessage) => void
  clearMessages: () => void
  setSwarmEnabled: (enabled: boolean) => void
  openMetricsPanel: () => void
  closeMetricsPanel: () => void
  toggleMetricsPanel: () => void
  updateMetrics: (updates: Partial<TeamMetrics>) => void
  reset: () => void
}

type TeamStore = TeamState & TeamActions

const initialMetrics: TeamMetrics = {
  totalTasksCompleted: 0,
  totalTokensUsed: 0,
  totalCostUsd: 0,
  agentUtilization: {},
  velocityTasksPerHour: 0,
  avgTaskCompletionTimeMs: 0,
  errorRate: 0,
  lastUpdatedAt: 0,
}

const initialState: TeamState = {
  activeTeam: null,
  members: [],
  currentPhase: 'planning',
  tasks: { pending: 0, inProgress: 0, completed: 0, blocked: 0 },
  messages: [],
  swarmEnabled: false,
  isMetricsPanelOpen: false,
  metrics: initialMetrics,
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

    openMetricsPanel: () =>
      set((state) => {
        state.isMetricsPanelOpen = true
      }),

    closeMetricsPanel: () =>
      set((state) => {
        state.isMetricsPanelOpen = false
      }),

    toggleMetricsPanel: () =>
      set((state) => {
        state.isMetricsPanelOpen = !state.isMetricsPanelOpen
      }),

    updateMetrics: (updates) =>
      set((state) => {
        Object.assign(state.metrics, updates, { lastUpdatedAt: Date.now() })
      }),

    reset: () =>
      set(() => ({
        ...initialState,
        members: [],
        messages: [],
        tasks: { pending: 0, inProgress: 0, completed: 0, blocked: 0 },
        metrics: { ...initialMetrics },
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
export async function syncToDisk(): Promise<void> {
  const { activeTeam, members, currentPhase } = useTeamStore.getState()
  if (!activeTeam) {
    return
  }

  const updated: TeamConfig = {
    ...activeTeam,
    members,
    phase: currentPhase,
  }
  await saveTeamConfig(activeTeam.name, updated)
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
