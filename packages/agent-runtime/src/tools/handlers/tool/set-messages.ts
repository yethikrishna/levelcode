import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { AgentState } from '@levelcode/common/types/session-state'

export const handleSetMessages = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<'set_messages'>

  agentState: AgentState
}): Promise<{ output: LevelCodeToolOutput<'set_messages'> }> => {
  const { previousToolCallFinished, toolCall, agentState } = params

  await previousToolCallFinished
  agentState.messageHistory = toolCall.input.messages
  return { output: [{ type: 'json', value: { message: 'Messages set.' } }] }
}) satisfies LevelCodeToolHandlerFunction<'set_messages'>
