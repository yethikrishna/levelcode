import { describe, test, expect } from 'bun:test'

import { getAllTeamAgents, getTeamAgent, TEAM_AGENTS } from '../index'

import type { AgentDefinition } from '../../types/agent-definition'

// ---------------------------------------------------------------------------
// All 21 agent role keys as registered in TEAM_AGENTS
// ---------------------------------------------------------------------------

const ALL_ROLES = [
  'coordinator',
  'manager',
  'senior-engineer',
  'researcher',
  'designer',
  'product-lead',
  'intern',
  'apprentice',
  'junior-engineer',
  'mid-level-engineer',
  'staff-engineer',
  'senior-staff-engineer',
  'principal-engineer',
  'distinguished-engineer',
  'fellow',
  'cto',
  'vp-engineering',
  'director',
  'tester',
  'sub-manager',
  'scientist',
] as const

// Expected id for each role (most are "team-{role}", two exceptions)
const EXPECTED_IDS: Record<string, string> = {
  'coordinator': 'coordinator',
  'manager': 'team-manager',
  'senior-engineer': 'senior-engineer',
  'researcher': 'team-researcher',
  'designer': 'team-designer',
  'product-lead': 'team-product-lead',
  'intern': 'team-intern',
  'apprentice': 'team-apprentice',
  'junior-engineer': 'team-junior-engineer',
  'mid-level-engineer': 'team-mid-level-engineer',
  'staff-engineer': 'team-staff-engineer',
  'senior-staff-engineer': 'team-senior-staff-engineer',
  'principal-engineer': 'team-principal-engineer',
  'distinguished-engineer': 'team-distinguished-engineer',
  'fellow': 'team-fellow',
  'cto': 'team-cto',
  'vp-engineering': 'team-vp-engineering',
  'director': 'team-director',
  'tester': 'team-tester',
  'sub-manager': 'team-sub-manager',
  'scientist': 'team-scientist',
}

// Valid model prefixes used across templates
const VALID_MODEL_PREFIXES = [
  'anthropic/',
  'openai/',
  'google/',
  'x-ai/',
  'qwen/',
  'deepseek/',
  'moonshotai/',
  'z-ai/',
]

// ---------------------------------------------------------------------------
// 1. All 21 templates exist and are retrievable
// ---------------------------------------------------------------------------

