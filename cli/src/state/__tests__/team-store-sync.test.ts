import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'

import {
  useTeamStore,
  syncFromDisk,
  syncToDisk,
  startPolling,
  stopPolling,
} from '../team-store'

import type { TeamConfig, TeamTask } from '@levelcode/common/types/team-config'

// ── Mocks ────────────────────────────────────────────────────────────

const mockLoadTeamConfig = mock(() => null as TeamConfig | null)
const mockSaveTeamConfig = mock((_name: string, _config: TeamConfig) => {})
const mockListTasks = mock(() => [] as TeamTask[])

mock.module('@levelcode/common/utils/team-fs', () => ({
  loadTeamConfig: mockLoadTeamConfig,
  saveTeamConfig: mockSaveTeamConfig,
  listTasks: mockListTasks,
}))

// ── Helpers ──────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<TeamConfig> = {}): TeamConfig {
  return {
    name: 'test-team',
    description: 'A test team',
    createdAt: 1000,
    leadAgentId: 'lead-1',
    phase: 'planning',
    members: [],
    settings: { maxMembers: 10, autoAssign: false },
    ...overrides,
  }
}

function makeTasks(): TeamTask[] {
  const base = {
    blockedBy: [],
    blocks: [],
    phase: 'planning' as const,
    createdAt: 1000,
    updatedAt: 1000,
  }
  return [
    { ...base, id: '1', subject: 'A', description: '', status: 'pending' },
    { ...base, id: '2', subject: 'B', description: '', status: 'in_progress' },
    { ...base, id: '3', subject: 'C', description: '', status: 'completed' },
    { ...base, id: '4', subject: 'D', description: '', status: 'blocked' },
    { ...base, id: '5', subject: 'E', description: '', status: 'pending' },
  ]
}

// ── Tests ────────────────────────────────────────────────────────────

describe('team-store sync', () => {
  beforeEach(() => {
    useTeamStore.getState().reset()
    mockLoadTeamConfig.mockReset()
    mockSaveTeamConfig.mockReset()
    mockListTasks.mockReset()
    mockLoadTeamConfig.mockReturnValue(null)
    mockListTasks.mockReturnValue([])
  })

  afterEach(() => {
    stopPolling()
  })

  // ── syncFromDisk ─────────────────────────────────────────────────

  describe('syncFromDisk', () => {
    it('returns null when team config is not found on disk', () => {
      mockLoadTeamConfig.mockReturnValue(null)

      const result = syncFromDisk('missing-team')

      expect(result).toBeNull()
      expect(useTeamStore.getState().activeTeam).toBeNull()
    })

    it('loads config into store and returns it', () => {
      const config = makeConfig({ name: 'my-team', phase: 'alpha' })
      mockLoadTeamConfig.mockReturnValue(config)

      const result = syncFromDisk('my-team')

      expect(result).toEqual(config)
      expect(useTeamStore.getState().activeTeam?.name).toBe('my-team')
      expect(useTeamStore.getState().currentPhase).toBe('alpha')
    })

    it('updates task counts from disk', () => {
      const config = makeConfig()
      mockLoadTeamConfig.mockReturnValue(config)
      mockListTasks.mockReturnValue(makeTasks())

      syncFromDisk('test-team')

      const { tasks } = useTeamStore.getState()
      expect(tasks.pending).toBe(2)
      expect(tasks.inProgress).toBe(1)
      expect(tasks.completed).toBe(1)
      expect(tasks.blocked).toBe(1)
    })

    it('sets task counts to zero when there are no tasks', () => {
      const config = makeConfig()
      mockLoadTeamConfig.mockReturnValue(config)
      mockListTasks.mockReturnValue([])

      syncFromDisk('test-team')

      const { tasks } = useTeamStore.getState()
      expect(tasks.pending).toBe(0)
      expect(tasks.inProgress).toBe(0)
      expect(tasks.completed).toBe(0)
      expect(tasks.blocked).toBe(0)
    })

    it('updates members from disk config', () => {
      const config = makeConfig({
        members: [
          {
            agentId: 'agent-1',
            name: 'Agent One',
            role: 'senior-engineer',
            agentType: 'claude',
            model: 'opus',
            joinedAt: 1000,
            status: 'active',
            cwd: '/tmp',
          },
        ],
      })
      mockLoadTeamConfig.mockReturnValue(config)

      syncFromDisk('test-team')

      const { members } = useTeamStore.getState()
      expect(members).toHaveLength(1)
      expect(members[0]!.agentId).toBe('agent-1')
    })
  })

  // ── syncToDisk ───────────────────────────────────────────────────

  describe('syncToDisk', () => {
    it('does nothing when there is no active team', () => {
      syncToDisk()

      expect(mockSaveTeamConfig).not.toHaveBeenCalled()
    })

    it('writes current store state to disk', () => {
      const config = makeConfig({ name: 'save-team', phase: 'planning' })
      useTeamStore.getState().setActiveTeam(config)
      useTeamStore.getState().setPhase('beta')

      syncToDisk()

      expect(mockSaveTeamConfig).toHaveBeenCalledTimes(1)
      const [savedName, savedConfig] = mockSaveTeamConfig.mock.calls[0]!
      expect(savedName).toBe('save-team')
      expect(savedConfig.phase).toBe('beta')
    })

    it('includes updated members in disk write', () => {
      const config = makeConfig({
        name: 'member-team',
        members: [
          {
            agentId: 'a1',
            name: 'A1',
            role: 'intern',
            agentType: 'claude',
            model: 'haiku',
            joinedAt: 1,
            status: 'idle',
            cwd: '/tmp',
          },
        ],
      })
      useTeamStore.getState().setActiveTeam(config)
      useTeamStore.getState().updateMember('a1', { status: 'working' })

      syncToDisk()

      const [, savedConfig] = mockSaveTeamConfig.mock.calls[0]!
      expect(savedConfig.members[0]!.status).toBe('working')
    })
  })

  // ── startPolling / stopPolling ───────────────────────────────────

  describe('polling', () => {
    it('startPolling calls syncFromDisk at the given interval', async () => {
      const config = makeConfig()
      mockLoadTeamConfig.mockReturnValue(config)

      startPolling('test-team', 50)

      // Initially syncFromDisk has NOT been called by startPolling itself
      // (it only fires on interval ticks)
      const callsBefore = mockLoadTeamConfig.mock.calls.length

      // Wait for at least one tick
      await new Promise((r) => setTimeout(r, 80))

      expect(mockLoadTeamConfig.mock.calls.length).toBeGreaterThan(callsBefore)

      stopPolling()
    })

    it('stopPolling prevents further syncs', async () => {
      const config = makeConfig()
      mockLoadTeamConfig.mockReturnValue(config)

      startPolling('test-team', 50)
      stopPolling()

      const callsAfterStop = mockLoadTeamConfig.mock.calls.length
      await new Promise((r) => setTimeout(r, 80))

      expect(mockLoadTeamConfig.mock.calls.length).toBe(callsAfterStop)
    })

    it('calling startPolling again stops previous timer', async () => {
      const config = makeConfig()
      mockLoadTeamConfig.mockReturnValue(config)

      startPolling('team-a', 50)
      startPolling('team-b', 50)

      await new Promise((r) => setTimeout(r, 80))

      // All calls after the second startPolling should be for team-b
      const recentCalls = mockLoadTeamConfig.mock.calls
      const lastCall = recentCalls[recentCalls.length - 1]
      expect(lastCall![0]).toBe('team-b')

      stopPolling()
    })

    it('stopPolling is safe to call when not polling', () => {
      // Should not throw
      stopPolling()
      stopPolling()
    })
  })
})
