import { jsonToolResult } from '@levelcode/common/util/messages'

import { commit, getCommit, getRef } from '../../../context/gcc'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

export interface ContextMergeInput {
  contextId: string
  sourceBranch: string
  targetBranch?: string
  message?: string
}

/**
 * Merge a GCC context branch into a target branch (default: main).
 * Strategy: snapshot merge — the source branch's latest tree is committed
 * onto the target branch, with the target's previous head as parent so
 * history stays linear and auditable.
 */
async function mergeContext(input: ContextMergeInput) {
  const { contextId, sourceBranch, targetBranch = 'main', message } = input

  const sourceHead = await getRef(contextId, sourceBranch)
  if (!sourceHead) {
    return {
      ok: false as const,
      error: `Source branch "${sourceBranch}" not found for context "${contextId}"`,
    }
  }

  const sourceCommit = await getCommit(contextId, sourceHead)
  if (!sourceCommit) {
    return {
      ok: false as const,
      error: `Head commit "${sourceHead}" of branch "${sourceBranch}" is missing`,
    }
  }

  const targetHead = await getRef(contextId, targetBranch)

  const result = await commit(contextId, {
    message:
      message ?? `Merge branch "${sourceBranch}" into "${targetBranch}"`,
    parent: targetHead,
    tree: sourceCommit.tree,
    branch: targetBranch,
  })

  return {
    ok: true as const,
    branch: targetBranch,
    commitId: result.commitId,
    ref: result.ref,
    mergedFrom: { branch: sourceBranch, commitId: sourceHead },
  }
}

type ToolName = 'context_merge'

export const handleContextMerge = (async ({
  previousToolCallFinished,
  toolCall,
  runId,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  runId: string
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  await previousToolCallFinished

  const result = await mergeContext({
    contextId: runId,
    sourceBranch: toolCall.input.branch,
    message: toolCall.input.message,
  })

  return {
    output: jsonToolResult({
      message: result.ok
        ? `Merged context branch ${result.mergedFrom.branch} into ${result.branch}: ${result.commitId}`
        : result.error,
    }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
