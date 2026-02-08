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

import type { TeamConfig, TeamMember, TeamTask } from '../../types/team-config'
import type { TeamMessage, BroadcastMessage } from '../../types/team-protocol'

// We need to mock getConfigRoot to use a temp dir so tests don't touch real config.
// Since team-fs uses os.homedir() internally, we override HOME/USERPROFILE env vars
// to redirect all file operations to a temp directory.

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
    priority: 'medium' as const,
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
    status: 'active',
    cwd: '/tmp',
    ...overrides,
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-fs-test-'))
  origHome = process.env.HOME
  origUserProfile = process.env.USERPROFILE
  // Override home directory so getConfigRoot() points to our temp dir
  process.env.HOME = tmpDir
  process.env.USERPROFILE = tmpDir
})

afterEach(() => {
  // Restore original env
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
  // Clean up temp dir
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

describe('team-fs', () => {
  describe('createTeam', () => {
    it('should create team directory structure and config file', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const teamsDir = getTeamsDir()
      const teamDir = path.join(teamsDir, 'test-team')
      expect(fs.existsSync(teamDir)).toBe(true)
      expect(fs.existsSync(path.join(teamDir, 'config.json'))).toBe(true)
      expect(fs.existsSync(path.join(teamDir, 'inboxes'))).toBe(true)

      const tasksDir = getTasksDir('test-team')
      expect(fs.existsSync(tasksDir)).toBe(true)
    })

    it('should write valid JSON config', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const configPath = path.join(getTeamsDir(), 'test-team', 'config.json')
      const raw = fs.readFileSync(configPath, 'utf-8')
      const parsed = JSON.parse(raw) as TeamConfig
      expect(parsed.name).toBe('test-team')
      expect(parsed.description).toBe('A test team')
      expect(parsed.leadAgentId).toBe('lead-123')
      expect(parsed.phase).toBe('planning')
      expect(parsed.members).toHaveLength(1)
    })

    it('should handle creating a team when directories already exist', () => {
      const config = makeTeamConfig()
      createTeam(config)
      // Creating again should not throw (mkdirSync recursive)
      expect(() => createTeam(config)).not.toThrow()
    })
  })

  describe('loadTeamConfig', () => {
    it('should return the config for an existing team', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const loaded = loadTeamConfig('test-team')
      expect(loaded).not.toBeNull()
      expect(loaded!.name).toBe('test-team')
      expect(loaded!.leadAgentId).toBe('lead-123')
    })

    it('should return null for a nonexistent team', () => {
      const loaded = loadTeamConfig('nonexistent-team')
      expect(loaded).toBeNull()
    })
  })

  describe('saveTeamConfig', () => {
    it('should overwrite existing config', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const updatedConfig = { ...config, description: 'Updated description' }
      await saveTeamConfig('test-team', updatedConfig)

      const loaded = loadTeamConfig('test-team')
      expect(loaded!.description).toBe('Updated description')
    })

    it('should create directories if they do not exist', async () => {
      const config = makeTeamConfig({ name: 'new-team' })
      await saveTeamConfig('new-team', config)

      const loaded = loadTeamConfig('new-team')
      expect(loaded).not.toBeNull()
      expect(loaded!.name).toBe('new-team')
    })
  })

  describe('deleteTeam', () => {
    it('should remove team directory and tasks directory', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const teamsDir = getTeamsDir()
      const teamDir = path.join(teamsDir, 'test-team')
      const tasksDir = getTasksDir('test-team')

      expect(fs.existsSync(teamDir)).toBe(true)
      expect(fs.existsSync(tasksDir)).toBe(true)

      deleteTeam('test-team')

      expect(fs.existsSync(teamDir)).toBe(false)
      expect(fs.existsSync(tasksDir)).toBe(false)
    })

    it('should not throw when deleting a nonexistent team', () => {
      expect(() => deleteTeam('nonexistent-team')).not.toThrow()
    })
  })

  describe('addTeamMember', () => {
    it('should add a member to the team config', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const newMember = makeMember()
      await addTeamMember('test-team', newMember)

      const loaded = loadTeamConfig('test-team')
      expect(loaded!.members).toHaveLength(2)
      expect(loaded!.members[1]!.name).toBe('developer')
      expect(loaded!.members[1]!.agentId).toBe('agent-456')
    })

    it('should throw if team does not exist', async () => {
      const newMember = makeMember()
      expect(addTeamMember('nonexistent-team', newMember)).rejects.toThrow(
        'Team "nonexistent-team" not found',
      )
    })
  })

  describe('removeTeamMember', () => {
    it('should remove a member by agentId', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const newMember = makeMember()
      await addTeamMember('test-team', newMember)

      await removeTeamMember('test-team', 'agent-456')

      const loaded = loadTeamConfig('test-team')
      expect(loaded!.members).toHaveLength(1)
      expect(loaded!.members[0]!.agentId).toBe('lead-123')
    })

    it('should throw if team does not exist', async () => {
      expect(removeTeamMember('nonexistent-team', 'agent-456')).rejects.toThrow(
        'Team "nonexistent-team" not found',
      )
    })

    it('should be a no-op if agentId is not found', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      await removeTeamMember('test-team', 'nonexistent-agent')

      const loaded = loadTeamConfig('test-team')
      expect(loaded!.members).toHaveLength(1)
    })
  })

  describe('createTask', () => {
    it('should create a task file in the tasks directory', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const task = makeTask()
      await createTask('test-team', task)

      const tasksDir = getTasksDir('test-team')
      const taskPath = path.join(tasksDir, '1.json')
      expect(fs.existsSync(taskPath)).toBe(true)

      const raw = fs.readFileSync(taskPath, 'utf-8')
      const parsed = JSON.parse(raw) as TeamTask
      expect(parsed.id).toBe('1')
      expect(parsed.subject).toBe('Test task')
    })

    it('should create tasks directory if it does not exist', async () => {
      // Do not call createTeam, just createTask directly
      const task = makeTask()
      await createTask('new-team', task)

      const tasksDir = getTasksDir('new-team')
      expect(fs.existsSync(tasksDir)).toBe(true)
    })
  })

  describe('updateTask', () => {
    it('should update task fields', async () => {
      const config = makeTeamConfig()
      createTeam(config)
      await createTask('test-team', makeTask())

      await updateTask('test-team', '1', { status: 'in_progress', owner: 'dev-1' })

      const task = getTask('test-team', '1')
      expect(task!.status).toBe('in_progress')
      expect(task!.owner).toBe('dev-1')
    })

    it('should set updatedAt timestamp', async () => {
      const config = makeTeamConfig()
      createTeam(config)
      const originalTask = makeTask({ updatedAt: 1000 })
      await createTask('test-team', originalTask)

      const before = Date.now()
      await updateTask('test-team', '1', { subject: 'Updated subject' })
      const after = Date.now()

      const task = getTask('test-team', '1')
      expect(task!.updatedAt).toBeGreaterThanOrEqual(before)
      expect(task!.updatedAt).toBeLessThanOrEqual(after)
      expect(task!.subject).toBe('Updated subject')
    })

    it('should throw if task does not exist', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      expect(updateTask('test-team', '999', { status: 'completed' })).rejects.toThrow(
        'Task "999" not found in team "test-team"',
      )
    })

    it('should throw on non-numeric task ID', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      expect(updateTask('test-team', 'nonexistent', { status: 'completed' })).rejects.toThrow(
        'Task ID must be numeric',
      )
    })
  })

  describe('listTasks', () => {
    it('should return all tasks for a team', async () => {
      const config = makeTeamConfig()
      createTeam(config)
      await createTask('test-team', makeTask({ id: '1', subject: 'Task 1' }))
      await createTask('test-team', makeTask({ id: '2', subject: 'Task 2' }))
      await createTask('test-team', makeTask({ id: '3', subject: 'Task 3' }))

      const tasks = listTasks('test-team')
      expect(tasks).toHaveLength(3)
      const subjects = tasks.map((t) => t.subject)
      expect(subjects).toContain('Task 1')
      expect(subjects).toContain('Task 2')
      expect(subjects).toContain('Task 3')
    })

    it('should return empty array when no tasks exist', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const tasks = listTasks('test-team')
      expect(tasks).toEqual([])
    })

    it('should return empty array when tasks directory does not exist', () => {
      const tasks = listTasks('nonexistent-team')
      expect(tasks).toEqual([])
    })
  })

  describe('getTask', () => {
    it('should return a specific task by id', async () => {
      const config = makeTeamConfig()
      createTeam(config)
      await createTask('test-team', makeTask({ id: '42', subject: 'Specific task' }))

      const task = getTask('test-team', '42')
      expect(task).not.toBeNull()
      expect(task!.id).toBe('42')
      expect(task!.subject).toBe('Specific task')
    })

    it('should return null for a nonexistent task', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const task = getTask('test-team', '999')
      expect(task).toBeNull()
    })

    it('should throw on non-numeric task ID', () => {
      const config = makeTeamConfig()
      createTeam(config)

      expect(() => getTask('test-team', 'nonexistent')).toThrow(
        'Task ID must be numeric',
      )
    })
  })

  describe('sendMessage', () => {
    it('should write a message to the recipient inbox', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const msg: TeamMessage = {
        type: 'message',
        from: 'team-lead',
        to: 'developer',
        text: 'Hello developer',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('test-team', 'developer', msg)

      const inbox = readInbox('test-team', 'developer')
      expect(inbox).toHaveLength(1)
      expect(inbox[0]!.type).toBe('message')
      expect((inbox[0] as TeamMessage).text).toBe('Hello developer')
    })

    it('should append messages to existing inbox', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const msg1: TeamMessage = {
        type: 'message',
        from: 'team-lead',
        to: 'developer',
        text: 'First message',
        timestamp: new Date().toISOString(),
      }
      const msg2: BroadcastMessage = {
        type: 'broadcast',
        from: 'team-lead',
        text: 'Broadcast message',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('test-team', 'developer', msg1)
      await sendMessage('test-team', 'developer', msg2)

      const inbox = readInbox('test-team', 'developer')
      expect(inbox).toHaveLength(2)
      expect(inbox[0]!.type).toBe('message')
      expect(inbox[1]!.type).toBe('broadcast')
    })

    it('should create inboxes directory if it does not exist', async () => {
      // Use sendMessage without calling createTeam first
      const msg: TeamMessage = {
        type: 'message',
        from: 'lead',
        to: 'dev',
        text: 'test',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('fresh-team', 'dev', msg)

      const inbox = readInbox('fresh-team', 'dev')
      expect(inbox).toHaveLength(1)
    })
  })

  describe('readInbox', () => {
    it('should return empty array for nonexistent inbox', () => {
      const inbox = readInbox('test-team', 'nonexistent-agent')
      expect(inbox).toEqual([])
    })

    it('should return all messages in the inbox', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const msg: TeamMessage = {
        type: 'message',
        from: 'lead',
        to: 'dev',
        text: 'test',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('test-team', 'dev', msg)
      await sendMessage('test-team', 'dev', msg)

      const inbox = readInbox('test-team', 'dev')
      expect(inbox).toHaveLength(2)
    })
  })

  describe('clearInbox', () => {
    it('should clear all messages from an inbox', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const msg: TeamMessage = {
        type: 'message',
        from: 'lead',
        to: 'dev',
        text: 'test',
        timestamp: new Date().toISOString(),
      }
      await sendMessage('test-team', 'dev', msg)
      await sendMessage('test-team', 'dev', msg)

      clearInbox('test-team', 'dev')

      const inbox = readInbox('test-team', 'dev')
      expect(inbox).toEqual([])
    })

    it('should be a no-op if inbox does not exist', () => {
      expect(() => clearInbox('test-team', 'nonexistent')).not.toThrow()
    })
  })

  describe('getTeamsDir and getTasksDir', () => {
    it('should return paths under the config root', () => {
      const teamsDir = getTeamsDir()
      expect(teamsDir).toContain('.config')
      expect(teamsDir).toContain('levelcode')
      expect(teamsDir).toContain('teams')
    })

    it('getTasksDir should include the team name', () => {
      const tasksDir = getTasksDir('my-team')
      expect(tasksDir).toContain('tasks')
      expect(tasksDir).toContain('my-team')
    })
  })

  describe('input validation and path traversal prevention', () => {
    it('should reject team names with path traversal sequences', () => {
      expect(() => loadTeamConfig('../../../etc')).toThrow()
      expect(() => loadTeamConfig('..\\..\\etc')).toThrow()
      expect(() => loadTeamConfig('team/../../../etc')).toThrow()
    })

    it('should reject team names with special characters', () => {
      expect(() => loadTeamConfig('team name')).toThrow()
      expect(() => loadTeamConfig('team/name')).toThrow()
      expect(() => loadTeamConfig('team.name')).toThrow()
      expect(() => loadTeamConfig('team@name')).toThrow()
    })

    it('should reject team names exceeding max length', () => {
      const longName = 'a'.repeat(51)
      expect(() => loadTeamConfig(longName)).toThrow('at most 50 characters')
    })

    it('should accept valid team names', () => {
      // Should not throw on validation, just return null for nonexistent
      expect(loadTeamConfig('valid-team')).toBeNull()
      expect(loadTeamConfig('team_123')).toBeNull()
      expect(loadTeamConfig('MyTeam')).toBeNull()
    })

    it('should reject non-numeric task IDs', () => {
      const config = makeTeamConfig()
      createTeam(config)

      expect(() => getTask('test-team', '../config')).toThrow('Task ID must be numeric')
      expect(() => getTask('test-team', 'abc')).toThrow('Task ID must be numeric')
      expect(() => getTask('test-team', '1.5')).toThrow('Task ID must be numeric')
      expect(() => getTask('test-team', '')).toThrow()
    })

    it('should reject agent names with path traversal in inbox operations', () => {
      const config = makeTeamConfig()
      createTeam(config)

      expect(() => readInbox('test-team', '../../../etc/passwd')).toThrow()
      expect(() => readInbox('test-team', '..\\..\\etc')).toThrow()
    })

    it('should reject agent names with special characters in inbox operations', () => {
      const config = makeTeamConfig()
      createTeam(config)

      expect(() => readInbox('test-team', 'agent/name')).toThrow()
      expect(() => readInbox('test-team', 'agent name')).toThrow()
      expect(() => readInbox('test-team', 'agent.name')).toThrow()
    })

    it('should reject empty and null-like inputs', () => {
      expect(() => loadTeamConfig('')).toThrow()
      expect(() => getTasksDir('')).toThrow()
    })
  })
})
