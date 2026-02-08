import { jsonToolResult } from '@levelcode/common/util/messages'
import {
  createTeam,
  getTeamsDir,
  getTasksDir,
  loadTeamConfig,
} from '@levelcode/common/utils/team-fs'
import { setLastActiveTeam } from '@levelcode/common/utils/team-discovery'
import { trackTeamCreated } from '@levelcode/common/utils/team-analytics'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { TrackEventFn } from '@levelcode/common/types/contracts/analytics'
import type { Logger } from '@levelcode/common/types/contracts/logger'
import type { TeamConfig } from '@levelcode/common/types/team-config'

type ToolName = 'team_create'

function errorResult(message: string) {
  return { output: jsonToolResult({ message }) }
}

export const handleTeamCreate = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  agentStepId: string
  trackEvent: TrackEventFn
  userId: string | undefined
  logger: Logger
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, agentStepId, trackEvent, userId, logger } = params
  const { team_name, description, agent_type } = toolCall.input

  await previousToolCallFinished

  // Validate required inputs
  if (!team_name || typeof team_name !== 'string' || team_name.trim() === '') {
    return errorResult('A non-empty "team_name" is required to create a team.')
  }

  // Validate team name contains only safe characters (alphanumeric, hyphens, underscores)
  if (!/^[a-zA-Z0-9_-]+$/.test(team_name)) {
    return errorResult(
      `Invalid team name "${team_name}". Team names may only contain letters, numbers, hyphens, and underscores.`,
    )
  }

  if (team_name.length > 50) {
    return errorResult(
      'Team name must be at most 50 characters.',
    )
  }

  // Check if a team with this name already exists
  try {
    const existing = loadTeamConfig(team_name)
    if (existing) {
      return errorResult(
        `A team named "${team_name}" already exists. Delete it first or choose a different name.`,
      )
    }
  } catch {
    // Config exists but is corrupted - warn and allow overwrite
  }

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
    return errorResult(`Failed to create team "${team_name}": ${errorMessage}`)
  }

  // Persist the team name so subsequent tool calls (whose agentStepId differs)
  // can locate this team via the last-active-team fallback.
  setLastActiveTeam(team_name)

  trackTeamCreated(
    { trackEvent, userId: userId ?? '', logger },
    team_name,
    teamConfig.members.length,
  )

  let teamFilePath: string
  let taskDirPath: string
  try {
    teamFilePath = `${getTeamsDir()}/${team_name}/config.json`
    taskDirPath = getTasksDir(team_name)
  } catch {
    // Team was created but path resolution failed - still report success
    return {
      output: jsonToolResult({
        message: `Team "${team_name}" created successfully. Lead: ${leadAgentId}`,
      }),
    }
  }

  return {
    output: jsonToolResult({
      message: `Team "${team_name}" created successfully. Config: ${teamFilePath}, Tasks: ${taskDirPath}, Lead: ${leadAgentId}`,
    }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
