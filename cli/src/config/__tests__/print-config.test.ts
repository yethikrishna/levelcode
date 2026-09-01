import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

import {
  collectConfigSnapshot,
  formatConfigReport,
  formatConfigJson,
  getConfigPaths,
  loadProviderSummaries,
  loadMcpSummaries,
} from '../../config/print-config'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

describe('print-config file loaders', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'print-config-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('loadProviderSummaries', () => {
    it('returns sourceExists: false with no providers.json', () => {
      const result = loadProviderSummaries(path.join(tmpDir, 'missing.json'))
      expect(result.sourceExists).toBe(false)
      expect(result.providers).toEqual([])
    })

    it('summarizes providers with key presence booleans only', () => {
      const providersPath = path.join(tmpDir, 'providers.json')
      fs.writeFileSync(
        providersPath,
        JSON.stringify({
          activeProvider: 'anthropic',
          activeModel: 'claude-sonnet-4',
          providers: {
            anthropic: {
              enabled: true,
              apiKey: 'sk-ant-super-secret-value',
              models: ['claude-sonnet-4', 'claude-opus-4'],
            },
            openrouter: {
              enabled: false,
              autoDetected: true,
              models: ['m1'],
            },
          },
        }),
        'utf-8',
      )
      const result = loadProviderSummaries(providersPath)
      expect(result.sourceExists).toBe(true)
      expect(result.activeProvider).toBe('anthropic')
      expect(result.activeModel).toBe('claude-sonnet-4')
      // Active provider sorts first.
      expect(result.providers[0].id).toBe('anthropic')
      expect(result.providers[0].hasApiKey).toBe(true)
      expect(result.providers[0].enabled).toBe(true)
      expect(result.providers[0].modelCount).toBe(2)
      expect(result.providers[1].hasApiKey).toBe(false)
      expect(result.providers[1].autoDetected).toBe(true)
    })

    it('never includes the apiKey or oauthToken values in the output', () => {
      const providersPath = path.join(tmpDir, 'providers.json')
      fs.writeFileSync(
        providersPath,
        JSON.stringify({
          providers: {
            secretive: {
              enabled: true,
              apiKey: 'sk-the-actual-secret',
              oauthToken: { accessToken: 'oauth-secret-token' },
              models: [],
            },
          },
        }),
        'utf-8',
      )
      const result = loadProviderSummaries(providersPath)
      expect(result.providers[0].hasApiKey).toBe(true)
      expect(result.providers[0].hasOAuthToken).toBe(true)
      expect(JSON.stringify(result)).not.toContain('sk-the-actual-secret')
      expect(JSON.stringify(result)).not.toContain('oauth-secret-token')
    })

    it('treats unparseable providers.json as present but empty', () => {
      const providersPath = path.join(tmpDir, 'providers.json')
      fs.writeFileSync(providersPath, '{not json', 'utf-8')
      const result = loadProviderSummaries(providersPath)
      expect(result.sourceExists).toBe(true)
      expect(result.providers).toEqual([])
    })
  })

  describe('loadMcpSummaries', () => {
    it('merges servers with later candidates winning, env values dropped', () => {
      const first = path.join(tmpDir, 'mcp-1.json')
      const second = path.join(tmpDir, 'mcp-2.json')
      fs.writeFileSync(
        first,
        JSON.stringify({
          mcpServers: {
            github: { command: 'npx', args: ['-y', 'gh-mcp'], env: { GH_TOKEN: '$GH_TOKEN' } },
            stale: { command: 'gone' },
          },
        }),
        'utf-8',
      )
      fs.writeFileSync(
        second,
        JSON.stringify({
          mcpServers: {
            github: { command: 'node', args: ['gh.js'], env: { GH_TOKEN: 'literal-secret' } },
          },
        }),
        'utf-8',
      )
      const result = loadMcpSummaries([first, second])
      expect(result).toHaveLength(2)
      const github = result.find((s) => s.name === 'github')!
      expect(github.kind).toBe('stdio')
      expect(github.target).toBe('node')
      expect(github.source).toBe(second)
      expect(github.envVarNames).toEqual(['GH_TOKEN'])
      expect(JSON.stringify(result)).not.toContain('literal-secret')
      // Per-server merge matches runtime semantics: a server present only
      // in an earlier file survives unless a later file overrides its name.
      expect(result.find((s) => s.name === 'stale')?.source).toBe(first)
    })

    it('reports remote servers by url and flags invalid JSON files', () => {
      const remote = path.join(tmpDir, 'mcp-remote.json')
      const broken = path.join(tmpDir, 'mcp-broken.json')
      fs.writeFileSync(
        remote,
        JSON.stringify({ mcpServers: { docs: { url: 'https://example.com/mcp' } } }),
        'utf-8',
      )
      fs.writeFileSync(broken, '{nope', 'utf-8')
      const result = loadMcpSummaries([remote, broken])
      const docs = result.find((s) => s.name === 'docs')!
      expect(docs.kind).toBe('remote')
      expect(docs.target).toBe('https://example.com/mcp')
      expect(result.find((s) => s.name === '(invalid JSON)')?.source).toBe(broken)
    })
  })
})

describe('collectConfigSnapshot', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'print-config-home-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('collects a coherent snapshot with home-dir overrides', () => {
    fs.mkdirSync(path.join(tmpDir, '.config', 'levelcode'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, '.config', 'levelcode', 'providers.json'),
      JSON.stringify({ activeProvider: null, activeModel: null, providers: {} }),
      'utf-8',
    )
    const snapshot = collectConfigSnapshot({ projectRoot: tmpDir, homeDir: tmpDir })
    expect(snapshot.projectRoot).toBe(tmpDir)
    expect(snapshot.effort.level).toBe('medium')
    expect(snapshot.effort.maxSteps).toBe(100)
    expect(snapshot.effort.isDefault).toBe(true)
    expect(snapshot.permission.profile).toBe('trusted')
    expect(snapshot.permission.available).toContain('godmode')
    expect(snapshot.providers.sourceExists).toBe(true)
    expect(snapshot.paths.providers).toBe(path.join(tmpDir, '.config', 'levelcode', 'providers.json'))
    // Every credential row is a boolean, never a value.
    for (const cred of snapshot.credentials.env) {
      expect(typeof cred.present).toBe('boolean')
    }
  })

  it('report and json renderers agree with the snapshot', () => {
    const snapshot = collectConfigSnapshot({ projectRoot: tmpDir, homeDir: tmpDir })
    const report = formatConfigReport(snapshot)
    expect(report).toContain('LevelCode config')
    expect(report).toContain('effort')
    expect(report).toContain('permissions')
    const json = formatConfigJson(snapshot)
    const parsed = JSON.parse(json)
    expect(parsed.effort.level).toBe(snapshot.effort.level)
    expect(parsed.permission.profile).toBe(snapshot.permission.profile)
  })
})

describe('getConfigPaths', () => {
  it('respects homeDir and projectRoot overrides', () => {
    const paths = getConfigPaths({ projectRoot: '/proj', homeDir: '/home-x' })
    expect(paths.providers).toBe(path.join('/home-x', '.config', 'levelcode', 'providers.json'))
    expect(paths.credentials).toBe(path.join('/home-x', '.config', 'levelcode', 'credentials.json'))
    expect(paths.mcpCandidates[0]).toBe(path.join('/proj', '.agents', 'mcp.json'))
    expect(paths.mcpCandidates[2]).toBe(path.join('/home-x', '.agents', 'mcp.json'))
  })
})
