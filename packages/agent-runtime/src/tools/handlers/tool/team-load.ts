import { jsonToolResult } from '@levelcode/common/util/messages'

import { teamRegistry } from '../../../team-registry'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

export interface TeamLoadInput {
  idOrName: string
}

type ToolName = 'team_load'

export const handleTeamLoad = (async ({
  previousToolCallFinished,
  toolCall,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  await previousToolCallFinished
  const team = await teamRegistry.load(toolCall.input.id_or_name)
  if (!team) {
    return {
      output: jsonToolResult({
        message: `Team "${toolCall.input.id_or_name}" not found.`,
      }),
    }
  }
  return {
    output: jsonToolResult({
      message: `Loaded team "${team.name}" (${team.members.length} members).`,
    }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
