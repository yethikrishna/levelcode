import { jsonToolResult } from '@levelcode/common/util/messages'
import { listTasks } from '@levelcode/common/utils/team-fs'
import { findCurrentTeam } from '@levelcode/common/utils/team-discovery'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

type ToolName = 'task_list'
export const handleTaskList = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  agentStepId: string
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, agentStepId } = params

  await previousToolCallFinished

  let teamResult: ReturnType<typeof findCurrentTeam>
  try {
    teamResult = findCurrentTeam(agentStepId)
  } catch {
    return {
      output: jsonToolResult({
        error: 'Failed to look up team for the current agent. The teams directory may be inaccessible.',
        tasks: [],
      }),
    }
  }
  if (!teamResult) {
    return {
      output: jsonToolResult({
        error: 'No active team found. Create a team first using team_create.',
        tasks: [],
      }),
    }
  }
  const teamName = teamResult.teamName

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
    priority: t.priority ?? 'medium',
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
