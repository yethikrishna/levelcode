import { jsonToolResult } from '@levelcode/common/util/messages'

import { commit } from '../../../context/gcc'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

export interface ContextCommitInput {
  contextId: string
  message: string
  parent?: string | null
  tree?: Record<string, any>
  branch?: string
}

async function commitContext(input: ContextCommitInput) {
  return commit(input.contextId, {
    message: input.message,
    parent: input.parent,
    tree: input.tree,
    branch: input.branch,
  })
}

type ToolName = 'context_commit'

export const handleContextCommit = (async ({
  previousToolCallFinished,
  toolCall,
  runId,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  runId: string
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  await previousToolCallFinished

  const result = await commitContext({
    contextId: runId,
    message: toolCall.input.message,
    branch: toolCall.input.branch,
  })

  return {
    output: jsonToolResult({
      message: `Committed context to ${result.ref}: ${result.commitId}`,
    }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
