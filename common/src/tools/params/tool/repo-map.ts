import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'repo_map'
const endsAgentStep = true
const inputSchema = z
  .object({
    focus_path: z
      .string()
      .optional()
      .describe(
        `Restrict the map to files under this directory (e.g. "src/auth"). Omit for a whole-project map.`,
      ),
    max_chars: z
      .number()
      .optional()
      .default(8000)
      .describe(
        `Character budget for the map. Default 8000 (~2k tokens). Increase for large focused areas.`,
      ),
  })
  .describe(
    `Get a compact structural map of the codebase: every important file with its key symbols (functions, classes, types), ranked by importance via tree-sitter cross-reference analysis.`,
  )
const description = `
Purpose: Understand the structure of an unfamiliar codebase in one call instead of reading dozens of files. The map lists files ranked by importance with their key symbols; a trailing * marks symbols referenced from 3+ other files (the project's de-facto API surface).

Use cases:
- FIRST STEP when working in an unfamiliar repo or area: orient before reading files
- Finding where functionality lives without grepping blindly
- Choosing which files to read in full (read_files) after seeing the big picture
- Mapping a subsystem before refactoring it: pass focus_path

Prefer repo_map over reading many files speculatively — it is dramatically cheaper in tokens and gives better coverage.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {},
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    focus_path: 'src/auth',
    max_chars: 4000,
  },
  endsAgentStep,
})}
`.trim()

export const repoMapParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({
        map: z.string(),
        fileCount: z.number(),
      }),
      z.object({
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
