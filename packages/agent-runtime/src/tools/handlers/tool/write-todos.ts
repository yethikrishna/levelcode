import { jsonToolResult } from '@levelcode/common/util/messages'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

type ToolName = 'write_todos'
export const handleWriteTodos = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished } = params

  await previousToolCallFinished

  return { output: jsonToolResult({ message: 'Todos written' }) }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
