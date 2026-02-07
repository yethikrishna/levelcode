import * as fs from 'fs'
import * as path from 'path'
import { jsonToolResult } from '@levelcode/common/util/messages'
import {
  getTeamsDir,
  getTasksDir,
  getTask,
  updateTask,
} from '@levelcode/common/utils/team-fs'
import { emitTaskCompleted } from '@levelcode/common/utils/team-hook-emitter'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { TrackEventFn } from '@levelcode/common/types/contracts/analytics'
import type { Logger } from '@levelcode/common/types/contracts/logger'

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'blocked', 'deleted'] as const

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

type ToolName = 'task_update'
export const handleTaskUpdate = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  trackEvent: TrackEventFn
  userId: string | undefined
  logger: Logger
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, trackEvent, userId, logger } = params
  const {
    taskId,
    status,
    subject,
    description,
    activeForm,
    owner,
    priority,
    addBlocks,
    addBlockedBy,
    metadata,
  } = toolCall.input

  await previousToolCallFinished

  // Validate required input
  if (!taskId || typeof taskId !== 'string' || taskId.trim() === '') {
    return errorResult('A non-empty "taskId" is required.')
  }

  // Validate status if provided
  if (status !== undefined && !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    return errorResult(
      `Invalid status "${status}". Expected one of: ${VALID_STATUSES.join(', ')}`,
    )
  }

  const teamName = getActiveTeamName()
  if (!teamName) {
    return errorResult(
      'No active team found. Create a team first using TeamCreate.',
    )
  }

  let existingTask
  try {
    existingTask = getTask(teamName, taskId)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    return errorResult(
      `Failed to read task "${taskId}": ${errorMessage}`,
    )
  }

  if (!existingTask) {
    return errorResult(`Task "${taskId}" not found.`)
  }

  if (status === 'deleted') {
    try {
      const taskPath = path.join(getTasksDir(teamName), `${taskId}.json`)
      if (fs.existsSync(taskPath)) {
        fs.unlinkSync(taskPath)
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      return errorResult(
        `Failed to delete task "${taskId}": ${errorMessage}`,
      )
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
  if (priority !== undefined) updates.priority = priority

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
    if (metadata && typeof metadata === 'object') {
      for (const [key, value] of Object.entries(metadata)) {
        if (value === null) {
          delete mergedMetadata[key]
        } else {
          mergedMetadata[key] = value
        }
      }
    }
    updates.metadata = mergedMetadata
  }

  try {
    await updateTask(teamName, taskId, updates)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    return errorResult(`Failed to update task "${taskId}": ${errorMessage}`)
  }

  let updatedTask
  try {
    updatedTask = getTask(teamName, taskId)
  } catch {
    // Update succeeded but re-read failed - still report success
    updatedTask = { ...existingTask, ...updates }
  }

  // Fire team hook event when a task is marked as completed
  if (status === 'completed' && existingTask.status !== 'completed') {
    try {
      emitTaskCompleted({
        taskId,
        taskSubject: updatedTask?.subject ?? existingTask.subject,
        owner: updatedTask?.owner ?? existingTask.owner ?? '',
        teamName,
        trackEvent,
        userId: userId ?? '',
        logger,
      })
    } catch {
      // Hook emission failure should not block the update response
    }
  }

  return {
    output: jsonToolResult({
      message: `Task "${taskId}" updated successfully`,
      task: updatedTask as unknown as Record<string, unknown>,
    }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
