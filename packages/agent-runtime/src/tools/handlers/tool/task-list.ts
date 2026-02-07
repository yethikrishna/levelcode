import * as fs from 'fs'
import { jsonToolResult } from '@levelcode/common/util/messages'
import { getTeamsDir, listTasks } from '@levelcode/common/utils/team-fs'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

function getActiveTeamName(): string | null {
  let teamsDir: string
  try {
    teamsDir = getTeamsDir()
  } catch {
    return null
  }
  if (!fs.existsSync(teamsDir)) {
    return null
  }
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(teamsDir, { withFileTypes: true })
  } catch {
    return null
  }
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

  let tasks
  try {
    tasks = listTasks(teamName)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    return {
      output: jsonToolResult({
        error: `Failed to list tasks: ${errorMessage}`,
        tasks: [],
      }),
    }
  }

  const summary = tasks.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    owner: t.owner ?? null,
    blockedBy: (Array.isArray(t.blockedBy) ? t.blockedBy : []).filter((id) => {
      const blocker = tasks.find((bt) => bt.id === id)
      return blocker && blocker.status !== 'completed'
    }),
  }))

  return {
    output: jsonToolResult({ tasks: summary }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
