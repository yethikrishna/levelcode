import { jsonToolResult } from '@levelcode/common/util/messages'
import type { JSONValue } from '@levelcode/common/types/json'
import { getTask } from '@levelcode/common/utils/team-fs'
import { findCurrentTeam } from '@levelcode/common/utils/team-discovery'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

function errorResult(message: string) {
  return { output: jsonToolResult({ error: message }) }
}

type ToolName = 'task_get'
export const handleTaskGet = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  agentStepId: string
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, agentStepId } = params
  const { taskId } = toolCall.input

  await previousToolCallFinished

  // Validate required input
  if (!taskId || typeof taskId !== 'string' || taskId.trim() === '') {
    return errorResult('A non-empty "taskId" is required.')
  }

  // Validate taskId is numeric to prevent path traversal
  if (!/^[0-9]+$/.test(taskId)) {
    return errorResult('Task ID must be numeric.')
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
    output: jsonToolResult(task as unknown as JSONValue),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
