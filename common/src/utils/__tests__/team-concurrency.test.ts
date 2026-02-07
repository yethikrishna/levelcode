import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import {
  createTeam,
  loadTeamConfig,
  saveTeamConfig,
  addTeamMember,
  createTask,
  updateTask,
  listTasks,
  getTask,
  sendMessage,
  readInbox,
  getTeamsDir,
  getTasksDir,
} from '../team-fs'

import { acquireLock, withLock } from '../file-lock'

import type { TeamConfig, TeamMember, TeamTask } from '../../types/team-config'
import type { TeamMessage } from '../../types/team-protocol'

// ---------------------------------------------------------------------------
// Test isolation: redirect HOME so team-fs writes to a temp dir
// ---------------------------------------------------------------------------

let tmpDir: string
let origHome: string | undefined
let origUserProfile: string | undefined

function makeTeamConfig(overrides?: Partial<TeamConfig>): TeamConfig {
  return {
    name: 'concurrency-team',
    description: 'Concurrency test team',
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
        cwd: '/tmp',
      },
    ],
    settings: { maxMembers: 20, autoAssign: true },
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
    agentId: 'agent-000',
    name: 'dev-0',
    role: 'senior-engineer',
    agentType: 'senior-engineer',
    model: 'test-model',
    joinedAt: Date.now(),
    status: 'active',
    cwd: '/tmp',
    ...overrides,
  }
}

