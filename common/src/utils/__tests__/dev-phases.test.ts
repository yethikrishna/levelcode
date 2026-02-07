import { describe, it, expect } from 'bun:test'

import {
  PHASE_ORDER,
  TEAM_TOOL_NAMES,
  getPhaseOrder,
  canTransition,
  transitionPhase,
  getPhaseDescription,
  getPhaseTools,
  isToolAllowedInPhase,
  getMinimumPhaseForTool,
} from '../dev-phases'

import type { TeamConfig, DevPhase } from '../../types/team-config'

function makeTeamConfig(phase: DevPhase): TeamConfig {
  return {
    name: 'test-team',
    description: 'A test team',
    createdAt: Date.now(),
    leadAgentId: 'lead-123',
    phase,
    members: [],
    settings: {
      maxMembers: 20,
      autoAssign: true,
    },
  }
}

describe('dev-phases', () => {
  describe('PHASE_ORDER', () => {
    it('should contain all six phases in order', () => {
      expect(PHASE_ORDER).toEqual([
        'planning',
        'pre-alpha',
        'alpha',
        'beta',
        'production',
        'mature',
      ])
    })

    it('should be readonly', () => {
      expect(PHASE_ORDER).toHaveLength(6)
    })
  })

  describe('getPhaseOrder', () => {
    it('should return correct index for each phase', () => {
      expect(getPhaseOrder('planning')).toBe(0)
      expect(getPhaseOrder('pre-alpha')).toBe(1)
      expect(getPhaseOrder('alpha')).toBe(2)
      expect(getPhaseOrder('beta')).toBe(3)
      expect(getPhaseOrder('production')).toBe(4)
      expect(getPhaseOrder('mature')).toBe(5)
    })

    it('should throw for an unknown phase', () => {
      expect(() => getPhaseOrder('unknown' as DevPhase)).toThrow('Unknown phase: unknown')
    })
  })

  describe('canTransition', () => {
    it('should allow forward single-step transitions', () => {
      expect(canTransition('planning', 'pre-alpha')).toBe(true)
      expect(canTransition('pre-alpha', 'alpha')).toBe(true)
      expect(canTransition('alpha', 'beta')).toBe(true)
      expect(canTransition('beta', 'production')).toBe(true)
      expect(canTransition('production', 'mature')).toBe(true)
    })

    it('should not allow backward transitions', () => {
      expect(canTransition('pre-alpha', 'planning')).toBe(false)
      expect(canTransition('alpha', 'pre-alpha')).toBe(false)
      expect(canTransition('beta', 'alpha')).toBe(false)
      expect(canTransition('production', 'beta')).toBe(false)
      expect(canTransition('mature', 'production')).toBe(false)
    })

    it('should not allow skipping phases', () => {
      expect(canTransition('planning', 'alpha')).toBe(false)
      expect(canTransition('planning', 'beta')).toBe(false)
      expect(canTransition('planning', 'production')).toBe(false)
      expect(canTransition('planning', 'mature')).toBe(false)
      expect(canTransition('pre-alpha', 'beta')).toBe(false)
      expect(canTransition('alpha', 'production')).toBe(false)
    })

    it('should not allow transitioning to the same phase', () => {
      expect(canTransition('planning', 'planning')).toBe(false)
      expect(canTransition('alpha', 'alpha')).toBe(false)
      expect(canTransition('mature', 'mature')).toBe(false)
    })

    it('should not allow transitioning from the last phase', () => {
      // mature is the last phase, so no forward transition exists
      expect(canTransition('mature', 'planning')).toBe(false)
    })
  })

  describe('transitionPhase', () => {
    it('should return a new config with the target phase', () => {
      const config = makeTeamConfig('planning')
      const result = transitionPhase(config, 'pre-alpha')

      expect(result.phase).toBe('pre-alpha')
      expect(result.name).toBe('test-team')
    })

    it('should not mutate the original config', () => {
      const config = makeTeamConfig('planning')
      const result = transitionPhase(config, 'pre-alpha')

      expect(config.phase).toBe('planning')
      expect(result.phase).toBe('pre-alpha')
      expect(result).not.toBe(config)
    })

    it('should throw for an invalid transition', () => {
      const config = makeTeamConfig('planning')
      expect(() => transitionPhase(config, 'alpha')).toThrow(
        'Cannot transition from "planning" to "alpha"',
      )
    })

    it('should throw for backward transitions', () => {
      const config = makeTeamConfig('beta')
      expect(() => transitionPhase(config, 'alpha')).toThrow(
        'Cannot transition from "beta" to "alpha"',
      )
    })

    it('should allow full sequential progression', () => {
      let config = makeTeamConfig('planning')
      config = transitionPhase(config, 'pre-alpha')
      expect(config.phase).toBe('pre-alpha')
      config = transitionPhase(config, 'alpha')
      expect(config.phase).toBe('alpha')
      config = transitionPhase(config, 'beta')
      expect(config.phase).toBe('beta')
      config = transitionPhase(config, 'production')
      expect(config.phase).toBe('production')
      config = transitionPhase(config, 'mature')
      expect(config.phase).toBe('mature')
    })
  })

  describe('getPhaseDescription', () => {
    it('should return a description for each phase', () => {
      for (const phase of PHASE_ORDER) {
        const desc = getPhaseDescription(phase)
        expect(typeof desc).toBe('string')
        expect(desc.length).toBeGreaterThan(0)
      }
    })

    it('should return distinct descriptions for each phase', () => {
      const descriptions = PHASE_ORDER.map((p) => getPhaseDescription(p))
      const unique = new Set(descriptions)
      expect(unique.size).toBe(PHASE_ORDER.length)
    })

    it('should mention planning for planning phase', () => {
      const desc = getPhaseDescription('planning')
      expect(desc.toLowerCase()).toContain('planning')
    })

    it('should mention testing for beta phase', () => {
      const desc = getPhaseDescription('beta')
      expect(desc.toLowerCase()).toContain('testing')
    })

    it('should mention production for production phase', () => {
      const desc = getPhaseDescription('production')
      expect(desc.toLowerCase()).toContain('production')
    })

    it('should mention maintenance for mature phase', () => {
      const desc = getPhaseDescription('mature')
      expect(desc.toLowerCase()).toContain('maintenance')
    })
  })

  describe('getPhaseTools', () => {
    it('should return only task tools for planning phase', () => {
      const tools = getPhaseTools('planning')
      expect(tools).toEqual(['task_create', 'task_update', 'task_get', 'task_list'])
    })

    it('should add send_message and team_create in pre-alpha phase', () => {
      const tools = getPhaseTools('pre-alpha')
      expect(tools).toContain('send_message')
      expect(tools).toContain('team_create')
      expect(tools).toContain('task_create')
      expect(tools).not.toContain('spawn_agents')
      expect(tools).not.toContain('team_delete')
    })

    it('should not include spawn_agents in planning phase', () => {
      const tools = getPhaseTools('planning')
      expect(tools).not.toContain('spawn_agents')
      expect(tools).not.toContain('spawn_agent_inline')
    })

    it('should include all team tools for alpha and later phases', () => {
      const allExpected = [
        'task_create',
        'task_update',
        'task_get',
        'task_list',
        'send_message',
        'team_create',
        'team_delete',
        'spawn_agents',
        'spawn_agent_inline',
      ]

      for (const phase of ['alpha', 'beta', 'production', 'mature'] as DevPhase[]) {
        const tools = getPhaseTools(phase)
        for (const expected of allExpected) {
          expect(tools).toContain(expected)
        }
      }
    })

    it('should return the same tools for alpha, beta, production, and mature', () => {
      const alphaTools = getPhaseTools('alpha')
      expect(getPhaseTools('beta')).toEqual(alphaTools)
      expect(getPhaseTools('production')).toEqual(alphaTools)
      expect(getPhaseTools('mature')).toEqual(alphaTools)
    })

    it('should progressively add more tools as phases advance', () => {
      const planningTools = getPhaseTools('planning')
      const preAlphaTools = getPhaseTools('pre-alpha')
      const alphaTools = getPhaseTools('alpha')

      expect(preAlphaTools.length).toBeGreaterThan(planningTools.length)
      expect(alphaTools.length).toBeGreaterThan(preAlphaTools.length)
    })
  })

  describe('isToolAllowedInPhase', () => {
    it('should allow task tools in planning phase', () => {
      expect(isToolAllowedInPhase('task_create', 'planning')).toBe(true)
      expect(isToolAllowedInPhase('task_get', 'planning')).toBe(true)
      expect(isToolAllowedInPhase('task_update', 'planning')).toBe(true)
      expect(isToolAllowedInPhase('task_list', 'planning')).toBe(true)
    })

    it('should block send_message in planning phase', () => {
      expect(isToolAllowedInPhase('send_message', 'planning')).toBe(false)
    })

    it('should block spawn_agents in planning phase', () => {
      expect(isToolAllowedInPhase('spawn_agents', 'planning')).toBe(false)
    })

    it('should block spawn_agents in pre-alpha phase', () => {
      expect(isToolAllowedInPhase('spawn_agents', 'pre-alpha')).toBe(false)
    })

    it('should allow spawn_agents in alpha phase', () => {
      expect(isToolAllowedInPhase('spawn_agents', 'alpha')).toBe(true)
    })

    it('should allow send_message in pre-alpha phase', () => {
      expect(isToolAllowedInPhase('send_message', 'pre-alpha')).toBe(true)
    })

    it('should allow team_create in pre-alpha phase', () => {
      expect(isToolAllowedInPhase('team_create', 'pre-alpha')).toBe(true)
    })

    it('should block team_delete in pre-alpha phase', () => {
      expect(isToolAllowedInPhase('team_delete', 'pre-alpha')).toBe(false)
    })

    it('should always allow non-team tools regardless of phase', () => {
      expect(isToolAllowedInPhase('read_files', 'planning')).toBe(true)
      expect(isToolAllowedInPhase('str_replace', 'planning')).toBe(true)
      expect(isToolAllowedInPhase('run_terminal_command', 'planning')).toBe(true)
      expect(isToolAllowedInPhase('glob', 'planning')).toBe(true)
    })
  })

  describe('getMinimumPhaseForTool', () => {
    it('should return planning for task tools', () => {
      expect(getMinimumPhaseForTool('task_create')).toBe('planning')
      expect(getMinimumPhaseForTool('task_get')).toBe('planning')
      expect(getMinimumPhaseForTool('task_update')).toBe('planning')
      expect(getMinimumPhaseForTool('task_list')).toBe('planning')
    })

    it('should return pre-alpha for send_message', () => {
      expect(getMinimumPhaseForTool('send_message')).toBe('pre-alpha')
    })

    it('should return pre-alpha for team_create', () => {
      expect(getMinimumPhaseForTool('team_create')).toBe('pre-alpha')
    })

    it('should return alpha for spawn_agents', () => {
      expect(getMinimumPhaseForTool('spawn_agents')).toBe('alpha')
    })

    it('should return alpha for team_delete', () => {
      expect(getMinimumPhaseForTool('team_delete')).toBe('alpha')
    })

    it('should return null for non-team tools', () => {
      expect(getMinimumPhaseForTool('read_files')).toBe(null)
      expect(getMinimumPhaseForTool('str_replace')).toBe(null)
      expect(getMinimumPhaseForTool('glob')).toBe(null)
    })
  })

  describe('TEAM_TOOL_NAMES', () => {
    it('should include all team-related tool names', () => {
      expect(TEAM_TOOL_NAMES).toContain('task_create')
      expect(TEAM_TOOL_NAMES).toContain('task_get')
      expect(TEAM_TOOL_NAMES).toContain('task_update')
      expect(TEAM_TOOL_NAMES).toContain('task_list')
      expect(TEAM_TOOL_NAMES).toContain('send_message')
      expect(TEAM_TOOL_NAMES).toContain('team_create')
      expect(TEAM_TOOL_NAMES).toContain('team_delete')
      expect(TEAM_TOOL_NAMES).toContain('spawn_agents')
      expect(TEAM_TOOL_NAMES).toContain('spawn_agent_inline')
    })

    it('should not include non-team tools', () => {
      expect(TEAM_TOOL_NAMES).not.toContain('read_files')
      expect(TEAM_TOOL_NAMES).not.toContain('str_replace')
      expect(TEAM_TOOL_NAMES).not.toContain('glob')
    })
  })
})
