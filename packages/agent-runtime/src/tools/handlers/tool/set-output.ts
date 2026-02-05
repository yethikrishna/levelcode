import { jsonToolResult } from '@levelcode/common/util/messages'

import { getAgentTemplate } from '../../../templates/agent-registry'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type {
  AgentTemplate,
  Logger,
} from '@levelcode/common/types/agent-template'
import type { FetchAgentFromDatabaseFn } from '@levelcode/common/types/contracts/database'
import type { AgentState } from '@levelcode/common/types/session-state'

type ToolName = 'set_output'
export const handleSetOutput = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>

  agentState: AgentState
  apiKey: string
  databaseAgentCache: Map<string, AgentTemplate | null>
  localAgentTemplates: Record<string, AgentTemplate>
  logger: Logger
  fetchAgentFromDatabase: FetchAgentFromDatabaseFn
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, agentState, logger } = params
  const output = toolCall.input
  const { data } = output ?? {}

  await previousToolCallFinished

  let agentTemplate = null
  if (agentState.agentType) {
    agentTemplate = await getAgentTemplate({
      ...params,
      agentId: agentState.agentType,
    })
  }

  let finalOutput: unknown
  if (agentTemplate?.outputSchema) {
    // When outputSchema is defined, validate against it
    try {
      agentTemplate.outputSchema.parse(output)
      finalOutput = output
    } catch (error) {
      try {
        // Fallback to the 'data' field if the whole output object is not valid
        agentTemplate.outputSchema.parse(data)
        finalOutput = data
      } catch (error2) {
        const errorMessage = `Output validation error: Output failed to match the output schema and was ignored. You might want to try again! Issues: ${error}`
        logger.error(
          {
            output,
            agentType: agentState.agentType,
            agentId: agentState.agentId,
            error,
          },
          'set_output validation error',
        )
        return { output: jsonToolResult({ message: errorMessage }) }
      }
    }
  } else {
    // When no outputSchema, use the data field if it is the only field
    // otherwise use the entire output object
    const keys = Object.keys(output)
    const hasOnlyDataField = keys.length === 1 && keys[0] === 'data'
    finalOutput = hasOnlyDataField ? data : output
  }

  // Set the output (completely replaces previous output)
  agentState.output = finalOutput as Record<string, unknown>

  return { output: jsonToolResult({ message: 'Output set' }) }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
