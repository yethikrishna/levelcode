import { AnalyticsEvent } from '../constants/analytics-events'

import type { TrackEventFn } from '../types/contracts/analytics'
import type { Logger } from '../types/contracts/logger'
import type {
  TeammateIdleHookEvent,
  TaskCompletedHookEvent,
  PhaseTransitionHookEvent,
  TeamHookEvent,
} from '../types/team-hook-events'
import type { DevPhase } from '../types/team-config'

/**
 * Listeners registered for team hook events.
 * Consumers can subscribe via {@link onTeamHookEvent} and unsubscribe via
 * the returned cleanup function.
 */
const listeners: Set<(event: TeamHookEvent) => void> = new Set()

/**
 * Subscribe to all team hook events.
 * Returns an unsubscribe function.
 */
export function onTeamHookEvent(
  listener: (event: TeamHookEvent) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Dispatch a team hook event to all registered listeners.
 * Exported for use in contexts (e.g. CLI) where the full emit helpers
 * cannot be used because a server-side TrackEventFn is not available.
 */
export function dispatchTeamHookEvent(event: TeamHookEvent): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      // Never let a listener error propagate
    }
  }
}

// ── Emit helpers ─────────────────────────────────────────────────────

export function emitTeammateIdle(params: {
  agentName: string
  teamName: string
  lastTaskId?: string
  trackEvent: TrackEventFn
  userId: string
  logger: Logger
}): void {
  const hookEvent: TeammateIdleHookEvent = {
    type: 'teammate_idle',
    agentName: params.agentName,
    teamName: params.teamName,
    lastTaskId: params.lastTaskId,
    timestamp: Date.now(),
  }

  dispatchTeamHookEvent(hookEvent)

  params.trackEvent({
    event: AnalyticsEvent.TEAM_TEAMMATE_IDLE,
    userId: params.userId,
    properties: {
      agentName: hookEvent.agentName,
      teamName: hookEvent.teamName,
      lastTaskId: hookEvent.lastTaskId,
    },
    logger: params.logger,
  })
}

export function emitTaskCompleted(params: {
  taskId: string
  taskSubject: string
  owner: string
  teamName: string
  trackEvent: TrackEventFn
  userId: string
  logger: Logger
}): void {
  const hookEvent: TaskCompletedHookEvent = {
    type: 'task_completed',
    taskId: params.taskId,
    taskSubject: params.taskSubject,
    owner: params.owner,
    teamName: params.teamName,
    timestamp: Date.now(),
  }

  dispatchTeamHookEvent(hookEvent)

  params.trackEvent({
    event: AnalyticsEvent.TEAM_TASK_COMPLETED,
    userId: params.userId,
    properties: {
      taskId: hookEvent.taskId,
      taskSubject: hookEvent.taskSubject,
      owner: hookEvent.owner,
      teamName: hookEvent.teamName,
    },
    logger: params.logger,
  })
}

export function emitPhaseTransition(params: {
  teamName: string
  fromPhase: DevPhase
  toPhase: DevPhase
  trackEvent: TrackEventFn
  userId: string
  logger: Logger
}): void {
  const hookEvent: PhaseTransitionHookEvent = {
    type: 'phase_transition',
    teamName: params.teamName,
    fromPhase: params.fromPhase,
    toPhase: params.toPhase,
    timestamp: Date.now(),
  }

  dispatchTeamHookEvent(hookEvent)

  params.trackEvent({
    event: AnalyticsEvent.TEAM_PHASE_TRANSITION,
    userId: params.userId,
    properties: {
      teamName: hookEvent.teamName,
      fromPhase: hookEvent.fromPhase,
      toPhase: hookEvent.toPhase,
    },
    logger: params.logger,
  })
}
