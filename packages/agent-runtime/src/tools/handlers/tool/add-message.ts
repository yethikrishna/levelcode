import { assistantMessage, userMessage } from '@levelcode/common/util/messages'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { AgentState } from '@levelcode/common/types/session-state'

export const handleAddMessage = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<'add_message'>

  agentState: AgentState
}): Promise<{
  output: LevelCodeToolOutput<'add_message'>
}> => {
  const {
    previousToolCallFinished,
    toolCall,

    agentState,
  } = params

  await previousToolCallFinished

  agentState.messageHistory.push(
    toolCall.input.role === 'user'
      ? userMessage(toolCall.input.content)
      : assistantMessage(toolCall.input.content),
  )

  return { output: [{ type: 'json', value: { message: 'Message added.' } }] }
}) satisfies LevelCodeToolHandlerFunction<'add_message'>
