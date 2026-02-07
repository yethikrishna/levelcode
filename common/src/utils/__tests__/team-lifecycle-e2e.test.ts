import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import {
  createTeam,
  loadTeamConfig,
  saveTeamConfig,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  createTask,
  updateTask,
  listTasks,
  getTask,
  sendMessage,
  readInbox,
  clearInbox,
  getTeamsDir,
  getTasksDir,
} from '../team-fs'

import {
  PHASE_ORDER,
  canTransition,
  transitionPhase,
  getPhaseTools,
} from '../dev-phases'

import type { TeamConfig, TeamMember, TeamTask, DevPhase } from '../../types/team-config'
import type { TeamMessage, BroadcastMessage, TaskCompletedMessage } from '../../types/team-protocol'

// --- Test helpers ---

let tmpDir: string
let origHome: string | undefined
let origUserProfile: string | undefined

function makeTeamConfig(overrides?: Partial<TeamConfig>): TeamConfig {
  return {
    name: 'e2e-team',
    description: 'End-to-end lifecycle test team',
    createdAt: Date.now(),
    leadAgentId: 'lead-001',
    phase: 'planning',
    members: [
      {
        agentId: 'lead-001',
        name: 'team-lead',
        role: 'coordinator',
        agentType: 'coordinator',
        model: 'test-model',
        joinedAt: Date.now(),
        status: 'active',
        cwd: '/tmp/e2e',
      },
    ],
    settings: {
      maxMembers: 20,
      autoAssign: true,
    },
    ...overrides,
  }
}

