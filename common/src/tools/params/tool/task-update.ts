import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  textToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'task_update'
const endsAgentStep = false
const inputSchema = z
  .object({
    taskId: z.string().describe('The ID of the task to update'),
    status: z
      .string()
      .optional()
      .describe(
        'New status for the task: "pending", "in_progress", "completed", or "deleted"',
      ),
    subject: z.string().optional().describe('New subject for the task'),
    description: z
      .string()
      .optional()
      .describe('New description for the task'),
    activeForm: z
      .string()
      .optional()
      .describe(
        'Present continuous form shown in spinner when in_progress (e.g., "Running tests")',
      ),
    owner: z.string().optional().describe('New owner for the task (agent name)'),
    priority: z
      .enum(['critical', 'high', 'medium', 'low'])
      .optional()
      .describe('New priority level for the task'),
    addBlocks: z
      .array(z.string())
      .optional()
      .describe('Task IDs that this task blocks'),
    addBlockedBy: z
      .array(z.string())
      .optional()
      .describe('Task IDs that block this task'),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Metadata keys to merge into the task. Set a key to null to delete it.',
      ),
  })
  .describe(
    `Update an existing task in the team task list.`,
  )
const description = `
Update a task's status, details, or dependencies.

- When to use: To mark tasks as in_progress, completed, or to update task details.
- Status workflow: pending -> in_progress -> completed. Use "deleted" to remove a task.
- Only mark a task as completed when you have fully accomplished it.

Example - Mark as in progress:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    taskId: '1',
    status: 'in_progress',
  },
  endsAgentStep,
})}

Example - Mark as completed:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    taskId: '1',
    status: 'completed',
  },
  endsAgentStep,
})}
`.trim()

export const taskUpdateParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: textToolResultSchema(),
} satisfies $ToolParams
