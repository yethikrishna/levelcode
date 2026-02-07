import * as fs from 'fs'
import { jsonToolResult } from '@levelcode/common/util/messages'
import { getTeamsDir, listTasks } from '@levelcode/common/utils/team-fs'

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

type ToolName = 'task_list'
export const handleTaskList = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished } = params

  await previousToolCallFinished

  const teamName = getActiveTeamName()
  if (!teamName) {
    return {
      output: jsonToolResult({
        error: 'No active team found. Create a team first using TeamCreate.',
        tasks: [],
      }),
    }
  }

  const tasks = listTasks(teamName)
  const summary = tasks.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    owner: t.owner ?? null,
    blockedBy: t.blockedBy.filter((id) => {
      const blocker = tasks.find((bt) => bt.id === id)
      return blocker && blocker.status !== 'completed'
    }),
  }))

  return {
    output: jsonToolResult({ tasks: summary }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
