import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  textToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'team_create'
const endsAgentStep = false
const inputSchema = z
  .object({
    team_name: z.string().describe('Name of the team to create'),
    description: z
      .string()
      .optional()
      .describe('Optional description of the team purpose'),
    agent_type: z
      .string()
      .optional()
      .describe('Optional agent type template to use for the team'),
  })
  .describe(
    `Create a new team/swarm with the given name and optional configuration.`,
  )
const description = `
Create a new team for collaborative multi-agent work.

- When to use: When you need to create a new team/swarm to coordinate multiple agents on a task.
- Before calling: Ensure the team name is unique and descriptive.
- Effect: Creates a new team context that agents can be spawned into.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    team_name: 'backend-refactor',
    description: 'Team for refactoring the backend API layer',
    agent_type: 'coordinator',
  },
  endsAgentStep,
})}
`.trim()

export const teamCreateParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: textToolResultSchema(),
} satisfies $ToolParams
