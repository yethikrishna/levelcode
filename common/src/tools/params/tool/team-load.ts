import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  textToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'team_load'
const endsAgentStep = false
const inputSchema = z
  .object({
    id_or_name: z.string().describe('Saved team id or display name'),
  })
  .describe('Load a saved persistent team by id or name.')
const description = `
Load a saved persistent team.

- When to use: When you want to reuse a previously saved team.
- Effect: Loads the team registry entry and reports its member count.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: { id_or_name: 'backend-refactor' },
  endsAgentStep,
})}
`.trim()

export const teamLoadParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: textToolResultSchema(),
} satisfies $ToolParams
