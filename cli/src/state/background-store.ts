import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type BackgroundTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface BackgroundTask {
  id: string
  agentId: string
  agentType: string
  prompt: string
  status: BackgroundTaskStatus
  createdAt: number
  startedAt?: number
  completedAt?: number
  result?: string
  error?: string
  progress?: number
}

interface BackgroundState {
  tasks: BackgroundTask[]
  isBackgroundPanelOpen: boolean
}

interface BackgroundActions {
  spawnTask: (agentId: string, agentType: string, prompt: string) => string
  updateTask: (id: string, updates: Partial<BackgroundTask>) => void
  cancelTask: (id: string) => void
  removeTask: (id: string) => void
  clearCompletedTasks: () => void
  toggleBackgroundPanel: () => void
  openBackgroundPanel: () => void
  closeBackgroundPanel: () => void
  reset: () => void
}

type BackgroundStore = BackgroundState & BackgroundActions

const initialState: BackgroundState = {
  tasks: [],
  isBackgroundPanelOpen: false,
}

export const useBackgroundStore = create<BackgroundStore>()(
  immer((set) => ({
    ...initialState,

    spawnTask: (agentId, agentType, prompt) => {
      const id = crypto.randomUUID()
      const task: BackgroundTask = {
        id,
        agentId,
        agentType,
        prompt,
        status: 'pending',
        createdAt: Date.now(),
      }
      set((state) => {
        state.tasks.unshift(task)
      })
      return id
    },

    updateTask: (id, updates) =>
      set((state) => {
        const task = state.tasks.find((t) => t.id === id)
        if (task) {
          Object.assign(task, updates)
          if (updates.status === 'running' && !task.startedAt) {
            task.startedAt = Date.now()
          }
          if (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'cancelled') {
            task.completedAt = Date.now()
          }
        }
      }),

    cancelTask: (id) =>
      set((state) => {
        const task = state.tasks.find((t) => t.id === id)
        if (task && (task.status === 'pending' || task.status === 'running')) {
          task.status = 'cancelled'
          task.completedAt = Date.now()
        }
      }),

    removeTask: (id) =>
      set((state) => {
        const idx = state.tasks.findIndex((t) => t.id === id)
        if (idx !== -1) {
          state.tasks.splice(idx, 1)
        }
      }),

    clearCompletedTasks: () =>
      set((state) => {
        state.tasks = state.tasks.filter(
          (t) => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled',
        )
      }),

    toggleBackgroundPanel: () =>
      set((state) => {
        state.isBackgroundPanelOpen = !state.isBackgroundPanelOpen
      }),

    openBackgroundPanel: () =>
      set((state) => {
        state.isBackgroundPanelOpen = true
      }),

    closeBackgroundPanel: () =>
      set((state) => {
        state.isBackgroundPanelOpen = false
      }),

    reset: () =>
      set((state) => {
        state.tasks = initialState.tasks
        state.isBackgroundPanelOpen = initialState.isBackgroundPanelOpen
      }),
  })),
)
