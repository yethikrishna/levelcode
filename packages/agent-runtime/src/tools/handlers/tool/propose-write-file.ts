import { createPatch } from 'diff'

import {
  getProposedContent,
  setProposedContent,
} from './proposed-content-store'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { RequestOptionalFileFn } from '@levelcode/common/types/contracts/client'
import type { Logger } from '@levelcode/common/types/contracts/logger'
import type { ParamsExcluding } from '@levelcode/common/types/function-params'

/**
 * Proposes writing a file without actually applying the changes.
 * Simply overwrites the file exactly with the given content (creating if it doesn't exist).
 * Returns a unified diff of the changes for review.
 */
export const handleProposeWriteFile = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: LevelCodeToolCall<'propose_write_file'>

    logger: Logger
    runId: string

    requestOptionalFile: RequestOptionalFileFn
  } & ParamsExcluding<RequestOptionalFileFn, 'filePath'>,
): Promise<{ output: LevelCodeToolOutput<'propose_write_file'> }> => {
  const {
    previousToolCallFinished,
    toolCall,
    logger: _logger,
    runId,
    requestOptionalFile,
  } = params
  const { path, content } = toolCall.input

  // Get content from proposed state first (by runId), then fall back to disk
  const getProposedOrDiskContent = async (): Promise<string | null> => {
    const proposedContent = getProposedContent(runId, path)
    if (proposedContent !== undefined) {
      return proposedContent
    }
    return requestOptionalFile({ ...params, filePath: path })
  }

  const initialContent = await getProposedOrDiskContent()

  // Normalize content (remove leading newline if present)
  const newContent = content.startsWith('\n') ? content.slice(1) : content

  // Store the proposed content for future propose calls on the same file (by runId)
  setProposedContent(runId, path, Promise.resolve(newContent))

  await previousToolCallFinished

  // Generate unified diff
  const oldContent = initialContent ?? ''
  let patch = createPatch(path, oldContent, newContent)
  
  // Strip the header lines, keep only from @@ onwards
  const lines = patch.split('\n')
  const hunkStartIndex = lines.findIndex((line) => line.startsWith('@@'))
  if (hunkStartIndex !== -1) {
    patch = lines.slice(hunkStartIndex).join('\n')
  }

  const isNewFile = initialContent === null
  const message = isNewFile ? `Proposed new file ${path}` : `Proposed changes to ${path}`

  return {
    output: [
      {
        type: 'json',
        value: {
          file: path,
          message,
          unifiedDiff: patch,
        },
      },
    ],
  }
}) as LevelCodeToolHandlerFunction<'propose_write_file'>
