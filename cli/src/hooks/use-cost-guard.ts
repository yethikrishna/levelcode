import { useCallback, useMemo } from 'react'

import { useCostStore } from '../state/cost-store'

export function useCostGuard() {
  const isDashboardOpen = useCostStore((state) => state.isDashboardOpen)
  const totalInputTokens = useCostStore((state) => state.totalInputTokens)
  const totalOutputTokens = useCostStore((state) => state.totalOutputTokens)
  const totalCacheReadTokens = useCostStore((state) => state.totalCacheReadTokens)
  const totalCacheWriteTokens = useCostStore((state) => state.totalCacheWriteTokens)
  const totalCostUsd = useCostStore((state) => state.totalCostUsd)
  const totalRequests = useCostStore((state) => state.totalRequests)
  const totalLatencyMs = useCostStore((state) => state.totalLatencyMs)
  const sessionStartAt = useCostStore((state) => state.sessionStartAt)
  const perAgentCosts = useCostStore((state) => state.perAgentCosts)

  const recordUsage = useCostStore((state) => state.recordUsage)
  const toggleDashboard = useCostStore((state) => state.toggleDashboard)
  const openDashboard = useCostStore((state) => state.openDashboard)
  const closeDashboard = useCostStore((state) => state.closeDashboard)
  const resetSession = useCostStore((state) => state.resetSession)

  const avgLatencyMs = useMemo(() => {
    if (totalRequests === 0) return 0
    return Math.round(totalLatencyMs / totalRequests)
  }, [totalLatencyMs, totalRequests])

  const p95LatencyMs = useMemo(() => {
    const entries = Object.values(perAgentCosts)
    if (entries.length === 0) return avgLatencyMs
    const latencies = entries
      .filter((e) => e.requestCount > 0)
      .map((e) => e.totalLatencyMs / e.requestCount)
      .sort((a, b) => a - b)
    if (latencies.length === 0) return avgLatencyMs
    const p95Index = Math.floor(latencies.length * 0.95)
    return Math.round(latencies[Math.min(p95Index, latencies.length - 1)] ?? avgLatencyMs)
  }, [perAgentCosts, avgLatencyMs])

  const sessionDurationMs = useMemo(() => {
    return Date.now() - sessionStartAt
  }, [sessionStartAt])

  const agentCostList = useMemo(() => {
    return Object.values(perAgentCosts).sort((a, b) => b.totalCostUsd - a.totalCostUsd)
  }, [perAgentCosts])

  const handleRecordUsage = useCallback(
    (params: {
      agentId: string
      agentType: string
      inputTokens: number
      outputTokens: number
      cacheReadTokens?: number
      cacheWriteTokens?: number
      costUsd: number
      latencyMs: number
    }) => {
      try {
        recordUsage(params)
      } catch {
        // Graceful fallback - don't crash if cost tracking fails
      }
    },
    [recordUsage],
  )

  return {
    isDashboardOpen,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheWriteTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalCostUsd,
    totalRequests,
    avgLatencyMs,
    p95LatencyMs,
    sessionStartAt,
    sessionDurationMs,
    perAgentCosts: agentCostList,
    recordUsage: handleRecordUsage,
    toggleDashboard,
    openDashboard,
    closeDashboard,
    resetSession,
  }
}
