import * as fs from 'fs'
import { getTeamsDir, loadTeamConfig } from '@levelcode/common/utils/team-fs'

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

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const config = loadTeamConfig(entry.name)
    if (!config) {
      continue
    }
    for (const member of config.members) {
      if (
        member.agentId === agentIdentifier ||
        member.agentId === `lead-${agentIdentifier}`
      ) {
        return { teamName: config.name, agentName: member.name, config }
      }
    }
  }

  return null
}
