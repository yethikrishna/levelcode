import { jsonToolResult } from '@levelcode/common/util/messages'

import { getFileReadingUpdates } from '../../../get-file-reading-updates'
import { renderReadFilesResult } from '../../../util/render-read-files-result'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { ParamsExcluding } from '@levelcode/common/types/function-params'
import type { ProjectFileContext } from '@levelcode/common/util/file'

type ToolName = 'read_files'
export const handleReadFiles = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: LevelCodeToolCall<ToolName>

    fileContext: ProjectFileContext
  } & ParamsExcluding<typeof getFileReadingUpdates, 'requestedFiles'>,
): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const {
    previousToolCallFinished,
    toolCall,

    fileContext,
  } = params
  const { paths } = toolCall.input

  await previousToolCallFinished

  const addedFiles = await getFileReadingUpdates({
    ...params,
    requestedFiles: paths,
  })

  return {
    output: jsonToolResult(
      renderReadFilesResult(addedFiles, fileContext.tokenCallers ?? {}),
    ),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
