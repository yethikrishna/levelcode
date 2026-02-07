import { describe, it, expect, beforeEach } from 'bun:test'
import { useTeamStore } from '../team-store'
import type { TeamConfig, TeamMember, DevPhase } from '@levelcode/common/types/team-config'
import type { TeamProtocolMessage } from '@levelcode/common/types/team-protocol'

function makeTeamConfig(overrides?: Partial<TeamConfig>): TeamConfig {
  return {
    name: 'test-team',
    description: 'A test team',
    createdAt: Date.now(),
    leadAgentId: 'lead-001',
    phase: 'alpha',
    members: [
      {
        agentId: 'agent-001',
        name: 'Alice',
        role: 'senior-engineer',
        agentType: 'coder',
        model: 'claude-opus-4-6',
        joinedAt: Date.now(),
        status: 'active',
        cwd: '/workspace',
      },
      {
        agentId: 'agent-002',
        name: 'Bob',
        role: 'tester',
        agentType: 'tester',
        model: 'claude-sonnet-4-5-20250929',
        joinedAt: Date.now(),
        status: 'idle',
        cwd: '/workspace',
      },
    ],
    settings: {
      maxMembers: 10,
      autoAssign: true,
    },
    ...overrides,
  }
}

function makeMessage(overrides?: Partial<TeamProtocolMessage>): TeamProtocolMessage {
  return {
    type: 'message',
    from: 'agent-001',
    to: 'agent-002',
    text: 'Hello',
    timestamp: new Date().toISOString(),
    ...overrides,
  } as TeamProtocolMessage
}

