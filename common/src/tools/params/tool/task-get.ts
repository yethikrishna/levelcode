import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  textToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'task_get'
const endsAgentStep = false
const inputSchema = z
  .object({
    taskId: z.string().describe('The ID of the task to retrieve'),
  })
  .describe(
    `Retrieve a task by its ID from the team task list.`,
  )
const description = `
Retrieve the full details of a task by its ID.

- When to use: When you need the full description and context before starting work on a task.
- Returns: subject, description, status, blocks, blockedBy, and other task details.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    taskId: '1',
  },
  endsAgentStep,
})}
`.trim()

export const taskGetParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: textToolResultSchema(),
} satisfies $ToolParams
