import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../hooks/use-theme'
import { useTeamStore } from '../../state/team-store'
import { TeamPanel } from '../team-panel'

import type { TeamConfig, TeamMember } from '@levelcode/common/types/team-config'

initializeThemeStore()

// -----------------------------------------------------------------------------
// Helper factories
// -----------------------------------------------------------------------------

const createMember = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  agentId: `agent-${Math.random().toString(36).slice(2, 8)}`,
  name: 'alice',
  role: 'senior-engineer',
  agentType: 'claude',
  model: 'opus-4',
  joinedAt: Date.now(),
  status: 'active',
  cwd: '/tmp/workspace',
  ...overrides,
})

const createTeamConfig = (
  overrides: Partial<TeamConfig> = {},
): TeamConfig => ({
  name: 'test-team',
  description: 'A test team',
  createdAt: Date.now(),
  leadAgentId: 'lead-1',
  phase: 'planning',
  members: [],
  settings: { maxMembers: 10, autoAssign: false },
  ...overrides,
})

// -----------------------------------------------------------------------------
// Setup / teardown
// -----------------------------------------------------------------------------

beforeEach(() => {
  useTeamStore.getState().reset()
})

afterEach(() => {
  useTeamStore.getState().reset()
})

// =============================================================================
// 1. Renders null when no active team
// =============================================================================

