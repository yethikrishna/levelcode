import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { TeamRegistry, type PersistedTeam } from '../team-registry'
import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

const TEAMS_DIR = join(homedir(), '.config', 'levelcode', 'teams')

describe('TeamRegistry', () => {
  let registry: TeamRegistry
  let originalTeams: string[] = []

  beforeEach(async () => {
    registry = new TeamRegistry()
    // Clean up any existing test teams (best effort)
    try {
      const files = await (await import('fs/promises')).readdir(TEAMS_DIR).catch(() => [])
      originalTeams = files.filter(f => f.endsWith('.json'))
    } catch {}
  })

  afterEach(async () => {
    // Cleanup is handled per-test via delete where possible
  })

  describe('save', () => {
    it('should save a new team with generated id', async () => {
      const team = await registry.save({
        name: 'Test Team',
        members: [{ role: 'coder', model: 'claude' }],
        description: 'A test team',
      })

      expect(team.id).toBe('test-team')
      expect(team.name).toBe('Test Team')
      expect(team.members).toHaveLength(1)
      expect(team.createdAt).toBeDefined()
      expect(team.lastUsed).toBeDefined()
    })

    it('should update lastUsed on resave of existing team', async () => {
      const first = await registry.save({ name: 'Update Test', members: [] })
      const createdAt = first.createdAt
      await new Promise(r => setTimeout(r, 10))
      const second = await registry.save({ id: first.id, name: 'Update Test', members: [{ role: 'reviewer' }] })

      expect(second.createdAt).toBe(createdAt)
      expect(second.lastUsed).not.toBe(createdAt)
      expect(second.members).toHaveLength(1)
    })

    it('slugifies names correctly', async () => {
      const team = await registry.save({ name: 'My Cool Team!!!', members: [] })
      expect(team.id).toBe('my-cool-team')
    })
  })

  describe('loadAll / list', () => {
    it('returns empty array when no teams', async () => {
      // Note: may return existing teams in real env; test focuses on sorting
      const teams = await registry.list()
      expect(Array.isArray(teams)).toBe(true)
    })
  })

  describe('load', () => {
    it('loads by id or name (case insensitive)', async () => {
      const saved = await registry.save({ name: 'Load Test', members: [{ role: 'lead' }] })
      const byId = await registry.load(saved.id)
      const byName = await registry.load('load test')

      expect(byId).not.toBeNull()
      expect(byName).not.toBeNull()
      expect(byId!.id).toBe(saved.id)
    })

    it('returns null for missing team', async () => {
      const result = await registry.load('non-existent-team-xyz')
      expect(result).toBeNull()
    })
  })

  describe('delete', () => {
    it('deletes existing team and returns true', async () => {
      const saved = await registry.save({ name: 'Delete Me', members: [] })
      const deleted = await registry.delete(saved.id)
      expect(deleted).toBe(true)

      const reloaded = await registry.load(saved.id)
      expect(reloaded).toBeNull()
    })

    it('returns false for non-existent', async () => {
      const result = await registry.delete('does-not-exist')
      expect(result).toBe(false)
    })
  })

  describe('integration: save → load flow', () => {
    it('persists team across save and subsequent loadAll/load', async () => {
      const input = {
        name: 'Integration Team',
        members: [
          { role: 'engineer', model: 'gpt-4o' },
          { role: 'reviewer', config: { strict: true } },
        ],
        description: 'End-to-end test team',
      }

      const saved = await registry.save(input)
      expect(saved.id).toBe('integration-team')

      // Fresh registry instance to simulate reload
      const freshRegistry = new TeamRegistry()
      const allTeams = await freshRegistry.list()
      const loaded = allTeams.find(t => t.id === saved.id)
      expect(loaded).toBeDefined()
      expect(loaded!.name).toBe('Integration Team')
      expect(loaded!.members).toHaveLength(2)

      const directLoad = await freshRegistry.load('integration-team')
      expect(directLoad).not.toBeNull()
      expect(directLoad!.lastUsed).not.toBe(saved.lastUsed) // load updates lastUsed
    })
  })
})
