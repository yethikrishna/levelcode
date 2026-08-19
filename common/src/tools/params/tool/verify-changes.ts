import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'verify_changes'
const endsAgentStep = true
const inputSchema = z
  .object({
    checks: z
      .array(z.enum(['typecheck', 'lint', 'test', 'build']))
      .optional()
      .describe(
        `Which checks to run. Omit to run all detected checks in order (typecheck -> lint -> test -> build).`,
      ),
    timeout_seconds: z
      .number()
      .optional()
      .default(300)
      .describe(`Per-check timeout in seconds. Default 300.`),
  })
  .describe(
    `Auto-detect and run this project's verification commands (typecheck, lint, test, build), returning structured pass/fail results with summarized failures.`,
  )
const description = `
Purpose: Verify that the codebase is healthy after making edits. LevelCode inspects the project's manifest files (package.json, Cargo.toml, go.mod, pyproject.toml, Makefile, ...) to detect the right typecheck/lint/test/build commands, runs them, and returns structured results with failure summaries.

THE SELF-HEALING LOOP: After completing a batch of edits, call verify_changes. If any check fails, read the failure summaries, fix the issues, and call verify_changes again. Repeat until all checks pass or you have made 3 fix attempts — then report remaining failures honestly. Never end a coding task with failing checks without telling the user.

Use cases:
- After editing files, before declaring a task complete
- To establish a health baseline before starting risky changes
- To run only fast checks while iterating: pass checks: ['typecheck']

Stops early: checks run in order and verification stops at the first failing check (later checks would only add noise).

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
    checks: ['typecheck', 'test'],
    timeout_seconds: 120,
  },
  endsAgentStep,
})}
`.trim()

export const verifyChangesParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({
        passed: z.boolean(),
        results: z.array(
          z.object({
            check: z.string(),
            command: z.string(),
            source: z.string(),
            passed: z.boolean(),
            exitCode: z.number().nullable(),
            durationMs: z.number(),
            summary: z.string().optional(),
          }),
        ),
        skipped: z.array(z.string()).optional(),
        message: z.string().optional(),
      }),
      z.object({
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
