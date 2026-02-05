import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { Logger } from '@levelcode/common/types/contracts/logger'

export const handleThinkDeeply = (async (params: {
  previousToolCallFinished: Promise<any>
  toolCall: LevelCodeToolCall<'think_deeply'>
  logger: Logger
}): Promise<{ output: LevelCodeToolOutput<'think_deeply'> }> => {
  const { previousToolCallFinished, toolCall, logger } = params
  const { thought } = toolCall.input

  logger.debug(
    {
      thought,
    },
    'Thought deeply',
  )

  await previousToolCallFinished
  return { output: [{ type: 'json', value: { message: 'Thought logged.' } }] }
}) satisfies LevelCodeToolHandlerFunction<'think_deeply'>
