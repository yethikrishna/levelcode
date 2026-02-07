import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import {
  cleanupStaleLocks,
  pruneCompletedTasks,
  cleanupOrphanedInboxes,
  getTeamStats,
  validateTeamIntegrity,
  archiveTeam,
} from '../team-maintenance'

import { createTeam, getTeamsDir, getTasksDir } from '../team-fs'
import type { TeamConfig, TeamTask } from '../../types/team-config'

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
    priority: 'medium',
    blockedBy: [],
    blocks: [],
    phase: 'planning',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function getTeamDir(teamName: string): string {
  return path.join(getTeamsDir(), teamName)
}

function getInboxesDir(teamName: string): string {
  return path.join(getTeamDir(teamName), 'inboxes')
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-maint-test-'))
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

describe('team-maintenance', () => {
  describe('cleanupStaleLocks', () => {
    it('should remove lock files older than the threshold', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const teamDir = getTeamDir('test-team')
      // Write a lock file with an old timestamp (20 seconds ago)
      const lockPath = path.join(teamDir, 'config.json.lock')
      fs.writeFileSync(lockPath, String(Date.now() - 20_000))

      const removed = cleanupStaleLocks('test-team', 10_000)

      expect(removed).toHaveLength(1)
      expect(removed[0]).toBe(lockPath)
      expect(fs.existsSync(lockPath)).toBe(false)
    })

    it('should not remove lock files that are still fresh', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const teamDir = getTeamDir('test-team')
      const lockPath = path.join(teamDir, 'fresh.lock')
      fs.writeFileSync(lockPath, String(Date.now()))

      const removed = cleanupStaleLocks('test-team', 10_000)

      expect(removed).toHaveLength(0)
      expect(fs.existsSync(lockPath)).toBe(true)
    })

    it('should remove lock files with invalid (non-numeric) content', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const teamDir = getTeamDir('test-team')
      const lockPath = path.join(teamDir, 'corrupt.lock')
      fs.writeFileSync(lockPath, 'not-a-number')

      const removed = cleanupStaleLocks('test-team', 10_000)

      expect(removed).toHaveLength(1)
      expect(fs.existsSync(lockPath)).toBe(false)
    })

    it('should scan team dir, tasks dir, and inboxes dir', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const teamDir = getTeamDir('test-team')
      const tasksDir = getTasksDir('test-team')
      const inboxesDir = getInboxesDir('test-team')

      const oldTimestamp = String(Date.now() - 20_000)
      const lock1 = path.join(teamDir, 'a.lock')
      const lock2 = path.join(tasksDir, 'b.lock')
      const lock3 = path.join(inboxesDir, 'c.lock')
      fs.writeFileSync(lock1, oldTimestamp)
      fs.writeFileSync(lock2, oldTimestamp)
      fs.writeFileSync(lock3, oldTimestamp)

      const removed = cleanupStaleLocks('test-team', 10_000)

      expect(removed).toHaveLength(3)
      expect(removed).toContain(lock1)
      expect(removed).toContain(lock2)
      expect(removed).toContain(lock3)
    })

    it('should return empty array when no lock files exist', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const removed = cleanupStaleLocks('test-team')
      expect(removed).toEqual([])
    })

    it('should not throw when team directories do not exist', () => {
      const removed = cleanupStaleLocks('nonexistent-team')
      expect(removed).toEqual([])
    })
  })

  describe('pruneCompletedTasks', () => {
    it('should archive completed tasks older than the threshold', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const tasksDir = getTasksDir('test-team')
      const oldTask = makeTask({
        id: '100',
        status: 'completed',
        updatedAt: Date.now() - 60_000,
      })
      fs.writeFileSync(path.join(tasksDir, '100.json'), JSON.stringify(oldTask))

      const result = pruneCompletedTasks('test-team', 30_000)

      expect(result.archived).toHaveLength(1)
      expect(result.archived).toContain('100')
      // Original file should be gone
      expect(fs.existsSync(path.join(tasksDir, '100.json'))).toBe(false)
      // Should be in the completed archive subdirectory
      expect(fs.existsSync(path.join(result.archiveDir, '100.json'))).toBe(true)
    })

    it('should not archive completed tasks within the threshold', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const tasksDir = getTasksDir('test-team')
      const recentTask = makeTask({
        id: '101',
        status: 'completed',
        updatedAt: Date.now() - 5_000,
      })
      fs.writeFileSync(path.join(tasksDir, '101.json'), JSON.stringify(recentTask))

      const result = pruneCompletedTasks('test-team', 30_000)

      expect(result.archived).toHaveLength(0)
      expect(fs.existsSync(path.join(tasksDir, '101.json'))).toBe(true)
    })

    it('should not archive non-completed tasks regardless of age', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const tasksDir = getTasksDir('test-team')
      const pendingTask = makeTask({
        id: '102',
        status: 'pending',
        updatedAt: Date.now() - 60_000,
      })
      const inProgressTask = makeTask({
        id: '103',
        status: 'in_progress',
        updatedAt: Date.now() - 60_000,
      })
      fs.writeFileSync(path.join(tasksDir, '102.json'), JSON.stringify(pendingTask))
      fs.writeFileSync(path.join(tasksDir, '103.json'), JSON.stringify(inProgressTask))

      const result = pruneCompletedTasks('test-team', 30_000)

      expect(result.archived).toHaveLength(0)
    })

    it('should return empty result when tasks directory does not exist', () => {
      const result = pruneCompletedTasks('nonexistent-team', 30_000)
      expect(result.archived).toEqual([])
    })

    it('should handle a mix of archivable and non-archivable tasks', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const tasksDir = getTasksDir('test-team')
      const oldCompleted = makeTask({
        id: '200',
        status: 'completed',
        updatedAt: Date.now() - 60_000,
      })
      const freshCompleted = makeTask({
        id: '201',
        status: 'completed',
        updatedAt: Date.now(),
      })
      const pending = makeTask({
        id: '202',
        status: 'pending',
        updatedAt: Date.now() - 60_000,
      })
      fs.writeFileSync(path.join(tasksDir, '200.json'), JSON.stringify(oldCompleted))
      fs.writeFileSync(path.join(tasksDir, '201.json'), JSON.stringify(freshCompleted))
      fs.writeFileSync(path.join(tasksDir, '202.json'), JSON.stringify(pending))

      const result = pruneCompletedTasks('test-team', 30_000)

      expect(result.archived).toEqual(['200'])
      expect(fs.existsSync(path.join(tasksDir, '201.json'))).toBe(true)
      expect(fs.existsSync(path.join(tasksDir, '202.json'))).toBe(true)
    })
  })

  describe('cleanupOrphanedInboxes', () => {
    it('should remove inbox files for agents not in the team config', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const inboxesDir = getInboxesDir('test-team')
      // Create an inbox for a non-member agent
      fs.writeFileSync(path.join(inboxesDir, 'ghost-agent.json'), '[]')

      const removed = cleanupOrphanedInboxes('test-team')

      expect(removed).toHaveLength(1)
      expect(removed).toContain('ghost-agent')
      expect(fs.existsSync(path.join(inboxesDir, 'ghost-agent.json'))).toBe(false)
    })

    it('should not remove inbox files for current team members', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const inboxesDir = getInboxesDir('test-team')
      // Create an inbox for the existing team lead member
      fs.writeFileSync(path.join(inboxesDir, 'team-lead.json'), '[]')

      const removed = cleanupOrphanedInboxes('test-team')

      expect(removed).toHaveLength(0)
      expect(fs.existsSync(path.join(inboxesDir, 'team-lead.json'))).toBe(true)
    })

    it('should return empty array when team does not exist', () => {
      const removed = cleanupOrphanedInboxes('nonexistent-team')
      expect(removed).toEqual([])
    })

    it('should return empty array when inboxes directory does not exist', () => {
      const config = makeTeamConfig()
      createTeam(config)

      // Remove the inboxes directory
      const inboxesDir = getInboxesDir('test-team')
      fs.rmSync(inboxesDir, { recursive: true, force: true })

      const removed = cleanupOrphanedInboxes('test-team')
      expect(removed).toEqual([])
    })

    it('should handle multiple orphaned inboxes', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const inboxesDir = getInboxesDir('test-team')
      fs.writeFileSync(path.join(inboxesDir, 'orphan-1.json'), '[]')
      fs.writeFileSync(path.join(inboxesDir, 'orphan-2.json'), '[]')
      fs.writeFileSync(path.join(inboxesDir, 'team-lead.json'), '[]')

      const removed = cleanupOrphanedInboxes('test-team')

      expect(removed).toHaveLength(2)
      expect(removed).toContain('orphan-1')
      expect(removed).toContain('orphan-2')
      expect(fs.existsSync(path.join(inboxesDir, 'team-lead.json'))).toBe(true)
    })
  })

  describe('getTeamStats', () => {
    it('should return correct counts for a team with tasks and members', () => {
      const now = Date.now()
      const config = makeTeamConfig({
        createdAt: now - 10_000,
        members: [
          {
            agentId: 'lead-123',
            name: 'team-lead',
            role: 'coordinator',
            agentType: 'coordinator',
            model: 'test-model',
            joinedAt: now,
            status: 'active',
            cwd: '/tmp',
          },
          {
            agentId: 'dev-1',
            name: 'developer',
            role: 'senior-engineer',
            agentType: 'senior-engineer',
            model: 'test-model',
            joinedAt: now,
            status: 'idle',
            cwd: '/tmp',
          },
        ],
      })
      createTeam(config)

      // Write task files directly
      const tasksDir = getTasksDir('test-team')
      const completedTask = makeTask({ id: '10', status: 'completed' })
      const pendingTask = makeTask({ id: '20', status: 'pending' })
      const inProgressTask = makeTask({ id: '30', status: 'in_progress' })
      fs.writeFileSync(path.join(tasksDir, '10.json'), JSON.stringify(completedTask))
      fs.writeFileSync(path.join(tasksDir, '20.json'), JSON.stringify(pendingTask))
      fs.writeFileSync(path.join(tasksDir, '30.json'), JSON.stringify(inProgressTask))

      const stats = getTeamStats('test-team')

      expect(stats).not.toBeNull()
      expect(stats!.totalTasks).toBe(3)
      expect(stats!.completedTasks).toBe(1)
      expect(stats!.activeMembers).toBe(1) // 'active' member
      expect(stats!.idleMembers).toBe(1) // 'idle' member
      expect(stats!.currentPhase).toBe('planning')
      expect(stats!.createdAt).toBe(now - 10_000)
      expect(stats!.uptime).toBeGreaterThanOrEqual(10_000)
    })

    it('should return null for a nonexistent team', () => {
      const stats = getTeamStats('nonexistent-team')
      expect(stats).toBeNull()
    })

    it('should return zero tasks when no tasks exist', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const stats = getTeamStats('test-team')

      expect(stats).not.toBeNull()
      expect(stats!.totalTasks).toBe(0)
      expect(stats!.completedTasks).toBe(0)
    })

    it('should count all completed tasks', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const tasksDir = getTasksDir('test-team')
      for (let i = 1; i <= 5; i++) {
        const task = makeTask({ id: `${i}`, status: 'completed' })
        fs.writeFileSync(path.join(tasksDir, `${i}.json`), JSON.stringify(task))
      }

      const stats = getTeamStats('test-team')

      expect(stats!.totalTasks).toBe(5)
      expect(stats!.completedTasks).toBe(5)
    })
  })

  describe('validateTeamIntegrity', () => {
    it('should return missing_config issue when team config does not exist', () => {
      // Create the team dir without a config
      const teamDir = getTeamDir('test-team')
      fs.mkdirSync(teamDir, { recursive: true })

      const issues = validateTeamIntegrity('test-team')

      expect(issues).toHaveLength(1)
      expect(issues[0]!.type).toBe('missing_config')
    })

    it('should return invalid_config issue for malformed JSON config', () => {
      const teamDir = getTeamDir('test-team')
      fs.mkdirSync(teamDir, { recursive: true })
      fs.writeFileSync(path.join(teamDir, 'config.json'), 'not valid json{{{')

      const issues = validateTeamIntegrity('test-team')

      const invalidConfigs = issues.filter((i) => i.type === 'invalid_config')
      expect(invalidConfigs.length).toBeGreaterThanOrEqual(1)
    })

    it('should return invalid_config issue for config that fails schema validation', () => {
      const teamDir = getTeamDir('test-team')
      fs.mkdirSync(teamDir, { recursive: true })
      // Valid JSON but missing required fields
      fs.writeFileSync(path.join(teamDir, 'config.json'), JSON.stringify({ name: 'test' }))

      const issues = validateTeamIntegrity('test-team')

      const invalidConfigs = issues.filter((i) => i.type === 'invalid_config')
      expect(invalidConfigs.length).toBeGreaterThanOrEqual(1)
    })

    it('should detect invalid task files', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const tasksDir = getTasksDir('test-team')
      // Write an invalid task file
      fs.writeFileSync(path.join(tasksDir, 'bad-task.json'), JSON.stringify({ broken: true }))

      const issues = validateTeamIntegrity('test-team')

      const invalidTasks = issues.filter((i) => i.type === 'invalid_task')
      expect(invalidTasks.length).toBeGreaterThanOrEqual(1)
    })

    it('should detect orphaned inboxes', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const inboxesDir = getInboxesDir('test-team')
      fs.writeFileSync(path.join(inboxesDir, 'ghost-agent.json'), '[]')

      const issues = validateTeamIntegrity('test-team')

      const orphaned = issues.filter((i) => i.type === 'orphaned_inbox')
      expect(orphaned).toHaveLength(1)
      expect(orphaned[0]!.message).toContain('ghost-agent')
    })

    it('should detect missing inboxes for members', () => {
      const config = makeTeamConfig()
      createTeam(config)

      // The team-lead member exists but has no inbox file
      const issues = validateTeamIntegrity('test-team')

      const missingInboxes = issues.filter((i) => i.type === 'missing_inbox')
      expect(missingInboxes).toHaveLength(1)
      expect(missingInboxes[0]!.message).toContain('team-lead')
    })

    it('should detect stale lock files', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const teamDir = getTeamDir('test-team')
      const lockPath = path.join(teamDir, 'old.lock')
      fs.writeFileSync(lockPath, String(Date.now() - 30_000))

      const issues = validateTeamIntegrity('test-team')

      const staleLocks = issues.filter((i) => i.type === 'stale_lock')
      expect(staleLocks.length).toBeGreaterThanOrEqual(1)
    })

    it('should detect dangling task references in blockedBy/blocks', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const tasksDir = getTasksDir('test-team')
      const taskWithDangling = makeTask({
        id: '1',
        blockedBy: ['999'],
        blocks: [],
      })
      fs.writeFileSync(path.join(tasksDir, '1.json'), JSON.stringify(taskWithDangling))

      const issues = validateTeamIntegrity('test-team')

      const dangling = issues.filter((i) => i.type === 'dangling_task_reference')
      expect(dangling.length).toBeGreaterThanOrEqual(1)
      expect(dangling[0]!.message).toContain('999')
    })

    it('should return no issues for a fully consistent team', () => {
      const config = makeTeamConfig()
      createTeam(config)

      // Create inbox for the member
      const inboxesDir = getInboxesDir('test-team')
      fs.writeFileSync(path.join(inboxesDir, 'team-lead.json'), '[]')

      // Create a valid task
      const tasksDir = getTasksDir('test-team')
      const task = makeTask({ id: '1', blockedBy: [], blocks: [] })
      fs.writeFileSync(path.join(tasksDir, '1.json'), JSON.stringify(task))

      const issues = validateTeamIntegrity('test-team')

      expect(issues).toEqual([])
    })
  })

  describe('archiveTeam', () => {
    it('should move team directory to archive', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const teamDir = getTeamDir('test-team')
      expect(fs.existsSync(teamDir)).toBe(true)

      const archiveDir = archiveTeam('test-team')

      expect(archiveDir).not.toBeNull()
      expect(archiveDir!).toContain('archive')
      expect(archiveDir!).toContain('test-team')
      // Original team dir should be gone
      expect(fs.existsSync(teamDir)).toBe(false)
      // Archive should contain the team directory
      const archivedTeamDir = path.join(archiveDir!, 'team')
      expect(fs.existsSync(archivedTeamDir)).toBe(true)
      // Config should be readable from archive
      expect(fs.existsSync(path.join(archivedTeamDir, 'config.json'))).toBe(true)
    })

    it('should move tasks directory to archive', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const tasksDir = getTasksDir('test-team')
      const task = makeTask({ id: '50' })
      fs.writeFileSync(path.join(tasksDir, '50.json'), JSON.stringify(task))

      const archiveDir = archiveTeam('test-team')

      expect(archiveDir).not.toBeNull()
      // Original tasks dir should be gone
      expect(fs.existsSync(tasksDir)).toBe(false)
      // Tasks should be in the archive
      const archivedTasksDir = path.join(archiveDir!, 'tasks')
      expect(fs.existsSync(archivedTasksDir)).toBe(true)
      expect(fs.existsSync(path.join(archivedTasksDir, '50.json'))).toBe(true)
    })

    it('should return null for a nonexistent team', () => {
      const result = archiveTeam('nonexistent-team')
      expect(result).toBeNull()
    })

    it('should include a timestamp in the archive directory name', () => {
      const config = makeTeamConfig()
      createTeam(config)

      const archiveDir = archiveTeam('test-team')

      expect(archiveDir).not.toBeNull()
      // The archive dir name should contain the team name and a timestamp pattern
      const dirName = path.basename(archiveDir!)
      expect(dirName).toMatch(/^test-team-\d{4}-\d{2}-\d{2}T/)
    })

    it('should handle team with no tasks directory', () => {
      const config = makeTeamConfig()
      createTeam(config)

      // Remove the tasks directory
      const tasksDir = getTasksDir('test-team')
      fs.rmSync(tasksDir, { recursive: true, force: true })

      const archiveDir = archiveTeam('test-team')

      expect(archiveDir).not.toBeNull()
      // Should archive team dir but no tasks dir
      expect(fs.existsSync(path.join(archiveDir!, 'team'))).toBe(true)
      expect(fs.existsSync(path.join(archiveDir!, 'tasks'))).toBe(false)
    })
  })
})