function makeMember(overrides?: Partial<TeamMember>): TeamMember {
  return {
    agentId: 'dev-001',
    name: 'developer',
    role: 'senior-engineer',
    agentType: 'senior-engineer',
    model: 'test-model',
    joinedAt: Date.now(),
    status: 'active',
    cwd: '/tmp/e2e',
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

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-lifecycle-e2e-'))
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

// --- E2E lifecycle tests ---

describe('team lifecycle E2E', () => {
  describe('Step 1: Create team and verify config exists', () => {
    it('should create a team with directory structure and loadable config', () => {
      const config = makeTeamConfig()
      createTeam(config)

      // Verify directory structure
      const teamDir = path.join(getTeamsDir(), 'e2e-team')
      expect(fs.existsSync(teamDir)).toBe(true)
      expect(fs.existsSync(path.join(teamDir, 'config.json'))).toBe(true)
      expect(fs.existsSync(path.join(teamDir, 'inboxes'))).toBe(true)
      expect(fs.existsSync(getTasksDir('e2e-team'))).toBe(true)

      // Verify config is loadable and correct
      const loaded = loadTeamConfig('e2e-team')
      expect(loaded).not.toBeNull()
      expect(loaded!.name).toBe('e2e-team')
      expect(loaded!.phase).toBe('planning')
      expect(loaded!.leadAgentId).toBe('lead-001')
      expect(loaded!.members).toHaveLength(1)
      expect(loaded!.members[0]!.role).toBe('coordinator')
    })
  })

  describe('Step 2: Add members and verify config updated', () => {
    it('should add multiple members and reflect them in the config', async () => {
      createTeam(makeTeamConfig())

      const senior = makeMember({
        agentId: 'sr-001',
        name: 'senior-dev',
        role: 'senior-engineer',
      })
      const junior = makeMember({
        agentId: 'jr-001',
        name: 'junior-dev',
        role: 'junior-engineer',
        agentType: 'junior-engineer',
      })
      const researcher = makeMember({
        agentId: 'res-001',
        name: 'researcher',
        role: 'researcher',
        agentType: 'researcher',
      })

      await addTeamMember('e2e-team', senior)
      await addTeamMember('e2e-team', junior)
      await addTeamMember('e2e-team', researcher)

      const loaded = loadTeamConfig('e2e-team')
      expect(loaded!.members).toHaveLength(4) // lead + 3 added
      const ids = loaded!.members.map((m) => m.agentId)
      expect(ids).toContain('lead-001')
      expect(ids).toContain('sr-001')
      expect(ids).toContain('jr-001')
      expect(ids).toContain('res-001')
    })
  })

  describe('Step 3: Create tasks and verify task files', () => {
    it('should create multiple tasks with individual JSON files', async () => {
      createTeam(makeTeamConfig())

      const task1 = makeTask({ id: 'task-1', subject: 'Set up project structure' })
      const task2 = makeTask({ id: 'task-2', subject: 'Implement auth module' })
      const task3 = makeTask({
        id: 'task-3',
        subject: 'Write tests for auth',
        blockedBy: ['task-2'],
      })

      await createTask('e2e-team', task1)
      await createTask('e2e-team', task2)
      await createTask('e2e-team', task3)

      // Verify files exist
      const tasksDir = getTasksDir('e2e-team')
      expect(fs.existsSync(path.join(tasksDir, 'task-1.json'))).toBe(true)
      expect(fs.existsSync(path.join(tasksDir, 'task-2.json'))).toBe(true)
      expect(fs.existsSync(path.join(tasksDir, 'task-3.json'))).toBe(true)

      // Verify content
      const tasks = listTasks('e2e-team')
      expect(tasks).toHaveLength(3)
      const subjects = tasks.map((t) => t.subject)
      expect(subjects).toContain('Set up project structure')
      expect(subjects).toContain('Implement auth module')
      expect(subjects).toContain('Write tests for auth')

      // Verify dependency on task-3
      const t3 = getTask('e2e-team', 'task-3')
      expect(t3!.blockedBy).toEqual(['task-2'])
    })
  })

  describe('Step 4: Assign tasks and verify owner set', () => {
    it('should assign tasks to team members via updateTask', async () => {
      createTeam(makeTeamConfig())
      await addTeamMember('e2e-team', makeMember({ agentId: 'sr-001', name: 'senior-dev' }))

      await createTask('e2e-team', makeTask({ id: 'task-1', subject: 'Build API' }))
      await createTask('e2e-team', makeTask({ id: 'task-2', subject: 'Build UI' }))

      await updateTask('e2e-team', 'task-1', { owner: 'sr-001' })
      await updateTask('e2e-team', 'task-2', { owner: 'lead-001' })

      const t1 = getTask('e2e-team', 'task-1')
      expect(t1!.owner).toBe('sr-001')

      const t2 = getTask('e2e-team', 'task-2')
      expect(t2!.owner).toBe('lead-001')
    })
  })

  describe('Step 5: Update task status and verify transitions', () => {
    it('should transition tasks through pending -> in_progress -> completed', async () => {
      createTeam(makeTeamConfig())
      await createTask('e2e-team', makeTask({ id: 'task-1', status: 'pending' }))

      // pending -> in_progress
      await updateTask('e2e-team', 'task-1', { status: 'in_progress', owner: 'dev-001' })
      let task = getTask('e2e-team', 'task-1')
      expect(task!.status).toBe('in_progress')
      expect(task!.owner).toBe('dev-001')

      // in_progress -> completed
      await updateTask('e2e-team', 'task-1', { status: 'completed' })
      task = getTask('e2e-team', 'task-1')
      expect(task!.status).toBe('completed')
    })

    it('should allow setting blocked status', async () => {
      createTeam(makeTeamConfig())
      await createTask('e2e-team', makeTask({ id: 'task-1', status: 'pending' }))

      await updateTask('e2e-team', 'task-1', { status: 'blocked' })
      const task = getTask('e2e-team', 'task-1')
      expect(task!.status).toBe('blocked')
    })

    it('should update the updatedAt timestamp on each transition', async () => {
      createTeam(makeTeamConfig())
      await createTask('e2e-team', makeTask({ id: 'task-1', updatedAt: 1000 }))

      const before = Date.now()
      await updateTask('e2e-team', 'task-1', { status: 'in_progress' })
      const after = Date.now()

      const task = getTask('e2e-team', 'task-1')
      expect(task!.updatedAt).toBeGreaterThanOrEqual(before)
      expect(task!.updatedAt).toBeLessThanOrEqual(after)
    })
  })

  describe('Step 6: Send messages between agents and verify inbox delivery', () => {
    it('should deliver direct messages to the correct agent inbox', async () => {
      createTeam(makeTeamConfig())

      const msg: TeamMessage = {
        type: 'message',
        from: 'lead-001',
        to: 'dev-001',
        text: 'Please start working on task-1',
        summary: 'Task assignment',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('e2e-team', 'dev-001', msg)

      const inbox = readInbox('e2e-team', 'dev-001')
      expect(inbox).toHaveLength(1)
      expect(inbox[0]!.type).toBe('message')
      expect((inbox[0] as TeamMessage).text).toBe('Please start working on task-1')
      expect((inbox[0] as TeamMessage).from).toBe('lead-001')
    })

    it('should deliver broadcast messages to multiple agent inboxes', async () => {
      createTeam(makeTeamConfig())

      const broadcast: BroadcastMessage = {
        type: 'broadcast',
        from: 'lead-001',
        text: 'Sprint planning starts now',
        summary: 'Sprint planning',
        timestamp: new Date().toISOString(),
      }

      // Simulate broadcast to multiple agents
      await sendMessage('e2e-team', 'dev-001', broadcast)
      await sendMessage('e2e-team', 'dev-002', broadcast)
      await sendMessage('e2e-team', 'dev-003', broadcast)

      const inbox1 = readInbox('e2e-team', 'dev-001')
      const inbox2 = readInbox('e2e-team', 'dev-002')
      const inbox3 = readInbox('e2e-team', 'dev-003')

      expect(inbox1).toHaveLength(1)
      expect(inbox2).toHaveLength(1)
      expect(inbox3).toHaveLength(1)
      expect((inbox1[0] as BroadcastMessage).text).toBe('Sprint planning starts now')
      expect((inbox2[0] as BroadcastMessage).text).toBe('Sprint planning starts now')
      expect((inbox3[0] as BroadcastMessage).text).toBe('Sprint planning starts now')
    })

    it('should accumulate multiple messages in order', async () => {
      createTeam(makeTeamConfig())

      const msg1: TeamMessage = {
        type: 'message',
        from: 'lead-001',
        to: 'dev-001',
        text: 'First message',
        timestamp: '2024-01-01T00:00:00Z',
      }
      const msg2: TeamMessage = {
        type: 'message',
        from: 'lead-001',
        to: 'dev-001',
        text: 'Second message',
        timestamp: '2024-01-01T00:01:00Z',
      }
      const completed: TaskCompletedMessage = {
        type: 'task_completed',
        from: 'dev-001',
        taskId: 'task-1',
        taskSubject: 'Build API',
        timestamp: '2024-01-01T00:02:00Z',
      }

      await sendMessage('e2e-team', 'dev-001', msg1)
      await sendMessage('e2e-team', 'dev-001', msg2)
      await sendMessage('e2e-team', 'lead-001', completed)

      const devInbox = readInbox('e2e-team', 'dev-001')
      expect(devInbox).toHaveLength(2)
      expect((devInbox[0] as TeamMessage).text).toBe('First message')
      expect((devInbox[1] as TeamMessage).text).toBe('Second message')

      const leadInbox = readInbox('e2e-team', 'lead-001')
      expect(leadInbox).toHaveLength(1)
      expect(leadInbox[0]!.type).toBe('task_completed')
      expect((leadInbox[0] as TaskCompletedMessage).taskId).toBe('task-1')
    })

    it('should clear inbox after reading', async () => {
      createTeam(makeTeamConfig())

      const msg: TeamMessage = {
        type: 'message',
        from: 'lead-001',
        to: 'dev-001',
        text: 'Hello',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('e2e-team', 'dev-001', msg)
      await sendMessage('e2e-team', 'dev-001', msg)

      expect(readInbox('e2e-team', 'dev-001')).toHaveLength(2)

      clearInbox('e2e-team', 'dev-001')
      expect(readInbox('e2e-team', 'dev-001')).toEqual([])
    })
  })

  describe('Step 7: Complete tasks and verify dependencies unblock', () => {
    it('should model dependency chains: blocking task completion enables dependent tasks', async () => {
      createTeam(makeTeamConfig())

      // task-2 depends on task-1; task-3 depends on task-2
      await createTask('e2e-team', makeTask({
        id: 'task-1',
        subject: 'Foundation',
        blocks: ['task-2'],
        status: 'pending',
      }))
      await createTask('e2e-team', makeTask({
        id: 'task-2',
        subject: 'Build on foundation',
        blockedBy: ['task-1'],
        blocks: ['task-3'],
        status: 'blocked',
      }))
      await createTask('e2e-team', makeTask({
        id: 'task-3',
        subject: 'Final polish',
        blockedBy: ['task-2'],
        status: 'blocked',
      }))

      // Verify initial dependency state
      const t2Initial = getTask('e2e-team', 'task-2')
      expect(t2Initial!.blockedBy).toEqual(['task-1'])
      expect(t2Initial!.status).toBe('blocked')

      // Complete task-1
      await updateTask('e2e-team', 'task-1', { status: 'completed' })
      const t1 = getTask('e2e-team', 'task-1')
      expect(t1!.status).toBe('completed')

      // Simulate unblocking task-2 (the orchestrator would do this)
      await updateTask('e2e-team', 'task-2', { status: 'pending', blockedBy: [] })
      const t2Unblocked = getTask('e2e-team', 'task-2')
      expect(t2Unblocked!.status).toBe('pending')
      expect(t2Unblocked!.blockedBy).toEqual([])

      // Progress task-2 to completion
      await updateTask('e2e-team', 'task-2', { status: 'in_progress', owner: 'sr-001' })
      await updateTask('e2e-team', 'task-2', { status: 'completed' })

      // Simulate unblocking task-3
      await updateTask('e2e-team', 'task-3', { status: 'pending', blockedBy: [] })
      const t3Unblocked = getTask('e2e-team', 'task-3')
      expect(t3Unblocked!.status).toBe('pending')
      expect(t3Unblocked!.blockedBy).toEqual([])

      // Complete the chain
      await updateTask('e2e-team', 'task-3', { status: 'in_progress', owner: 'jr-001' })
      await updateTask('e2e-team', 'task-3', { status: 'completed' })

      // Verify all tasks completed
      const allTasks = listTasks('e2e-team')
      expect(allTasks.every((t) => t.status === 'completed')).toBe(true)
    })

    it('should handle fan-out dependencies: one task blocks multiple', async () => {
      createTeam(makeTeamConfig())

      await createTask('e2e-team', makeTask({
        id: 'setup',
        subject: 'Project setup',
        blocks: ['feature-a', 'feature-b', 'feature-c'],
        status: 'pending',
      }))
      await createTask('e2e-team', makeTask({
        id: 'feature-a',
        subject: 'Feature A',
        blockedBy: ['setup'],
        status: 'blocked',
      }))
      await createTask('e2e-team', makeTask({
        id: 'feature-b',
        subject: 'Feature B',
        blockedBy: ['setup'],
        status: 'blocked',
      }))
      await createTask('e2e-team', makeTask({
        id: 'feature-c',
        subject: 'Feature C',
        blockedBy: ['setup'],
        status: 'blocked',
      }))

      // Complete setup
      await updateTask('e2e-team', 'setup', { status: 'completed' })

      // Unblock all three features
      await updateTask('e2e-team', 'feature-a', { status: 'pending', blockedBy: [] })
      await updateTask('e2e-team', 'feature-b', { status: 'pending', blockedBy: [] })
      await updateTask('e2e-team', 'feature-c', { status: 'pending', blockedBy: [] })

      const tasks = listTasks('e2e-team')
      const pendingTasks = tasks.filter((t) => t.status === 'pending')
      expect(pendingTasks).toHaveLength(3)
      expect(pendingTasks.map((t) => t.id).sort()).toEqual(['feature-a', 'feature-b', 'feature-c'])
    })
  })

  describe('Step 8: Phase transitions and verify phase changes', () => {
    it('should progress through all phases sequentially', async () => {
      const config = makeTeamConfig({ phase: 'planning' })
      createTeam(config)

      let current = loadTeamConfig('e2e-team')!

      // planning -> pre-alpha
      current = transitionPhase(current, 'pre-alpha')
      await saveTeamConfig('e2e-team', current)
      expect(loadTeamConfig('e2e-team')!.phase).toBe('pre-alpha')

      // pre-alpha -> alpha
      current = transitionPhase(current, 'alpha')
      await saveTeamConfig('e2e-team', current)
      expect(loadTeamConfig('e2e-team')!.phase).toBe('alpha')

      // alpha -> beta
      current = transitionPhase(current, 'beta')
      await saveTeamConfig('e2e-team', current)
      expect(loadTeamConfig('e2e-team')!.phase).toBe('beta')

      // beta -> production
      current = transitionPhase(current, 'production')
      await saveTeamConfig('e2e-team', current)
      expect(loadTeamConfig('e2e-team')!.phase).toBe('production')

      // production -> mature
      current = transitionPhase(current, 'mature')
      await saveTeamConfig('e2e-team', current)
      expect(loadTeamConfig('e2e-team')!.phase).toBe('mature')
    })

    it('should reject invalid phase transitions', () => {
      const config = makeTeamConfig({ phase: 'planning' })
      createTeam(config)

      const current = loadTeamConfig('e2e-team')!

      // Cannot skip phases
      expect(() => transitionPhase(current, 'alpha')).toThrow()
      expect(() => transitionPhase(current, 'production')).toThrow()

      // Cannot go backward
      const alphaConfig = { ...current, phase: 'alpha' as DevPhase }
      expect(() => transitionPhase(alphaConfig, 'planning')).toThrow()
    })

    it('should unlock more tools as phases advance', () => {
      const planningTools = getPhaseTools('planning')
      const preAlphaTools = getPhaseTools('pre-alpha')
      const alphaTools = getPhaseTools('alpha')

      // Planning: only task tools
      expect(planningTools).not.toContain('SendMessage')
      expect(planningTools).not.toContain('Read')

      // Pre-alpha: adds messaging
      expect(preAlphaTools).toContain('SendMessage')
      expect(preAlphaTools).not.toContain('Read')

      // Alpha+: adds file/code tools
      expect(alphaTools).toContain('SendMessage')
      expect(alphaTools).toContain('Read')
      expect(alphaTools).toContain('Write')
      expect(alphaTools).toContain('Bash')
    })

    it('should persist phase changes to disk', async () => {
      createTeam(makeTeamConfig({ phase: 'planning' }))

      let config = loadTeamConfig('e2e-team')!
      expect(config.phase).toBe('planning')

      config = transitionPhase(config, 'pre-alpha')
      await saveTeamConfig('e2e-team', config)

      // Re-load from disk to confirm persistence
      const reloaded = loadTeamConfig('e2e-team')!
      expect(reloaded.phase).toBe('pre-alpha')
    })
  })

  describe('Step 9: Remove members and verify cleanup', () => {
    it('should remove a member and confirm they are gone from config', async () => {
      createTeam(makeTeamConfig())
      await addTeamMember('e2e-team', makeMember({ agentId: 'dev-001', name: 'developer-1' }))
      await addTeamMember('e2e-team', makeMember({ agentId: 'dev-002', name: 'developer-2' }))

      expect(loadTeamConfig('e2e-team')!.members).toHaveLength(3)

      await removeTeamMember('e2e-team', 'dev-001')

      const config = loadTeamConfig('e2e-team')!
      expect(config.members).toHaveLength(2)
      const ids = config.members.map((m) => m.agentId)
      expect(ids).not.toContain('dev-001')
      expect(ids).toContain('lead-001')
      expect(ids).toContain('dev-002')
    })

    it('should not affect other members when one is removed', async () => {
      createTeam(makeTeamConfig())
      await addTeamMember('e2e-team', makeMember({ agentId: 'dev-001', name: 'developer-1' }))
      await addTeamMember('e2e-team', makeMember({ agentId: 'dev-002', name: 'developer-2' }))

      await removeTeamMember('e2e-team', 'dev-001')

      const remaining = loadTeamConfig('e2e-team')!.members
      const dev2 = remaining.find((m) => m.agentId === 'dev-002')
      expect(dev2).not.toBeUndefined()
      expect(dev2!.name).toBe('developer-2')
      expect(dev2!.role).toBe('senior-engineer')
    })

    it('should handle removing the last non-lead member', async () => {
      createTeam(makeTeamConfig())
      await addTeamMember('e2e-team', makeMember({ agentId: 'dev-001' }))

      await removeTeamMember('e2e-team', 'dev-001')

      const config = loadTeamConfig('e2e-team')!
      expect(config.members).toHaveLength(1)
      expect(config.members[0]!.agentId).toBe('lead-001')
    })
  })

  describe('Step 10: Delete team and verify all files removed', () => {
    it('should remove all team directories and task files', async () => {
      createTeam(makeTeamConfig())
      await addTeamMember('e2e-team', makeMember({ agentId: 'dev-001' }))
      await createTask('e2e-team', makeTask({ id: 'task-1' }))
      await createTask('e2e-team', makeTask({ id: 'task-2' }))
      await sendMessage('e2e-team', 'dev-001', {
        type: 'message',
        from: 'lead-001',
        to: 'dev-001',
        text: 'hello',
        timestamp: new Date().toISOString(),
      })

      // Verify everything exists before deletion
      const teamDir = path.join(getTeamsDir(), 'e2e-team')
      const tasksDir = getTasksDir('e2e-team')
      expect(fs.existsSync(teamDir)).toBe(true)
      expect(fs.existsSync(path.join(teamDir, 'config.json'))).toBe(true)
      expect(fs.existsSync(path.join(teamDir, 'inboxes'))).toBe(true)
      expect(fs.existsSync(tasksDir)).toBe(true)
      expect(fs.existsSync(path.join(tasksDir, 'task-1.json'))).toBe(true)
      expect(fs.existsSync(path.join(tasksDir, 'task-2.json'))).toBe(true)

      deleteTeam('e2e-team')

      // Verify everything is gone
      expect(fs.existsSync(teamDir)).toBe(false)
      expect(fs.existsSync(tasksDir)).toBe(false)
      expect(loadTeamConfig('e2e-team')).toBeNull()
      expect(listTasks('e2e-team')).toEqual([])
    })

    it('should be safe to delete twice', () => {
      createTeam(makeTeamConfig())
      deleteTeam('e2e-team')
      expect(() => deleteTeam('e2e-team')).not.toThrow()
    })
  })

  describe('Full lifecycle: end-to-end sequential flow', () => {
    it('should complete the entire team lifecycle from creation to deletion', async () => {
      // === Step 1: Create team ===
      const config = makeTeamConfig()
      createTeam(config)
      expect(loadTeamConfig('e2e-team')).not.toBeNull()
      expect(loadTeamConfig('e2e-team')!.phase).toBe('planning')

      // === Step 2: Add members ===
      await addTeamMember('e2e-team', makeMember({
        agentId: 'sr-001',
        name: 'senior-dev',
        role: 'senior-engineer',
      }))
      await addTeamMember('e2e-team', makeMember({
        agentId: 'jr-001',
        name: 'junior-dev',
        role: 'junior-engineer',
        agentType: 'junior-engineer',
      }))
      await addTeamMember('e2e-team', makeMember({
        agentId: 'tester-001',
        name: 'tester',
        role: 'tester',
        agentType: 'tester',
      }))
      expect(loadTeamConfig('e2e-team')!.members).toHaveLength(4)

      // === Step 3: Create tasks ===
      await createTask('e2e-team', makeTask({
        id: 'task-1',
        subject: 'Architecture design',
        description: 'Define system architecture',
        blocks: ['task-2', 'task-3'],
      }))
      await createTask('e2e-team', makeTask({
        id: 'task-2',
        subject: 'Implement core API',
        description: 'Build the REST API',
        blockedBy: ['task-1'],
        blocks: ['task-4'],
        status: 'blocked',
      }))
      await createTask('e2e-team', makeTask({
        id: 'task-3',
        subject: 'Implement UI shell',
        description: 'Build the frontend skeleton',
        blockedBy: ['task-1'],
        blocks: ['task-4'],
        status: 'blocked',
      }))
      await createTask('e2e-team', makeTask({
        id: 'task-4',
        subject: 'Integration testing',
        description: 'E2E tests for API + UI',
        blockedBy: ['task-2', 'task-3'],
        status: 'blocked',
      }))
      expect(listTasks('e2e-team')).toHaveLength(4)

      // === Step 4: Assign task-1 ===
      await updateTask('e2e-team', 'task-1', { owner: 'lead-001' })
      expect(getTask('e2e-team', 'task-1')!.owner).toBe('lead-001')

      // === Step 5: Progress task-1 ===
      await updateTask('e2e-team', 'task-1', { status: 'in_progress' })
      expect(getTask('e2e-team', 'task-1')!.status).toBe('in_progress')

      // === Step 6: Send messages ===
      await sendMessage('e2e-team', 'sr-001', {
        type: 'message',
        from: 'lead-001',
        to: 'sr-001',
        text: 'Architecture design is nearly done. Prepare for API work.',
        summary: 'Heads up on API task',
        timestamp: new Date().toISOString(),
      })
      expect(readInbox('e2e-team', 'sr-001')).toHaveLength(1)

      // === Step 7: Complete task-1 and unblock dependents ===
      await updateTask('e2e-team', 'task-1', { status: 'completed' })
      expect(getTask('e2e-team', 'task-1')!.status).toBe('completed')

      // Unblock task-2 and task-3
      await updateTask('e2e-team', 'task-2', { status: 'pending', blockedBy: [] })
      await updateTask('e2e-team', 'task-3', { status: 'pending', blockedBy: [] })
      expect(getTask('e2e-team', 'task-2')!.status).toBe('pending')
      expect(getTask('e2e-team', 'task-3')!.status).toBe('pending')

      // Assign and complete task-2
      await updateTask('e2e-team', 'task-2', { owner: 'sr-001', status: 'in_progress' })
      await updateTask('e2e-team', 'task-2', { status: 'completed' })

      // Assign and complete task-3
      await updateTask('e2e-team', 'task-3', { owner: 'jr-001', status: 'in_progress' })
      await updateTask('e2e-team', 'task-3', { status: 'completed' })

      // Unblock and complete task-4
      await updateTask('e2e-team', 'task-4', { status: 'pending', blockedBy: [] })
      await updateTask('e2e-team', 'task-4', { owner: 'tester-001', status: 'in_progress' })
      await updateTask('e2e-team', 'task-4', { status: 'completed' })

      // All tasks completed
      const allTasks = listTasks('e2e-team')
      expect(allTasks.every((t) => t.status === 'completed')).toBe(true)

      // === Step 8: Phase transitions ===
      let teamConfig = loadTeamConfig('e2e-team')!
      teamConfig = transitionPhase(teamConfig, 'pre-alpha')
      await saveTeamConfig('e2e-team', teamConfig)
      expect(loadTeamConfig('e2e-team')!.phase).toBe('pre-alpha')

      teamConfig = transitionPhase(loadTeamConfig('e2e-team')!, 'alpha')
      await saveTeamConfig('e2e-team', teamConfig)
      expect(loadTeamConfig('e2e-team')!.phase).toBe('alpha')

      teamConfig = transitionPhase(loadTeamConfig('e2e-team')!, 'beta')
      await saveTeamConfig('e2e-team', teamConfig)
      expect(loadTeamConfig('e2e-team')!.phase).toBe('beta')

      teamConfig = transitionPhase(loadTeamConfig('e2e-team')!, 'production')
      await saveTeamConfig('e2e-team', teamConfig)
      expect(loadTeamConfig('e2e-team')!.phase).toBe('production')

      teamConfig = transitionPhase(loadTeamConfig('e2e-team')!, 'mature')
      await saveTeamConfig('e2e-team', teamConfig)
      expect(loadTeamConfig('e2e-team')!.phase).toBe('mature')

      // === Step 9: Remove members ===
      await removeTeamMember('e2e-team', 'jr-001')
      await removeTeamMember('e2e-team', 'tester-001')
      const afterRemoval = loadTeamConfig('e2e-team')!
      expect(afterRemoval.members).toHaveLength(2)
      expect(afterRemoval.members.map((m) => m.agentId).sort()).toEqual(['lead-001', 'sr-001'])

      // === Step 10: Delete team ===
      const teamDir = path.join(getTeamsDir(), 'e2e-team')
      const tasksDir = getTasksDir('e2e-team')
      expect(fs.existsSync(teamDir)).toBe(true)
      expect(fs.existsSync(tasksDir)).toBe(true)

      deleteTeam('e2e-team')

      expect(fs.existsSync(teamDir)).toBe(false)
      expect(fs.existsSync(tasksDir)).toBe(false)
      expect(loadTeamConfig('e2e-team')).toBeNull()
      expect(listTasks('e2e-team')).toEqual([])
    })
  })
})
