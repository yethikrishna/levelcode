import { buildArray } from '@levelcode/common/util/array'
import { jsonToolResult } from '@levelcode/common/util/messages'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { Subgoal } from '@levelcode/common/types/session-state'

export const handleAddSubgoal = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<'add_subgoal'>

  agentContext: Record<string, Subgoal>
}): Promise<{
  output: LevelCodeToolOutput<'add_subgoal'>
}> => {
  const { previousToolCallFinished, toolCall, agentContext } = params

  agentContext[toolCall.input.id] = {
    objective: toolCall.input.objective,
    status: toolCall.input.status,
    plan: toolCall.input.plan,
    logs: buildArray([toolCall.input.log]),
  }

  await previousToolCallFinished
  return { output: jsonToolResult({ message: 'Successfully added subgoal' }) }
}) satisfies LevelCodeToolHandlerFunction<'add_subgoal'>
