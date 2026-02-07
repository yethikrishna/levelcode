import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import {
  PHASE_ORDER,
  getPhaseTools,
  isToolAllowedInPhase,
  canTransition,
  transitionPhase,
  TEAM_TOOL_NAMES,
} from '../dev-phases'

import {
  createTeam,
  loadTeamConfig,
  saveTeamConfig,
  deleteTeam,
} from '../team-fs'

import {
  onTeamHookEvent,
  dispatchTeamHookEvent,
} from '../team-hook-emitter'

import type { DevPhase, TeamConfig } from '../../types/team-config'
import type { TeamHookEvent, PhaseTransitionHookEvent } from '../../types/team-hook-events'

// ── Helpers ──────────────────────────────────────────────────────────

let tmpDir: string
let origHome: string | undefined
let origUserProfile: string | undefined

function makeTeamConfig(phase: DevPhase = 'planning', overrides?: Partial<TeamConfig>): TeamConfig {
  return {
    name: 'phase-test-team',
    description: 'Team for phase integration tests',
    createdAt: Date.now(),
    leadAgentId: 'lead-001',
    phase,
    members: [
      {
        agentId: 'lead-001',
        name: 'team-lead',
        role: 'coordinator',
        agentType: 'coordinator',
        model: 'test-model',
        joinedAt: Date.now(),
        status: 'active',
        cwd: '/tmp',
      },
    ],
    settings: {
      maxMembers: 20,
      autoAssign: true,
    },
    ...overrides,
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-integration-test-'))
  origHome = process.env.HOME
  origUserProfile = process.env.USERPROFILE
  process.env.HOME = tmpDir
  process.env.USERPROFILE = tmpDir
})

