import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  textToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'task_list'
const endsAgentStep = false
const inputSchema = z
  .object({})
  .describe(
    `List all tasks in the team task list.`,
  )
const description = `
List all tasks in the current team's task list.

- When to use: To see available tasks, check progress, or find unblocked work to claim.
- Returns a summary of each task: id, subject, status, priority, owner, blockedBy.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {},
  endsAgentStep,
})}
`.trim()

export const taskListParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: textToolResultSchema(),
} satisfies $ToolParams