function makeMessage(overrides?: Partial<TeamMessage>): TeamMessage {
  return {
    type: 'message',
    from: 'sender',
    to: 'receiver',
    text: 'hello',
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-concurrency-test-'))
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

describe('team-concurrency', () => {
  // =========================================================================
  // 1. Multiple agents writing to the same team config simultaneously
  // =========================================================================
  describe('concurrent team config writes', () => {
    it('should not corrupt config when multiple agents write simultaneously', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      // Simulate 10 agents each updating the config description concurrently
      const agents = Array.from({ length: 10 }, (_, i) => `agent-${i}`)
      await Promise.all(
        agents.map((agentName) =>
          saveTeamConfig('concurrency-team', {
            ...config,
            description: `Updated by ${agentName}`,
          }),
        ),
      )

      // Config should be valid JSON with one of the agent descriptions
      const loaded = loadTeamConfig('concurrency-team')
      expect(loaded).not.toBeNull()
      expect(loaded!.name).toBe('concurrency-team')
      // The description should be from one of the agents (last writer wins)
      const isValidDescription = agents.some(
        (a) => loaded!.description === `Updated by ${a}`,
      )
      expect(isValidDescription).toBe(true)
    })

    it('should not leave a corrupted config file after concurrent writes', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      // Rapid overlapping writes
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          saveTeamConfig('concurrency-team', {
            ...config,
            description: `Write ${i}`,
          }),
        ),
      )

      // The config file should be parseable JSON
      const configPath = path.join(
        getTeamsDir(),
        'concurrency-team',
        'config.json',
      )
      const raw = fs.readFileSync(configPath, 'utf-8')
      expect(() => JSON.parse(raw)).not.toThrow()
    })

    it('should handle concurrent addTeamMember calls without losing members', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const memberCount = 5
      await Promise.all(
        Array.from({ length: memberCount }, (_, i) =>
          addTeamMember(
            'concurrency-team',
            makeMember({
              agentId: `concurrent-agent-${i}`,
              name: `concurrent-dev-${i}`,
            }),
          ),
        ),
      )

      const loaded = loadTeamConfig('concurrency-team')
      expect(loaded).not.toBeNull()

      // Due to file locking, all members should be added (serialized by lock)
      // The original lead + all concurrent members
      expect(loaded!.members.length).toBe(1 + memberCount)

      // Verify each concurrent member is present
      for (let i = 0; i < memberCount; i++) {
        const found = loaded!.members.find(
          (m) => m.agentId === `concurrent-agent-${i}`,
        )
        expect(found).toBeDefined()
      }
    })
  })

  // =========================================================================
  // 2. Multiple agents creating tasks at the same time (no ID collisions)
  // =========================================================================
  describe('concurrent task creation (no ID collisions)', () => {
    it('should create all tasks when using unique IDs concurrently', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const taskCount = 20
      await Promise.all(
        Array.from({ length: taskCount }, (_, i) =>
          createTask(
            'concurrency-team',
            makeTask({ id: `${i + 1}`, subject: `Task ${i}` }),
          ),
        ),
      )

      const tasks = listTasks('concurrency-team')
      expect(tasks).toHaveLength(taskCount)

      // Verify all task IDs are present
      const taskIds = new Set(tasks.map((t) => t.id))
      expect(taskIds.size).toBe(taskCount)
      for (let i = 0; i < taskCount; i++) {
        expect(taskIds.has(`${i + 1}`)).toBe(true)
      }
    })

    it('should not produce corrupted task files under concurrent creation', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const taskCount = 15
      await Promise.all(
        Array.from({ length: taskCount }, (_, i) =>
          createTask(
            'concurrency-team',
            makeTask({
              id: `${100 + i}`,
              subject: `Concurrent task ${i}`,
              description: `Description for task ${i} with some padding ${'x'.repeat(100)}`,
            }),
          ),
        ),
      )

      // Each task file should be valid JSON
      const tasksDir = getTasksDir('concurrency-team')
      for (let i = 0; i < taskCount; i++) {
        const taskPath = path.join(tasksDir, `${100 + i}.json`)
        expect(fs.existsSync(taskPath)).toBe(true)
        const raw = fs.readFileSync(taskPath, 'utf-8')
        expect(() => JSON.parse(raw)).not.toThrow()
        const parsed = JSON.parse(raw)
        expect(parsed.id).toBe(`${100 + i}`)
      }
    })

    it('should handle concurrent creation of tasks with sequential ID generation', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      // Simulate a counter-based ID generator with concurrent access
      let counter = 0
      const getNextId = () => String(++counter)

      const taskCount = 10
      // Generate IDs first (simulating what would happen before lock)
      const ids = Array.from({ length: taskCount }, () => getNextId())

      await Promise.all(
        ids.map((id) =>
          createTask(
            'concurrency-team',
            makeTask({ id, subject: `Task with ID ${id}` }),
          ),
        ),
      )

      const tasks = listTasks('concurrency-team')
      expect(tasks).toHaveLength(taskCount)

      // All IDs should be unique
      const uniqueIds = new Set(tasks.map((t) => t.id))
      expect(uniqueIds.size).toBe(taskCount)
    })
  })

  // =========================================================================
  // 3. Multiple agents sending messages to same inbox concurrently
  // =========================================================================
  describe('concurrent inbox writes', () => {
    it('should not lose messages when multiple agents send to same inbox concurrently', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const senderCount = 10
      await Promise.all(
        Array.from({ length: senderCount }, (_, i) =>
          sendMessage(
            'concurrency-team',
            'team-lead',
            makeMessage({
              from: `agent-${i}`,
              to: 'team-lead',
              text: `Message from agent-${i}`,
            }),
          ),
        ),
      )

      const inbox = readInbox('concurrency-team', 'team-lead')
      // File locking serializes writes, so all messages should be preserved
      expect(inbox).toHaveLength(senderCount)

      // Verify all senders are represented
      const senders = new Set(
        inbox
          .filter((m): m is TeamMessage => m.type === 'message')
          .map((m) => m.from),
      )
      expect(senders.size).toBe(senderCount)
      for (let i = 0; i < senderCount; i++) {
        expect(senders.has(`agent-${i}`)).toBe(true)
      }
    })

    it('should preserve message content integrity under concurrent writes', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const messageCount = 15
      await Promise.all(
        Array.from({ length: messageCount }, (_, i) =>
          sendMessage(
            'concurrency-team',
            'team-lead',
            makeMessage({
              from: `agent-${i}`,
              to: 'team-lead',
              text: `Unique payload ${i}: ${'data'.repeat(50)}`,
            }),
          ),
        ),
      )

      const inbox = readInbox('concurrency-team', 'team-lead')
      expect(inbox).toHaveLength(messageCount)

      // Each message should have its complete, uncorrupted text
      for (const msg of inbox) {
        const tm = msg as TeamMessage
        expect(tm.text).toMatch(/^Unique payload \d+: /)
        expect(tm.text).toContain('data'.repeat(50))
      }
    })

    it('should handle concurrent writes to different inboxes without interference', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const agents = ['alpha', 'beta', 'gamma', 'delta']
      const msgsPerAgent = 8

      // Each agent sends messages to themselves (simulating different inboxes)
      await Promise.all(
        agents.flatMap((agent) =>
          Array.from({ length: msgsPerAgent }, (_, i) =>
            sendMessage(
              'concurrency-team',
              agent,
              makeMessage({
                from: 'broadcaster',
                to: agent,
                text: `msg-${i} for ${agent}`,
              }),
            ),
          ),
        ),
      )

      // Each inbox should have exactly the right messages
      for (const agent of agents) {
        const inbox = readInbox('concurrency-team', agent)
        expect(inbox).toHaveLength(msgsPerAgent)
        for (const msg of inbox) {
          expect((msg as TeamMessage).text).toContain(`for ${agent}`)
        }
      }
    })
  })

  // =========================================================================
  // 4. File lock acquisition and release
  // =========================================================================
  describe('file lock acquisition and release', () => {
    it('should acquire and release a lock successfully', async () => {
      const lockTarget = path.join(tmpDir, 'test-lock-target.json')
      fs.writeFileSync(lockTarget, '{}')

      const release = await acquireLock(lockTarget)
      const lockPath = lockTarget + '.lock'

      // Lock file should exist while held
      expect(fs.existsSync(lockPath)).toBe(true)

      release()

      // Lock file should be removed after release
      expect(fs.existsSync(lockPath)).toBe(false)
    })

    it('should prevent a second lock while the first is held', async () => {
      const lockTarget = path.join(tmpDir, 'contested-lock.json')
      fs.writeFileSync(lockTarget, '{}')

      const release1 = await acquireLock(lockTarget)

      // Second lock attempt should wait and then eventually acquire after release
      let secondAcquired = false
      const secondLockPromise = acquireLock(lockTarget, 2000).then(
        (release2) => {
          secondAcquired = true
          release2()
        },
      )

      // Give the second lock a moment to poll
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(secondAcquired).toBe(false)

      // Release the first lock
      release1()

      // Second lock should now acquire
      await secondLockPromise
      expect(secondAcquired).toBe(true)
    })

    it('should serialize operations via withLock', async () => {
      const lockTarget = path.join(tmpDir, 'serial-lock.json')
      fs.writeFileSync(lockTarget, '[]')

      const results: number[] = []

      // Launch 5 concurrent operations that all want to append to the same array
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          withLock(lockTarget, async () => {
            // Read current state
            const raw = fs.readFileSync(lockTarget, 'utf-8')
            const arr = JSON.parse(raw) as number[]
            // Simulate some async work
            await new Promise((resolve) => setTimeout(resolve, 10))
            // Append and write back
            arr.push(i)
            fs.writeFileSync(lockTarget, JSON.stringify(arr))
            results.push(i)
          }),
        ),
      )

      // All 5 operations should have completed
      expect(results).toHaveLength(5)

      // The file should contain all 5 values (serialized by lock)
      const final = JSON.parse(fs.readFileSync(lockTarget, 'utf-8')) as number[]
      expect(final).toHaveLength(5)
      expect(final.sort()).toEqual([0, 1, 2, 3, 4])
    })

    it('should release the lock if the locked function throws', async () => {
      const lockTarget = path.join(tmpDir, 'throw-lock.json')
      fs.writeFileSync(lockTarget, '{}')

      try {
        await withLock(lockTarget, () => {
          throw new Error('intentional error')
        })
      } catch {
        // Expected
      }

      // Lock should be released - a new lock should be immediately acquirable
      const release = await acquireLock(lockTarget, 500)
      expect(typeof release).toBe('function')
      release()
    })

    it('should not double-release a lock', async () => {
      const lockTarget = path.join(tmpDir, 'double-release.json')
      fs.writeFileSync(lockTarget, '{}')

      const release = await acquireLock(lockTarget)
      release()
      // Calling release again should not throw
      expect(() => release()).not.toThrow()
    })
  })

  // =========================================================================
  // 5. Lock timeout / stale lock cleanup
  // =========================================================================
  describe('lock timeout and stale lock cleanup', () => {
    it('should time out when lock cannot be acquired within timeout', async () => {
      const lockTarget = path.join(tmpDir, 'timeout-lock.json')
      fs.writeFileSync(lockTarget, '{}')

      // Manually create a lock file (simulating a held lock)
      const lockPath = lockTarget + '.lock'
      fs.writeFileSync(lockPath, String(Date.now()))

      // Attempt to acquire with a very short timeout
      try {
        await acquireLock(lockTarget, 200)
        // Should not reach here
        expect(true).toBe(false)
      } catch (err: unknown) {
        expect((err as Error).message).toContain('Timed out waiting for lock')
      }

      // Clean up the manual lock file
      fs.unlinkSync(lockPath)
    })

    it('should clean up stale locks automatically', async () => {
      const lockTarget = path.join(tmpDir, 'stale-lock.json')
      fs.writeFileSync(lockTarget, '{}')

      // Create a lock file with a timestamp far in the past (stale)
      const lockPath = lockTarget + '.lock'
      const staleTimestamp = Date.now() - 30_000 // 30 seconds ago (> 10s stale threshold)
      fs.writeFileSync(lockPath, String(staleTimestamp))

      // Should be able to acquire the lock since the existing one is stale
      const release = await acquireLock(lockTarget, 2000)
      expect(typeof release).toBe('function')
      release()
    })

    it('should not consider a fresh lock as stale', async () => {
      const lockTarget = path.join(tmpDir, 'fresh-lock.json')
      fs.writeFileSync(lockTarget, '{}')

      // Create a lock file with a current timestamp (not stale)
      const lockPath = lockTarget + '.lock'
      fs.writeFileSync(lockPath, String(Date.now()))

      // Attempt to acquire with a short timeout - should fail because lock is fresh
      try {
        await acquireLock(lockTarget, 200)
        expect(true).toBe(false)
      } catch (err: unknown) {
        expect((err as Error).message).toContain('Timed out waiting for lock')
      }

      // Clean up
      fs.unlinkSync(lockPath)
    })

    it('should handle a lock file with invalid content as non-stale', async () => {
      const lockTarget = path.join(tmpDir, 'invalid-lock.json')
      fs.writeFileSync(lockTarget, '{}')

      // Create a lock file with garbage content
      const lockPath = lockTarget + '.lock'
      fs.writeFileSync(lockPath, 'not-a-number')

      // Since parseInt('not-a-number') is NaN, the staleness check should not
      // treat it as stale. It should time out.
      try {
        await acquireLock(lockTarget, 300)
        expect(true).toBe(false)
      } catch (err: unknown) {
        expect((err as Error).message).toContain('Timed out waiting for lock')
      }

      // Clean up
      fs.unlinkSync(lockPath)
    })
  })

  // =========================================================================
  // 6. Config read while another agent is writing
  // =========================================================================
  describe('config read during concurrent write', () => {
    it('should read a consistent config even during concurrent writes', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      // Start a long-running write
      const writePromise = saveTeamConfig('concurrency-team', {
        ...config,
        description: 'Long write in progress',
      })

      // Immediately read the config
      const readResult = loadTeamConfig('concurrency-team')

      await writePromise

      // Read should return a valid config (either old or new, but not corrupted)
      expect(readResult).not.toBeNull()
      expect(readResult!.name).toBe('concurrency-team')
      expect(
        readResult!.description === 'Concurrency test team' ||
          readResult!.description === 'Long write in progress',
      ).toBe(true)
    })

    it('should always return valid JSON from loadTeamConfig during rapid writes', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      // Fire off many writes
      const writePromises = Array.from({ length: 10 }, (_, i) =>
        saveTeamConfig('concurrency-team', {
          ...config,
          description: `Rapid write ${i}`,
        }),
      )

      // Interleave reads between writes
      const readResults: (TeamConfig | null)[] = []
      for (let i = 0; i < 5; i++) {
        readResults.push(loadTeamConfig('concurrency-team'))
      }

      await Promise.all(writePromises)

      // All reads should return valid, non-null configs
      for (const result of readResults) {
        expect(result).not.toBeNull()
        expect(result!.name).toBe('concurrency-team')
      }
    })

    it('should reflect the final write after all concurrent writes complete', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      // All writes complete, then read
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          saveTeamConfig('concurrency-team', {
            ...config,
            description: `Final write ${i}`,
          }),
        ),
      )

      const loaded = loadTeamConfig('concurrency-team')
      expect(loaded).not.toBeNull()
      // Should have one of the "Final write N" descriptions
      expect(loaded!.description).toMatch(/^Final write \d+$/)
    })
  })

  // =========================================================================
  // 7. Task update race conditions (two agents updating same task)
  // =========================================================================
  describe('task update race conditions', () => {
    it('should not corrupt a task when two agents update it simultaneously', async () => {
      const config = makeTeamConfig()
      createTeam(config)
      await createTask(
        'concurrency-team',
        makeTask({ id: '200', subject: 'Race condition task' }),
      )

      // Two agents try to update the same task at the same time
      await Promise.all([
        updateTask('concurrency-team', '200', {
          status: 'in_progress',
          owner: 'agent-A',
        }),
        updateTask('concurrency-team', '200', {
          status: 'in_progress',
          owner: 'agent-B',
        }),
      ])

      const task = getTask('concurrency-team', '200')
      expect(task).not.toBeNull()
      expect(task!.status).toBe('in_progress')
      // One of the two owners should win (last-writer-wins with lock serialization)
      expect(task!.owner === 'agent-A' || task!.owner === 'agent-B').toBe(true)
    })

    it('should preserve task data integrity under concurrent status transitions', async () => {
      const config = makeTeamConfig()
      createTeam(config)
      await createTask(
        'concurrency-team',
        makeTask({
          id: '300',
          subject: 'Transition task',
          description: 'This description must survive',
        }),
      )

      // Multiple concurrent updates to different fields
      await Promise.all([
        updateTask('concurrency-team', '300', {
          status: 'in_progress',
        }),
        updateTask('concurrency-team', '300', {
          owner: 'agent-C',
        }),
        updateTask('concurrency-team', '300', {
          activeForm: 'Working on it',
        }),
      ])

      const task = getTask('concurrency-team', '300')
      expect(task).not.toBeNull()
      // Original fields should be intact
      expect(task!.id).toBe('300')
      expect(task!.subject).toBe('Transition task')
      expect(task!.description).toBe('This description must survive')
      // The task file should be valid JSON
      const taskPath = path.join(
        getTasksDir('concurrency-team'),
        '300.json',
      )
      const raw = fs.readFileSync(taskPath, 'utf-8')
      expect(() => JSON.parse(raw)).not.toThrow()
    })

    it('should handle concurrent updates to multiple different tasks', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      const taskCount = 10
      // Create all tasks first
      await Promise.all(
        Array.from({ length: taskCount }, (_, i) =>
          createTask(
            'concurrency-team',
            makeTask({ id: `${400 + i}`, subject: `Multi-task ${i}` }),
          ),
        ),
      )

      // Now update all tasks concurrently
      await Promise.all(
        Array.from({ length: taskCount }, (_, i) =>
          updateTask('concurrency-team', `${400 + i}`, {
            status: 'in_progress',
            owner: `agent-${i}`,
          }),
        ),
      )

      // All tasks should be updated correctly
      for (let i = 0; i < taskCount; i++) {
        const task = getTask('concurrency-team', `${400 + i}`)
        expect(task).not.toBeNull()
        expect(task!.status).toBe('in_progress')
        expect(task!.owner).toBe(`agent-${i}`)
      }
    })

    it('should update updatedAt timestamp even under concurrent updates', async () => {
      const config = makeTeamConfig()
      createTeam(config)
      const earlyTime = 1000
      await createTask(
        'concurrency-team',
        makeTask({
          id: '500',
          updatedAt: earlyTime,
        }),
      )

      const before = Date.now()

      await Promise.all([
        updateTask('concurrency-team', '500', {
          subject: 'Updated A',
        }),
        updateTask('concurrency-team', '500', {
          subject: 'Updated B',
        }),
      ])

      const after = Date.now()
      const task = getTask('concurrency-team', '500')
      expect(task).not.toBeNull()
      // updatedAt should be recent, not the original earlyTime
      expect(task!.updatedAt).toBeGreaterThanOrEqual(before)
      expect(task!.updatedAt).toBeLessThanOrEqual(after)
    })

    it('should handle rapid create-then-update sequences concurrently', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      // Each "agent" creates a task and immediately updates it
      const agentCount = 8
      await Promise.all(
        Array.from({ length: agentCount }, async (_, i) => {
          await createTask(
            'concurrency-team',
            makeTask({ id: `${600 + i}`, subject: `Seq ${i}`, status: 'pending' }),
          )
          await updateTask('concurrency-team', `${600 + i}`, {
            status: 'in_progress',
            owner: `agent-${i}`,
          })
        }),
      )

      // All tasks should exist and be in_progress
      const tasks = listTasks('concurrency-team')
      expect(tasks).toHaveLength(agentCount)
      for (let i = 0; i < agentCount; i++) {
        const task = getTask('concurrency-team', `${600 + i}`)
        expect(task).not.toBeNull()
        expect(task!.status).toBe('in_progress')
        expect(task!.owner).toBe(`agent-${i}`)
      }
    })
  })

  // =========================================================================
  // Stress test: combined concurrent operations
  // =========================================================================
  describe('combined stress test', () => {
    it('should handle simultaneous config writes, task operations, and messaging', async () => {
      const config = makeTeamConfig()
      createTeam(config)

      // Create some initial tasks
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          createTask(
            'concurrency-team',
            makeTask({ id: `${700 + i}`, subject: `Stress task ${i}` }),
          ),
        ),
      )

      // Simultaneously: update config, update tasks, send messages
      await Promise.all([
        // Config updates
        saveTeamConfig('concurrency-team', {
          ...config,
          description: 'Stress updated',
        }),
        addTeamMember(
          'concurrency-team',
          makeMember({ agentId: 'stress-agent', name: 'stress-dev' }),
        ),

        // Task updates
        ...Array.from({ length: 5 }, (_, i) =>
          updateTask('concurrency-team', `${700 + i}`, {
            status: 'in_progress',
            owner: `stress-owner-${i}`,
          }),
        ),

        // Messages
        ...Array.from({ length: 5 }, (_, i) =>
          sendMessage(
            'concurrency-team',
            'team-lead',
            makeMessage({ from: `stress-agent-${i}`, text: `Stress msg ${i}` }),
          ),
        ),
      ])

      // Verify everything is consistent
      const loadedConfig = loadTeamConfig('concurrency-team')
      expect(loadedConfig).not.toBeNull()
      // Config should be valid
      expect(loadedConfig!.name).toBe('concurrency-team')

      // All tasks should be updated
      for (let i = 0; i < 5; i++) {
        const task = getTask('concurrency-team', `${700 + i}`)
        expect(task).not.toBeNull()
        expect(task!.status).toBe('in_progress')
      }

      // All messages should be present
      const inbox = readInbox('concurrency-team', 'team-lead')
      expect(inbox).toHaveLength(5)
    })
  })
})
