import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
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

// ---------------------------------------------------------------------------
// Last-active team tracking
// ---------------------------------------------------------------------------
// When team_create runs, it writes the team name to a small marker file so
// that subsequent tool calls from the same orchestrator session (whose
// agentStepId changes every call) can still locate the team.

function getLastActiveTeamPath(): string {
  return path.join(os.homedir(), '.config', 'levelcode', 'teams', '.last-active-team')
}

/**
 * Persist the most-recently-created/used team name so that it can be
 * resolved even when the caller's agentStepId no longer matches any
 * member in the config.
 */
export function setLastActiveTeam(teamName: string): void {
  try {
    const filePath = getLastActiveTeamPath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, teamName, 'utf-8')
  } catch {
    // Best-effort; failure is non-fatal
  }
}

/**
 * Read the last-active team name, if any.
 */
export function getLastActiveTeam(): string | null {
  try {
    const filePath = getLastActiveTeamPath()
    if (!fs.existsSync(filePath)) {
      return null
    }
    const name = fs.readFileSync(filePath, 'utf-8').trim()
    return name || null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Collects all valid team configs from disk.
 */
function loadAllTeamConfigs(): { teamName: string; config: TeamConfig }[] {
  const entries = readTeamEntries()
  const results: { teamName: string; config: TeamConfig }[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const config = safeLoadTeamConfig(entry.name)
    if (config) {
      results.push({ teamName: config.name, config })
    }
  }
  return results
}

/**
 * Finds the team that an agent belongs to, returning the team name and config.
 * Matches against both the raw agentId and a "lead-" prefixed variant.
 *
 * Because the orchestrator's agentStepId is regenerated on every tool call,
 * the exact-match lookup will often fail for the team lead. To handle this,
 * the function applies the following fallback strategy:
 *
 *   1. Exact match against leadAgentId or any member's agentId.
 *   2. If exactly one team exists on disk, return it (single-team shortcut).
 *   3. Look up the last-active team name written by team_create.
 */
export function findCurrentTeam(agentId: string): { teamName: string; config: TeamConfig } | null {
  const allTeams = loadAllTeamConfigs()

  // --- Pass 1: exact match ---
  for (const { teamName, config } of allTeams) {
    if (config.leadAgentId === `lead-${agentId}`) {
      return { teamName, config }
    }
    for (const member of config.members) {
      if (member.agentId === `lead-${agentId}` || member.agentId === agentId) {
        return { teamName, config }
      }
    }
  }

  // --- Fallback 1: single-team shortcut ---
  if (allTeams.length === 1) {
    return allTeams[0]!
  }

  // --- Fallback 2: last-active team marker ---
  const lastActive = getLastActiveTeam()
  if (lastActive) {
    const match = allTeams.find((t) => t.teamName === lastActive)
    if (match) {
      return match
    }
  }

  return null
}

/**
 * Finds the team and the matched agent name for a given agent identifier.
 * This is the richer variant that also returns which member name was matched.
 *
 * Applies the same fallback strategy as findCurrentTeam (single-team shortcut
 * and last-active marker) and defaults the agent name to 'team-lead' when the
 * caller's ID doesn't match any member (which happens when the orchestrator's
 * agentStepId has rotated).
 */
export function findCurrentTeamAndAgent(agentId: string): TeamAndAgent | null {
  const allTeams = loadAllTeamConfigs()

  // --- Pass 1: exact member match ---
  for (const { teamName, config } of allTeams) {
    for (const member of config.members) {
      if (member.agentId === `lead-${agentId}` || member.agentId === agentId) {
        return { teamName, agentName: member.name, config }
      }
    }
  }

  // --- Fallback: resolve team then default agent name to team-lead ---
  let resolved: { teamName: string; config: TeamConfig } | null = null

  if (allTeams.length === 1) {
    resolved = allTeams[0]!
  } else {
    const lastActive = getLastActiveTeam()
    if (lastActive) {
      resolved = allTeams.find((t) => t.teamName === lastActive) ?? null
    }
  }

  if (resolved) {
    // Try to find the lead member's name, falling back to 'team-lead'
    const leadMember = resolved.config.members.find(
      (m) => m.agentId === resolved!.config.leadAgentId,
    )
    const agentName = leadMember?.name ?? 'team-lead'
    return { teamName: resolved.teamName, agentName, config: resolved.config }
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
 * Uses the same fallback strategy as findCurrentTeam.
 */
export function getAgentTeamContext(agentId: string): AgentTeamContext | null {
  const allTeams = loadAllTeamConfigs()

  // --- Pass 1: exact member match ---
  for (const { config } of allTeams) {
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

  // --- Fallback: resolve team then default to lead member ---
  let resolved: { teamName: string; config: TeamConfig } | null = null
  if (allTeams.length === 1) {
    resolved = allTeams[0]!
  } else {
    const lastActive = getLastActiveTeam()
    if (lastActive) {
      resolved = allTeams.find((t) => t.teamName === lastActive) ?? null
    }
  }

  if (resolved) {
    const leadMember = resolved.config.members.find(
      (m) => m.agentId === resolved!.config.leadAgentId,
    )
    if (leadMember) {
      return {
        teamName: resolved.config.name,
        agentName: leadMember.name,
        role: leadMember.role,
        isLeader: true,
        phase: resolved.config.phase,
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