afterEach(() => {
  if (origHome !== undefined) {
    process.env.HOME = origHome
  } else {
    delete process.env.HOME
  }
  if (origUserProfile !== undefined) {
    process.env.USERPROFILE = origUserProfile
  } else {
    delete process.env.USERPROFILE
  }
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

// ── Tests ────────────────────────────────────────────────────────────

describe('phase-integration', () => {
  // ── 1. Tool gating per phase ─────────────────────────────────────

  describe('tool gating per phase', () => {
    it('should block send_message, team_create, team_delete, spawn_agents in planning', () => {
      expect(isToolAllowedInPhase('send_message', 'planning')).toBe(false)
      expect(isToolAllowedInPhase('team_create', 'planning')).toBe(false)
      expect(isToolAllowedInPhase('team_delete', 'planning')).toBe(false)
      expect(isToolAllowedInPhase('spawn_agents', 'planning')).toBe(false)
      expect(isToolAllowedInPhase('spawn_agent_inline', 'planning')).toBe(false)
    })

    it('should allow task tools in every phase', () => {
      const taskTools = ['task_create', 'task_get', 'task_update', 'task_list']
      for (const phase of PHASE_ORDER) {
        for (const tool of taskTools) {
          expect(isToolAllowedInPhase(tool, phase)).toBe(true)
        }
      }
    })

    it('should block spawn_agents and team_delete in pre-alpha', () => {
      expect(isToolAllowedInPhase('spawn_agents', 'pre-alpha')).toBe(false)
      expect(isToolAllowedInPhase('spawn_agent_inline', 'pre-alpha')).toBe(false)
      expect(isToolAllowedInPhase('team_delete', 'pre-alpha')).toBe(false)
    })

    it('should allow send_message and team_create in pre-alpha', () => {
      expect(isToolAllowedInPhase('send_message', 'pre-alpha')).toBe(true)
      expect(isToolAllowedInPhase('team_create', 'pre-alpha')).toBe(true)
    })

    it('should allow all team tools in alpha and every later phase', () => {
      const laterPhases: DevPhase[] = ['alpha', 'beta', 'production', 'mature']
      for (const phase of laterPhases) {
        for (const tool of TEAM_TOOL_NAMES) {
          expect(isToolAllowedInPhase(tool, phase)).toBe(true)
        }
      }
    })

    it('should never gate non-team tools regardless of phase', () => {
      const nonTeamTools = ['read_files', 'str_replace', 'run_terminal_command', 'glob', 'write_file']
      for (const phase of PHASE_ORDER) {
        for (const tool of nonTeamTools) {
          expect(isToolAllowedInPhase(tool, phase)).toBe(true)
        }
      }
    })
  })

  // ── 2. Phase transitions through full lifecycle ──────────────────

  describe('phase transitions through full lifecycle', () => {
    it('should transition sequentially through all phases via transitionPhase', () => {
      let config = makeTeamConfig('planning')
      const phases: DevPhase[] = ['pre-alpha', 'alpha', 'beta', 'production', 'mature']

      for (const nextPhase of phases) {
        config = transitionPhase(config, nextPhase)
        expect(config.phase).toBe(nextPhase)
      }
    })

    it('should persist each phase change to disk through the full lifecycle', async () => {
      const config = makeTeamConfig('planning')
      createTeam(config)

      const phases: DevPhase[] = ['pre-alpha', 'alpha', 'beta', 'production', 'mature']
      let current = config

      for (const nextPhase of phases) {
        current = transitionPhase(current, nextPhase)
        await saveTeamConfig('phase-test-team', current)

        const loaded = loadTeamConfig('phase-test-team')
        expect(loaded).not.toBeNull()
        expect(loaded!.phase).toBe(nextPhase)
      }
    })

    it('should preserve team name and members through all transitions', () => {
      let config = makeTeamConfig('planning')
      const originalName = config.name
      const originalLeadId = config.leadAgentId

      const phases: DevPhase[] = ['pre-alpha', 'alpha', 'beta', 'production', 'mature']
      for (const nextPhase of phases) {
        config = transitionPhase(config, nextPhase)
      }

      expect(config.name).toBe(originalName)
      expect(config.leadAgentId).toBe(originalLeadId)
      expect(config.members).toHaveLength(1)
      expect(config.members[0]!.agentId).toBe('lead-001')
    })
  })

  // ── 3. Phase cannot skip ─────────────────────────────────────────

  describe('phase cannot skip', () => {
    it('planning -> alpha should fail', () => {
      expect(canTransition('planning', 'alpha')).toBe(false)
    })

    it('planning -> beta should fail', () => {
      expect(canTransition('planning', 'beta')).toBe(false)
    })

    it('planning -> production should fail', () => {
      expect(canTransition('planning', 'production')).toBe(false)
    })

    it('planning -> mature should fail', () => {
      expect(canTransition('planning', 'mature')).toBe(false)
    })

    it('pre-alpha -> beta should fail', () => {
      expect(canTransition('pre-alpha', 'beta')).toBe(false)
    })

    it('pre-alpha -> production should fail', () => {
      expect(canTransition('pre-alpha', 'production')).toBe(false)
    })

    it('alpha -> production should fail (skips beta)', () => {
      expect(canTransition('alpha', 'production')).toBe(false)
    })

    it('beta -> mature should fail (skips production)', () => {
      expect(canTransition('beta', 'mature')).toBe(false)
    })

    it('transitionPhase should throw when trying to skip a phase', () => {
      const config = makeTeamConfig('planning')
      expect(() => transitionPhase(config, 'alpha')).toThrow(
        'Cannot transition from "planning" to "alpha"',
      )
    })

    it('transitionPhase should throw when skipping from pre-alpha to beta', () => {
      const config = makeTeamConfig('pre-alpha')
      expect(() => transitionPhase(config, 'beta')).toThrow(
        'Cannot transition from "pre-alpha" to "beta"',
      )
    })
  })

  // ── 4. Phase cannot go backward ──────────────────────────────────

  describe('phase cannot go backward', () => {
    it('beta -> alpha should fail', () => {
      expect(canTransition('beta', 'alpha')).toBe(false)
    })

    it('beta -> pre-alpha should fail', () => {
      expect(canTransition('beta', 'pre-alpha')).toBe(false)
    })

    it('beta -> planning should fail', () => {
      expect(canTransition('beta', 'planning')).toBe(false)
    })

    it('alpha -> planning should fail', () => {
      expect(canTransition('alpha', 'planning')).toBe(false)
    })

    it('production -> beta should fail', () => {
      expect(canTransition('production', 'beta')).toBe(false)
    })

    it('mature -> production should fail', () => {
      expect(canTransition('mature', 'production')).toBe(false)
    })

    it('mature -> planning should fail', () => {
      expect(canTransition('mature', 'planning')).toBe(false)
    })

    it('same-phase transition should fail', () => {
      for (const phase of PHASE_ORDER) {
        expect(canTransition(phase, phase)).toBe(false)
      }
    })

    it('transitionPhase should throw for backward transition beta -> alpha', () => {
      const config = makeTeamConfig('beta')
      expect(() => transitionPhase(config, 'alpha')).toThrow(
        'Cannot transition from "beta" to "alpha"',
      )
    })

    it('transitionPhase should throw for backward transition production -> pre-alpha', () => {
      const config = makeTeamConfig('production')
      expect(() => transitionPhase(config, 'pre-alpha')).toThrow(
        'Cannot transition from "production" to "pre-alpha"',
      )
    })
  })

  // ── 5. Team config updates correctly on phase change ─────────────

  describe('team config updates correctly on phase change', () => {
    it('should update phase in the returned config object', () => {
      const config = makeTeamConfig('planning')
      const updated = transitionPhase(config, 'pre-alpha')
      expect(updated.phase).toBe('pre-alpha')
    })

    it('should not mutate the original config', () => {
      const config = makeTeamConfig('planning')
      const updated = transitionPhase(config, 'pre-alpha')
      expect(config.phase).toBe('planning')
      expect(updated.phase).toBe('pre-alpha')
      expect(updated).not.toBe(config)
    })

    it('should persist phase change via saveTeamConfig and reload correctly', async () => {
      const config = makeTeamConfig('planning')
      createTeam(config)

      const updated = transitionPhase(config, 'pre-alpha')
      await saveTeamConfig('phase-test-team', updated)

      const loaded = loadTeamConfig('phase-test-team')
      expect(loaded).not.toBeNull()
      expect(loaded!.phase).toBe('pre-alpha')
      expect(loaded!.name).toBe('phase-test-team')
      expect(loaded!.members).toHaveLength(1)
    })

    it('should preserve settings across phase transitions', async () => {
      const config = makeTeamConfig('planning', {
        settings: { maxMembers: 10, autoAssign: false },
      })
      createTeam(config)

      const updated = transitionPhase(config, 'pre-alpha')
      await saveTeamConfig('phase-test-team', updated)

      const loaded = loadTeamConfig('phase-test-team')
      expect(loaded!.settings.maxMembers).toBe(10)
      expect(loaded!.settings.autoAssign).toBe(false)
    })

    it('should survive team deletion and recreation at a new phase', () => {
      const config = makeTeamConfig('alpha')
      createTeam(config)
      deleteTeam('phase-test-team')

      const loaded = loadTeamConfig('phase-test-team')
      expect(loaded).toBeNull()

      const newConfig = makeTeamConfig('beta')
      createTeam(newConfig)

      const reloaded = loadTeamConfig('phase-test-team')
      expect(reloaded).not.toBeNull()
      expect(reloaded!.phase).toBe('beta')
    })
  })

  // ── 6. getPhaseTools returns correct tool lists for each phase ───

  describe('getPhaseTools returns correct tool lists for each phase', () => {
    it('planning: only task tools', () => {
      const tools = getPhaseTools('planning')
      expect(tools).toEqual(['task_create', 'task_update', 'task_get', 'task_list'])
    })

    it('pre-alpha: task tools + send_message + team_create', () => {
      const tools = getPhaseTools('pre-alpha')
      expect(tools).toContain('task_create')
      expect(tools).toContain('task_update')
      expect(tools).toContain('task_get')
      expect(tools).toContain('task_list')
      expect(tools).toContain('send_message')
      expect(tools).toContain('team_create')
      expect(tools).not.toContain('team_delete')
      expect(tools).not.toContain('spawn_agents')
      expect(tools).not.toContain('spawn_agent_inline')
      expect(tools).toHaveLength(6)
    })

    it('alpha: all team tools', () => {
      const tools = getPhaseTools('alpha')
      expect(tools).toHaveLength(TEAM_TOOL_NAMES.length)
      for (const tool of TEAM_TOOL_NAMES) {
        expect(tools).toContain(tool)
      }
    })

    it('beta: same as alpha', () => {
      expect(getPhaseTools('beta')).toEqual(getPhaseTools('alpha'))
    })

    it('production: same as alpha', () => {
      expect(getPhaseTools('production')).toEqual(getPhaseTools('alpha'))
    })

    it('mature: same as alpha', () => {
      expect(getPhaseTools('mature')).toEqual(getPhaseTools('alpha'))
    })

    it('tool count increases monotonically across phases', () => {
      let prevCount = 0
      for (const phase of PHASE_ORDER) {
        const count = getPhaseTools(phase).length
        expect(count).toBeGreaterThanOrEqual(prevCount)
        prevCount = count
      }
    })

    it('each later phase is a superset of the previous phase tools', () => {
      for (let i = 1; i < PHASE_ORDER.length; i++) {
        const prevTools = getPhaseTools(PHASE_ORDER[i - 1]!)
        const currTools = getPhaseTools(PHASE_ORDER[i]!)
        for (const tool of prevTools) {
          expect(currTools).toContain(tool)
        }
      }
    })
  })

  // ── 7. Phase transition fires the correct hook event ─────────────

  describe('phase transition fires the correct hook event', () => {
    it('should fire a phase_transition event via dispatchTeamHookEvent', () => {
      const events: TeamHookEvent[] = []
      const unsubscribe = onTeamHookEvent((event) => {
        events.push(event)
      })

      const hookEvent: PhaseTransitionHookEvent = {
        type: 'phase_transition',
        teamName: 'phase-test-team',
        fromPhase: 'planning',
        toPhase: 'pre-alpha',
        timestamp: Date.now(),
      }
      dispatchTeamHookEvent(hookEvent)

      expect(events).toHaveLength(1)
      expect(events[0]!.type).toBe('phase_transition')

      const evt = events[0] as PhaseTransitionHookEvent
      expect(evt.teamName).toBe('phase-test-team')
      expect(evt.fromPhase).toBe('planning')
      expect(evt.toPhase).toBe('pre-alpha')
      expect(evt.timestamp).toBeGreaterThan(0)

      unsubscribe()
    })

    it('should deliver the event to multiple listeners', () => {
      let count1 = 0
      let count2 = 0

      const unsub1 = onTeamHookEvent(() => { count1++ })
      const unsub2 = onTeamHookEvent(() => { count2++ })

      dispatchTeamHookEvent({
        type: 'phase_transition',
        teamName: 'test',
        fromPhase: 'alpha',
        toPhase: 'beta',
        timestamp: Date.now(),
      })

      expect(count1).toBe(1)
      expect(count2).toBe(1)

      unsub1()
      unsub2()
    })

    it('should not deliver events after unsubscribing', () => {
      let count = 0
      const unsub = onTeamHookEvent(() => { count++ })

      dispatchTeamHookEvent({
        type: 'phase_transition',
        teamName: 'test',
        fromPhase: 'planning',
        toPhase: 'pre-alpha',
        timestamp: Date.now(),
      })
      expect(count).toBe(1)

      unsub()

      dispatchTeamHookEvent({
        type: 'phase_transition',
        teamName: 'test',
        fromPhase: 'pre-alpha',
        toPhase: 'alpha',
        timestamp: Date.now(),
      })
      expect(count).toBe(1)
    })

    it('should fire the correct fromPhase and toPhase for each step in full lifecycle', () => {
      const transitions: Array<{ from: DevPhase; to: DevPhase }> = []
      const unsub = onTeamHookEvent((event) => {
        if (event.type === 'phase_transition') {
          transitions.push({ from: event.fromPhase, to: event.toPhase })
        }
      })

      let config = makeTeamConfig('planning')
      for (let i = 1; i < PHASE_ORDER.length; i++) {
        const from = config.phase
        const to = PHASE_ORDER[i]!
        config = transitionPhase(config, to)
        dispatchTeamHookEvent({
          type: 'phase_transition',
          teamName: config.name,
          fromPhase: from,
          toPhase: to,
          timestamp: Date.now(),
        })
      }

      expect(transitions).toHaveLength(5)
      expect(transitions[0]).toEqual({ from: 'planning', to: 'pre-alpha' })
      expect(transitions[1]).toEqual({ from: 'pre-alpha', to: 'alpha' })
      expect(transitions[2]).toEqual({ from: 'alpha', to: 'beta' })
      expect(transitions[3]).toEqual({ from: 'beta', to: 'production' })
      expect(transitions[4]).toEqual({ from: 'production', to: 'mature' })

      unsub()
    })

    it('should not propagate listener errors to the caller', () => {
      const unsub = onTeamHookEvent(() => {
        throw new Error('listener crash')
      })

      expect(() => {
        dispatchTeamHookEvent({
          type: 'phase_transition',
          teamName: 'test',
          fromPhase: 'planning',
          toPhase: 'pre-alpha',
          timestamp: Date.now(),
        })
      }).not.toThrow()

      unsub()
    })
  })
})
