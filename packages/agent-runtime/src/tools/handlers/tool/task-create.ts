import { jsonToolResult } from '@levelcode/common/util/messages'
import {
  createTask,
  listTasks,
} from '@levelcode/common/utils/team-fs'
import { findCurrentTeam } from '@levelcode/common/utils/team-discovery'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { TeamTask } from '@levelcode/common/types/team-config'

function errorResult(message: string) {
  return { output: jsonToolResult({ error: message }) }
}

type ToolName = 'task_create'
export const handleTaskCreate = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  agentStepId: string
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, agentStepId } = params
  const { subject, description, activeForm, priority, metadata } = toolCall.input

  await previousToolCallFinished

  // Validate required inputs
  if (!subject || typeof subject !== 'string' || subject.trim() === '') {
    return errorResult('A non-empty "subject" is required to create a task.')
  }

  if (!description || typeof description !== 'string' || description.trim() === '') {
    return errorResult('A non-empty "description" is required to create a task.')
  }

  let teamResult: ReturnType<typeof findCurrentTeam>
  try {
    teamResult = findCurrentTeam(agentStepId)
  } catch {
    return errorResult(
      'Failed to look up team for the current agent. The teams directory may be inaccessible.',
    )
  }
  if (!teamResult) {
    return errorResult(
      'No active team found. Create a team first using team_create.',
    )
  }
  const teamName = teamResult.teamName

  let existingTasks: TeamTask[]
  try {
    existingTasks = listTasks(teamName)
  } catch {
    // Tasks directory may be corrupted - start fresh with id 1
    existingTasks = []
  }

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
    priority: priority ?? 'medium',
    blockedBy: [],
    blocks: [],
    phase: 'planning',
    activeForm,
    createdAt: now,
    updatedAt: now,
    metadata,
  }

  try {
    await createTask(teamName, task)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    return errorResult(`Failed to create task: ${errorMessage}`)
  }

  return {
    output: jsonToolResult({
      taskId,
      subject,
    }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
