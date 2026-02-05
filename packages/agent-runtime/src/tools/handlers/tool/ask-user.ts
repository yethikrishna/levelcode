import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

type ToolName = 'ask_user'

// Handler for ask_user - delegates to client
export const handleAskUser = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  requestClientToolCall: (toolCall: any) => Promise<any>
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished

  const result = await requestClientToolCall(toolCall as any)
  return {
    output: result,
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
