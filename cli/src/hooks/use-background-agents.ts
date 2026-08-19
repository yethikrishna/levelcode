import { useCallback } from 'react'

import { useBackgroundStore } from '../state/background-store'

export function useBackgroundAgents() {
  const tasks = useBackgroundStore((state) => state.tasks)
  const isBackgroundPanelOpen = useBackgroundStore((state) => state.isBackgroundPanelOpen)

  const spawnTask = useBackgroundStore((state) => state.spawnTask)
  const updateTask = useBackgroundStore((state) => state.updateTask)
  const cancelTask = useBackgroundStore((state) => state.cancelTask)
  const removeTask = useBackgroundStore((state) => state.removeTask)
  const clearCompletedTasks = useBackgroundStore((state) => state.clearCompletedTasks)
  const toggleBackgroundPanel = useBackgroundStore((state) => state.toggleBackgroundPanel)
  const openBackgroundPanel = useBackgroundStore((state) => state.openBackgroundPanel)
  const closeBackgroundPanel = useBackgroundStore((state) => state.closeBackgroundPanel)

  const runningTasks = tasks.filter((t) => t.status === 'running' || t.status === 'pending')
  const completedTasks = tasks.filter((t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')

  const handleSpawn = useCallback(
    (agentId: string, agentType: string, prompt: string) => {
      return spawnTask(agentId, agentType, prompt)
    },
    [spawnTask],
  )

  return {
    tasks,
    runningTasks,
    completedTasks,
    isBackgroundPanelOpen,
    spawnTask: handleSpawn,
    updateTask,
    cancelTask,
    removeTask,
    clearCompletedTasks,
    toggleBackgroundPanel,
    openBackgroundPanel,
    closeBackgroundPanel,
  }
}
