import * as fs from 'fs'
import { jsonToolResult } from '@levelcode/common/util/messages'
import { getTeamsDir, getTask } from '@levelcode/common/utils/team-fs'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

function errorResult(message: string) {
  return { output: jsonToolResult({ error: message }) }
}

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

type ToolName = 'task_get'
export const handleTaskGet = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall } = params
  const { taskId } = toolCall.input

  await previousToolCallFinished

  // Validate required input
  if (!taskId || typeof taskId !== 'string' || taskId.trim() === '') {
    return errorResult('A non-empty "taskId" is required.')
  }

  const teamName = getActiveTeamName()
  if (!teamName) {
    return errorResult(
      'No active team found. Create a team first using TeamCreate.',
    )
  }

  let task
  try {
    task = getTask(teamName, taskId)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    return errorResult(
      `Failed to read task "${taskId}": ${errorMessage}`,
    )
  }

  if (!task) {
    return errorResult(`Task "${taskId}" not found.`)
  }

  return {
    output: jsonToolResult(task),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
