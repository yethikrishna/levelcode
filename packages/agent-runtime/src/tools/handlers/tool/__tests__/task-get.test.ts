import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { handleTaskGet } from '../task-get'
import {
  createTeam,
  createTask,
} from '@levelcode/common/utils/team-fs'

import type { TeamConfig, TeamTask } from '@levelcode/common/types/team-config'

let tmpDir: string
let origHome: string | undefined
let origUserProfile: string | undefined

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-get-test-'))
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

function makeParams(taskId: string) {
  return {
    previousToolCallFinished: Promise.resolve(),
    toolCall: {
      toolCallId: 'tc-task-get-1',
      toolName: 'task_get' as const,
      input: { taskId },
    },
  }
}

function getJsonValue(result: { output: any[] }): any {
  const output = result.output[0]
  return output?.type === 'json' ? output.value : null
}

describe('handleTaskGet', () => {
  it('should return task data for an existing task', async () => {
    createTeam(makeTeamConfig())
    await createTask('test-team', makeTask({
      id: '42',
      subject: 'Important task',
      description: 'Do something important',
      status: 'in_progress',
      owner: 'developer',
    }))

    const result = await handleTaskGet(makeParams('42') as any)
    const val = getJsonValue(result)
    expect(val.id).toBe('42')
    expect(val.subject).toBe('Important task')
    expect(val.description).toBe('Do something important')
    expect(val.status).toBe('in_progress')
    expect(val.owner).toBe('developer')
  })

  it('should return error for nonexistent task', async () => {
    createTeam(makeTeamConfig())

    const result = await handleTaskGet(makeParams('999') as any)
    const val = getJsonValue(result)
    expect(val.error).toContain('Task "999" not found')
  })

  it('should return error when no active team exists', async () => {
    const result = await handleTaskGet(makeParams('1') as any)
    const val = getJsonValue(result)
    expect(val.error).toContain('No active team found')
  })

  it('should return all task fields including blockedBy and blocks', async () => {
    createTeam(makeTeamConfig())
    await createTask('test-team', makeTask({
      id: '5',
      subject: 'Blocked task',
      blockedBy: ['3', '4'],
      blocks: ['6'],
      activeForm: 'Working on blocked task',
    }))

    const result = await handleTaskGet(makeParams('5') as any)
    const val = getJsonValue(result)
    expect(val.blockedBy).toEqual(['3', '4'])
    expect(val.blocks).toEqual(['6'])
    expect(val.activeForm).toBe('Working on blocked task')
  })

  it('should return task with correct timestamps', async () => {
    createTeam(makeTeamConfig())
    const now = Date.now()
    await createTask('test-team', makeTask({
      id: '7',
      createdAt: now - 1000,
      updatedAt: now,
    }))

    const result = await handleTaskGet(makeParams('7') as any)
    const val = getJsonValue(result)
    expect(val.createdAt).toBe(now - 1000)
    expect(val.updatedAt).toBe(now)
  })
})
