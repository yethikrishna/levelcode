import { AnalyticsEvent } from '../constants/analytics-events'

import type { TrackEventFn } from '../types/contracts/analytics'
import type { Logger } from '../types/contracts/logger'
import type { DevPhase } from '../types/team-config'

type TrackingContext = {
  trackEvent: TrackEventFn
  userId: string
  logger: Logger
}

export function trackTeamCreated(
  ctx: TrackingContext,
  teamName: string,
  memberCount: number,
): void {
  ctx.trackEvent({
    event: AnalyticsEvent.TEAM_CREATED,
    userId: ctx.userId,
    properties: { teamName, memberCount },
    logger: ctx.logger,
  })
}

export function trackTeamDeleted(
  ctx: TrackingContext,
  teamName: string,
): void {
  ctx.trackEvent({
    event: AnalyticsEvent.TEAM_DELETED,
    userId: ctx.userId,
    properties: { teamName },
    logger: ctx.logger,
  })
}

export function trackTeammateIdle(
  ctx: TrackingContext,
  teamName: string,
  agentName: string,
  role: string,
): void {
  ctx.trackEvent({
    event: AnalyticsEvent.TEAM_TEAMMATE_IDLE,
    userId: ctx.userId,
    properties: { teamName, agentName, role },
    logger: ctx.logger,
  })
}

export function trackTaskCompleted(
  ctx: TrackingContext,
  teamName: string,
  taskId: string,
  taskSubject: string,
  owner: string,
): void {
  ctx.trackEvent({
    event: AnalyticsEvent.TEAM_TASK_COMPLETED,
    userId: ctx.userId,
    properties: { teamName, taskId, taskSubject, owner },
    logger: ctx.logger,
  })
}

export function trackPhaseTransition(
  ctx: TrackingContext,
  teamName: string,
  fromPhase: DevPhase,
  toPhase: DevPhase,
): void {
  ctx.trackEvent({
    event: AnalyticsEvent.TEAM_PHASE_TRANSITION,
    userId: ctx.userId,
    properties: { teamName, fromPhase, toPhase },
    logger: ctx.logger,
  })
}

export function trackMessageSent(
  ctx: TrackingContext,
  teamName: string,
  type: 'dm' | 'broadcast' | 'shutdown',
): void {
  ctx.trackEvent({
    event: AnalyticsEvent.TEAM_MESSAGE_SENT,
    userId: ctx.userId,
    properties: { teamName, messageType: type },
    logger: ctx.logger,
  })
}

export function trackAgentSpawned(
  ctx: TrackingContext,
  teamName: string,
  role: string,
  agentName: string,
): void {
  ctx.trackEvent({
    event: AnalyticsEvent.TEAM_AGENT_SPAWNED,
    userId: ctx.userId,
    properties: { teamName, role, agentName },
    logger: ctx.logger,
  })
}
