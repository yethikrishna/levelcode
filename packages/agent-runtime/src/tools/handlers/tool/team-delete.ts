import { jsonToolResult } from '@levelcode/common/util/messages'
import { deleteTeam } from '@levelcode/common/utils/team-fs'
import { findCurrentTeam } from '@levelcode/common/utils/team-discovery'
import { trackTeamDeleted } from '@levelcode/common/utils/team-analytics'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { TrackEventFn } from '@levelcode/common/types/contracts/analytics'
import type { Logger } from '@levelcode/common/types/contracts/logger'

type ToolName = 'team_delete'

function errorResult(message: string) {
  return { output: jsonToolResult({ message }) }
}

export const handleTeamDelete = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: LevelCodeToolCall<ToolName>
  agentStepId: string
  trackEvent: TrackEventFn
  userId: string | undefined
  logger: Logger
}): Promise<{ output: LevelCodeToolOutput<ToolName> }> => {
  const { previousToolCallFinished, agentStepId, trackEvent, userId, logger } = params

  await previousToolCallFinished

  let result: ReturnType<typeof findCurrentTeam>
  try {
    result = findCurrentTeam(agentStepId)
  } catch {
    return errorResult(
      'Failed to look up team for the current agent. The teams directory may be inaccessible.',
    )
  }

  if (!result) {
    return errorResult(
      'No team found for the current agent context. Cannot delete.',
    )
  }

  const { teamName, config } = result

  // Validate no active members besides the lead
  const members = Array.isArray(config.members) ? config.members : []
  const activeNonLeadMembers = members.filter(
    (m) => m.status === 'active' && m.agentId !== config.leadAgentId,
  )
  if (activeNonLeadMembers.length > 0) {
    const activeNames = activeNonLeadMembers.map((m) => m.name).join(', ')
    return errorResult(
      `Cannot delete team "${teamName}": ${activeNonLeadMembers.length} active member(s) besides lead: ${activeNames}. Ensure all agents have completed their work before deleting the team.`,
    )
  }

  try {
    deleteTeam(teamName)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    return errorResult(`Failed to delete team "${teamName}": ${errorMessage}`)
  }

  try {
    trackTeamDeleted(
      { trackEvent, userId: userId ?? '', logger },
      teamName,
    )
  } catch {
    // Analytics failure should not block deletion response
  }

  return {
    output: jsonToolResult({
      message: `Team "${teamName}" deleted successfully. All team and task directories have been removed.`,
    }),
  }
}) satisfies LevelCodeToolHandlerFunction<ToolName>
