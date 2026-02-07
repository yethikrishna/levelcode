import * as fs from 'fs'
import { jsonToolResult } from '@levelcode/common/util/messages'
import {
  deleteTeam,
  getTeamsDir,
  loadTeamConfig,
} from '@levelcode/common/utils/team-fs'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'

type ToolName = 'team_delete'

function findCurrentTeam(agentStepId: string): string | null {
  const teamsDir = getTeamsDir()
  if (!fs.existsSync(teamsDir)) {
    return null
  }
  const entries = fs.readdirSync(teamsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const config = loadTeamConfig(entry.name)
    if (!config) {
      continue
    }
    if (config.leadAgentId === `lead-${agentStepId}`) {
      return config.name
    }
    for (const member of config.members) {
      if (member.agentId === `lead-${agentStepId}` || member.agentId === agentStepId) {
        return config.name
      }
    }
  }
  return null
}

export const handleTeamDelete = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  agentStepId: string
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, agentStepId } = params

  await previousToolCallFinished

  const teamName = findCurrentTeam(agentStepId)
  if (!teamName) {
    return {
      output: jsonToolResult({
        message: 'No team found for the current agent context. Cannot delete.',
      }),
    }
  }

  const config = loadTeamConfig(teamName)
  if (!config) {
    return {
      output: jsonToolResult({
        message: `Team "${teamName}" config not found. It may have already been deleted.`,
      }),
    }
  }

  // Validate no active members besides the lead
  const activeNonLeadMembers = config.members.filter(
    (m) => m.status === 'active' && m.agentId !== config.leadAgentId,
  )
  if (activeNonLeadMembers.length > 0) {
    const activeNames = activeNonLeadMembers.map((m) => m.name).join(', ')
    return {
      output: jsonToolResult({
        message: `Cannot delete team "${teamName}": ${activeNonLeadMembers.length} active member(s) besides lead: ${activeNames}. Ensure all agents have completed their work before deleting the team.`,
      }),
    }
  }

  try {
    deleteTeam(teamName)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    return {
      output: jsonToolResult({
        message: `Failed to delete team "${teamName}": ${errorMessage}`,
      }),
    }
  }

  return {
    output: jsonToolResult({
      message: `Team "${teamName}" deleted successfully. All team and task directories have been removed.`,
    }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
