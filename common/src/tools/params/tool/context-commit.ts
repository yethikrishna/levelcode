import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  textToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'context_commit'
const endsAgentStep = false
const inputSchema = z
  .object({
    message: z.string().describe('Commit message for the context commit'),
    branch: z
      .string()
      .optional()
      .describe('Optional branch name to commit to'),
  })
  .describe(
    `Commit the current agent context using gcc.ts context commit function.`,
  )
const description = `
Perform a context commit wrapping gcc.ts commit functionality.
Deep integration via ContextController in run-agent-step.ts for Agent Context system (GCC commits/branches in agent steps).

- When to use: To save the current working context/state into git via gcc.
- Before calling: Ensure changes are ready.
- Effect: Calls gcc commit logic via ContextController.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    message: 'context update from agent',
  },
  endsAgentStep,
})}
`.trim()

export const contextCommitParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: textToolResultSchema(),
} satisfies $ToolParams
