import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'remember'
const endsAgentStep = false
const inputSchema = z
  .object({
    category: z
      .enum(['lesson', 'gotcha', 'preference', 'fact'])
      .describe(
        `lesson: a technique or approach that worked/failed here. gotcha: a non-obvious trap in this codebase. preference: how the user wants things done. fact: a durable truth about the architecture or tooling.`,
      ),
    content: z
      .string()
      .min(1)
      .describe(
        `One concise, self-contained insight (max 500 chars). Write it for a future agent with zero context from this session.`,
      ),
  })
  .describe(
    `Persist a durable insight about this repository to .levelcode/MEMORY.md. Every future LevelCode session in this repo automatically starts with these memories in context.`,
  )
const description = `
Purpose: Make LevelCode smarter on every future session in this repository. Memories are stored in .levelcode/MEMORY.md (human-editable, version-controllable) and injected into agent context at session start.

WHEN TO REMEMBER (be selective — only durable, repo-specific insights):
- You discovered something non-obvious the hard way (a build quirk, a hidden coupling, a misleading name)
- The user expressed a lasting preference ("always use the makeRequest wrapper, never fetch directly")
- A repeated mistake pattern you or a subagent made that future agents should avoid
- Architecture facts that took real effort to figure out

WHEN NOT TO REMEMBER:
- Session-specific details (current task state, file you just edited)
- Anything already obvious from reading the code or knowledge.md
- Generic programming knowledge

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    category: 'gotcha',
    content:
      'The API tests require the dev database to be running (bun start-db) — they fail with cryptic connection errors otherwise.',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    category: 'preference',
    content:
      'User prefers small focused PRs: when a task spans frontend and backend, split the work into separate commits per layer.',
  },
  endsAgentStep,
})}
`.trim()

export const rememberParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({
        saved: z.boolean(),
        message: z.string(),
        totalMemories: z.number().optional(),
      }),
      z.object({
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
