import { jsonToolResult } from '@levelcode/common/util/messages'
import { generateCompactId } from '@levelcode/common/util/string'
import { sendMessage } from '@levelcode/common/utils/team-fs'
import { findCurrentTeamAndAgent } from '@levelcode/common/utils/team-discovery'
import { trackMessageSent } from '@levelcode/common/utils/team-analytics'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { TrackEventFn } from '@levelcode/common/types/contracts/analytics'
import type { Logger } from '@levelcode/common/types/contracts/logger'
import type {
  TeamMessage,
  BroadcastMessage,
  ShutdownRequest,
  ShutdownApproved,
  ShutdownRejected,
  PlanApprovalResponse,
} from '@levelcode/common/types/team-protocol'

type ToolName = 'send_message'

function errorResult(message: string) {
  return { output: jsonToolResult({ message }) }
}

async function safeSendMessage(
  teamName: string,
  recipientName: string,
  msg: Parameters<typeof sendMessage>[2],
): Promise<string | null> {
  try {
    await sendMessage(teamName, recipientName, msg)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

export const handleSendMessage = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  agentStepId: string
  trackEvent: TrackEventFn
  userId: string | undefined
  logger: Logger
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, agentStepId, trackEvent, userId, logger } = params
  const { type, recipient, content, summary, request_id, approve } =
    toolCall.input

  await previousToolCallFinished

  // Validate message type
  if (!type) {
    return errorResult(
      'A "type" is required. Expected one of: message, broadcast, shutdown_request, shutdown_response, plan_approval_response.',
    )
  }

  let teamContext: ReturnType<typeof findCurrentTeamAndAgent>
  try {
    teamContext = findCurrentTeamAndAgent(agentStepId)
  } catch {
    return errorResult(
      'Failed to look up team for the current agent. The teams directory may be inaccessible.',
    )
  }
  if (!teamContext) {
    return errorResult(
      'No team found for the current agent context. Cannot send messages outside a team.',
    )
  }
  const { teamName, agentName, config } = teamContext
  const members = Array.isArray(config.members) ? config.members : []
  const timestamp = new Date().toISOString()

  switch (type) {
    case 'message': {
      if (!recipient) {
        return errorResult(
          'A "recipient" is required for type "message".',
        )
      }
      if (!summary) {
        return errorResult(
          'A "summary" is required for type "message".',
        )
      }
      if (recipient === agentName) {
        return errorResult('Cannot send a message to yourself.')
      }
      const memberExists = members.some((m) => m.name === recipient)
      if (!memberExists) {
        const available = members.map((m) => m.name).join(', ')
        return errorResult(
          `Recipient "${recipient}" is not a member of team "${teamName}". Available members: ${available}`,
        )
      }
      const msg: TeamMessage = {
        type: 'message',
        from: agentName,
        to: recipient,
        text: content ?? '',
        summary,
        timestamp,
      }
      const sendErr = await safeSendMessage(teamName, recipient, msg)
      if (sendErr) {
        return errorResult(
          `Failed to deliver message to "${recipient}": ${sendErr}`,
        )
      }
      try {
        trackMessageSent(
          { trackEvent, userId: userId ?? '', logger },
          teamName,
          'dm',
        )
      } catch {
        // Analytics failure should not block message delivery response
      }
      return {
        output: jsonToolResult({
          message: `Message sent to "${recipient}" in team "${teamName}".`,
        }),
      }
    }

    case 'broadcast': {
      if (!summary) {
        return errorResult(
          'A "summary" is required for type "broadcast".',
        )
      }
      const msg: BroadcastMessage = {
        type: 'broadcast',
        from: agentName,
        text: content ?? '',
        summary,
        timestamp,
      }
      const recipients = members
        .filter((m) => m.name !== agentName)
        .map((m) => m.name)
      if (recipients.length === 0) {
        return errorResult(
          'No other team members to broadcast to.',
        )
      }
      const failures: string[] = []
      for (const memberName of recipients) {
        const sendErr = await safeSendMessage(teamName, memberName, msg)
        if (sendErr) {
          failures.push(memberName)
        }
      }
      if (failures.length > 0) {
        return errorResult(
          `Broadcast partially failed. Could not deliver to: ${failures.join(', ')}`,
        )
      }
      try {
        trackMessageSent(
          { trackEvent, userId: userId ?? '', logger },
          teamName,
          'broadcast',
        )
      } catch {
        // Analytics failure should not block message delivery response
      }
      return {
        output: jsonToolResult({
          message: `Broadcast sent to ${recipients.length} teammate(s) in team "${teamName}".`,
        }),
      }
    }

    case 'shutdown_request': {
      if (!recipient) {
        return errorResult(
          'A "recipient" is required for type "shutdown_request".',
        )
      }
      const memberExists = members.some((m) => m.name === recipient)
      if (!memberExists) {
        return errorResult(
          `Recipient "${recipient}" is not a member of team "${teamName}".`,
        )
      }
      if (recipient === agentName) {
        return errorResult('Cannot send a shutdown request to yourself.')
      }
      const msg: ShutdownRequest = {
        type: 'shutdown_request',
        requestId: generateCompactId(),
        from: agentName,
        reason: content,
        timestamp,
      }
      const sendErr = await safeSendMessage(teamName, recipient, msg)
      if (sendErr) {
        return errorResult(
          `Failed to deliver shutdown request to "${recipient}": ${sendErr}`,
        )
      }
      try {
        trackMessageSent(
          { trackEvent, userId: userId ?? '', logger },
          teamName,
          'shutdown',
        )
      } catch {
        // Analytics failure should not block message delivery response
      }
      return {
        output: jsonToolResult({
          message: `Shutdown request sent to "${recipient}" (requestId: ${msg.requestId}).`,
        }),
      }
    }

    case 'shutdown_response': {
      if (!request_id) {
        return errorResult(
          'A "request_id" is required for type "shutdown_response".',
        )
      }
      if (approve === undefined || approve === null) {
        return errorResult(
          'An "approve" boolean is required for type "shutdown_response".',
        )
      }
      // The response goes back to whoever sent the shutdown_request.
      // We broadcast the response so the requester picks it up.
      const otherMembers = members.filter((m) => m.name !== agentName)
      if (approve) {
        const msg: ShutdownApproved = {
          type: 'shutdown_approved',
          requestId: request_id,
          from: agentName,
          timestamp,
        }
        const failures: string[] = []
        for (const member of otherMembers) {
          const sendErr = await safeSendMessage(teamName, member.name, msg)
          if (sendErr) {
            failures.push(member.name)
          }
        }
        if (failures.length > 0) {
          return errorResult(
            `Shutdown approved but failed to notify: ${failures.join(', ')}`,
          )
        }
        return {
          output: jsonToolResult({
            message: `Shutdown approved (requestId: ${request_id}). Agent will exit.`,
          }),
        }
      } else {
        const msg: ShutdownRejected = {
          type: 'shutdown_rejected',
          requestId: request_id,
          from: agentName,
          reason: content ?? 'Shutdown rejected without a reason.',
          timestamp,
        }
        const failures: string[] = []
        for (const member of otherMembers) {
          const sendErr = await safeSendMessage(teamName, member.name, msg)
          if (sendErr) {
            failures.push(member.name)
          }
        }
        if (failures.length > 0) {
          return errorResult(
            `Shutdown rejected but failed to notify: ${failures.join(', ')}`,
          )
        }
        return {
          output: jsonToolResult({
            message: `Shutdown rejected (requestId: ${request_id}).`,
          }),
        }
      }
    }

    case 'plan_approval_response': {
      if (!request_id) {
        return errorResult(
          'A "request_id" is required for type "plan_approval_response".',
        )
      }
      if (!recipient) {
        return errorResult(
          'A "recipient" is required for type "plan_approval_response".',
        )
      }
      if (approve === undefined || approve === null) {
        return errorResult(
          'An "approve" boolean is required for type "plan_approval_response".',
        )
      }
      const memberExists = members.some((m) => m.name === recipient)
      if (!memberExists) {
        return errorResult(
          `Recipient "${recipient}" is not a member of team "${teamName}".`,
        )
      }
      const msg: PlanApprovalResponse = {
        type: 'plan_approval_response',
        requestId: request_id,
        approved: approve,
        feedback: content,
        timestamp,
      }
      const sendErr = await safeSendMessage(teamName, recipient, msg)
      if (sendErr) {
        return errorResult(
          `Failed to deliver plan approval response to "${recipient}": ${sendErr}`,
        )
      }
      const action = approve ? 'approved' : 'rejected'
      return {
        output: jsonToolResult({
          message: `Plan ${action} for "${recipient}" (requestId: ${request_id}).`,
        }),
      }
    }

    default: {
      return errorResult(
        `Unknown message type: "${type}". Expected one of: message, broadcast, shutdown_request, shutdown_response, plan_approval_response.`,
      )
    }
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
