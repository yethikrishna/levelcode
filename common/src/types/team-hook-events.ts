import type { DevPhase } from './team-config'

/**
 * Hook event fired when an agent goes idle (no active tasks).
 */
export type TeammateIdleHookEvent = {
  type: 'teammate_idle'
  agentName: string
  teamName: string
  lastTaskId?: string
  timestamp: number
}

/**
 * Hook event fired when a task is marked as completed.
 */
export type TaskCompletedHookEvent = {
  type: 'task_completed'
  taskId: string
  taskSubject: string
  owner: string
  teamName: string
  timestamp: number
}

/**
 * Hook event fired when the team's dev phase changes.
 */
export type PhaseTransitionHookEvent = {
  type: 'phase_transition'
  teamName: string
  fromPhase: DevPhase
  toPhase: DevPhase
  timestamp: number
}

/**
 * Union of all team hook event types.
 */
export type TeamHookEvent =
  | TeammateIdleHookEvent
  | TaskCompletedHookEvent
  | PhaseTransitionHookEvent
