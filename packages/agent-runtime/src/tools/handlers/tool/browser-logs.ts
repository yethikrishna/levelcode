import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

export const handleBrowserLogs = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<'browser_logs'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'browser_logs'>,
  ) => Promise<LevelCodeToolOutput<'browser_logs'>>
}): Promise<{
  output: LevelCodeToolOutput<'browser_logs'>
}> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies LevelCodeToolHandlerFunction<'browser_logs'>
