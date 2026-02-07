import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import {
  createTeam,
  loadTeamConfig,
  createTask,
  listTasks,
  getTask,
  readInbox,
} from '@levelcode/common/utils/team-fs'
import type { TeamConfig, TeamMember, TeamTask } from '@levelcode/common/types/team-config'

import {
  findAvailableTasks,
  findIdleAgents,
  autoAssignTasks,
  claimTask,
  releaseTask,
  completeTask,
  isTaskBlocked,
  getUnblockedTasks,
  isAgentSuitableForTask,
} from '../task-assignment'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string
let origHome: string | undefined
let origUserProfile: string | undefined

function makeTeamConfig(overrides?: Partial<TeamConfig>): TeamConfig {
  return {
    name: 'test-team',
    description: 'A test team',
    createdAt: Date.now(),
    leadAgentId: 'lead-123',
    phase: 'planning',
    members: [
      {
        agentId: 'lead-123',
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

function makeTask(overrides?: Partial<TeamTask>): TeamTask {
  return {
    id: '1',
    subject: 'Test task',
    description: 'A test task description',
    status: 'pending',
    blockedBy: [],
    blocks: [],
    phase: 'planning',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function makeMember(overrides?: Partial<TeamMember>): TeamMember {
  return {
    agentId: 'agent-456',
    name: 'developer',
    role: 'senior-engineer',
    agentType: 'senior-engineer',
    model: 'test-model',
    joinedAt: Date.now(),
    status: 'idle',
    cwd: '/tmp',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / Teardown — redirect HOME to a temp dir so team-fs writes there
// ---------------------------------------------------------------------------

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-assign-test-'))
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('task-assignment', () => {
  // -----------------------------------------------------------------------
  // findAvailableTasks
  // -----------------------------------------------------------------------
  describe('findAvailableTasks', () => {
    it('should return unowned, unblocked, pending tasks', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending' }))
      createTask('test-team', makeTask({ id: '2', status: 'pending' }))

      const available = findAvailableTasks('test-team')
      expect(available).toHaveLength(2)
      expect(available.map((t) => t.id)).toEqual(['1', '2'])
    })

    it('should exclude tasks that already have an owner', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending', owner: 'someone' }))
      createTask('test-team', makeTask({ id: '2', status: 'pending' }))

      const available = findAvailableTasks('test-team')
      expect(available).toHaveLength(1)
      expect(available[0]!.id).toBe('2')
    })

    it('should exclude non-pending tasks', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'in_progress' }))
      createTask('test-team', makeTask({ id: '2', status: 'completed' }))
      createTask('test-team', makeTask({ id: '3', status: 'pending' }))

      const available = findAvailableTasks('test-team')
      expect(available).toHaveLength(1)
      expect(available[0]!.id).toBe('3')
    })

    it('should exclude tasks blocked by incomplete dependencies', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending' }))
      createTask('test-team', makeTask({ id: '2', status: 'pending', blockedBy: ['1'] }))

      const available = findAvailableTasks('test-team')
      expect(available).toHaveLength(1)
      expect(available[0]!.id).toBe('1')
    })

    it('should return tasks sorted by ID ascending', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '10', status: 'pending' }))
      createTask('test-team', makeTask({ id: '3', status: 'pending' }))
      createTask('test-team', makeTask({ id: '7', status: 'pending' }))

      const available = findAvailableTasks('test-team')
      expect(available.map((t) => t.id)).toEqual(['3', '7', '10'])
    })

    it('should return empty array when no tasks exist', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const available = findAvailableTasks('test-team')
      expect(available).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // findIdleAgents
  // -----------------------------------------------------------------------
  describe('findIdleAgents', () => {
    it('should return agents with idle status', () => {
      const config = makeTeamConfig({
        members: [
          makeMember({ name: 'dev-1', agentId: 'a1', status: 'idle' }),
          makeMember({ name: 'dev-2', agentId: 'a2', status: 'active' }),
          makeMember({ name: 'dev-3', agentId: 'a3', status: 'idle' }),
        ],
      })
      createTeam(config)

      const idle = findIdleAgents('test-team')
      expect(idle).toHaveLength(2)
      expect(idle.map((a) => a.name).sort()).toEqual(['dev-1', 'dev-3'])
    })

    it('should exclude idle agents who own an in_progress task', () => {
      const config = makeTeamConfig({
        members: [
          makeMember({ name: 'dev-1', agentId: 'a1', status: 'idle' }),
          makeMember({ name: 'dev-2', agentId: 'a2', status: 'idle' }),
        ],
      })
      createTeam(config)
      createTask(
        'test-team',
        makeTask({ id: '1', status: 'in_progress', owner: 'dev-1' }),
      )

      const idle = findIdleAgents('test-team')
      expect(idle).toHaveLength(1)
      expect(idle[0]!.name).toBe('dev-2')
    })

    it('should return empty array for nonexistent team', () => {
      const idle = findIdleAgents('nonexistent-team')
      expect(idle).toEqual([])
    })

    it('should return empty array when all agents are active', () => {
      const config = makeTeamConfig({
        members: [
          makeMember({ name: 'dev-1', agentId: 'a1', status: 'active' }),
          makeMember({ name: 'dev-2', agentId: 'a2', status: 'active' }),
        ],
      })
      createTeam(config)

      const idle = findIdleAgents('test-team')
      expect(idle).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // autoAssignTasks
  // -----------------------------------------------------------------------
  describe('autoAssignTasks', () => {
    it('should match idle agents to available tasks by role suitability', () => {
      const config = makeTeamConfig({
        members: [
          makeMember({ name: 'senior-dev', agentId: 'a1', status: 'idle', role: 'senior-engineer' }),
          makeMember({ name: 'junior-dev', agentId: 'a2', status: 'idle', role: 'junior-engineer' }),
        ],
        settings: { maxMembers: 20, autoAssign: true },
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending', metadata: { seniority: 'senior' } }))
      createTask('test-team', makeTask({ id: '2', status: 'pending', metadata: { seniority: 'junior' } }))

      const assignments = autoAssignTasks('test-team')
      expect(assignments).toHaveLength(2)

      // Task 1 requires senior (seniority >= 6), only senior-dev qualifies
      const task1Assignment = assignments.find((a) => a.taskId === '1')
      expect(task1Assignment).toBeDefined()
      expect(task1Assignment!.agentName).toBe('senior-dev')

      // Task 2 is junior-level, junior-dev gets it
      const task2Assignment = assignments.find((a) => a.taskId === '2')
      expect(task2Assignment).toBeDefined()
      expect(task2Assignment!.agentName).toBe('junior-dev')
    })

    it('should not assign when autoAssign is disabled', () => {
      const config = makeTeamConfig({
        members: [makeMember({ name: 'dev-1', agentId: 'a1', status: 'idle' })],
        settings: { maxMembers: 20, autoAssign: false },
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending' }))

      const assignments = autoAssignTasks('test-team')
      expect(assignments).toEqual([])
    })

    it('should assign at most one task per agent', () => {
      const config = makeTeamConfig({
        members: [
          makeMember({ name: 'dev-1', agentId: 'a1', status: 'idle', role: 'senior-engineer' }),
        ],
        settings: { maxMembers: 20, autoAssign: true },
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending' }))
      createTask('test-team', makeTask({ id: '2', status: 'pending' }))

      const assignments = autoAssignTasks('test-team')
      expect(assignments).toHaveLength(1)
      expect(assignments[0]!.agentName).toBe('dev-1')
      expect(assignments[0]!.taskId).toBe('1')
    })

    it('should update task owner and status to in_progress', () => {
      const config = makeTeamConfig({
        members: [makeMember({ name: 'dev-1', agentId: 'a1', status: 'idle' })],
        settings: { maxMembers: 20, autoAssign: true },
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending' }))

      autoAssignTasks('test-team')

      const task = getTask('test-team', '1')
      expect(task!.owner).toBe('dev-1')
      expect(task!.status).toBe('in_progress')
    })

    it('should update member status to active in team config', () => {
      const config = makeTeamConfig({
        members: [makeMember({ name: 'dev-1', agentId: 'a1', status: 'idle' })],
        settings: { maxMembers: 20, autoAssign: true },
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending' }))

      autoAssignTasks('test-team')

      const updatedConfig = loadTeamConfig('test-team')
      const member = updatedConfig!.members.find((m) => m.name === 'dev-1')
      expect(member!.status).toBe('active')
      expect(member!.currentTaskId).toBe('1')
    })

    it('should return empty array for nonexistent team', () => {
      const assignments = autoAssignTasks('nonexistent-team')
      expect(assignments).toEqual([])
    })

    it('should skip tasks that no idle agent is senior enough for', () => {
      const config = makeTeamConfig({
        members: [
          makeMember({ name: 'intern', agentId: 'a1', status: 'idle', role: 'intern' }),
        ],
        settings: { maxMembers: 20, autoAssign: true },
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending', metadata: { seniority: 'senior' } }))

      const assignments = autoAssignTasks('test-team')
      expect(assignments).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // claimTask
  // -----------------------------------------------------------------------
  describe('claimTask', () => {
    it('should set owner and mark task as in_progress', () => {
      const config = makeTeamConfig({
        members: [makeMember({ name: 'dev-1', agentId: 'a1', status: 'idle' })],
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending' }))

      const result = claimTask('test-team', 'dev-1', '1')
      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()

      const task = getTask('test-team', '1')
      expect(task!.owner).toBe('dev-1')
      expect(task!.status).toBe('in_progress')
    })

    it('should update member status in team config', () => {
      const config = makeTeamConfig({
        members: [makeMember({ name: 'dev-1', agentId: 'a1', status: 'idle' })],
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending' }))

      claimTask('test-team', 'dev-1', '1')

      const updatedConfig = loadTeamConfig('test-team')
      const member = updatedConfig!.members.find((m) => m.name === 'dev-1')
      expect(member!.status).toBe('active')
      expect(member!.currentTaskId).toBe('1')
    })

    it('should fail if task does not exist', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const result = claimTask('test-team', 'dev-1', 'nonexistent')
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('should fail if task is not pending', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'in_progress' }))

      const result = claimTask('test-team', 'dev-1', '1')
      expect(result.success).toBe(false)
      expect(result.error).toContain('not pending')
    })

    it('should fail if task already has an owner', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending', owner: 'other-dev' }))

      const result = claimTask('test-team', 'dev-1', '1')
      expect(result.success).toBe(false)
      expect(result.error).toContain('already owned')
    })

    it('should fail if task is blocked by unresolved dependencies', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending' }))
      createTask('test-team', makeTask({ id: '2', status: 'pending', blockedBy: ['1'] }))

      const result = claimTask('test-team', 'dev-1', '2')
      expect(result.success).toBe(false)
      expect(result.error).toContain('blocked')
    })
  })

  // -----------------------------------------------------------------------
  // releaseTask
  // -----------------------------------------------------------------------
  describe('releaseTask', () => {
    it('should remove owner and set task back to pending', () => {
      const config = makeTeamConfig({
        members: [makeMember({ name: 'dev-1', agentId: 'a1', status: 'active', currentTaskId: '1' })],
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'in_progress', owner: 'dev-1' }))

      const result = releaseTask('test-team', '1')
      expect(result.success).toBe(true)

      const task = getTask('test-team', '1')
      expect(task!.owner).toBeUndefined()
      expect(task!.status).toBe('pending')
    })

    it('should update member status back to idle', () => {
      const config = makeTeamConfig({
        members: [makeMember({ name: 'dev-1', agentId: 'a1', status: 'active', currentTaskId: '1' })],
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'in_progress', owner: 'dev-1' }))

      releaseTask('test-team', '1')

      const updatedConfig = loadTeamConfig('test-team')
      const member = updatedConfig!.members.find((m) => m.name === 'dev-1')
      expect(member!.status).toBe('idle')
      expect(member!.currentTaskId).toBeUndefined()
    })

    it('should fail if task does not exist', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const result = releaseTask('test-team', 'nonexistent')
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('should succeed even if task has no owner', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending' }))

      const result = releaseTask('test-team', '1')
      expect(result.success).toBe(true)

      const task = getTask('test-team', '1')
      expect(task!.status).toBe('pending')
    })
  })

  // -----------------------------------------------------------------------
  // completeTask
  // -----------------------------------------------------------------------
  describe('completeTask', () => {
    it('should mark a task as completed', () => {
      const config = makeTeamConfig({
        members: [makeMember({ name: 'dev-1', agentId: 'a1', status: 'active', currentTaskId: '1' })],
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'in_progress', owner: 'dev-1' }))

      const result = completeTask('test-team', '1')
      expect(result.success).toBe(true)

      const task = getTask('test-team', '1')
      expect(task!.status).toBe('completed')
    })

    it('should update member status back to idle', () => {
      const config = makeTeamConfig({
        members: [makeMember({ name: 'dev-1', agentId: 'a1', status: 'active', currentTaskId: '1' })],
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'in_progress', owner: 'dev-1' }))

      completeTask('test-team', '1')

      const updatedConfig = loadTeamConfig('test-team')
      const member = updatedConfig!.members.find((m) => m.name === 'dev-1')
      expect(member!.status).toBe('idle')
      expect(member!.currentTaskId).toBeUndefined()
    })

    it('should send a TaskCompleted protocol message to the team lead', () => {
      const config = makeTeamConfig({
        members: [
          {
            agentId: 'lead-123',
            name: 'team-lead',
            role: 'coordinator',
            agentType: 'coordinator',
            model: 'test-model',
            joinedAt: Date.now(),
            status: 'active',
            cwd: '/tmp',
          },
          makeMember({ name: 'dev-1', agentId: 'a1', status: 'active', currentTaskId: '1' }),
        ],
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'in_progress', owner: 'dev-1', subject: 'Fix bug' }))

      completeTask('test-team', '1')

      const inbox = readInbox('test-team', 'team-lead')
      expect(inbox).toHaveLength(1)
      expect(inbox[0]!.type).toBe('task_completed')
      const msg = inbox[0] as any
      expect(msg.from).toBe('dev-1')
      expect(msg.taskId).toBe('1')
      expect(msg.taskSubject).toBe('Fix bug')
    })

    it('should fail if task does not exist', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const result = completeTask('test-team', 'nonexistent')
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('should fail if task is already completed', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'completed' }))

      const result = completeTask('test-team', '1')
      expect(result.success).toBe(false)
      expect(result.error).toContain('already completed')
    })

    it('should return unblocked task IDs when completing a task unblocks others', () => {
      const config = makeTeamConfig({
        members: [makeMember({ name: 'dev-1', agentId: 'a1', status: 'active', currentTaskId: '1' })],
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'in_progress', owner: 'dev-1' }))
      createTask('test-team', makeTask({ id: '2', status: 'pending', blockedBy: ['1'] }))
      createTask('test-team', makeTask({ id: '3', status: 'pending', blockedBy: ['1'] }))

      const result = completeTask('test-team', '1')
      expect(result.success).toBe(true)
      expect(result.unblockedTaskIds.sort()).toEqual(['2', '3'])
    })

    it('should not return tasks that are still blocked by other incomplete tasks', () => {
      const config = makeTeamConfig({
        members: [makeMember({ name: 'dev-1', agentId: 'a1', status: 'active', currentTaskId: '1' })],
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'in_progress', owner: 'dev-1' }))
      createTask('test-team', makeTask({ id: '2', status: 'pending' }))
      // Task 3 is blocked by both 1 and 2; completing 1 alone does not unblock it
      createTask('test-team', makeTask({ id: '3', status: 'pending', blockedBy: ['1', '2'] }))

      const result = completeTask('test-team', '1')
      expect(result.success).toBe(true)
      expect(result.unblockedTaskIds).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // isTaskBlocked
  // -----------------------------------------------------------------------
  describe('isTaskBlocked', () => {
    it('should return false for a task with no blockers', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', blockedBy: [] }))

      expect(isTaskBlocked('test-team', '1')).toBe(false)
    })

    it('should return true when a blocker is not completed', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending' }))
      createTask('test-team', makeTask({ id: '2', status: 'pending', blockedBy: ['1'] }))

      expect(isTaskBlocked('test-team', '2')).toBe(true)
    })

    it('should return false when all blockers are completed', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'completed' }))
      createTask('test-team', makeTask({ id: '2', status: 'pending', blockedBy: ['1'] }))

      expect(isTaskBlocked('test-team', '2')).toBe(false)
    })

    it('should return true for a nonexistent task', () => {
      const config = makeTeamConfig()
      createTeam(config)

      expect(isTaskBlocked('test-team', 'nonexistent')).toBe(true)
    })

    it('should return true when a blocker task does not exist', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', blockedBy: ['nonexistent'] }))

      expect(isTaskBlocked('test-team', '1')).toBe(true)
    })

    it('should handle multiple blockers where some are completed and some are not', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'completed' }))
      createTask('test-team', makeTask({ id: '2', status: 'in_progress' }))
      createTask('test-team', makeTask({ id: '3', blockedBy: ['1', '2'] }))

      expect(isTaskBlocked('test-team', '3')).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // getUnblockedTasks
  // -----------------------------------------------------------------------
  describe('getUnblockedTasks', () => {
    it('should return pending tasks with all dependencies resolved', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'completed' }))
      createTask('test-team', makeTask({ id: '2', status: 'pending', blockedBy: ['1'] }))
      createTask('test-team', makeTask({ id: '3', status: 'pending' }))

      const unblocked = getUnblockedTasks('test-team')
      expect(unblocked).toHaveLength(2)
      expect(unblocked.map((t) => t.id)).toEqual(['2', '3'])
    })

    it('should exclude tasks that are still blocked', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'pending' }))
      createTask('test-team', makeTask({ id: '2', status: 'pending', blockedBy: ['1'] }))

      const unblocked = getUnblockedTasks('test-team')
      expect(unblocked).toHaveLength(1)
      expect(unblocked[0]!.id).toBe('1')
    })

    it('should exclude non-pending tasks', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'in_progress' }))
      createTask('test-team', makeTask({ id: '2', status: 'completed' }))
      createTask('test-team', makeTask({ id: '3', status: 'pending' }))

      const unblocked = getUnblockedTasks('test-team')
      expect(unblocked).toHaveLength(1)
      expect(unblocked[0]!.id).toBe('3')
    })

    it('should sort results by numeric ID ascending', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '20', status: 'pending' }))
      createTask('test-team', makeTask({ id: '5', status: 'pending' }))
      createTask('test-team', makeTask({ id: '12', status: 'pending' }))

      const unblocked = getUnblockedTasks('test-team')
      expect(unblocked.map((t) => t.id)).toEqual(['5', '12', '20'])
    })

    it('should return empty array when there are no pending tasks', () => {
      const config = makeTeamConfig()
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'completed' }))

      const unblocked = getUnblockedTasks('test-team')
      expect(unblocked).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // Completing a task unblocks dependent tasks (integration)
  // -----------------------------------------------------------------------
  describe('completing a task unblocks dependent tasks', () => {
    it('should make previously blocked tasks available after their blocker completes', () => {
      const config = makeTeamConfig({
        members: [
          makeMember({ name: 'dev-1', agentId: 'a1', status: 'active', currentTaskId: '1' }),
        ],
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'in_progress', owner: 'dev-1' }))
      createTask('test-team', makeTask({ id: '2', status: 'pending', blockedBy: ['1'] }))
      createTask('test-team', makeTask({ id: '3', status: 'pending', blockedBy: ['1'] }))

      // Before completion, tasks 2 and 3 are blocked
      expect(isTaskBlocked('test-team', '2')).toBe(true)
      expect(isTaskBlocked('test-team', '3')).toBe(true)
      expect(findAvailableTasks('test-team')).toEqual([])

      // Complete task 1
      const result = completeTask('test-team', '1')
      expect(result.success).toBe(true)
      expect(result.unblockedTaskIds.sort()).toEqual(['2', '3'])

      // After completion, tasks 2 and 3 are available
      expect(isTaskBlocked('test-team', '2')).toBe(false)
      expect(isTaskBlocked('test-team', '3')).toBe(false)
      const available = findAvailableTasks('test-team')
      expect(available).toHaveLength(2)
      expect(available.map((t) => t.id)).toEqual(['2', '3'])
    })

    it('should handle chain of dependencies: A -> B -> C', () => {
      const config = makeTeamConfig({
        members: [
          makeMember({ name: 'dev-1', agentId: 'a1', status: 'active', currentTaskId: '1' }),
        ],
      })
      createTeam(config)
      createTask('test-team', makeTask({ id: '1', status: 'in_progress', owner: 'dev-1' }))
      createTask('test-team', makeTask({ id: '2', status: 'pending', blockedBy: ['1'] }))
      createTask('test-team', makeTask({ id: '3', status: 'pending', blockedBy: ['2'] }))

      // Complete task 1 -> unblocks task 2 but NOT task 3
      const result1 = completeTask('test-team', '1')
      expect(result1.unblockedTaskIds).toEqual(['2'])
      expect(isTaskBlocked('test-team', '3')).toBe(true)

      // Claim and complete task 2 -> unblocks task 3
      claimTask('test-team', 'dev-1', '2')
      const result2 = completeTask('test-team', '2')
      expect(result2.unblockedTaskIds).toEqual(['3'])
      expect(isTaskBlocked('test-team', '3')).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // isAgentSuitableForTask (role suitability)
  // -----------------------------------------------------------------------
  describe('isAgentSuitableForTask', () => {
    it('should allow a senior-engineer for a senior-level task', () => {
      const agent = makeMember({ role: 'senior-engineer' })
      const task = makeTask({ metadata: { seniority: 'senior' } })
      expect(isAgentSuitableForTask(agent, task)).toBe(true)
    })

    it('should not allow an intern for a senior-level task', () => {
      const agent = makeMember({ role: 'intern' })
      const task = makeTask({ metadata: { seniority: 'senior' } })
      expect(isAgentSuitableForTask(agent, task)).toBe(false)
    })

    it('should allow any role for a task with no seniority metadata', () => {
      const agent = makeMember({ role: 'intern' })
      const task = makeTask()
      expect(isAgentSuitableForTask(agent, task)).toBe(true)
    })

    it('should allow a mid-level-engineer for a mid-level task', () => {
      const agent = makeMember({ role: 'mid-level-engineer' })
      const task = makeTask({ metadata: { seniority: 'mid' } })
      expect(isAgentSuitableForTask(agent, task)).toBe(true)
    })

    it('should not allow a junior-engineer for a mid-level task', () => {
      const agent = makeMember({ role: 'junior-engineer' })
      const task = makeTask({ metadata: { seniority: 'mid' } })
      expect(isAgentSuitableForTask(agent, task)).toBe(false)
    })
  })
})
