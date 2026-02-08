import * as fs from 'fs'
import { getTeamsDir, loadTeamConfig } from '@levelcode/common/utils/team-fs'
import { getLastActiveTeam } from '@levelcode/common/utils/team-discovery'

import type { TeamConfig } from '@levelcode/common/types/team-config'

export interface TeamContext {
  teamName: string
  agentName: string
  config: TeamConfig
}

/**
 * Discovers the team context for a given agent identifier.
 * Scans all team directories to find which team the agent belongs to.
 * Matches against both the raw agentId and a "lead-" prefixed variant.
 *
 * Falls back to the single-team shortcut or the last-active-team marker
 * when the exact ID match fails (common for the orchestrator whose
 * agentStepId rotates every tool call).
 *
 * Returns null if the agent is not part of any team (e.g., standalone mode).
 */
export function findTeamContext(agentIdentifier: string): TeamContext | null {
  const teamsDir = getTeamsDir()
  if (!fs.existsSync(teamsDir)) {
    return null
  }

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(teamsDir, { withFileTypes: true })
  } catch {
    return null
  }

  // Collect all valid team configs
  const allTeams: { teamName: string; config: TeamConfig }[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const config = loadTeamConfig(entry.name)
    if (!config) {
      continue
    }
    allTeams.push({ teamName: config.name, config })
  }

  // --- Pass 1: exact member match ---
  for (const { teamName, config } of allTeams) {
    for (const member of config.members) {
      if (
        member.agentId === agentIdentifier ||
        member.agentId === `lead-${agentIdentifier}`
      ) {
        return { teamName, agentName: member.name, config }
      }
    }
  }

  // --- Fallback helper: resolve team then default agent name to lead ---
  function resolveFromTeam(team: { teamName: string; config: TeamConfig }): TeamContext {
    const leadMember = team.config.members.find(
      (m) => m.agentId === team.config.leadAgentId,
    )
    const agentName = leadMember?.name ?? 'team-lead'
    return { teamName: team.teamName, agentName, config: team.config }
  }

  // --- Fallback 1: single-team shortcut ---
  if (allTeams.length === 1) {
    return resolveFromTeam(allTeams[0]!)
  }

  // --- Fallback 2: last-active team marker ---
  const lastActive = getLastActiveTeam()
  if (lastActive) {
    const match = allTeams.find((t) => t.teamName === lastActive)
    if (match) {
      return resolveFromTeam(match)
    }
  }

  return null
}
