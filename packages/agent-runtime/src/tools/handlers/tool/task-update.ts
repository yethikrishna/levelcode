import * as fs from 'fs'
import * as path from 'path'
import { jsonToolResult } from '@levelcode/common/util/messages'
import {
  getTeamsDir,
  getTasksDir,
  getTask,
  updateTask,
} from '@levelcode/common/utils/team-fs'

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

type ToolName = 'task_update'
export const handleTaskUpdate = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall } = params
  const {
    taskId,
    status,
    subject,
    description,
    activeForm,
    owner,
    addBlocks,
    addBlockedBy,
    metadata,
  } = toolCall.input

  await previousToolCallFinished

  const teamName = getActiveTeamName()
  if (!teamName) {
    return {
      output: jsonToolResult({
        error: 'No active team found. Create a team first using TeamCreate.',
      }),
    }
  }

  const existingTask = getTask(teamName, taskId)
  if (!existingTask) {
    return {
      output: jsonToolResult({
        error: `Task "${taskId}" not found.`,
      }),
    }
  }

  if (status === 'deleted') {
    const taskPath = path.join(getTasksDir(teamName), `${taskId}.json`)
    if (fs.existsSync(taskPath)) {
      fs.unlinkSync(taskPath)
    }
    return {
      output: jsonToolResult({
        message: `Task "${taskId}" deleted.`,
      }),
    }
  }

  const updates: Record<string, unknown> = {}
  if (status !== undefined) updates.status = status
  if (subject !== undefined) updates.subject = subject
  if (description !== undefined) updates.description = description
  if (activeForm !== undefined) updates.activeForm = activeForm
  if (owner !== undefined) updates.owner = owner

  if (addBlocks && addBlocks.length > 0) {
    const currentBlocks = existingTask.blocks ?? []
    const newBlocks = [...new Set([...currentBlocks, ...addBlocks])]
    updates.blocks = newBlocks
  }

  if (addBlockedBy && addBlockedBy.length > 0) {
    const currentBlockedBy = existingTask.blockedBy ?? []
    const newBlockedBy = [...new Set([...currentBlockedBy, ...addBlockedBy])]
    updates.blockedBy = newBlockedBy
  }

  if (metadata !== undefined) {
    const currentMetadata = existingTask.metadata ?? {}
    const mergedMetadata = { ...currentMetadata }
    for (const [key, value] of Object.entries(metadata)) {
      if (value === null) {
        delete mergedMetadata[key]
      } else {
        mergedMetadata[key] = value
      }
    }
    updates.metadata = mergedMetadata
  }

  try {
    updateTask(teamName, taskId, updates)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    return {
      output: jsonToolResult({
        message: `Failed to update task "${taskId}": ${errorMessage}`,
      }),
    }
  }

  const updatedTask = getTask(teamName, taskId)

  return {
    output: jsonToolResult({
      message: `Task "${taskId}" updated successfully`,
      task: updatedTask as unknown as Record<string, unknown>,
    }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
