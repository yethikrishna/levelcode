import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

type ToolName = 'run_file_change_hooks'
export const handleRunFileChangeHooks = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  requestClientToolCall: (
    toolCall: ClientToolCall<ToolName>,
  ) => Promise<LevelCodeToolOutput<ToolName>>
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies LevelCodeToolHandlerFunction<'run_file_change_hooks'>
