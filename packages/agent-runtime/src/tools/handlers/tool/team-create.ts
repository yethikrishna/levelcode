import { jsonToolResult } from '@levelcode/common/util/messages'
import {
  createTeam,
  getTeamsDir,
  getTasksDir,
} from '@levelcode/common/utils/team-fs'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { TeamConfig } from '@levelcode/common/types/team-config'

type ToolName = 'team_create'
export const handleTeamCreate = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  agentStepId: string
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, agentStepId } = params
  const { team_name, description, agent_type } = toolCall.input

  await previousToolCallFinished

  const leadAgentId = `lead-${agentStepId}`
  const now = Date.now()

  const teamConfig: TeamConfig = {
    name: team_name,
    description: description ?? '',
    createdAt: now,
    leadAgentId,
    phase: 'planning',
    members: [
      {
        agentId: leadAgentId,
        name: 'team-lead',
        role: 'coordinator',
        agentType: agent_type ?? 'coordinator',
        model: '',
        joinedAt: now,
        status: 'active',
        cwd: process.cwd(),
      },
    ],
    settings: {
      maxMembers: 20,
      autoAssign: true,
    },
  }

  try {
    createTeam(teamConfig)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    return {
      output: jsonToolResult({
        message: `Failed to create team "${team_name}": ${errorMessage}`,
      }),
    }
  }

  const teamFilePath = `${getTeamsDir()}/${team_name}/config.json`
  const taskDirPath = getTasksDir(team_name)

  return {
    output: jsonToolResult({
      message: `Team "${team_name}" created successfully. Config: ${teamFilePath}, Tasks: ${taskDirPath}, Lead: ${leadAgentId}`,
    }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
