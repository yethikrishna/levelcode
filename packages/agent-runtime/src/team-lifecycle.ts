import {
  loadTeamConfig,
  saveTeamConfig,
  removeTeamMember,
  sendMessage,
} from '@levelcode/common/utils/team-fs'
import { emitTeammateIdle } from '@levelcode/common/utils/team-hook-emitter'

import type { AgentStatus } from '@levelcode/common/types/team-config'
import type {
  IdleNotification,
  ShutdownApproved,
  ShutdownRejected,
} from '@levelcode/common/types/team-protocol'
import type { TrackEventFn } from '@levelcode/common/types/contracts/analytics'
import type { Logger } from '@levelcode/common/types/contracts/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegisteredAgent {
  agentId: string
  agentName: string
  teamName: string
  abortController: AbortController
  status: AgentStatus
  startedAt: number
  lastActivityAt: number
}

export interface ActiveAgentInfo {
  agentId: string
  agentName: string
  status: AgentStatus
  startedAt: number
}

export interface ShutdownResult {
  approved: boolean
  reason?: string
}

// ---------------------------------------------------------------------------
// Agent Registry (in-memory)
// ---------------------------------------------------------------------------

/**
 * In-memory registry of active team agents keyed by teamName -> agentId.
 * Each entry holds the agent's AbortController so the lifecycle manager
 * can abort the agent on graceful shutdown.
 */
const registry: Map<string, Map<string, RegisteredAgent>> = new Map()

function getTeamRegistry(teamName: string): Map<string, RegisteredAgent> {
  let teamMap = registry.get(teamName)
  if (!teamMap) {
    teamMap = new Map()
    registry.set(teamName, teamMap)
  }
  return teamMap
}

/**
 * Register an agent in the in-memory registry.
 * This should be called after the agent is spawned and has begun running.
 */
export function registerAgent(
  teamName: string,
  agentId: string,
  agentName: string,
  abortController: AbortController,
): void {
  const teamMap = getTeamRegistry(teamName)
  teamMap.set(agentId, {
    agentId,
    agentName,
    teamName,
    abortController,
    status: 'active',
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
  })
}

/**
 * Unregister an agent from the in-memory registry.
 * Does NOT abort the controller - callers should abort before unregistering
 * if they need to stop the agent.
 */
export function unregisterAgent(teamName: string, agentId: string): void {
  const teamMap = registry.get(teamName)
  if (teamMap) {
    teamMap.delete(agentId)
    if (teamMap.size === 0) {
      registry.delete(teamName)
    }
  }
}

/**
 * Returns a snapshot of all active agents for a team.
 */
export function getActiveAgents(teamName: string): ActiveAgentInfo[] {
  const teamMap = registry.get(teamName)
  if (!teamMap) {
    return []
  }
  const agents: ActiveAgentInfo[] = []
  for (const entry of teamMap.values()) {
    agents.push({
      agentId: entry.agentId,
      agentName: entry.agentName,
      status: entry.status,
      startedAt: entry.startedAt,
    })
  }
  return agents
}

/**
 * Checks if an agent is registered and active.
 */
export function isAgentActive(teamName: string, agentId: string): boolean {
  const teamMap = registry.get(teamName)
  if (!teamMap) {
    return false
  }
  const entry = teamMap.get(agentId)
  return !!entry && entry.status !== 'completed' && entry.status !== 'failed'
}

/**
 * Returns the registered agent entry if it exists, or null.
 */
export function getRegisteredAgent(
  teamName: string,
  agentId: string,
): RegisteredAgent | null {
  const teamMap = registry.get(teamName)
  if (!teamMap) {
    return null
  }
  return teamMap.get(agentId) ?? null
}

/**
 * Record activity for an agent (resets idle timer).
 */
export function recordActivity(teamName: string, agentId: string): void {
  const teamMap = registry.get(teamName)
  if (!teamMap) {
    return
  }
  const entry = teamMap.get(agentId)
  if (entry) {
    entry.lastActivityAt = Date.now()
  }
}

// ---------------------------------------------------------------------------
// Agent Status Tracking
// ---------------------------------------------------------------------------

/**
 * Update an agent's status both in the in-memory registry and in
 * the persisted team config. If the agent is not found in the registry
 * it still attempts to update the team config on disk.
 */
export async function updateAgentStatus(
  teamName: string,
  agentId: string,
  status: AgentStatus,
  logger: Logger,
): Promise<void> {
  // Update in-memory registry
  const teamMap = registry.get(teamName)
  if (teamMap) {
    const entry = teamMap.get(agentId)
    if (entry) {
      entry.status = status
    }
  }

  // Update persisted team config
  const config = loadTeamConfig(teamName)
  if (!config) {
    logger.debug(
      { teamName, agentId, status },
      'updateAgentStatus: team config not found',
    )
    return
  }

  const memberIndex = config.members.findIndex((m) => m.agentId === agentId)
  if (memberIndex === -1) {
    logger.debug(
      { teamName, agentId, status },
      'updateAgentStatus: member not found in team config',
    )
    return
  }

  config.members[memberIndex]!.status = status
  await saveTeamConfig(teamName, config)

  logger.debug(
    { teamName, agentId, status },
    `updateAgentStatus: set status to "${status}"`,
  )
}

