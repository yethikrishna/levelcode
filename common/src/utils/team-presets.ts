import type { TeamRole, DevPhase, TeamConfig } from '../types/team-config'

/**
 * A preset member definition. Contains the role and descriptive name
 * but not runtime fields (agentId, joinedAt, status, cwd) which are
 * assigned at spawn time.
 */
export interface PresetMember {
  name: string
  role: TeamRole
  agentType: string
  model: string
}

/**
 * A preset configuration that can be used to bootstrap a team.
 * Contains the member list and default settings but no runtime state.
 */
export interface PresetConfig {
  presetName: string
  description: string
  defaultPhase: DevPhase
  members: PresetMember[]
  settings: {
    maxMembers: number
    autoAssign: boolean
  }
}

function smallTeam(): PresetConfig {
  return {
    presetName: 'SMALL_TEAM',
    description: 'A lean team for small projects: 1 coordinator, 2 senior engineers, and 1 reviewer.',
    defaultPhase: 'planning',
    members: [
      { name: 'lead', role: 'coordinator', agentType: 'coordinator', model: 'claude-sonnet-4-5-20250929' },
      { name: 'eng-1', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'eng-2', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'reviewer', role: 'reviewer', agentType: 'reviewer', model: 'claude-sonnet-4-5-20250929' },
    ],
    settings: {
      maxMembers: 6,
      autoAssign: true,
    },
  }
}

