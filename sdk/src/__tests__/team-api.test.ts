import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { LevelCodeClient } from '../client'
import {
  createTeam as fsCreateTeam,
  loadTeamConfig,
  getTeamsDir,
  getTasksDir,
} from '@levelcode/common/utils/team-fs'
import { listAllTeams } from '@levelcode/common/utils/team-discovery'

import type { TeamConfig, TeamMember, DevPhase } from '@levelcode/common/types/team-config'
import type { CreateTeamOptions } from '../team'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string
let origHome: string | undefined
let origUserProfile: string | undefined

function makeTeamConfig(overrides?: Partial<TeamConfig>): TeamConfig {
  return {
    name: 'sdk-test-team',
    description: 'Team created via SDK tests',
    createdAt: Date.now(),
    leadAgentId: 'lead-sdk-001',
    phase: 'planning' as DevPhase,
    members: [
      {
        agentId: 'lead-sdk-001',
        name: 'team-lead',
        role: 'coordinator',
        agentType: 'coordinator',
        model: 'test-model',
        joinedAt: Date.now(),
        status: 'active',
        cwd: '/tmp',
      } satisfies TeamMember,
    ],
    settings: {
      maxMembers: 20,
      autoAssign: true,
    },
    ...overrides,
  }
}

/** Convert a TeamConfig into the (name, options) args expected by client.createTeam */
function toCreateArgs(config: TeamConfig): [string, CreateTeamOptions] {
  return [
    config.name,
    {
      description: config.description,
      phase: config.phase,
      members: config.members.map((m) => ({
        name: m.name,
        role: m.role,
        agentType: m.agentType,
        model: m.model,
        cwd: m.cwd,
      })),
      settings: config.settings,
    },
  ]
}

function createClient(): LevelCodeClient {
  return new LevelCodeClient({ apiKey: 'test-api-key' })
}

// ---------------------------------------------------------------------------
// Setup / Teardown — redirect HOME to a temp directory so team-fs operations
// never touch the real user config.
// ---------------------------------------------------------------------------

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-team-api-test-'))
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

// ===========================================================================
// Tests for client.createTeam
// ===========================================================================

