import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { Logger } from '@levelcode/common/types/contracts/logger'

export const handleSuggestFollowups = (async (params: {
  previousToolCallFinished: Promise<unknown>
  toolCall: LevelCodeToolCall<'suggest_followups'>
  logger: Logger
}): Promise<{ output: LevelCodeToolOutput<'suggest_followups'> }> => {
  const { previousToolCallFinished, toolCall } = params
  const { followups: _followups } = toolCall.input

  await previousToolCallFinished
  return { output: [{ type: 'json', value: { message: 'Followups suggested!' } }] }
}) satisfies LevelCodeToolHandlerFunction<'suggest_followups'>
