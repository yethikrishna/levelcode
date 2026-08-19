import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  textToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'context_merge'
const endsAgentStep = false
const inputSchema = z
  .object({
    branch: z.string().describe('Branch or context name to merge into'),
    create: z
      .boolean()
      .optional()
      .describe('Create the target if it does not exist'),
    message: z.string().optional().describe('Merge message'),
  })
  .describe(
    `Merge context using gcc.merge logic (create if not exists). Handles conflict markers for markdown.`,
  )
const description = `
Merge context branches/states by calling gcc.merge (creates target if not exists).
Handles standard git-style conflict markers, with special handling for markdown files.

- When to use: To merge context changes.
- Before calling: Have source context ready.
- Effect: Invokes gcc merge, resolves markdown conflicts appropriately.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    branch: 'main',
    create: true,
    message: 'merge context update',
  },
  endsAgentStep,
})}
`.trim()

export const contextMergeParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: textToolResultSchema(),
} satisfies $ToolParams