describe('TeamPanel', () => {
  describe('no active team', () => {
    test('renders nothing when activeTeam is null', () => {
      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toBe('')
    })

    test('renders nothing after reset clears the active team', () => {
      const team = createTeamConfig()
      useTeamStore.getState().setActiveTeam(team)
      useTeamStore.getState().reset()

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toBe('')
    })
  })

  // ===========================================================================
  // 2. Shows team name and phase when team is active
  // ===========================================================================

  describe('team header', () => {
    test('displays the team name', () => {
      const team = createTeamConfig({ name: 'alpha-squad' })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('alpha-squad')
    })

    test('displays the current phase in uppercase', () => {
      const team = createTeamConfig({ phase: 'pre-alpha' })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('PRE ALPHA')
    })

    test('displays planning phase by default', () => {
      const team = createTeamConfig({ phase: 'planning' })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('PLANNING')
    })

    test('displays production phase correctly', () => {
      const team = createTeamConfig({ phase: 'production' })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('PRODUCTION')
    })
  })

  // ===========================================================================
  // 3. Shows correct member count
  // ===========================================================================

  describe('member count', () => {
    test('shows 0/N when team has no members', () => {
      const team = createTeamConfig({
        members: [],
        settings: { maxMembers: 5, autoAssign: false },
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('0/5')
    })

    test('shows correct count with multiple members', () => {
      const members = [
        createMember({ name: 'alice' }),
        createMember({ name: 'bob' }),
        createMember({ name: 'charlie' }),
      ]
      const team = createTeamConfig({
        members,
        settings: { maxMembers: 8, autoAssign: false },
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('3/8')
    })

    test('shows N/N when team is full', () => {
      const members = [
        createMember({ name: 'alice' }),
        createMember({ name: 'bob' }),
      ]
      const team = createTeamConfig({
        members,
        settings: { maxMembers: 2, autoAssign: false },
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('2/2')
    })
  })

  // ===========================================================================
  // 4. Lists members with role, status, name
  // ===========================================================================

  describe('member list', () => {
    test('displays member name with @ prefix', () => {
      const team = createTeamConfig({
        members: [createMember({ name: 'devbot' })],
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('@devbot')
    })

    test('displays formatted role with capitalized words', () => {
      const team = createTeamConfig({
        members: [createMember({ role: 'senior-engineer' })],
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('Senior Engineer')
    })

    test('displays single-word role capitalized', () => {
      const team = createTeamConfig({
        members: [createMember({ role: 'coordinator' })],
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('Coordinator')
    })

    test('displays multi-hyphen role correctly', () => {
      const team = createTeamConfig({
        members: [createMember({ role: 'senior-staff-engineer' })],
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('Senior Staff Engineer')
    })

    test('displays current task ID when member has one', () => {
      const team = createTeamConfig({
        members: [
          createMember({ name: 'worker', currentTaskId: 'TASK-42' }),
        ],
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('[TASK-42]')
    })

    test('does not display task bracket when member has no current task', () => {
      const team = createTeamConfig({
        members: [
          createMember({ name: 'idler', currentTaskId: undefined }),
        ],
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).not.toContain('[')
    })

    test('renders multiple members in the list', () => {
      const team = createTeamConfig({
        members: [
          createMember({ name: 'alice', role: 'coordinator', status: 'active' }),
          createMember({ name: 'bob', role: 'researcher', status: 'idle' }),
          createMember({ name: 'carol', role: 'tester', status: 'completed' }),
        ],
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('@alice')
      expect(markup).toContain('@bob')
      expect(markup).toContain('@carol')
      expect(markup).toContain('Coordinator')
      expect(markup).toContain('Researcher')
      expect(markup).toContain('Tester')
    })
  })

  // ===========================================================================
  // 5. Color codes status correctly
  // ===========================================================================

  describe('status labels and colors', () => {
    test('active status shows "working" label', () => {
      const team = createTeamConfig({
        members: [createMember({ status: 'active' })],
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('working')
    })

    test('idle status shows "idle" label', () => {
      const team = createTeamConfig({
        members: [createMember({ status: 'idle' })],
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('idle')
    })

    test('failed status shows "failed" label', () => {
      const team = createTeamConfig({
        members: [createMember({ status: 'failed' })],
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('failed')
    })

    test('completed status shows "done" label', () => {
      const team = createTeamConfig({
        members: [createMember({ status: 'completed' })],
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('done')
    })

    test('different statuses render with distinct color attributes', () => {
      const team = createTeamConfig({
        members: [
          createMember({ agentId: 'a1', name: 'worker', status: 'active' }),
          createMember({ agentId: 'a2', name: 'waiter', status: 'idle' }),
          createMember({ agentId: 'a3', name: 'broken', status: 'failed' }),
          createMember({ agentId: 'a4', name: 'finisher', status: 'completed' }),
        ],
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)

      // All four status labels should be present
      expect(markup).toContain('working')
      expect(markup).toContain('idle')
      expect(markup).toContain('failed')
      expect(markup).toContain('done')
    })
  })

  // ===========================================================================
  // 6. Updates when store changes
  // ===========================================================================

  describe('reactivity to store changes', () => {
    test('reflects phase change via setPhase', () => {
      const team = createTeamConfig({ phase: 'alpha' })
      useTeamStore.getState().setActiveTeam(team)

      // Verify initial phase
      let markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('ALPHA')

      // Change phase
      useTeamStore.getState().setPhase('beta')

      markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('BETA')
    })

    test('reflects member update via updateMember', () => {
      const member = createMember({
        agentId: 'agent-x',
        name: 'agent-x',
        status: 'active',
      })
      const team = createTeamConfig({ members: [member] })
      useTeamStore.getState().setActiveTeam(team)

      // Initially active -> "working"
      let markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('working')

      // Update status to failed
      useTeamStore.getState().updateMember('agent-x', { status: 'failed' })

      markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('failed')
    })

    test('reflects team swap via setActiveTeam', () => {
      const teamA = createTeamConfig({ name: 'team-alpha' })
      useTeamStore.getState().setActiveTeam(teamA)

      let markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('team-alpha')

      const teamB = createTeamConfig({ name: 'team-beta' })
      useTeamStore.getState().setActiveTeam(teamB)

      markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('team-beta')
      expect(markup).not.toContain('team-alpha')
    })

    test('renders null after setActiveTeam(null)', () => {
      const team = createTeamConfig({ name: 'disposable' })
      useTeamStore.getState().setActiveTeam(team)

      let markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('disposable')

      useTeamStore.getState().setActiveTeam(null)

      markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toBe('')
    })

    test('reflects added task on existing member', () => {
      const member = createMember({
        agentId: 'worker-1',
        name: 'worker',
        currentTaskId: undefined,
      })
      const team = createTeamConfig({ members: [member] })
      useTeamStore.getState().setActiveTeam(team)

      let markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).not.toContain('[')

      useTeamStore.getState().updateMember('worker-1', {
        currentTaskId: 'TASK-99',
      })

      markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toContain('[TASK-99]')
    })
  })

  // ===========================================================================
  // Width prop
  // ===========================================================================

  describe('width prop', () => {
    test('renders with default width without errors', () => {
      const team = createTeamConfig({
        members: [createMember()],
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel />)
      expect(markup).toBeTruthy()
    })

    test('renders with custom width without errors', () => {
      const team = createTeamConfig({
        members: [createMember()],
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel width={100} />)
      expect(markup).toBeTruthy()
    })

    test('renders with narrow width without errors', () => {
      const team = createTeamConfig({
        members: [createMember()],
      })
      useTeamStore.getState().setActiveTeam(team)

      const markup = renderToStaticMarkup(<TeamPanel width={10} />)
      expect(markup).toBeTruthy()
    })
  })
})