describe('agent templates: all 21 roles present', () => {
  test('TEAM_AGENTS has exactly 21 entries', () => {
    const entries = Object.keys(TEAM_AGENTS)
    expect(entries.length).toBe(21)
  })

  test('getAllTeamAgents returns exactly 21 templates', () => {
    const agents = getAllTeamAgents()
    expect(agents.length).toBe(21)
  })

  test.each(ALL_ROLES)('getTeamAgent("%s") returns a defined template', (role) => {
    const agent = getTeamAgent(role as any)
    expect(agent).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 2. Required fields: id, displayName, model, toolNames
// ---------------------------------------------------------------------------

describe('agent templates: required fields', () => {
  test.each(ALL_ROLES)('%s has a non-empty id string', (role) => {
    const agent = getTeamAgent(role as any)!
    expect(typeof agent.id).toBe('string')
    expect(agent.id.length).toBeGreaterThan(0)
  })

  test.each(ALL_ROLES)('%s has a non-empty displayName string', (role) => {
    const agent = getTeamAgent(role as any)!
    expect(typeof agent.displayName).toBe('string')
    expect(agent.displayName.length).toBeGreaterThan(0)
  })

  test.each(ALL_ROLES)('%s has a non-empty model string', (role) => {
    const agent = getTeamAgent(role as any)!
    expect(typeof agent.model).toBe('string')
    expect(agent.model.length).toBeGreaterThan(0)
  })

  test.each(ALL_ROLES)('%s has toolNames as a non-empty array', (role) => {
    const agent = getTeamAgent(role as any)!
    expect(Array.isArray(agent.toolNames)).toBe(true)
    expect(agent.toolNames!.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 3. Model is a valid model string (has a provider/ prefix)
// ---------------------------------------------------------------------------

describe('agent templates: model validation', () => {
  test.each(ALL_ROLES)('%s model has a valid provider prefix', (role) => {
    const agent = getTeamAgent(role as any)!
    const hasValidPrefix = VALID_MODEL_PREFIXES.some((prefix) =>
      agent.model.startsWith(prefix),
    )
    expect(hasValidPrefix).toBe(true)
  })

  test.each(ALL_ROLES)('%s model contains a slash separator', (role) => {
    const agent = getTeamAgent(role as any)!
    expect(agent.model).toContain('/')
  })
})

// ---------------------------------------------------------------------------
// 4. toolNames is a non-empty array of strings
// ---------------------------------------------------------------------------

describe('agent templates: toolNames validation', () => {
  test.each(ALL_ROLES)('%s toolNames contains only strings', (role) => {
    const agent = getTeamAgent(role as any)!
    for (const toolName of agent.toolNames!) {
      expect(typeof toolName).toBe('string')
      expect(toolName.length).toBeGreaterThan(0)
    }
  })

  test.each(ALL_ROLES)('%s toolNames has no duplicates', (role) => {
    const agent = getTeamAgent(role as any)!
    const unique = new Set(agent.toolNames)
    expect(unique.size).toBe(agent.toolNames!.length)
  })

  test.each(ALL_ROLES)('%s toolNames includes set_output', (role) => {
    const agent = getTeamAgent(role as any)!
    expect(agent.toolNames).toContain('set_output')
  })
})

// ---------------------------------------------------------------------------
// 5. systemPrompt and instructionsPrompt exist and are non-empty
// ---------------------------------------------------------------------------

describe('agent templates: prompts', () => {
  test.each(ALL_ROLES)('%s has a non-empty systemPrompt', (role) => {
    const agent = getTeamAgent(role as any)!
    expect(typeof agent.systemPrompt).toBe('string')
    expect(agent.systemPrompt!.trim().length).toBeGreaterThan(0)
  })

  test.each(ALL_ROLES)('%s has a non-empty instructionsPrompt', (role) => {
    const agent = getTeamAgent(role as any)!
    expect(typeof agent.instructionsPrompt).toBe('string')
    expect(agent.instructionsPrompt!.trim().length).toBeGreaterThan(0)
  })

  test.each(ALL_ROLES)('%s has a non-empty spawnerPrompt', (role) => {
    const agent = getTeamAgent(role as any)!
    expect(typeof agent.spawnerPrompt).toBe('string')
    expect(agent.spawnerPrompt!.trim().length).toBeGreaterThan(0)
  })

  test.each(ALL_ROLES)('%s systemPrompt is at least 50 characters', (role) => {
    const agent = getTeamAgent(role as any)!
    expect(agent.systemPrompt!.length).toBeGreaterThanOrEqual(50)
  })

  test.each(ALL_ROLES)('%s instructionsPrompt is at least 20 characters', (role) => {
    const agent = getTeamAgent(role as any)!
    expect(agent.instructionsPrompt!.length).toBeGreaterThanOrEqual(20)
  })
})

// ---------------------------------------------------------------------------
// 6. id matches expected pattern (team-{role} or known exceptions)
// ---------------------------------------------------------------------------

describe('agent templates: id pattern', () => {
  test.each(ALL_ROLES)('%s id matches expected value', (role) => {
    const agent = getTeamAgent(role as any)!
    const expectedId = EXPECTED_IDS[role]
    expect(agent.id).toBe(expectedId)
  })

  test.each(ALL_ROLES)('%s id contains only lowercase, numbers, hyphens', (role) => {
    const agent = getTeamAgent(role as any)!
    expect(agent.id).toMatch(/^[a-z0-9-]+$/)
  })

  test('no two templates share the same id', () => {
    const agents = getAllTeamAgents()
    const ids = agents.map((a) => a.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  test('id contains the role name for all templates', () => {
    for (const role of ALL_ROLES) {
      const agent = getTeamAgent(role as any)!
      expect(agent.id).toContain(role)
    }
  })
})

// ---------------------------------------------------------------------------
// 7. Additional structural checks
// ---------------------------------------------------------------------------

describe('agent templates: structural integrity', () => {
  test.each(ALL_ROLES)('%s has a valid outputMode', (role) => {
    const agent = getTeamAgent(role as any)!
    expect(agent.outputMode).toBeDefined()
    expect(['last_message', 'all_messages', 'structured_output']).toContain(
      agent.outputMode,
    )
  })

  test.each(ALL_ROLES)('%s has a spawnableAgents array', (role) => {
    const agent = getTeamAgent(role as any)!
    expect(Array.isArray(agent.spawnableAgents)).toBe(true)
  })

  test.each(ALL_ROLES)('%s has a handleSteps function', (role) => {
    const agent = getTeamAgent(role as any)!
    expect(typeof agent.handleSteps).toBe('function')
  })

  test.each(ALL_ROLES)('%s handleSteps returns a generator', (role) => {
    const agent = getTeamAgent(role as any)!
    const mockContext = {
      agentState: {
        agentId: 'test',
        runId: 'test-run',
        parentId: undefined,
        messageHistory: [],
        output: undefined,
        systemPrompt: '',
        toolDefinitions: {},
        contextTokenCount: 0,
      },
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    }
    const gen = agent.handleSteps!(mockContext as any)
    expect(gen).toBeDefined()
    expect(typeof gen.next).toBe('function')
    expect(typeof gen.return).toBe('function')
    expect(typeof gen.throw).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// 8. Per-agent individual import tests
// ---------------------------------------------------------------------------

describe('agent templates: individual imports', () => {
  test('coordinator template', async () => {
    const mod = await import('../coordinator')
    const agent = mod.default
    expect(agent.id).toBe('coordinator')
    expect(agent.displayName).toBe('Coordinator')
    expect(agent.model).toBe('anthropic/claude-opus-4.5')
    expect(agent.toolNames).toContain('spawn_agents')
    expect(agent.toolNames).toContain('SendMessage')
    expect(agent.spawnableAgents).toContain('manager')
    expect(agent.spawnableAgents).toContain('senior-engineer')
  })

  test('manager template', async () => {
    const mod = await import('../manager')
    const agent = mod.default
    expect(agent.id).toBe('team-manager')
    expect(agent.displayName).toContain('Manager')
  })

  test('senior-engineer template', async () => {
    const mod = await import('../senior-engineer')
    const agent = mod.default
    expect(agent.id).toBe('senior-engineer')
    expect(agent.displayName).toContain('Senior Engineer')
  })

  test('researcher template', async () => {
    const mod = await import('../researcher')
    const agent = mod.default
    expect(agent.id).toBe('team-researcher')
    expect(agent.displayName).toContain('Researcher')
  })

  test('designer template', async () => {
    const mod = await import('../designer')
    const agent = mod.default
    expect(agent.id).toBe('team-designer')
    expect(agent.displayName).toContain('Designer')
  })

  test('product-lead template', async () => {
    const mod = await import('../product-lead')
    const agent = mod.default
    expect(agent.id).toBe('team-product-lead')
    expect(agent.displayName).toContain('Product')
  })

  test('intern template', async () => {
    const mod = await import('../intern')
    const agent = mod.default
    expect(agent.id).toBe('team-intern')
    expect(agent.displayName).toContain('Intern')
    expect(agent.model).toBe('anthropic/claude-haiku-3.5')
    expect(agent.spawnableAgents).toEqual([])
  })

  test('apprentice template', async () => {
    const mod = await import('../apprentice')
    const agent = mod.default
    expect(agent.id).toBe('team-apprentice')
    expect(agent.displayName).toContain('Apprentice')
    expect(agent.model).toBe('anthropic/claude-haiku-3.5')
  })

  test('junior-engineer template', async () => {
    const mod = await import('../junior-engineer')
    const agent = mod.default
    expect(agent.id).toBe('team-junior-engineer')
    expect(agent.displayName).toContain('Junior')
  })

  test('mid-level-engineer template', async () => {
    const mod = await import('../mid-level-engineer')
    const agent = mod.default
    expect(agent.id).toBe('team-mid-level-engineer')
    expect(agent.displayName).toContain('Mid')
  })

  test('staff-engineer template', async () => {
    const mod = await import('../staff-engineer')
    const agent = mod.default
    expect(agent.id).toBe('team-staff-engineer')
    expect(agent.displayName).toContain('Staff')
  })

  test('senior-staff-engineer template', async () => {
    const mod = await import('../senior-staff-engineer')
    const agent = mod.default
    expect(agent.id).toBe('team-senior-staff-engineer')
    expect(agent.displayName).toContain('Senior Staff')
  })

  test('principal-engineer template', async () => {
    const mod = await import('../principal-engineer')
    const agent = mod.default
    expect(agent.id).toBe('team-principal-engineer')
    expect(agent.displayName).toContain('Principal')
  })

  test('distinguished-engineer template', async () => {
    const mod = await import('../distinguished-engineer')
    const agent = mod.default
    expect(agent.id).toBe('team-distinguished-engineer')
    expect(agent.displayName).toContain('Distinguished')
  })

  test('fellow template', async () => {
    const mod = await import('../fellow')
    const agent = mod.default
    expect(agent.id).toBe('team-fellow')
    expect(agent.displayName).toContain('Fellow')
  })

  test('cto template', async () => {
    const mod = await import('../cto')
    const agent = mod.default
    expect(agent.id).toBe('team-cto')
    expect(agent.displayName).toContain('CTO')
    expect(agent.model).toBe('anthropic/claude-opus-4.5')
  })

  test('vp-engineering template', async () => {
    const mod = await import('../vp-engineering')
    const agent = mod.default
    expect(agent.id).toBe('team-vp-engineering')
    expect(agent.displayName).toContain('VP')
  })

  test('director template', async () => {
    const mod = await import('../director')
    const agent = mod.default
    expect(agent.id).toBe('team-director')
    expect(agent.displayName).toContain('Director')
  })

  test('tester template', async () => {
    const mod = await import('../tester')
    const agent = mod.default
    expect(agent.id).toBe('team-tester')
    expect(agent.displayName).toContain('Tester')
  })

  test('sub-manager template', async () => {
    const mod = await import('../sub-manager')
    const agent = mod.default
    expect(agent.id).toBe('team-sub-manager')
    expect(agent.displayName).toContain('Sub')
  })

  test('scientist template', async () => {
    const mod = await import('../scientist')
    const agent = mod.default
    expect(agent.id).toBe('team-scientist')
    expect(agent.displayName).toContain('Scientist')
  })
})

// ---------------------------------------------------------------------------
// 9. Cross-template consistency checks
// ---------------------------------------------------------------------------

describe('agent templates: cross-template consistency', () => {
  test('all templates reference real tool names (no empty strings)', () => {
    const agents = getAllTeamAgents()
    for (const agent of agents) {
      for (const tool of agent.toolNames!) {
        expect(tool.trim().length).toBeGreaterThan(0)
      }
    }
  })

  test('all spawnableAgents entries are non-empty strings', () => {
    const agents = getAllTeamAgents()
    for (const agent of agents) {
      for (const spawnable of agent.spawnableAgents!) {
        expect(typeof spawnable).toBe('string')
        expect(spawnable.length).toBeGreaterThan(0)
      }
    }
  })

  test('higher-tier models are used for leadership roles', () => {
    const leadershipRoles = ['coordinator', 'cto', 'vp-engineering', 'director', 'fellow', 'distinguished-engineer']
    for (const role of leadershipRoles) {
      const agent = getTeamAgent(role as any)!
      expect(agent.model).toContain('opus')
    }
  })

  test('entry-level roles use cheaper models', () => {
    const entryRoles = ['intern', 'apprentice']
    for (const role of entryRoles) {
      const agent = getTeamAgent(role as any)!
      expect(agent.model).toContain('haiku')
    }
  })

  test('intern and apprentice have empty spawnableAgents', () => {
    const agent1 = getTeamAgent('intern' as any)!
    const agent2 = getTeamAgent('apprentice' as any)!
    expect(agent1.spawnableAgents).toEqual([])
    expect(agent2.spawnableAgents).toEqual([])
  })

  test('coordinator can spawn managers', () => {
    const coord = getTeamAgent('coordinator' as any)!
    expect(coord.spawnableAgents).toContain('manager')
  })

  test('all 21 displayNames are unique', () => {
    const agents = getAllTeamAgents()
    const names = agents.map((a) => a.displayName)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })
})
