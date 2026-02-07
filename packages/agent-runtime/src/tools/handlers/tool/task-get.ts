import * as fs from 'fs'
import { jsonToolResult } from '@levelcode/common/util/messages'
import { getTeamsDir, getTask } from '@levelcode/common/utils/team-fs'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

function getActiveTeamName(): string | null {
  const teamsDir = getTeamsDir()
  if (!fs.existsSync(teamsDir)) {
    return null
  }
  const entries = fs.readdirSync(teamsDir, { withFileTypes: true })
  const teamDirs = entries.filter((e) => e.isDirectory())
  if (teamDirs.length === 0) {
    return null
  }
  return teamDirs[0]!.name
}

type ToolName = 'task_get'
export const handleTaskGet = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall } = params
  const { taskId } = toolCall.input

  await previousToolCallFinished

  const teamName = getActiveTeamName()
  if (!teamName) {
    return {
      output: jsonToolResult({
        error: 'No active team found. Create a team first using TeamCreate.',
      }),
    }
  }

  const task = getTask(teamName, taskId)
  if (!task) {
    return {
      output: jsonToolResult({
        error: `Task "${taskId}" not found.`,
      }),
    }
  }

  return {
    output: jsonToolResult(task),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
