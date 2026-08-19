import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export interface AgentCostEntry {
  agentId: string
  agentType: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalCostUsd: number
  requestCount: number
  totalLatencyMs: number
  lastRequestAt: number
}

interface CostState {
  isDashboardOpen: boolean
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  totalCostUsd: number
  totalRequests: number
  totalLatencyMs: number
  sessionStartAt: number
  perAgentCosts: Record<string, AgentCostEntry>
}

interface CostActions {
  recordUsage: (params: {
    agentId: string
    agentType: string
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    costUsd: number
    latencyMs: number
  }) => void
  toggleDashboard: () => void
  openDashboard: () => void
  closeDashboard: () => void
  resetSession: () => void
}

type CostStore = CostState & CostActions

const initialState: CostState = {
  isDashboardOpen: false,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCacheReadTokens: 0,
  totalCacheWriteTokens: 0,
  totalCostUsd: 0,
  totalRequests: 0,
  totalLatencyMs: 0,
  sessionStartAt: Date.now(),
  perAgentCosts: {},
}

export const useCostStore = create<CostStore>()(
  immer((set) => ({
    ...initialState,

    recordUsage: ({ agentId, agentType, inputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0, costUsd, latencyMs }) =>
      set((state) => {
        state.totalInputTokens += inputTokens
        state.totalOutputTokens += outputTokens
        state.totalCacheReadTokens += cacheReadTokens
        state.totalCacheWriteTokens += cacheWriteTokens
        state.totalCostUsd += costUsd
        state.totalRequests += 1
        state.totalLatencyMs += latencyMs

        if (!state.perAgentCosts[agentId]) {
          state.perAgentCosts[agentId] = {
            agentId,
            agentType,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalCostUsd: 0,
            requestCount: 0,
            totalLatencyMs: 0,
            lastRequestAt: 0,
          }
        }
        const entry = state.perAgentCosts[agentId]
        entry.inputTokens += inputTokens
        entry.outputTokens += outputTokens
        entry.cacheReadTokens += cacheReadTokens
        entry.cacheWriteTokens += cacheWriteTokens
        entry.totalCostUsd += costUsd
        entry.requestCount += 1
        entry.totalLatencyMs += latencyMs
        entry.lastRequestAt = Date.now()
        entry.agentType = agentType
      }),

    toggleDashboard: () =>
      set((state) => {
        state.isDashboardOpen = !state.isDashboardOpen
      }),

    openDashboard: () =>
      set((state) => {
        state.isDashboardOpen = true
      }),

    closeDashboard: () =>
      set((state) => {
        state.isDashboardOpen = false
      }),

    resetSession: () =>
      set((state) => {
        state.totalInputTokens = 0
        state.totalOutputTokens = 0
        state.totalCacheReadTokens = 0
        state.totalCacheWriteTokens = 0
        state.totalCostUsd = 0
        state.totalRequests = 0
        state.totalLatencyMs = 0
        state.sessionStartAt = Date.now()
        state.perAgentCosts = {}
      }),
  })),
)
