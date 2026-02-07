import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { handleTeamDelete } from '../team-delete'
import {
  createTeam,
  loadTeamConfig,
  getTeamsDir,
  getTasksDir,
} from '@levelcode/common/utils/team-fs'

import type { TeamConfig } from '@levelcode/common/types/team-config'

let tmpDir: string
let origHome: string | undefined
let origUserProfile: string | undefined

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-delete-test-'))
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

function makeTeamConfig(overrides?: Partial<TeamConfig>): TeamConfig {
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
    ...overrides,
  }
}

function makeParams(agentStepId: string = 'step-abc') {
  return {
    previousToolCallFinished: Promise.resolve(),
    toolCall: {
      toolCallId: 'tc-del-1',
      toolName: 'team_delete' as const,
      input: {},
    },
    agentStepId,
  }
}

function getJsonValue(result: { output: any[] }): any {
  const output = result.output[0]
  return output?.type === 'json' ? output.value : null
}

describe('handleTeamDelete', () => {
  it('should successfully delete a team with only the lead active', async () => {
    createTeam(makeTeamConfig())

    const result = await handleTeamDelete(makeParams() as any)
    const val = getJsonValue(result)
    expect(val.message).toContain('Team "test-team" deleted successfully')

    const teamsDir = getTeamsDir()
    const teamDir = path.join(teamsDir, 'test-team')
    expect(fs.existsSync(teamDir)).toBe(false)

    const tasksDir = getTasksDir('test-team')
    expect(fs.existsSync(tasksDir)).toBe(false)
  })

  it('should block deletion when active non-lead members exist', async () => {
    createTeam(makeTeamConfig({
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
        {
          agentId: 'agent-dev-1',
          name: 'developer',
          role: 'senior-engineer',
          agentType: 'senior-engineer',
          model: 'test-model',
          joinedAt: Date.now(),
          status: 'active',
          cwd: '/tmp',
        },
      ],
    }))

    const result = await handleTeamDelete(makeParams() as any)
    const val = getJsonValue(result)
    expect(val.message).toContain('Cannot delete team')
    expect(val.message).toContain('1 active member(s)')
    expect(val.message).toContain('developer')

    // Team should still exist
    expect(loadTeamConfig('test-team')).not.toBeNull()
  })

  it('should allow deletion when non-lead members are not active', async () => {
    createTeam(makeTeamConfig({
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
        {
          agentId: 'agent-dev-1',
          name: 'developer',
          role: 'senior-engineer',
          agentType: 'senior-engineer',
          model: 'test-model',
          joinedAt: Date.now(),
          status: 'completed',
          cwd: '/tmp',
        },
      ],
    }))

    const result = await handleTeamDelete(makeParams() as any)
    const val = getJsonValue(result)
    expect(val.message).toContain('deleted successfully')
  })

  it('should return error when no team found for agent', async () => {
    const result = await handleTeamDelete(makeParams('unknown-step') as any)
    const val = getJsonValue(result)
    expect(val.message).toContain('No team found for the current agent context')
  })

  it('should find team when agent matches via member agentId', async () => {
    createTeam(makeTeamConfig({
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
        {
          agentId: 'step-dev',
          name: 'developer',
          role: 'senior-engineer',
          agentType: 'senior-engineer',
          model: 'test-model',
          joinedAt: Date.now(),
          status: 'completed',
          cwd: '/tmp',
        },
      ],
    }))

    // Use agentStepId 'step-dev' - findCurrentTeam checks member.agentId === agentStepId
    const result = await handleTeamDelete(makeParams('step-dev') as any)
    const val = getJsonValue(result)
    expect(val.message).toContain('deleted successfully')
  })
})
