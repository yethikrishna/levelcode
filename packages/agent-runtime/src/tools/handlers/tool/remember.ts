import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

type ToolName = 'remember'

/**
 * Memory lives in the project (.levelcode/MEMORY.md), so persistence happens
 * on the client; this handler forwards the call.
 */
export const handleRemember = (async ({
  previousToolCallFinished,
  toolCall,
  requestClientToolCall,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  requestClientToolCall: (
    clientToolCall: ClientToolCall<ToolName>,
  ) => Promise<LevelCodeToolOutput<ToolName>>
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const clientToolCall: ClientToolCall<ToolName> = {
    toolName: 'remember',
    toolCallId: toolCall.toolCallId,
    input: toolCall.input,
  }
  await previousToolCallFinished
  return { output: await requestClientToolCall(clientToolCall) }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
