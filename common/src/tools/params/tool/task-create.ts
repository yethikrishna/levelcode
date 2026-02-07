import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  textToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'task_create'
const endsAgentStep = false
const inputSchema = z
  .object({
    subject: z.string().describe('A brief, actionable title for the task'),
    description: z
      .string()
      .describe('A detailed description of what needs to be done'),
    activeForm: z
      .string()
      .optional()
      .describe(
        'Present continuous form shown in spinner when in_progress (e.g., "Running tests")',
      ),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Arbitrary metadata to attach to the task'),
  })
  .describe(
    `Create a new task in the team task list for tracking work items.`,
  )
const description = `
Create a structured task for tracking work in the current team/swarm.

- When to use: When a task requires multiple steps or needs to be tracked and coordinated across agents.
- The subject should be imperative (e.g., "Fix authentication bug").
- The activeForm should be present continuous (e.g., "Fixing authentication bug").
- New tasks are created with status "pending".

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    subject: 'Fix authentication bug in login flow',
    description: 'The login endpoint returns 500 when password contains special characters',
    activeForm: 'Fixing authentication bug',
  },
  endsAgentStep,
})}
`.trim()

export const taskCreateParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: textToolResultSchema(),
} satisfies $ToolParams
