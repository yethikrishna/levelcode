import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  textToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'send_message'
const endsAgentStep = false
const inputSchema = z
  .object({
    type: z
      .enum([
        'message',
        'broadcast',
        'shutdown_request',
        'shutdown_response',
        'plan_approval_response',
      ])
      .describe(
        'Message type: "message" for DMs, "broadcast" to all teammates, "shutdown_request" to request shutdown, "shutdown_response" to respond to shutdown, "plan_approval_response" to approve/reject plans',
      ),
    recipient: z
      .string()
      .optional()
      .describe(
        'Agent name of the recipient (required for message, shutdown_request, plan_approval_response)',
      ),
    content: z
      .string()
      .optional()
      .describe('Message text, reason, or feedback'),
    summary: z
      .string()
      .optional()
      .describe(
        'A 5-10 word summary of the message, shown as a preview in the UI (required for message, broadcast)',
      ),
    request_id: z
      .string()
      .optional()
      .describe(
        'Request ID to respond to (required for shutdown_response, plan_approval_response)',
      ),
    approve: z
      .boolean()
      .optional()
      .describe(
        'Whether to approve the request (required for shutdown_response, plan_approval_response)',
      ),
  })
  .describe(
    `Send a message to a teammate or broadcast to all teammates in the current team/swarm.`,
  )
const description = `
Send messages to agent teammates and handle protocol requests/responses in a team.

Message types:
- "message": Send a direct message to a specific teammate (requires recipient)
- "broadcast": Send a message to all teammates (use sparingly)
- "shutdown_request": Request a teammate to shut down (requires recipient)
- "shutdown_response": Respond to a shutdown request (requires request_id, approve)
- "plan_approval_response": Approve or reject a teammate's plan (requires request_id, recipient, approve)

Example - Direct message:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    type: 'message',
    recipient: 'researcher',
    content: 'Found the bug in the auth module',
    summary: 'Auth bug found',
  },
  endsAgentStep,
})}

Example - Broadcast:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    type: 'broadcast',
    content: 'Blocking issue found, please pause work',
    summary: 'Critical blocking issue',
  },
  endsAgentStep,
})}
`.trim()

export const sendMessageParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: textToolResultSchema(),
} satisfies $ToolParams
