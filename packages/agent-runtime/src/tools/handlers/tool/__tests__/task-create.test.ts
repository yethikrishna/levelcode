import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { handleTaskCreate } from '../task-create'
import {
  createTeam,
  createTask,
  getTask,
  listTasks,
} from '@levelcode/common/utils/team-fs'

import type { TeamConfig, TeamTask } from '@levelcode/common/types/team-config'

let tmpDir: string
let origHome: string | undefined
let origUserProfile: string | undefined

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-create-test-'))
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

function makeParams(input: {
  subject: string
  description: string
  activeForm?: string
  metadata?: Record<string, unknown>
}) {
  return {
    previousToolCallFinished: Promise.resolve(),
    toolCall: {
      toolCallId: 'tc-task-create-1',
      toolName: 'task_create' as const,
      input,
    },
  }
}

function getJsonValue(result: { output: any[] }): any {
  const output = result.output[0]
  return output?.type === 'json' ? output.value : null
}

describe('handleTaskCreate', () => {
  it('should create a task with valid input', async () => {
    createTeam(makeTeamConfig())

    const result = await handleTaskCreate(
      makeParams({
        subject: 'Fix login bug',
        description: 'The login form crashes on empty email',
        activeForm: 'Fixing login bug',
      }) as any,
    )

    const val = getJsonValue(result)
    expect(val.taskId).toBe('1')
    expect(val.subject).toBe('Fix login bug')

    const task = getTask('test-team', '1')
    expect(task).not.toBeNull()
    expect(task!.subject).toBe('Fix login bug')
    expect(task!.description).toBe('The login form crashes on empty email')
    expect(task!.status).toBe('pending')
    expect(task!.activeForm).toBe('Fixing login bug')
    expect(task!.blockedBy).toEqual([])
    expect(task!.blocks).toEqual([])
  })

  it('should auto-increment task ID', async () => {
    createTeam(makeTeamConfig())

    await handleTaskCreate(
      makeParams({
        subject: 'Task 1',
        description: 'First task',
      }) as any,
    )

    await handleTaskCreate(
      makeParams({
        subject: 'Task 2',
        description: 'Second task',
      }) as any,
    )

    await handleTaskCreate(
      makeParams({
        subject: 'Task 3',
        description: 'Third task',
      }) as any,
    )

    const tasks = listTasks('test-team')
    expect(tasks).toHaveLength(3)

    const ids = tasks.map((t) => t.id).sort()
    expect(ids).toEqual(['1', '2', '3'])
  })

  it('should auto-increment from existing max ID', async () => {
    createTeam(makeTeamConfig())

    // Manually create a task with ID 10
    const existingTask: TeamTask = {
      id: '10',
      subject: 'Pre-existing',
      description: 'Already here',
      status: 'completed',
      priority: 'medium',
      blockedBy: [],
      blocks: [],
      phase: 'planning',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await createTask('test-team', existingTask)

    const result = await handleTaskCreate(
      makeParams({
        subject: 'New task',
        description: 'After existing',
      }) as any,
    )

    const val = getJsonValue(result)
    expect(val.taskId).toBe('11')
  })

  it('should store metadata when provided', async () => {
    createTeam(makeTeamConfig())

    await handleTaskCreate(
      makeParams({
        subject: 'Meta task',
        description: 'Has metadata',
        metadata: { priority: 'high', component: 'auth' },
      }) as any,
    )

    const task = getTask('test-team', '1')
    expect(task!.metadata).toEqual({ priority: 'high', component: 'auth' })
  })

  it('should return error when no active team exists', async () => {
    const result = await handleTaskCreate(
      makeParams({
        subject: 'Orphan task',
        description: 'No team',
      }) as any,
    )

    const val = getJsonValue(result)
    expect(val.error).toContain('No active team found')
  })

  it('should set phase to planning', async () => {
    createTeam(makeTeamConfig())

    await handleTaskCreate(
      makeParams({
        subject: 'Phase check',
        description: 'Check default phase',
      }) as any,
    )

    const task = getTask('test-team', '1')
    expect(task!.phase).toBe('planning')
  })

  it('should set createdAt and updatedAt timestamps', async () => {
    createTeam(makeTeamConfig())

    const before = Date.now()
    await handleTaskCreate(
      makeParams({
        subject: 'Timestamp check',
        description: 'Check timestamps',
      }) as any,
    )
    const after = Date.now()

    const task = getTask('test-team', '1')
    expect(task!.createdAt).toBeGreaterThanOrEqual(before)
    expect(task!.createdAt).toBeLessThanOrEqual(after)
    expect(task!.updatedAt).toBeGreaterThanOrEqual(before)
    expect(task!.updatedAt).toBeLessThanOrEqual(after)
  })
})
