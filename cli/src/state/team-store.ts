import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

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
