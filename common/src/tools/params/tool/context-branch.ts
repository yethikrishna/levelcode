import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  textToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'context_branch'
const endsAgentStep = false
const inputSchema = z
  .object({
    branch_name: z.string().describe('Name of the context branch to create or switch to'),
    create: z
      .boolean()
      .optional()
      .describe('Whether to create the branch if it does not exist'),
  })
  .describe(
    `Manage context branches wrapping gcc.ts branch functions.`,
  )
const description = `
Create or switch context branches using gcc.ts branch handler.
ContextController deep integration points added for GCC branches in run-agent-step.ts agent steps.

- When to use: For branching context states.
- Before calling: Decide branch name.
- Effect: Wraps gcc branch operations via ContextController.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    branch_name: 'feature/context-x',
    create: true,
  },
  endsAgentStep,
})}
`.trim()

export const contextBranchParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: textToolResultSchema(),
} satisfies $ToolParams
