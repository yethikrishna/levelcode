import {
  generateTeamContextPrompt,
} from './team-context-prompt'

import type { DevPhase, TeamRole } from '@levelcode/common/types/team-config'

/**
 * Generates a system prompt section explaining the agent's team context.
 * This is the primary entry point for injecting team awareness into agent system prompts.
 *
 * Delegates to generateTeamContextPrompt for role-based guidance, communication
 * protocols, task workflows, idle behavior, and shutdown instructions.
 */
export function generateTeamPromptSection(
  teamName: string,
  agentName: string,
  role: TeamRole,
  phase: DevPhase,
): string {
  const leaderRoles: TeamRole[] = ['coordinator', 'cto', 'vp-engineering', 'director']
  const isLeader = leaderRoles.includes(role)

  return generateTeamContextPrompt({
    teamName,
    agentName,
    role,
    phase,
    isLeader,
  })
}
