import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  textToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'team_list'
const endsAgentStep = false
const inputSchema = z.object({}).describe('List saved teams.')
const description = `
List saved persistent teams.

- When to use: When you need to inspect reusable saved teams.
- Effect: Returns a short summary of saved teams.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {},
  endsAgentStep,
})}
`.trim()

export const teamListParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: textToolResultSchema(),
} satisfies $ToolParams