describe('LevelCodeClient team API', () => {
  describe('createTeam', () => {
    test('creates team config file and directory structure', () => {
      const client = createClient()
      const config = makeTeamConfig()

      client.createTeam(...toCreateArgs(config))

      const teamsDir = getTeamsDir()
      const teamDir = path.join(teamsDir, 'sdk-test-team')
      expect(fs.existsSync(teamDir)).toBe(true)
      expect(fs.existsSync(path.join(teamDir, 'config.json'))).toBe(true)
      expect(fs.existsSync(path.join(teamDir, 'inboxes'))).toBe(true)

      const tasksDir = getTasksDir('sdk-test-team')
      expect(fs.existsSync(tasksDir)).toBe(true)
    })

    test('persists correct config data to disk', () => {
      const client = createClient()
      const config = makeTeamConfig({ description: 'Persisted description' })

      client.createTeam(...toCreateArgs(config))

      const loaded = loadTeamConfig('sdk-test-team')
      expect(loaded).not.toBeNull()
      expect(loaded!.name).toBe('sdk-test-team')
      expect(loaded!.description).toBe('Persisted description')
      expect(loaded!.leadAgentId).toBe('lead-sdk-001')
      expect(loaded!.phase).toBe('planning')
      expect(loaded!.members).toHaveLength(1)
      expect(loaded!.members[0]!.role).toBe('coordinator')
    })

    test('creates multiple teams without conflicts', () => {
      const client = createClient()
      client.createTeam(...toCreateArgs(makeTeamConfig({ name: 'team-alpha' })))
      client.createTeam(...toCreateArgs(makeTeamConfig({ name: 'team-beta' })))

      expect(loadTeamConfig('team-alpha')).not.toBeNull()
      expect(loadTeamConfig('team-beta')).not.toBeNull()
    })

    test('overwrites existing team when created with the same name', () => {
      const client = createClient()
      client.createTeam(...toCreateArgs(makeTeamConfig({ description: 'version 1' })))
      client.createTeam(...toCreateArgs(makeTeamConfig({ description: 'version 2' })))

      const loaded = loadTeamConfig('sdk-test-team')
      expect(loaded!.description).toBe('version 2')
    })
  })

  // =========================================================================
  // Tests for client.deleteTeam
  // =========================================================================

  describe('deleteTeam', () => {
    test('removes team directory and tasks directory', () => {
      const client = createClient()
      client.createTeam(...toCreateArgs(makeTeamConfig()))

      const teamsDir = getTeamsDir()
      const teamDir = path.join(teamsDir, 'sdk-test-team')
      const tasksDir = getTasksDir('sdk-test-team')
      expect(fs.existsSync(teamDir)).toBe(true)
      expect(fs.existsSync(tasksDir)).toBe(true)

      client.deleteTeam('sdk-test-team')

      expect(fs.existsSync(teamDir)).toBe(false)
      expect(fs.existsSync(tasksDir)).toBe(false)
    })

    test('config is no longer loadable after deletion', () => {
      const client = createClient()
      client.createTeam(...toCreateArgs(makeTeamConfig()))
      expect(loadTeamConfig('sdk-test-team')).not.toBeNull()

      client.deleteTeam('sdk-test-team')
      expect(loadTeamConfig('sdk-test-team')).toBeNull()
    })

    test('does not throw when deleting a nonexistent team', () => {
      const client = createClient()
      expect(() => client.deleteTeam('no-such-team')).not.toThrow()
    })

    test('does not affect other teams', () => {
      const client = createClient()
      client.createTeam(...toCreateArgs(makeTeamConfig({ name: 'keep-me' })))
      client.createTeam(...toCreateArgs(makeTeamConfig({ name: 'remove-me' })))

      client.deleteTeam('remove-me')

      expect(loadTeamConfig('keep-me')).not.toBeNull()
      expect(loadTeamConfig('remove-me')).toBeNull()
    })
  })

  // =========================================================================
  // Tests for client.getTeamStatus
  // =========================================================================

  describe('getTeamStatus', () => {
    test('returns correct status info for an existing team', () => {
      const client = createClient()
      const config = makeTeamConfig({
        phase: 'alpha',
        members: [
          {
            agentId: 'lead-sdk-001',
            name: 'team-lead',
            role: 'coordinator',
            agentType: 'coordinator',
            model: 'test-model',
            joinedAt: Date.now(),
            status: 'active',
            cwd: '/tmp',
          },
          {
            agentId: 'agent-002',
            name: 'developer',
            role: 'senior-engineer',
            agentType: 'senior-engineer',
            model: 'test-model',
            joinedAt: Date.now(),
            status: 'working',
            cwd: '/tmp',
          },
        ],
      })
      client.createTeam(...toCreateArgs(config))

      const status = client.getTeamStatus('sdk-test-team')

      expect(status).not.toBeNull()
      expect(status!.config.name).toBe('sdk-test-team')
      expect(status!.config.phase).toBe('alpha')
      expect(status!.memberCount).toBe(2)
    })

    test('returns null for a nonexistent team', () => {
      const client = createClient()
      const status = client.getTeamStatus('ghost-team')
      expect(status).toBeNull()
    })

    test('reflects updated member count after deletion and re-creation', () => {
      const client = createClient()
      client.createTeam(...toCreateArgs(makeTeamConfig()))

      let status = client.getTeamStatus('sdk-test-team')
      expect(status!.memberCount).toBe(1)

      // Re-create with more members
      client.createTeam(
        ...toCreateArgs(makeTeamConfig({
          members: [
            {
              agentId: 'lead-sdk-001',
              name: 'team-lead',
              role: 'coordinator',
              agentType: 'coordinator',
              model: 'test-model',
              joinedAt: Date.now(),
              status: 'active',
              cwd: '/tmp',
            },
            {
              agentId: 'agent-003',
              name: 'tester',
              role: 'tester',
              agentType: 'tester',
              model: 'test-model',
              joinedAt: Date.now(),
              status: 'idle',
              cwd: '/tmp',
            },
            {
              agentId: 'agent-004',
              name: 'researcher',
              role: 'researcher',
              agentType: 'researcher',
              model: 'test-model',
              joinedAt: Date.now(),
              status: 'idle',
              cwd: '/tmp',
            },
          ],
        })),
      )

      status = client.getTeamStatus('sdk-test-team')
      expect(status!.memberCount).toBe(3)
    })
  })

  // =========================================================================
  // Tests for client.listTeams
  // =========================================================================

  describe('listTeams', () => {
    test('returns empty array when no teams exist', () => {
      const client = createClient()
      const teams = client.listTeams()
      expect(teams).toEqual([])
    })

    test('lists all created teams', () => {
      const client = createClient()
      client.createTeam(...toCreateArgs(makeTeamConfig({ name: 'team-a' })))
      client.createTeam(...toCreateArgs(makeTeamConfig({ name: 'team-b' })))
      client.createTeam(...toCreateArgs(makeTeamConfig({ name: 'team-c' })))

      const teams = client.listTeams()
      expect(teams).toHaveLength(3)

      const names = teams.map((t) => t.name)
      expect(names).toContain('team-a')
      expect(names).toContain('team-b')
      expect(names).toContain('team-c')
    })

    test('reflects deletions in the listing', () => {
      const client = createClient()
      client.createTeam(...toCreateArgs(makeTeamConfig({ name: 'stay' })))
      client.createTeam(...toCreateArgs(makeTeamConfig({ name: 'go-away' })))

      expect(client.listTeams()).toHaveLength(2)

      client.deleteTeam('go-away')

      const teams = client.listTeams()
      expect(teams).toHaveLength(1)
      expect(teams[0]!.name).toBe('stay')
    })

    test('includes phase and memberCount for each team', () => {
      const client = createClient()
      client.createTeam(
        ...toCreateArgs(makeTeamConfig({
          name: 'production-team',
          phase: 'production',
          members: [
            {
              agentId: 'lead-1',
              name: 'lead',
              role: 'coordinator',
              agentType: 'coordinator',
              model: 'model',
              joinedAt: Date.now(),
              status: 'active',
              cwd: '/tmp',
            },
            {
              agentId: 'dev-1',
              name: 'dev',
              role: 'senior-engineer',
              agentType: 'senior-engineer',
              model: 'model',
              joinedAt: Date.now(),
              status: 'working',
              cwd: '/tmp',
            },
          ],
        })),
      )

      const teams = client.listTeams()
      expect(teams).toHaveLength(1)
      expect(teams[0]!.phase).toBe('production')
      expect(teams[0]!.memberCount).toBe(2)
    })
  })

  // =========================================================================
  // Error handling
  // =========================================================================

  describe('error handling', () => {
    test('getTeamStatus returns null rather than throwing for missing team', () => {
      const client = createClient()
      expect(() => client.getTeamStatus('does-not-exist')).not.toThrow()
      expect(client.getTeamStatus('does-not-exist')).toBeNull()
    })

    test('deleteTeam is safe to call on already-deleted team', () => {
      const client = createClient()
      client.createTeam(...toCreateArgs(makeTeamConfig()))
      client.deleteTeam('sdk-test-team')
      expect(() => client.deleteTeam('sdk-test-team')).not.toThrow()
    })

    test('listTeams returns empty array when teams directory does not exist', () => {
      const client = createClient()
      // Ensure no .config/levelcode/teams directory exists
      const teamsDir = getTeamsDir()
      if (fs.existsSync(teamsDir)) {
        fs.rmSync(teamsDir, { recursive: true, force: true })
      }
      expect(client.listTeams()).toEqual([])
    })

    test('getTeamStatus handles corrupted config gracefully', () => {
      const client = createClient()
      client.createTeam(...toCreateArgs(makeTeamConfig()))

      // Corrupt the config file
      const configPath = path.join(getTeamsDir(), 'sdk-test-team', 'config.json')
      fs.writeFileSync(configPath, '{ this is not valid json !!!', 'utf-8')

      // Should return null rather than propagating parse errors
      const status = client.getTeamStatus('sdk-test-team')
      expect(status).toBeNull()
    })

    test('listTeams skips teams with corrupted config files', () => {
      const client = createClient()
      client.createTeam(...toCreateArgs(makeTeamConfig({ name: 'good-team' })))
      client.createTeam(...toCreateArgs(makeTeamConfig({ name: 'bad-team' })))

      // Corrupt one config
      const configPath = path.join(getTeamsDir(), 'bad-team', 'config.json')
      fs.writeFileSync(configPath, '<<<CORRUPT>>>', 'utf-8')

      const teams = client.listTeams()
      // The corrupted team should be skipped, good team should still appear
      const names = teams.map((t) => t.name)
      expect(names).toContain('good-team')
      expect(names).not.toContain('bad-team')
    })
  })
})