// ---------------------------------------------------------------------------
// Idle Detection
// ---------------------------------------------------------------------------

/**
 * Mark an agent as idle. This:
 * 1. Updates the agent's status to 'idle' in both registry and team config
 * 2. Fires the TeammateIdle hook event
 * 3. Sends an idle notification to the team lead's inbox
 */
export async function markAgentIdle(params: {
  teamName: string
  agentId: string
  agentName: string
  lastTaskId?: string
  trackEvent: TrackEventFn
  userId: string
  logger: Logger
}): Promise<void> {
  const { teamName, agentId, agentName, lastTaskId, trackEvent, userId, logger } = params

  // 1. Update status in registry + config
  await updateAgentStatus(teamName, agentId, 'idle', logger)

  // Clear currentTaskId in team config
  const config = loadTeamConfig(teamName)
  if (config) {
    const member = config.members.find((m) => m.agentId === agentId)
    if (member) {
      member.currentTaskId = undefined
      await saveTeamConfig(teamName, config)
    }
  }

  // 2. Fire TeammateIdle hook event
  emitTeammateIdle({
    agentName,
    teamName,
    lastTaskId,
    trackEvent,
    userId,
    logger,
  })

  // 3. Send idle notification to team lead's inbox
  if (config) {
    const leadMember = config.members.find(
      (m) => m.agentId === config.leadAgentId,
    )
    const leadName = leadMember?.name ?? 'team-lead'

    const notification: IdleNotification = {
      type: 'idle_notification',
      from: agentName,
      timestamp: new Date().toISOString(),
      summary: lastTaskId
        ? `Completed task ${lastTaskId}, now idle`
        : 'Agent is idle and ready for work',
      completedTaskId: lastTaskId,
    }

    await sendMessage(teamName, leadName, notification)

    logger.debug(
      { teamName, agentName, leadName, lastTaskId },
      'markAgentIdle: sent idle notification to team lead',
    )
  }
}

/**
 * Check if an agent should be considered idle based on whether it
 * produced any output during its last turn. Call this after an agent's
 * turn completes.
 *
 * @param producedOutput Whether the agent produced any meaningful output
 *   (tool calls, text, etc.) during its turn.
 */
export async function checkIdleAfterTurn(params: {
  teamName: string
  agentId: string
  agentName: string
  producedOutput: boolean
  lastTaskId?: string
  trackEvent: TrackEventFn
  userId: string
  logger: Logger
}): Promise<void> {
  const { producedOutput, ...rest } = params

  if (!producedOutput) {
    await markAgentIdle(rest)
  }
}

// ---------------------------------------------------------------------------
// Graceful Shutdown
// ---------------------------------------------------------------------------

/**
 * Process a graceful shutdown for an agent:
 * 1. Abort the agent's AbortController
 * 2. Update team config to remove the member (or mark as completed)
 * 3. Send shutdown_approved to the requester
 * 4. Unregister the agent from the in-memory registry
 */
export async function approveShutdown(params: {
  teamName: string
  agentId: string
  agentName: string
  requestId: string
  requesterName: string
  logger: Logger
}): Promise<ShutdownResult> {
  const { teamName, agentId, agentName, requestId, requesterName, logger } = params

  // 1. Abort the agent's controller
  const registered = getRegisteredAgent(teamName, agentId)
  if (registered) {
    registered.abortController.abort()
    logger.debug(
      { teamName, agentId },
      'approveShutdown: aborted agent controller',
    )
  }

  // 2. Update team config - mark member as completed and remove
  const config = loadTeamConfig(teamName)
  if (config) {
    const memberIndex = config.members.findIndex((m) => m.agentId === agentId)
    if (memberIndex !== -1) {
      config.members[memberIndex]!.status = 'completed'
      await saveTeamConfig(teamName, config)
    }

    // Remove the member from the team
    await removeTeamMember(teamName, agentId)
  }

  // 3. Send shutdown_approved to requester
  const approved: ShutdownApproved = {
    type: 'shutdown_approved',
    requestId,
    from: agentName,
    timestamp: new Date().toISOString(),
  }
  await sendMessage(teamName, requesterName, approved)

  logger.debug(
    { teamName, agentId, agentName, requestId, requesterName },
    'approveShutdown: shutdown approved and agent removed',
  )

  // 4. Unregister from in-memory registry
  unregisterAgent(teamName, agentId)

  return { approved: true }
}

