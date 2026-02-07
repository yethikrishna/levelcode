import { describe, it, expect } from 'bun:test'

import { getTeamPreset, listPresets } from '../team-presets'
import type { PresetConfig, PresetMember } from '../team-presets'
import { teamRoleSchema } from '../../types/team-config-schemas'
import type { TeamRole } from '../../types/team-config'

/** All valid TeamRole values extracted from the zod schema. */
const VALID_ROLES: readonly string[] = teamRoleSchema.options

/**
 * Roles that count as a "leader" — every preset must include at least one.
 * These are the top-level roles that can lead a team.
 */
const LEADER_ROLES: TeamRole[] = [
  'coordinator',
  'cto',
  'vp-engineering',
  'director',
  'fellow',
  'distinguished-engineer',
  'principal-engineer',
]

/** Roles that should appear at most once per team preset. */
const UNIQUE_ROLES: TeamRole[] = [
  'cto',
  'coordinator',
  'fellow',
  'designer',
  'product-lead',
]

const ALL_PRESET_NAMES = listPresets()

describe('team-presets', () => {
  describe('listPresets', () => {
    it('should return all preset names', () => {
      expect(ALL_PRESET_NAMES).toContain('SMALL_TEAM')
      expect(ALL_PRESET_NAMES).toContain('STANDARD_TEAM')
      expect(ALL_PRESET_NAMES).toContain('LARGE_TEAM')
      expect(ALL_PRESET_NAMES).toContain('STARTUP_TEAM')
      expect(ALL_PRESET_NAMES).toContain('RESEARCH_TEAM')
    })

    it('should return exactly 5 presets', () => {
      expect(ALL_PRESET_NAMES).toHaveLength(5)
    })

    it('should return an array of strings', () => {
      for (const name of ALL_PRESET_NAMES) {
        expect(typeof name).toBe('string')
        expect(name.length).toBeGreaterThan(0)
      }
    })
  })

  describe('getTeamPreset', () => {
    it('should return null for invalid preset names', () => {
      expect(getTeamPreset('NONEXISTENT')).toBeNull()
      expect(getTeamPreset('')).toBeNull()
      expect(getTeamPreset('random-team')).toBeNull()
      expect(getTeamPreset('small')).toBeNull()
      expect(getTeamPreset('MEGA_TEAM')).toBeNull()
    })

    it('should return a preset for each valid name', () => {
      for (const name of ALL_PRESET_NAMES) {
        const preset = getTeamPreset(name)
        expect(preset).not.toBeNull()
      }
    })

    it('should be case-insensitive', () => {
      const upper = getTeamPreset('SMALL_TEAM')
      const lower = getTeamPreset('small_team')
      const mixed = getTeamPreset('Small_Team')

      expect(upper).not.toBeNull()
      expect(lower).not.toBeNull()
      expect(mixed).not.toBeNull()
      expect(upper!.presetName).toBe(lower!.presetName)
      expect(upper!.presetName).toBe(mixed!.presetName)
    })

    it('should accept hyphenated names', () => {
      const preset = getTeamPreset('small-team')
      expect(preset).not.toBeNull()
      expect(preset!.presetName).toBe('SMALL_TEAM')
    })

    it('should return a new instance each time (no shared state)', () => {
      const a = getTeamPreset('SMALL_TEAM')
      const b = getTeamPreset('SMALL_TEAM')
      expect(a).not.toBe(b)
      expect(a).toEqual(b)
    })
  })

  describe('preset validity', () => {
    it.each(ALL_PRESET_NAMES)('%s should have a non-empty presetName', (name) => {
      const preset = getTeamPreset(name)!
      expect(preset.presetName).toBe(name)
    })

    it.each(ALL_PRESET_NAMES)('%s should have a non-empty description', (name) => {
      const preset = getTeamPreset(name)!
      expect(typeof preset.description).toBe('string')
      expect(preset.description.length).toBeGreaterThan(0)
    })

    it.each(ALL_PRESET_NAMES)('%s should have a valid defaultPhase', (name) => {
      const preset = getTeamPreset(name)!
      const validPhases = ['planning', 'pre-alpha', 'alpha', 'beta', 'production', 'mature']
      expect(validPhases).toContain(preset.defaultPhase)
    })

    it.each(ALL_PRESET_NAMES)('%s should have valid settings', (name) => {
      const preset = getTeamPreset(name)!
      expect(typeof preset.settings.maxMembers).toBe('number')
      expect(preset.settings.maxMembers).toBeGreaterThan(0)
      expect(typeof preset.settings.autoAssign).toBe('boolean')
    })

    it.each(ALL_PRESET_NAMES)('%s should have maxMembers >= member count', (name) => {
      const preset = getTeamPreset(name)!
      expect(preset.settings.maxMembers).toBeGreaterThanOrEqual(preset.members.length)
    })
  })

  describe('preset member counts', () => {
    it('SMALL_TEAM should have 4 members', () => {
      const preset = getTeamPreset('SMALL_TEAM')!
      expect(preset.members).toHaveLength(4)
    })

    it('STANDARD_TEAM should have 8 members', () => {
      const preset = getTeamPreset('STANDARD_TEAM')!
      expect(preset.members).toHaveLength(8)
    })

    it('LARGE_TEAM should have 28 members', () => {
      const preset = getTeamPreset('LARGE_TEAM')!
      expect(preset.members).toHaveLength(28)
    })

    it('STARTUP_TEAM should have 5 members', () => {
      const preset = getTeamPreset('STARTUP_TEAM')!
      expect(preset.members).toHaveLength(5)
    })

    it('RESEARCH_TEAM should have 6 members', () => {
      const preset = getTeamPreset('RESEARCH_TEAM')!
      expect(preset.members).toHaveLength(6)
    })

    it.each(ALL_PRESET_NAMES)('%s should have at least 1 member', (name) => {
      const preset = getTeamPreset(name)!
      expect(preset.members.length).toBeGreaterThan(0)
    })
  })

  describe('preset member fields', () => {
    it.each(ALL_PRESET_NAMES)('%s members should all have required fields (name, role, agentType)', (name) => {
      const preset = getTeamPreset(name)!
      for (const member of preset.members) {
        expect(typeof member.name).toBe('string')
        expect(member.name.length).toBeGreaterThan(0)

        expect(typeof member.role).toBe('string')
        expect(member.role.length).toBeGreaterThan(0)

        expect(typeof member.agentType).toBe('string')
        expect(member.agentType.length).toBeGreaterThan(0)
      }
    })

    it.each(ALL_PRESET_NAMES)('%s members should all have a model field', (name) => {
      const preset = getTeamPreset(name)!
      for (const member of preset.members) {
        expect(typeof member.model).toBe('string')
        expect(member.model.length).toBeGreaterThan(0)
      }
    })

    it.each(ALL_PRESET_NAMES)('%s members should have unique names', (name) => {
      const preset = getTeamPreset(name)!
      const names = preset.members.map((m) => m.name)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(names.length)
    })
  })

  describe('role validity', () => {
    it.each(ALL_PRESET_NAMES)('%s should only use valid TeamRole values', (name) => {
      const preset = getTeamPreset(name)!
      for (const member of preset.members) {
        expect(VALID_ROLES).toContain(member.role)
      }
    })
  })

  describe('leader role presence', () => {
    it.each(ALL_PRESET_NAMES)('%s should have at least one leader role', (name) => {
      const preset = getTeamPreset(name)!
      const hasLeader = preset.members.some((m) => LEADER_ROLES.includes(m.role))
      expect(hasLeader).toBe(true)
    })

    it('SMALL_TEAM leader should be coordinator', () => {
      const preset = getTeamPreset('SMALL_TEAM')!
      const leaders = preset.members.filter((m) => LEADER_ROLES.includes(m.role))
      expect(leaders).toHaveLength(1)
      expect(leaders[0].role).toBe('coordinator')
    })

    it('STANDARD_TEAM leader should be coordinator', () => {
      const preset = getTeamPreset('STANDARD_TEAM')!
      const coordinators = preset.members.filter((m) => m.role === 'coordinator')
      expect(coordinators).toHaveLength(1)
    })

    it('STARTUP_TEAM leader should be cto', () => {
      const preset = getTeamPreset('STARTUP_TEAM')!
      const ctos = preset.members.filter((m) => m.role === 'cto')
      expect(ctos).toHaveLength(1)
    })

    it('LARGE_TEAM leader should be cto', () => {
      const preset = getTeamPreset('LARGE_TEAM')!
      const ctos = preset.members.filter((m) => m.role === 'cto')
      expect(ctos).toHaveLength(1)
    })

    it('RESEARCH_TEAM leader should be fellow', () => {
      const preset = getTeamPreset('RESEARCH_TEAM')!
      const fellows = preset.members.filter((m) => m.role === 'fellow')
      expect(fellows).toHaveLength(1)
    })
  })

  describe('no duplicate roles where inappropriate', () => {
    it.each(ALL_PRESET_NAMES)('%s should not have duplicate unique roles', (name) => {
      const preset = getTeamPreset(name)!
      for (const uniqueRole of UNIQUE_ROLES) {
        const count = preset.members.filter((m) => m.role === uniqueRole).length
        expect(count).toBeLessThanOrEqual(1)
      }
    })

    it('SMALL_TEAM should have exactly one coordinator', () => {
      const preset = getTeamPreset('SMALL_TEAM')!
      const coordinators = preset.members.filter((m) => m.role === 'coordinator')
      expect(coordinators).toHaveLength(1)
    })

    it('LARGE_TEAM should have exactly one cto', () => {
      const preset = getTeamPreset('LARGE_TEAM')!
      const ctos = preset.members.filter((m) => m.role === 'cto')
      expect(ctos).toHaveLength(1)
    })

    it('allows multiple senior-engineer roles', () => {
      const preset = getTeamPreset('STANDARD_TEAM')!
      const seniors = preset.members.filter((m) => m.role === 'senior-engineer')
      expect(seniors.length).toBeGreaterThan(1)
    })

    it('allows multiple manager roles', () => {
      const preset = getTeamPreset('LARGE_TEAM')!
      const managers = preset.members.filter((m) => m.role === 'manager')
      expect(managers.length).toBeGreaterThan(1)
    })

    it('allows multiple researcher roles', () => {
      const preset = getTeamPreset('RESEARCH_TEAM')!
      const researchers = preset.members.filter((m) => m.role === 'researcher')
      expect(researchers.length).toBeGreaterThan(1)
    })
  })
})
