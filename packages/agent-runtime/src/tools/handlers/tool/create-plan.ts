import { postStreamProcessing } from './write-file'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type { FileProcessingState } from './write-file'
import type {
  ClientToolCall,
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { Logger } from '@levelcode/common/types/contracts/logger'

export const handleCreatePlan = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<'create_plan'>

  fileProcessingState: FileProcessingState
  logger: Logger

  requestClientToolCall: (
    toolCall: ClientToolCall<'create_plan'>,
  ) => Promise<LevelCodeToolOutput<'create_plan'>>
  writeToClient: (chunk: string) => void
}): Promise<{
  output: LevelCodeToolOutput<'create_plan'>
}> => {
  const {
    fileProcessingState,
    logger,
    previousToolCallFinished,
    toolCall,
    requestClientToolCall,
    writeToClient,
  } = params
  const { path, plan } = toolCall.input

  logger.debug(
    {
      path,
      plan,
    },
    'Create plan',
  )
  // Add the plan file to the processing queue
  const change = {
    tool: 'create_plan' as const,
    path,
    content: plan,
    messages: [],
    toolCallId: toolCall.toolCallId,
  }
  fileProcessingState.promisesByPath[path].push(Promise.resolve(change))
  fileProcessingState.allPromises.push(Promise.resolve(change))

  await previousToolCallFinished
  return {
    output: await postStreamProcessing<'create_plan'>(
      change,
      fileProcessingState,
      writeToClient,
      requestClientToolCall,
    ),
  }
}) satisfies LevelCodeToolHandlerFunction<'create_plan'>
