import { jsonToolResult } from '@levelcode/common/util/messages'

import { branch } from '../../../context/gcc'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

export interface ContextBranchInput {
  contextId: string
  name: string
  startPoint?: string
}

async function createContextBranch(input: ContextBranchInput) {
  return branch(input.contextId, {
    name: input.name,
    startPoint: input.startPoint,
  })
}

type ToolName = 'context_branch'

export const handleContextBranch = (async ({
  previousToolCallFinished,
  toolCall,
  runId,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  runId: string
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  await previousToolCallFinished

  const result = await createContextBranch({
    contextId: runId,
    name: toolCall.input.branch_name,
  })

  return {
    output: jsonToolResult({
      message: `Using context branch ${result.branch}${
        result.commitId ? ` at ${result.commitId}` : ''
      }`,
    }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
