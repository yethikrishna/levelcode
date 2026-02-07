import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  textToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'team_delete'
const endsAgentStep = false
const inputSchema = z
  .object({})
  .describe(
    `Delete the current team/swarm. Uses the current team context to determine which team to delete.`,
  )
const description = `
Delete the current team and clean up all associated resources.

- When to use: When a team's work is complete and it should be disbanded.
- Before calling: Ensure all agents in the team have completed their work.
- Effect: Removes the team context and all associated state.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {},
  endsAgentStep,
})}
`.trim()

export const teamDeleteParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: textToolResultSchema(),
} satisfies $ToolParams
