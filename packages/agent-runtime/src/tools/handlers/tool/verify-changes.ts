import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

type ToolName = 'verify_changes'

/**
 * Verification runs on the client (it needs the project's filesystem and
 * toolchain), so this handler simply forwards the call.
 */
export const handleVerifyChanges = (async ({
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
    toolName: 'verify_changes',
    toolCallId: toolCall.toolCallId,
    input: toolCall.input,
  }
  await previousToolCallFinished
  return { output: await requestClientToolCall(clientToolCall) }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
