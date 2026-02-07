import * as fs from 'fs'
import { getTeamsDir, loadTeamConfig, validateTeamName } from './team-fs'
import type { TeamConfig, DevPhase, TeamRole } from '../types/team-config'

export interface TeamAndAgent {
  teamName: string
  agentName: string
  config: TeamConfig
}

export interface AgentTeamContext {
  teamName: string
  agentName: string
  role: TeamRole
  isLeader: boolean
  phase: DevPhase
}

export interface TeamSummary {
  name: string
  phase: DevPhase
  memberCount: number
}

function readTeamEntries(): fs.Dirent[] {
  let teamsDir: string
  try {
    teamsDir = getTeamsDir()
  } catch {
    return []
  }
  if (!fs.existsSync(teamsDir)) {
    return []
  }
  try {
    return fs.readdirSync(teamsDir, { withFileTypes: true })
  } catch {
    return []
  }
}

function safeLoadTeamConfig(teamName: string): TeamConfig | null {
  try {
    const config = loadTeamConfig(teamName)
    if (!config || !Array.isArray(config.members)) {
      return null
    }
    return config
  } catch {
    return null
  }
}

/**
 * Finds the team that an agent belongs to, returning the team name and config.
 * Matches against both the raw agentId and a "lead-" prefixed variant.
 */
export function findCurrentTeam(agentId: string): { teamName: string; config: TeamConfig } | null {
  const entries = readTeamEntries()
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const config = safeLoadTeamConfig(entry.name)
    if (!config) {
      continue
    }
    if (config.leadAgentId === `lead-${agentId}`) {
      return { teamName: config.name, config }
    }
    for (const member of config.members) {
      if (member.agentId === `lead-${agentId}` || member.agentId === agentId) {
        return { teamName: config.name, config }
      }
    }
  }
  return null
}

/**
 * Finds the team and the matched agent name for a given agent identifier.
 * This is the richer variant that also returns which member name was matched.
 */
export function findCurrentTeamAndAgent(agentId: string): TeamAndAgent | null {
  const entries = readTeamEntries()
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const config = safeLoadTeamConfig(entry.name)
    if (!config) {
      continue
    }
    for (const member of config.members) {
      if (member.agentId === `lead-${agentId}` || member.agentId === agentId) {
        return { teamName: config.name, agentName: member.name, config }
      }
    }
  }
  return null
}

/**
 * Direct lookup of a team by name.
 */
export function findTeamByName(name: string): TeamConfig | null {
  try {
    validateTeamName(name)
  } catch {
    return null
  }
  return safeLoadTeamConfig(name)
}

/**
 * Lists all teams with summary information.
 */
export function listAllTeams(): TeamSummary[] {
  const entries = readTeamEntries()
  const results: TeamSummary[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const config = safeLoadTeamConfig(entry.name)
    if (!config) {
      continue
    }
    results.push({
      name: config.name,
      phase: config.phase,
      memberCount: config.members.length,
    })
  }
  return results
}

/**
 * Returns full context for an agent's team membership including role and leadership status.
 */
export function getAgentTeamContext(agentId: string): AgentTeamContext | null {
  const entries = readTeamEntries()
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const config = safeLoadTeamConfig(entry.name)
    if (!config) {
      continue
    }
    for (const member of config.members) {
      if (member.agentId === `lead-${agentId}` || member.agentId === agentId) {
        return {
          teamName: config.name,
          agentName: member.name,
          role: member.role,
          isLeader: member.agentId === config.leadAgentId,
          phase: config.phase,
        }
      }
    }
  }
  return null
}

/**
 * Checks whether an agent is a member of a specific team.
 */
export function isAgentInTeam(agentId: string, teamName: string): boolean {
  try {
    validateTeamName(teamName)
  } catch {
    return false
  }
  const config = safeLoadTeamConfig(teamName)
  if (!config) {
    return false
  }
  return config.members.some(
    (m) => m.agentId === agentId || m.agentId === `lead-${agentId}`,
  )
}
