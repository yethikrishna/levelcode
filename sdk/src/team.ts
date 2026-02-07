import {
  createTeam as fsCreateTeam,
  deleteTeam as fsDeleteTeam,
  loadTeamConfig,
  saveTeamConfig,
  addTeamMember,
  removeTeamMember,
  sendMessage,
  readInbox,
  clearInbox,
  createTask,
  updateTask,
  listTasks,
  getTask,
} from '@levelcode/common/utils/team-fs'
import {
  listAllTeams,
  findTeamByName,
} from '@levelcode/common/utils/team-discovery'
import { getTeamPreset, listPresets } from '@levelcode/common/utils/team-presets'

import type {
  TeamConfig,
  TeamMember,
  TeamTask,
  DevPhase,
  TeamRole,
} from '@levelcode/common/types/team-config'
import type { TeamProtocolMessage } from '@levelcode/common/types/team-protocol'
import type { TeamSummary } from '@levelcode/common/utils/team-discovery'
import type { PresetConfig } from '@levelcode/common/utils/team-presets'
import type { RunOptions, LevelCodeClientOptions } from './run'
import type { RunState } from './run-state'

export type CreateTeamOptions = {
  description?: string
  phase?: DevPhase
  preset?: string
  members?: Array<{
    name: string
    role: TeamRole
    agentType: string
    model: string
    cwd?: string
  }>
  settings?: {
    maxMembers?: number
    autoAssign?: boolean
  }
}

export type RunWithTeamOptions = RunOptions &
  LevelCodeClientOptions & {
    teamName: string
    memberName: string
    role: TeamRole
  }

export type TeamStatus = {
  config: TeamConfig
  tasks: TeamTask[]
  memberCount: number
}

/**
 * Creates a new team with the given name and options.
 * If a preset is specified, uses its member/settings defaults.
 */
export function sdkCreateTeam(
  name: string,
  leadAgentId: string,
  options?: CreateTeamOptions,
): TeamConfig {
  let presetConfig: PresetConfig | null = null
  if (options?.preset) {
    presetConfig = getTeamPreset(options.preset)
    if (!presetConfig) {
      throw new Error(
        `Unknown team preset "${options.preset}". Available presets: ${listPresets().join(', ')}`,
      )
    }
  }

  const now = Date.now()
  const members: TeamMember[] = []

  if (presetConfig) {
    for (const pm of presetConfig.members) {
      members.push({
        agentId: `${name}-${pm.name}`,
        name: pm.name,
        role: pm.role,
        agentType: pm.agentType,
        model: pm.model,
        joinedAt: now,
        status: 'idle',
        cwd: process.cwd(),
      })
    }
  } else if (options?.members) {
    for (const m of options.members) {
      members.push({
        agentId: `${name}-${m.name}`,
        name: m.name,
        role: m.role,
        agentType: m.agentType,
        model: m.model,
        joinedAt: now,
        status: 'idle',
        cwd: m.cwd ?? process.cwd(),
      })
    }
  }

  const config: TeamConfig = {
    name,
    description: options?.description ?? presetConfig?.description ?? '',
    createdAt: now,
    leadAgentId,
    phase: options?.phase ?? presetConfig?.defaultPhase ?? 'planning',
    members,
    settings: {
      maxMembers:
        options?.settings?.maxMembers ??
        presetConfig?.settings.maxMembers ??
        10,
      autoAssign:
        options?.settings?.autoAssign ??
        presetConfig?.settings.autoAssign ??
        true,
    },
  }

  fsCreateTeam(config)
  return config
}

/**
 * Deletes a team by name and removes all associated data.
 */
export function sdkDeleteTeam(name: string): void {
  const existing = findTeamByName(name)
  if (!existing) {
    throw new Error(`Team "${name}" not found`)
  }
  fsDeleteTeam(name)
}

/**
 * Gets the full status of a team including config and tasks.
 */
export function sdkGetTeamStatus(name: string): TeamStatus {
  const config = findTeamByName(name)
  if (!config) {
    throw new Error(`Team "${name}" not found`)
  }
  const tasks = listTasks(name)
  return {
    config,
    tasks,
    memberCount: config.members.length,
  }
}

/**
 * Lists all teams with summary information.
 */
export function sdkListTeams(): TeamSummary[] {
  return listAllTeams()
}

// Re-export types for SDK consumers
export type {
  TeamConfig,
  TeamMember,
  TeamTask,
  DevPhase,
  TeamRole,
  TeamProtocolMessage,
  TeamSummary,
  PresetConfig,
}
