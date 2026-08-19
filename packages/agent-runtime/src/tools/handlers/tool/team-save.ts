import { jsonToolResult } from '@levelcode/common/util/messages'

import { teamRegistry, type PersistedTeamMember } from '../../../team-registry'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

export interface TeamSaveInput {
  name: string
  members: PersistedTeamMember[]
  description?: string
}

type ToolName = 'team_save'

export const handleTeamSave = (async ({
  previousToolCallFinished,
  toolCall,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  await previousToolCallFinished
  const input = toolCall.input
  const team = await teamRegistry.save({
    name: input.name,
    members: input.members,
    description: input.description,
  })

  return {
    output: jsonToolResult({
      message: `Team "${team.name}" saved with ${team.members.length} members.`,
    }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
