import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

type ToolName = 'repo_map'

/**
 * The repo map is computed on the client where the project files (and the
 * tree-sitter wasm parsers) live, so this handler forwards the call.
 */
export const handleRepoMap = (async ({
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
    toolName: 'repo_map',
    toolCallId: toolCall.toolCallId,
    input: toolCall.input,
  }
  await previousToolCallFinished
  return { output: await requestClientToolCall(clientToolCall) }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
