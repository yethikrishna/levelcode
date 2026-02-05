import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

export const handleEndTurn = (async (params: {
  previousToolCallFinished: Promise<any>
  toolCall: LevelCodeToolCall<'end_turn'>
}): Promise<{ output: LevelCodeToolOutput<'end_turn'> }> => {
  const { previousToolCallFinished } = params

  await previousToolCallFinished
  return { output: [{ type: 'json', value: { message: 'Turn ended.' } }] }
}) satisfies LevelCodeToolHandlerFunction<'end_turn'>
