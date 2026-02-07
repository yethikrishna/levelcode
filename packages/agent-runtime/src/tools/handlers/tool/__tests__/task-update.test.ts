import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { handleTaskUpdate } from '../task-update'
import {
  createTeam,
  createTask,
  getTask,
  getTasksDir,
} from '@levelcode/common/utils/team-fs'

import type { TeamConfig, TeamTask } from '@levelcode/common/types/team-config'

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => noopLogger,
} as any

let tmpDir: string
let origHome: string | undefined
let origUserProfile: string | undefined

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-update-test-'))
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

function makeTeamConfig(): TeamConfig {
  return {
    name: 'test-team',
    description: 'A test team',
    createdAt: Date.now(),
    leadAgentId: 'lead-step-abc',
    phase: 'planning',
    members: [
      {
        agentId: 'lead-step-abc',
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

function makeParams(input: Record<string, unknown>) {
  return {
    previousToolCallFinished: Promise.resolve(),
    toolCall: {
      toolCallId: 'tc-task-update-1',
      toolName: 'task_update' as const,
      input,
    },
    trackEvent: mock(() => {}),
    userId: 'test-user',
    logger: noopLogger,
  }
}

function getJsonValue(result: { output: any[] }): any {
  const output = result.output[0]
  return output?.type === 'json' ? output.value : null
}

describe('handleTaskUpdate', () => {
  describe('status changes', () => {
    it('should update task status from pending to in_progress', async () => {
      createTeam(makeTeamConfig())
      await createTask('test-team', makeTask())

      const result = await handleTaskUpdate(
        makeParams({ taskId: '1', status: 'in_progress' }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('updated successfully')
      expect(val.task.status).toBe('in_progress')

      const task = getTask('test-team', '1')
      expect(task!.status).toBe('in_progress')
    })

    it('should update task status to completed', async () => {
      createTeam(makeTeamConfig())
      await createTask('test-team', makeTask({ status: 'in_progress' }))

      const result = await handleTaskUpdate(
        makeParams({ taskId: '1', status: 'completed' }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('updated successfully')

      const task = getTask('test-team', '1')
      expect(task!.status).toBe('completed')
    })

    it('should delete task when status is deleted', async () => {
      createTeam(makeTeamConfig())
      await createTask('test-team', makeTask())

      const result = await handleTaskUpdate(
        makeParams({ taskId: '1', status: 'deleted' }) as any,
      )

      const val = getJsonValue(result)
      expect(val.message).toContain('Task "1" deleted')

      const task = getTask('test-team', '1')
      expect(task).toBeNull()

      const taskPath = path.join(getTasksDir('test-team'), '1.json')
      expect(fs.existsSync(taskPath)).toBe(false)
    })
  })

  describe('field updates', () => {
    it('should update subject', async () => {
      createTeam(makeTeamConfig())
      await createTask('test-team', makeTask())

      await handleTaskUpdate(
        makeParams({ taskId: '1', subject: 'Updated subject' }) as any,
      )

      const task = getTask('test-team', '1')
      expect(task!.subject).toBe('Updated subject')
    })

    it('should update description', async () => {
      createTeam(makeTeamConfig())
      await createTask('test-team', makeTask())

      await handleTaskUpdate(
        makeParams({ taskId: '1', description: 'New description' }) as any,
      )

      const task = getTask('test-team', '1')
      expect(task!.description).toBe('New description')
    })

    it('should update activeForm', async () => {
      createTeam(makeTeamConfig())
      await createTask('test-team', makeTask())

      await handleTaskUpdate(
        makeParams({ taskId: '1', activeForm: 'Running tests' }) as any,
      )

      const task = getTask('test-team', '1')
      expect(task!.activeForm).toBe('Running tests')
    })

    it('should update owner', async () => {
      createTeam(makeTeamConfig())
      await createTask('test-team', makeTask())

      await handleTaskUpdate(
        makeParams({ taskId: '1', owner: 'developer' }) as any,
      )

      const task = getTask('test-team', '1')
      expect(task!.owner).toBe('developer')
    })
  })

  describe('addBlocks / addBlockedBy', () => {
    it('should add blocks to existing empty list', async () => {
      createTeam(makeTeamConfig())
      await createTask('test-team', makeTask())

      await handleTaskUpdate(
        makeParams({ taskId: '1', addBlocks: ['2', '3'] }) as any,
      )

      const task = getTask('test-team', '1')
      expect(task!.blocks).toEqual(['2', '3'])
    })

    it('should merge blocks with existing list (no duplicates)', async () => {
      createTeam(makeTeamConfig())
      await createTask('test-team', makeTask({ blocks: ['2'] }))

      await handleTaskUpdate(
        makeParams({ taskId: '1', addBlocks: ['2', '3'] }) as any,
      )

      const task = getTask('test-team', '1')
      expect(task!.blocks).toEqual(['2', '3'])
    })

    it('should add blockedBy to existing empty list', async () => {
      createTeam(makeTeamConfig())
      await createTask('test-team', makeTask())

      await handleTaskUpdate(
        makeParams({ taskId: '1', addBlockedBy: ['5', '6'] }) as any,
      )

      const task = getTask('test-team', '1')
      expect(task!.blockedBy).toEqual(['5', '6'])
    })

    it('should merge blockedBy with existing list (no duplicates)', async () => {
      createTeam(makeTeamConfig())
      await createTask('test-team', makeTask({ blockedBy: ['5'] }))

      await handleTaskUpdate(
        makeParams({ taskId: '1', addBlockedBy: ['5', '6'] }) as any,
      )

      const task = getTask('test-team', '1')
      expect(task!.blockedBy).toEqual(['5', '6'])
    })
  })

  describe('metadata merge', () => {
    it('should set metadata on task with no existing metadata', async () => {
      createTeam(makeTeamConfig())
      await createTask('test-team', makeTask())

      await handleTaskUpdate(
        makeParams({
          taskId: '1',
          metadata: { priority: 'high', component: 'auth' },
        }) as any,
      )

      const task = getTask('test-team', '1')
      expect(task!.metadata).toEqual({ priority: 'high', component: 'auth' })
    })

    it('should merge metadata with existing values', async () => {
      createTeam(makeTeamConfig())
      await createTask(
        'test-team',
        makeTask({ metadata: { priority: 'low', author: 'alice' } }),
      )

      await handleTaskUpdate(
        makeParams({
          taskId: '1',
          metadata: { priority: 'high', component: 'auth' },
        }) as any,
      )

      const task = getTask('test-team', '1')
      expect(task!.metadata).toEqual({
        priority: 'high',
        author: 'alice',
        component: 'auth',
      })
    })

    it('should delete metadata keys when value is null', async () => {
      createTeam(makeTeamConfig())
      await createTask(
        'test-team',
        makeTask({
          metadata: { priority: 'high', author: 'alice', component: 'auth' },
        }),
      )

      await handleTaskUpdate(
        makeParams({
          taskId: '1',
          metadata: { author: null },
        }) as any,
      )

      const task = getTask('test-team', '1')
      expect(task!.metadata).toEqual({ priority: 'high', component: 'auth' })
      expect(task!.metadata!.author).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should return error for nonexistent task', async () => {
      createTeam(makeTeamConfig())

      const result = await handleTaskUpdate(
        makeParams({ taskId: '999', status: 'completed' }) as any,
      )

      const val = getJsonValue(result)
      expect(val.error).toContain('Task "999" not found')
    })

    it('should return error when no active team exists', async () => {
      const result = await handleTaskUpdate(
        makeParams({ taskId: '1', status: 'completed' }) as any,
      )

      const val = getJsonValue(result)
      expect(val.error).toContain('No active team found')
    })

    it('should return updated task in success response', async () => {
      createTeam(makeTeamConfig())
      await createTask('test-team', makeTask())

      const result = await handleTaskUpdate(
        makeParams({
          taskId: '1',
          status: 'in_progress',
          owner: 'developer',
        }) as any,
      )

      const val = getJsonValue(result)
      expect(val.task.status).toBe('in_progress')
      expect(val.task.owner).toBe('developer')
    })
  })
})