describe('useTeamStore', () => {
  beforeEach(() => {
    useTeamStore.getState().reset()
  })

  describe('initial state', () => {
    it('has null activeTeam, empty members, and planning phase', () => {
      const state = useTeamStore.getState()
      expect(state.activeTeam).toBeNull()
      expect(state.members).toEqual([])
      expect(state.currentPhase).toBe('planning')
      expect(state.tasks).toEqual({ pending: 0, inProgress: 0, completed: 0, blocked: 0 })
      expect(state.messages).toEqual([])
      expect(state.swarmEnabled).toBe(false)
    })
  })

  describe('setActiveTeam', () => {
    it('populates members and phase from config', () => {
      const config = makeTeamConfig({ phase: 'beta' })
      useTeamStore.getState().setActiveTeam(config)

      const state = useTeamStore.getState()
      expect(state.activeTeam).toEqual(config)
      expect(state.members).toHaveLength(2)
      expect(state.members[0].agentId).toBe('agent-001')
      expect(state.members[1].agentId).toBe('agent-002')
      expect(state.currentPhase).toBe('beta')
    })

    it('resets members and phase when set to null', () => {
      const config = makeTeamConfig({ phase: 'production' })
      useTeamStore.getState().setActiveTeam(config)
      expect(useTeamStore.getState().members).toHaveLength(2)

      useTeamStore.getState().setActiveTeam(null)

      const state = useTeamStore.getState()
      expect(state.activeTeam).toBeNull()
      expect(state.members).toEqual([])
      expect(state.currentPhase).toBe('planning')
    })
  })

  describe('updateMember', () => {
    it('updates the correct member by agentId', () => {
      const config = makeTeamConfig()
      useTeamStore.getState().setActiveTeam(config)

      useTeamStore.getState().updateMember('agent-001', { status: 'working', currentTaskId: 'task-5' })

      const state = useTeamStore.getState()
      const alice = state.members.find((m) => m.agentId === 'agent-001')
      const bob = state.members.find((m) => m.agentId === 'agent-002')

      expect(alice?.status).toBe('working')
      expect(alice?.currentTaskId).toBe('task-5')
      expect(bob?.status).toBe('idle')
    })

    it('does nothing when agentId is not found', () => {
      const config = makeTeamConfig()
      useTeamStore.getState().setActiveTeam(config)
      const before = useTeamStore.getState().members

      useTeamStore.getState().updateMember('nonexistent', { status: 'blocked' })

      const after = useTeamStore.getState().members
      expect(after).toEqual(before)
    })
  })

  describe('setPhase', () => {
    it('changes currentPhase', () => {
      useTeamStore.getState().setPhase('beta')
      expect(useTeamStore.getState().currentPhase).toBe('beta')
    })

    it('can cycle through all phases', () => {
      const phases: DevPhase[] = ['planning', 'pre-alpha', 'alpha', 'beta', 'production', 'mature']
      for (const phase of phases) {
        useTeamStore.getState().setPhase(phase)
        expect(useTeamStore.getState().currentPhase).toBe(phase)
      }
    })
  })

  describe('updateTaskCounts', () => {
    it('sets task counts correctly', () => {
      const counts = { pending: 3, inProgress: 2, completed: 5, blocked: 1 }
      useTeamStore.getState().updateTaskCounts(counts)

      expect(useTeamStore.getState().tasks).toEqual(counts)
    })

    it('overwrites previous counts', () => {
      useTeamStore.getState().updateTaskCounts({ pending: 10, inProgress: 5, completed: 0, blocked: 0 })
      useTeamStore.getState().updateTaskCounts({ pending: 0, inProgress: 0, completed: 15, blocked: 0 })

      expect(useTeamStore.getState().tasks).toEqual({ pending: 0, inProgress: 0, completed: 15, blocked: 0 })
    })
  })

  describe('addMessage', () => {
    it('adds a message to the messages array', () => {
      const msg = makeMessage()
      useTeamStore.getState().addMessage(msg)

      expect(useTeamStore.getState().messages).toHaveLength(1)
      expect(useTeamStore.getState().messages[0]).toEqual(msg)
    })

    it('appends multiple messages in order', () => {
      const msg1 = makeMessage({ text: 'first' } as Partial<TeamProtocolMessage>)
      const msg2 = makeMessage({ text: 'second' } as Partial<TeamProtocolMessage>)
      const msg3 = makeMessage({ text: 'third' } as Partial<TeamProtocolMessage>)

      useTeamStore.getState().addMessage(msg1)
      useTeamStore.getState().addMessage(msg2)
      useTeamStore.getState().addMessage(msg3)

      const messages = useTeamStore.getState().messages
      expect(messages).toHaveLength(3)
      expect((messages[0] as any).text).toBe('first')
      expect((messages[1] as any).text).toBe('second')
      expect((messages[2] as any).text).toBe('third')
    })
  })

  describe('clearMessages', () => {
    it('empties the messages array', () => {
      useTeamStore.getState().addMessage(makeMessage())
      useTeamStore.getState().addMessage(makeMessage())
      expect(useTeamStore.getState().messages).toHaveLength(2)

      useTeamStore.getState().clearMessages()

      expect(useTeamStore.getState().messages).toEqual([])
    })

    it('is a no-op on empty messages', () => {
      useTeamStore.getState().clearMessages()
      expect(useTeamStore.getState().messages).toEqual([])
    })
  })

  describe('setSwarmEnabled', () => {
    it('toggles swarmEnabled to true', () => {
      useTeamStore.getState().setSwarmEnabled(true)
      expect(useTeamStore.getState().swarmEnabled).toBe(true)
    })

    it('toggles swarmEnabled back to false', () => {
      useTeamStore.getState().setSwarmEnabled(true)
      useTeamStore.getState().setSwarmEnabled(false)
      expect(useTeamStore.getState().swarmEnabled).toBe(false)
    })
  })

  describe('reset', () => {
    it('returns to initial state after modifications', () => {
      const config = makeTeamConfig()
      const { setActiveTeam, setPhase, updateTaskCounts, addMessage, setSwarmEnabled } =
        useTeamStore.getState()

      setActiveTeam(config)
      setPhase('production')
      updateTaskCounts({ pending: 5, inProgress: 3, completed: 10, blocked: 2 })
      addMessage(makeMessage())
      addMessage(makeMessage())
      setSwarmEnabled(true)

      useTeamStore.getState().reset()

      const state = useTeamStore.getState()
      expect(state.activeTeam).toBeNull()
      expect(state.members).toEqual([])
      expect(state.currentPhase).toBe('planning')
      expect(state.tasks).toEqual({ pending: 0, inProgress: 0, completed: 0, blocked: 0 })
      expect(state.messages).toEqual([])
      expect(state.swarmEnabled).toBe(false)
    })
  })
})
