import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { handleTaskList } from '../task-list'
import {
  createTeam,
  createTask,
} from '@levelcode/common/utils/team-fs'

import type { TeamConfig, TeamTask } from '@levelcode/common/types/team-config'

let tmpDir: string
let origHome: string | undefined
let origUserProfile: string | undefined

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-list-test-'))
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
    priority: 'medium',
    blockedBy: [],
    blocks: [],
    phase: 'planning',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function makeParams() {
  return {
    previousToolCallFinished: Promise.resolve(),
    toolCall: {
      toolCallId: 'tc-task-list-1',
      toolName: 'task_list' as const,
      input: {},
    },
  }
}

function getJsonValue(result: { output: any[] }): any {
  const output = result.output[0]
  return output?.type === 'json' ? output.value : null
}

describe('handleTaskList', () => {
  it('should return all tasks for the active team', async () => {
    createTeam(makeTeamConfig())
    await createTask('test-team', makeTask({ id: '1', subject: 'Task A' }))
    await createTask('test-team', makeTask({ id: '2', subject: 'Task B' }))
    await createTask('test-team', makeTask({ id: '3', subject: 'Task C' }))

    const result = await handleTaskList(makeParams() as any)
    const val = getJsonValue(result)
    expect(val.tasks).toHaveLength(3)
    const subjects = val.tasks.map((t: any) => t.subject)
    expect(subjects).toContain('Task A')
    expect(subjects).toContain('Task B')
    expect(subjects).toContain('Task C')
  })

  it('should return empty tasks array when no tasks exist', async () => {
    createTeam(makeTeamConfig())

    const result = await handleTaskList(makeParams() as any)
    const val = getJsonValue(result)
    expect(val.tasks).toEqual([])
  })

  it('should return error when no active team exists', async () => {
    const result = await handleTaskList(makeParams() as any)
    const val = getJsonValue(result)
    expect(val.error).toContain('No active team found')
    expect(val.tasks).toEqual([])
  })

  it('should return summary fields: id, subject, status, owner, blockedBy', async () => {
    createTeam(makeTeamConfig())
    await createTask(
      'test-team',
      makeTask({
        id: '1',
        subject: 'Summary task',
        status: 'in_progress',
        owner: 'developer',
        blockedBy: [],
      }),
    )

    const result = await handleTaskList(makeParams() as any)
    const val = getJsonValue(result)
    const task = val.tasks[0]
    expect(task.id).toBe('1')
    expect(task.subject).toBe('Summary task')
    expect(task.status).toBe('in_progress')
    expect(task.owner).toBe('developer')
    expect(task.blockedBy).toEqual([])
  })

  it('should filter blockedBy to only show non-completed blockers', async () => {
    createTeam(makeTeamConfig())

    // Task 1 is completed
    await createTask(
      'test-team',
      makeTask({ id: '1', subject: 'Done task', status: 'completed' }),
    )
    // Task 2 is pending
    await createTask(
      'test-team',
      makeTask({ id: '2', subject: 'Pending task', status: 'pending' }),
    )
    // Task 3 is blocked by tasks 1 and 2
    await createTask(
      'test-team',
      makeTask({
        id: '3',
        subject: 'Blocked task',
        status: 'pending',
        blockedBy: ['1', '2'],
      }),
    )

    const result = await handleTaskList(makeParams() as any)
    const val = getJsonValue(result)
    const blockedTask = val.tasks.find((t: any) => t.id === '3')
    // Task 1 is completed so it should be filtered out from blockedBy
    expect(blockedTask.blockedBy).toEqual(['2'])
  })

  it('should show null for owner when not set', async () => {
    createTeam(makeTeamConfig())
    await createTask('test-team', makeTask({ id: '1', subject: 'Unowned' }))

    const result = await handleTaskList(makeParams() as any)
    const val = getJsonValue(result)
    expect(val.tasks[0].owner).toBeNull()
  })

  it('should filter blockedBy referencing nonexistent tasks', async () => {
    createTeam(makeTeamConfig())
    // Task references a blocker that doesn't exist
    await createTask(
      'test-team',
      makeTask({
        id: '1',
        subject: 'Ghost blocker',
        blockedBy: ['999'],
      }),
    )

    const result = await handleTaskList(makeParams() as any)
    const val = getJsonValue(result)
    // Task 999 doesn't exist, so blocker is filtered out
    expect(val.tasks[0].blockedBy).toEqual([])
  })
})
