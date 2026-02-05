import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

export const handleCodeSearch = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<'code_search'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'code_search'>,
  ) => Promise<LevelCodeToolOutput<'code_search'>>
}): Promise<{
  output: LevelCodeToolOutput<'code_search'>
}> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies LevelCodeToolHandlerFunction<'code_search'>
