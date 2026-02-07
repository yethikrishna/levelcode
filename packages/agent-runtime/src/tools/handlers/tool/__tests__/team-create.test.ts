import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { handleTeamCreate } from '../team-create'
import {
  createTeam,
  getTeamsDir,
  getTasksDir,
  loadTeamConfig,
} from '@levelcode/common/utils/team-fs'

import type { TeamConfig } from '@levelcode/common/types/team-config'

let tmpDir: string
let origHome: string | undefined
let origUserProfile: string | undefined

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => noopLogger,
} as any

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-create-test-'))
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

function makeParams(input: {
  team_name: string
  description?: string
  agent_type?: string
}) {
  return {
    previousToolCallFinished: Promise.resolve(),
    toolCall: {
      toolCallId: 'tc-1',
      toolName: 'team_create' as const,
      input,
    },
    agentStepId: 'step-abc',
    trackEvent: mock(() => {}),
    userId: 'test-user',
    logger: noopLogger,
  }
}

function getJsonValue(result: { output: any[] }): any {
  const output = result.output[0]
  return output?.type === 'json' ? output.value : null
}

describe('handleTeamCreate', () => {
  it('should create a team with valid input', async () => {
    const result = await handleTeamCreate(
      makeParams({ team_name: 'alpha-team', description: 'My team' }) as any,
    )

    const val = getJsonValue(result)
    expect(val.message).toContain('Team "alpha-team" created successfully')

    const config = loadTeamConfig('alpha-team')
    expect(config).not.toBeNull()
    expect(config!.name).toBe('alpha-team')
    expect(config!.description).toBe('My team')
    expect(config!.leadAgentId).toBe('lead-step-abc')
    expect(config!.phase).toBe('planning')
    expect(config!.members).toHaveLength(1)
    expect(config!.members[0]!.name).toBe('team-lead')
    expect(config!.members[0]!.role).toBe('coordinator')
  })

  it('should default description to empty string when omitted', async () => {
    await handleTeamCreate(
      makeParams({ team_name: 'no-desc-team' }) as any,
    )

    const config = loadTeamConfig('no-desc-team')
    expect(config!.description).toBe('')
  })

  it('should use provided agent_type for the lead member', async () => {
    await handleTeamCreate(
      makeParams({ team_name: 'typed-team', agent_type: 'cto' }) as any,
    )

    const config = loadTeamConfig('typed-team')
    expect(config!.members[0]!.agentType).toBe('cto')
  })

  it('should default agent_type to coordinator when omitted', async () => {
    await handleTeamCreate(
      makeParams({ team_name: 'default-type-team' }) as any,
    )

    const config = loadTeamConfig('default-type-team')
    expect(config!.members[0]!.agentType).toBe('coordinator')
  })

  it('should create both team dir and tasks dir', async () => {
    await handleTeamCreate(
      makeParams({ team_name: 'dir-test-team' }) as any,
    )

    const teamsDir = getTeamsDir()
    const teamDir = path.join(teamsDir, 'dir-test-team')
    expect(fs.existsSync(teamDir)).toBe(true)
    expect(fs.existsSync(path.join(teamDir, 'config.json'))).toBe(true)

    const tasksDir = getTasksDir('dir-test-team')
    expect(fs.existsSync(tasksDir)).toBe(true)
  })

  it('should include file paths in success message', async () => {
    const result = await handleTeamCreate(
      makeParams({ team_name: 'path-team' }) as any,
    )

    const val = getJsonValue(result)
    expect(val.message).toContain('config.json')
    expect(val.message).toContain('lead-step-abc')
  })

  it('should reject duplicate team name', async () => {
    await handleTeamCreate(
      makeParams({ team_name: 'dup-team', description: 'first' }) as any,
    )

    const result = await handleTeamCreate(
      makeParams({ team_name: 'dup-team', description: 'second' }) as any,
    )

    const val = getJsonValue(result)
    expect(val.message).toContain('already exists')
  })

  it('should reject invalid team name characters', async () => {
    const result = await handleTeamCreate(
      makeParams({ team_name: 'bad name!' }) as any,
    )

    const val = getJsonValue(result)
    expect(val.message).toContain('Invalid team name')
  })

  it('should return error when team_name is empty', async () => {
    const result = await handleTeamCreate(
      makeParams({ team_name: '' }) as any,
    )

    const val = getJsonValue(result)
    expect(val.message).toContain('team_name')
  })

  it('should return error message when createTeam throws', async () => {
    // Make the teams directory path a file to cause mkdirSync to fail
    const teamsDir = getTeamsDir()
    fs.mkdirSync(path.dirname(teamsDir), { recursive: true })
    fs.writeFileSync(teamsDir, 'not a directory')

    const result = await handleTeamCreate(
      makeParams({ team_name: 'fail-team' }) as any,
    )

    const val = getJsonValue(result)
    expect(val.message).toContain('Failed to create team')
  })

  it('should call trackEvent for analytics', async () => {
    const trackEvent = mock(() => {})
    const params = {
      ...makeParams({ team_name: 'analytics-team' }),
      trackEvent,
    }

    await handleTeamCreate(params as any)

    expect(trackEvent).toHaveBeenCalled()
  })
})