/**
 * Reject a shutdown request. The agent continues running and sends
 * a shutdown_rejected message to the requester.
 */
export async function rejectShutdown(params: {
  teamName: string
  agentName: string
  requestId: string
  requesterName: string
  reason: string
  logger: Logger
}): Promise<ShutdownResult> {
  const { teamName, agentName, requestId, requesterName, reason, logger } = params

  const rejected: ShutdownRejected = {
    type: 'shutdown_rejected',
    requestId,
    from: agentName,
    reason,
    timestamp: new Date().toISOString(),
  }
  await sendMessage(teamName, requesterName, rejected)

  logger.debug(
    { teamName, agentName, requestId, requesterName, reason },
    'rejectShutdown: shutdown rejected',
  )

  return { approved: false, reason }
}

/**
 * Forcefully shut down all agents in a team. Used when the team is being
 * deleted or when the team lead is shutting down the entire team.
 *
 * This aborts all agent controllers, marks them as completed in the config,
 * and clears the in-memory registry for the team.
 */
export async function shutdownAllAgents(teamName: string, logger: Logger): Promise<void> {
  const teamMap = registry.get(teamName)
  if (!teamMap) {
    logger.debug(
      { teamName },
      'shutdownAllAgents: no agents registered for team',
    )
    return
  }

  for (const [agentId, entry] of teamMap) {
    entry.abortController.abort()
    logger.debug(
      { teamName, agentId, agentName: entry.agentName },
      'shutdownAllAgents: aborted agent',
    )
  }

  // Update all members to completed in team config
  const config = loadTeamConfig(teamName)
  if (config) {
    for (const member of config.members) {
      if (member.status !== 'completed' && member.status !== 'failed') {
        member.status = 'completed'
      }
    }
    await saveTeamConfig(teamName, config)
  }

  // Clear the in-memory registry for this team
  registry.delete(teamName)

  logger.debug({ teamName }, 'shutdownAllAgents: all agents shut down')
}

// ---------------------------------------------------------------------------
// Lifecycle Helpers (for integration with spawn flow)
// ---------------------------------------------------------------------------

/**
 * Call this when an agent starts working on a task.
 * Updates both the in-memory registry and persisted team config.
 */
export async function markAgentWorking(params: {
  teamName: string
  agentId: string
  taskId: string
  logger: Logger
}): Promise<void> {
  const { teamName, agentId, taskId, logger } = params

  await updateAgentStatus(teamName, agentId, 'working', logger)

  const config = loadTeamConfig(teamName)
  if (config) {
    const member = config.members.find((m) => m.agentId === agentId)
    if (member) {
      member.currentTaskId = taskId
      await saveTeamConfig(teamName, config)
    }
  }
}

/**
 * Call this when an agent is blocked (e.g., waiting on a dependency).
 */
export async function markAgentBlocked(params: {
  teamName: string
  agentId: string
  logger: Logger
}): Promise<void> {
  await updateAgentStatus(params.teamName, params.agentId, 'blocked', params.logger)
}

/**
 * Call this when an agent fails (unrecoverable error).
 * Aborts the controller and updates status.
 */
export async function markAgentFailed(params: {
  teamName: string
  agentId: string
  agentName: string
  error: string
  logger: Logger
}): Promise<void> {
  const { teamName, agentId, agentName, error, logger } = params

  // Abort the controller
  const registered = getRegisteredAgent(teamName, agentId)
  if (registered) {
    registered.abortController.abort()
  }

  await updateAgentStatus(teamName, agentId, 'failed', logger)

  // Notify team lead about the failure
  const config = loadTeamConfig(teamName)
  if (config) {
    const leadMember = config.members.find(
      (m) => m.agentId === config.leadAgentId,
    )
    const leadName = leadMember?.name ?? 'team-lead'

    await sendMessage(teamName, leadName, {
      type: 'message',
      from: agentName,
      to: leadName,
      text: `Agent failed with error: ${error}`,
      summary: `Agent ${agentName} failed`,
      timestamp: new Date().toISOString(),
    })
  }

  // Unregister from in-memory registry
  unregisterAgent(teamName, agentId)

  logger.debug(
    { teamName, agentId, agentName, error },
    'markAgentFailed: agent marked as failed and unregistered',
  )
}

// ---------------------------------------------------------------------------
// Cleanup / Testing Utilities
// ---------------------------------------------------------------------------

/**
 * Clear the entire in-memory registry. Useful for tests.
 */
export function clearRegistry(): void {
  registry.clear()
}

/**
 * Returns the count of registered agents across all teams.
 * Useful for monitoring / debugging.
 */
export function getRegistrySize(): number {
  let count = 0
  for (const teamMap of registry.values()) {
    count += teamMap.size
  }
  return count
}

/**
 * Returns team names that have registered agents.
 */
export function getActiveTeams(): string[] {
  return Array.from(registry.keys())
}
