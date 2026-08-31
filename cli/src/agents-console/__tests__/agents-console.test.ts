import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  formatAgentsOverview,
  formatTeamDetail,
  plainTheme,
} from '../agents-console'
import { collectAgentsData, renderAgentsCommand } from '../run-agents'
import { getTeamsDir, getTasksDir } from '@levelcode/common/utils/team-fs'

import type { TeamConfig, TeamMember, TeamTask } from '@levelcode/common/types/team-config'

const theme = plainTheme

function makeMember(over: Partial<TeamMember> = {}): TeamMember {
  return {
    agentId: 'agent-1',
    name: 'alice',
    role: 'senior-engineer',
    agentType: 'senior-engineer',
    model: 'test-model',
    joinedAt: Date.now(),
    status: 'idle',
    cwd: '/tmp',
    ...over,
  }
}

function makeConfig(over: Partial<TeamConfig> = {}): TeamConfig {
  return {
    name: 'test-team',
    description: '',
    createdAt: 1700000000000,
    leadAgentId: 'agent-1',
    phase: 'planning',
    members: [makeMember()],
    settings: { maxMembers: 10, autoAssign: false },
    ...over,
  }
}

function makeTask(over: Partial<TeamTask> = {}): TeamTask {
  return {
    id: '1',
    subject: 'Implement thing',
    description: '',
    status: 'pending',
    priority: 'medium',
    blockedBy: [],
    blocks: [],
    phase: 'planning',
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }
}

describe('formatAgentsOverview', () => {
  it('renders an empty-state message when no teams exist', () => {
    const out = formatAgentsOverview({ teams: [] }, theme)
    expect(out).toContain('No teams found.')
    expect(out).toContain('/team:create')
  })

  it('shows team, lead, members with statuses, and task counts', () => {
    const out = formatAgentsOverview(
      {
        teams: [
          {
            name: 'test-team',
            config: makeConfig({
              members: [
                makeMember({ name: 'alice', status: 'working' }),
                makeMember({ agentId: 'agent-2', name: 'bob', status: 'idle' }),
              ],
            }),
            tasks: [
              makeTask({ id: '1', status: 'in_progress', owner: 'agent-1' }),
              makeTask({ id: '2', status: 'pending' }),
              makeTask({ id: '3', status: 'completed' }),
            ],
            isLastActive: true,
          },
        ],
      },
      theme,
    )

    expect(out).toContain('test-team')
    expect(out).toContain('← last active')
    expect(out).toContain('alice')
    expect(out).toContain('bob')
    expect(out).toContain('#1 Implement thing')
    expect(out).toContain('tasks: 1 pending · 1 in progress · 0 blocked · 1 completed')
    expect(out).toContain('1 team · 2 agents · 2 open tasks')
  })

  it('shows a no-members placeholder for empty teams', () => {
    const out = formatAgentsOverview(
      { teams: [{ name: 'empty', config: makeConfig({ members: [] }), tasks: [], isLastActive: false }] },
      theme,
    )
    expect(out).toContain('(no members)')
  })
})

describe('formatTeamDetail', () => {
  it('renders members with lead marker and tasks with blockers', () => {
    const out = formatTeamDetail(
      'detail-team',
      makeConfig({
        name: 'detail-team',
        phase: 'alpha',
        members: [
          makeMember({ name: 'lead-1', status: 'active' }),
          makeMember({ agentId: 'agent-2', name: 'dev-2', status: 'failed' }),
        ],
      }),
      [
        makeTask({ id: '1', status: 'in_progress', owner: 'agent-1' }),
        makeTask({ id: '2', status: 'blocked', blockedBy: ['1'], subject: 'Depends on 1' }),
      ],
      false,
      theme,
    )

    expect(out).toContain('detail-team')
    expect(out).toContain('phase: alpha')
    expect(out).toContain('(lead)')
    expect(out).toContain('blocked by 1')
    expect(out).toContain('Depends on 1')
  })
})

describe('agents command (disk-backed)', () => {
  let origHome: Record<string, string | undefined>
  let tmpHome: string

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-console-'))
    // os.homedir() follows USERPROFILE on Windows — set both.
    origHome = {
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
    }
    process.env.HOME = tmpHome
    process.env.USERPROFILE = tmpHome
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(origHome)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  function seedTeam(name: string): void {
    // Seed through getTeamsDir()/getTasksDir(): with the isolated-home
    // preload these resolve to a fresh LEVELCODE_HOME per test.
    const teamDir = path.join(getTeamsDir(), name)
    fs.mkdirSync(path.join(teamDir, 'inboxes'), { recursive: true })
    const config = makeConfig({
      name,
      members: [makeMember({ agentId: `lead-${name}`, name: 'team-lead', status: 'working' })],
      leadAgentId: `lead-${name}`,
    })
    fs.writeFileSync(
      path.join(teamDir, 'config.json'),
      JSON.stringify(config),
      'utf-8',
    )
    const tasksDir = getTasksDir(name)
    fs.mkdirSync(tasksDir, { recursive: true })
    fs.writeFileSync(
      path.join(tasksDir, '1.json'),
      JSON.stringify(makeTask({ id: '1', status: 'in_progress', owner: `lead-${name}` })),
      'utf-8',
    )
  }

  it('collectAgentsData reads seeded teams from disk', () => {
    seedTeam('disk-team')
    const data = collectAgentsData()

    expect(data.teams).toHaveLength(1)
    expect(data.teams[0]!.name).toBe('disk-team')
    expect(data.teams[0]!.tasks).toHaveLength(1)
  })

  it('renderAgentsCommand renders the overview and errors on unknown team', () => {
    seedTeam('render-team')

    const overview = renderAgentsCommand()
    expect(overview.exitCode).toBe(0)
    expect(overview.output).toContain('render-team')

    const missing = renderAgentsCommand('no-such-team')
    expect(missing.exitCode).toBe(1)
    expect(missing.output).toContain('No team named "no-such-team"')

    const detail = renderAgentsCommand('render-team')
    expect(detail.exitCode).toBe(0)
    expect(detail.output).toContain('render-team')
    expect(detail.output).toContain('Tasks')
  })
})
