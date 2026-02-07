import * as fs from 'fs'
import { jsonToolResult } from '@levelcode/common/util/messages'
import { generateCompactId } from '@levelcode/common/util/string'
import {
  getTeamsDir,
  loadTeamConfig,
  sendMessage,
} from '@levelcode/common/utils/team-fs'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { TeamConfig } from '@levelcode/common/types/team-config'
import type {
  TeamMessage,
  BroadcastMessage,
  ShutdownRequest,
  ShutdownApproved,
  ShutdownRejected,
  PlanApprovalResponse,
} from '@levelcode/common/types/team-protocol'

type ToolName = 'send_message'

function findCurrentTeamAndAgent(
  agentStepId: string,
): { teamName: string; agentName: string; config: TeamConfig } | null {
  const teamsDir = getTeamsDir()
  if (!fs.existsSync(teamsDir)) {
    return null
  }
  const entries = fs.readdirSync(teamsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const config = loadTeamConfig(entry.name)
    if (!config) {
      continue
    }
    for (const member of config.members) {
      if (
        member.agentId === `lead-${agentStepId}` ||
        member.agentId === agentStepId
      ) {
        return { teamName: config.name, agentName: member.name, config }
      }
    }
  }
  return null
}

function errorResult(message: string) {
  return { output: jsonToolResult({ message }) }
}

export const handleSendMessage = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  agentStepId: string
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, agentStepId } = params
  const { type, recipient, content, summary, request_id, approve } =
    toolCall.input

  await previousToolCallFinished

  const teamContext = findCurrentTeamAndAgent(agentStepId)
  if (!teamContext) {
    return errorResult(
      'No team found for the current agent context. Cannot send messages outside a team.',
    )
  }
  const { teamName, agentName, config } = teamContext
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
      const memberExists = config.members.some(
        (m) => m.name === recipient,
      )
      if (!memberExists) {
        return errorResult(
          `Recipient "${recipient}" is not a member of team "${teamName}".`,
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
      sendMessage(teamName, recipient, msg)
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
      const recipients = config.members
        .filter((m) => m.name !== agentName)
        .map((m) => m.name)
      for (const memberName of recipients) {
        sendMessage(teamName, memberName, msg)
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
      const memberExists = config.members.some(
        (m) => m.name === recipient,
      )
      if (!memberExists) {
        return errorResult(
          `Recipient "${recipient}" is not a member of team "${teamName}".`,
        )
      }
      const msg: ShutdownRequest = {
        type: 'shutdown_request',
        requestId: generateCompactId(),
        from: agentName,
        reason: content,
        timestamp,
      }
      sendMessage(teamName, recipient, msg)
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
      if (approve) {
        const msg: ShutdownApproved = {
          type: 'shutdown_approved',
          requestId: request_id,
          from: agentName,
          timestamp,
        }
        // Send to all members so the requester sees it regardless of who they are
        for (const member of config.members) {
          if (member.name !== agentName) {
            sendMessage(teamName, member.name, msg)
          }
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
        for (const member of config.members) {
          if (member.name !== agentName) {
            sendMessage(teamName, member.name, msg)
          }
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
      const memberExists = config.members.some(
        (m) => m.name === recipient,
      )
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
      sendMessage(teamName, recipient, msg)
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
