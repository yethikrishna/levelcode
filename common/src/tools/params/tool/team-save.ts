import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  textToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'team_save'
const endsAgentStep = false
const memberSchema = z.object({
  role: z.string().describe('Team member role'),
  model: z.string().optional().describe('Optional model for the member'),
  config: z.record(z.string(), z.unknown()).optional(),
})
const inputSchema = z
  .object({
    name: z.string().describe('Saved team name'),
    members: z.array(memberSchema).describe('Members to persist'),
    description: z.string().optional().describe('Optional team description'),
  })
  .describe('Save a team for later reuse.')
const description = `
Save a persistent team definition.

- When to use: When a useful team configuration should be reused later.
- Effect: Persists the team in the local team registry.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    name: 'backend-refactor',
    members: [{ role: 'senior-engineer' }],
    description: 'Backend refactor team',
  },
  endsAgentStep,
})}
`.trim()

export const teamSaveParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: textToolResultSchema(),
} satisfies $ToolParams
