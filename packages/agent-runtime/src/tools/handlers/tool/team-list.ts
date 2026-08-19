import { jsonToolResult } from '@levelcode/common/util/messages'

import { teamRegistry } from '../../../team-registry'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

type ToolName = 'team_list'

export const handleTeamList = (async ({
  previousToolCallFinished,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  await previousToolCallFinished
  const teams = await teamRegistry.list()
  return {
    output: jsonToolResult({
      message: teams.length
        ? `Found ${teams.length} saved teams: ${teams
            .map((team) => team.name)
            .join(', ')}.`
        : 'No saved teams yet. Use team_save to persist a team.',
    }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