function standardTeam(): PresetConfig {
  return {
    presetName: 'STANDARD_TEAM',
    description: 'A balanced team for medium projects: coordinator, manager, 3 senior engineers, researcher, reviewer, and tester.',
    defaultPhase: 'planning',
    members: [
      { name: 'lead', role: 'coordinator', agentType: 'coordinator', model: 'claude-sonnet-4-5-20250929' },
      { name: 'pm', role: 'manager', agentType: 'manager', model: 'claude-sonnet-4-5-20250929' },
      { name: 'eng-1', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'eng-2', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'eng-3', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'researcher', role: 'researcher', agentType: 'researcher', model: 'claude-sonnet-4-5-20250929' },
      { name: 'reviewer', role: 'reviewer', agentType: 'reviewer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'tester', role: 'tester', agentType: 'tester', model: 'claude-sonnet-4-5-20250929' },
    ],
    settings: {
      maxMembers: 12,
      autoAssign: true,
    },
  }
}

function largeTeam(): PresetConfig {
  return {
    presetName: 'LARGE_TEAM',
    description: 'A full-scale team for large projects: CTO, directors, managers, engineers at multiple levels, researchers, testers, designer, and product lead.',
    defaultPhase: 'planning',
    members: [
      // Leadership
      { name: 'cto', role: 'cto', agentType: 'cto', model: 'claude-opus-4-6' },
      { name: 'dir-1', role: 'director', agentType: 'director', model: 'claude-opus-4-6' },
      { name: 'dir-2', role: 'director', agentType: 'director', model: 'claude-opus-4-6' },
      // Management
      { name: 'mgr-1', role: 'manager', agentType: 'manager', model: 'claude-sonnet-4-5-20250929' },
      { name: 'mgr-2', role: 'manager', agentType: 'manager', model: 'claude-sonnet-4-5-20250929' },
      { name: 'mgr-3', role: 'manager', agentType: 'manager', model: 'claude-sonnet-4-5-20250929' },
      { name: 'mgr-4', role: 'manager', agentType: 'manager', model: 'claude-sonnet-4-5-20250929' },
      // Senior engineers
      { name: 'sr-eng-1', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'sr-eng-2', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'sr-eng-3', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'sr-eng-4', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'sr-eng-5', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'sr-eng-6', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'sr-eng-7', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'sr-eng-8', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'sr-eng-9', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'sr-eng-10', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
      // Mid-level engineers
      { name: 'mid-eng-1', role: 'mid-level-engineer', agentType: 'mid-level-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'mid-eng-2', role: 'mid-level-engineer', agentType: 'mid-level-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'mid-eng-3', role: 'mid-level-engineer', agentType: 'mid-level-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'mid-eng-4', role: 'mid-level-engineer', agentType: 'mid-level-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'mid-eng-5', role: 'mid-level-engineer', agentType: 'mid-level-engineer', model: 'claude-sonnet-4-5-20250929' },
      // Specialists
      { name: 'researcher-1', role: 'researcher', agentType: 'researcher', model: 'claude-sonnet-4-5-20250929' },
      { name: 'researcher-2', role: 'researcher', agentType: 'researcher', model: 'claude-sonnet-4-5-20250929' },
      { name: 'tester-1', role: 'tester', agentType: 'tester', model: 'claude-sonnet-4-5-20250929' },
      { name: 'tester-2', role: 'tester', agentType: 'tester', model: 'claude-sonnet-4-5-20250929' },
      { name: 'designer', role: 'designer', agentType: 'designer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'product', role: 'product-lead', agentType: 'product-lead', model: 'claude-sonnet-4-5-20250929' },
    ],
    settings: {
      maxMembers: 30,
      autoAssign: true,
    },
  }
}

function startupTeam(): PresetConfig {
  return {
    presetName: 'STARTUP_TEAM',
    description: 'A nimble startup team: CTO leading 2 staff engineers, a designer, and a product lead.',
    defaultPhase: 'planning',
    members: [
      { name: 'cto', role: 'cto', agentType: 'cto', model: 'claude-opus-4-6' },
      { name: 'staff-1', role: 'staff-engineer', agentType: 'staff-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'staff-2', role: 'staff-engineer', agentType: 'staff-engineer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'designer', role: 'designer', agentType: 'designer', model: 'claude-sonnet-4-5-20250929' },
      { name: 'product', role: 'product-lead', agentType: 'product-lead', model: 'claude-sonnet-4-5-20250929' },
    ],
    settings: {
      maxMembers: 8,
      autoAssign: true,
    },
  }
}

function researchTeam(): PresetConfig {
  return {
    presetName: 'RESEARCH_TEAM',
    description: 'A research-focused team: fellow leading 2 researchers, 2 scientists, and a senior engineer for implementation.',
    defaultPhase: 'planning',
    members: [
      { name: 'fellow', role: 'fellow', agentType: 'fellow', model: 'claude-opus-4-6' },
      { name: 'researcher-1', role: 'researcher', agentType: 'researcher', model: 'claude-sonnet-4-5-20250929' },
      { name: 'researcher-2', role: 'researcher', agentType: 'researcher', model: 'claude-sonnet-4-5-20250929' },
      { name: 'scientist-1', role: 'scientist', agentType: 'scientist', model: 'claude-sonnet-4-5-20250929' },
      { name: 'scientist-2', role: 'scientist', agentType: 'scientist', model: 'claude-sonnet-4-5-20250929' },
      { name: 'eng', role: 'senior-engineer', agentType: 'senior-engineer', model: 'claude-sonnet-4-5-20250929' },
    ],
    settings: {
      maxMembers: 10,
      autoAssign: true,
    },
  }
}

const PRESETS: Record<string, () => PresetConfig> = {
  SMALL_TEAM: smallTeam,
  STANDARD_TEAM: standardTeam,
  LARGE_TEAM: largeTeam,
  STARTUP_TEAM: startupTeam,
  RESEARCH_TEAM: researchTeam,
}

/**
 * Returns a preset team configuration by name, or null if not found.
 * Preset names are case-insensitive.
 */
export function getTeamPreset(name: string): PresetConfig | null {
  const key = name.toUpperCase().replace(/-/g, '_')
  const factory = PRESETS[key]
  return factory ? factory() : null
}

/**
 * Returns the list of all available preset names.
 */
export function listPresets(): string[] {
  return Object.keys(PRESETS)
}
