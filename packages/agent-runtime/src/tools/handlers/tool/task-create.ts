import * as fs from 'fs'
import { jsonToolResult } from '@levelcode/common/util/messages'
import {
  createTask,
  getTeamsDir,
  listTasks,
} from '@levelcode/common/utils/team-fs'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { TeamTask } from '@levelcode/common/types/team-config'

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

type ToolName = 'task_create'
export const handleTaskCreate = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall } = params
  const { subject, description, activeForm, metadata } = toolCall.input

  await previousToolCallFinished

  const teamName = getActiveTeamName()
  if (!teamName) {
    return {
      output: jsonToolResult({
        error: 'No active team found. Create a team first using TeamCreate.',
      }),
    }
  }

  const existingTasks = listTasks(teamName)
  const maxId = existingTasks.reduce((max, t) => {
    const num = parseInt(t.id, 10)
    return isNaN(num) ? max : Math.max(max, num)
  }, 0)
  const taskId = String(maxId + 1)

  const now = Date.now()
  const task: TeamTask = {
    id: taskId,
    subject,
    description,
    status: 'pending',
    blockedBy: [],
    blocks: [],
    phase: 'planning',
    activeForm,
    createdAt: now,
    updatedAt: now,
    metadata,
  }

  try {
    createTask(teamName, task)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    return {
      output: jsonToolResult({
        error: `Failed to create task: ${errorMessage}`,
      }),
    }
  }

  return {
    output: jsonToolResult({
      taskId,
      subject,
    }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
