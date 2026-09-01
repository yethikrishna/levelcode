/**
 * `levelcode --print-config` — resolved configuration introspection.
 *
 * One-shot dump of what a run would actually use: effort/steps, permission
 * profile, providers and active model, env credential presence, MCP servers,
 * and the config paths consulted. Secrets are redacted by construction:
 * API keys, OAuth tokens, and MCP env values are reported as presence
 * booleans, never values.
 *
 * Follows the doctor fast-path contract: node builtins + workspace imports
 * only, no agent runtime, no TUI, no side effects (nothing is written).
 */

import fs from 'fs'
import path from 'path'
import { getProfile, listProfiles } from '@levelcode/common/permissions/profiles'
import { getUserHomeDir } from '@levelcode/common/utils/home-dir'
import { DEFAULT_EFFORT, getEffortLevel, maxStepsForEffort } from '../utils/effort'
import type { EffortLevel } from '../utils/effort'

// ── Credential presence (never values) ──────────────────────────────────

const CREDENTIAL_ENV_VARS = [
  'LEVELCODE_API_KEY',
  'OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY',
  'LEVELCODE_BYOK_OPENROUTER',
  'LEVELCODE_CLAUDE_OAUTH_TOKEN',
] as const

function envCredentialPresence(): Array<{ name: string; present: boolean }> {
  return CREDENTIAL_ENV_VARS.map((name) => ({
    name,
    present: typeof process.env[name] === 'string' && process.env[name]!.length > 0,
  }))
}

// ── Config file locations ────────────────────────────────────────────────

export type ConfigPaths = {
  credentials: string
  providers: string
  settingsCandidates: string[]
  mcpCandidates: string[]
  projectRoot: string
}

export function getConfigPaths(
  overrides: { projectRoot?: string; homeDir?: string } = {},
): ConfigPaths {
  const home = overrides.homeDir ?? getUserHomeDir()
  const projectRoot = overrides.projectRoot ?? process.cwd()
  return {
    credentials: path.join(home, '.config', 'levelcode', 'credentials.json'),
    providers: path.join(home, '.config', 'levelcode', 'providers.json'),
    settingsCandidates: [
      path.join(home, '.config', 'levelcode', 'settings.json'),
      path.join(home, '.levelcode', 'settings.json'),
      path.join(projectRoot, '.levelcode', 'settings.json'),
    ],
    mcpCandidates: [
      path.join(projectRoot, '.agents', 'mcp.json'),
      path.join(projectRoot, '..', '.agents', 'mcp.json'),
      path.join(home, '.agents', 'mcp.json'),
    ],
    projectRoot,
  }
}

// ── Providers (from providers.json, redacted) ────────────────────────────

export type ProviderSummary = {
  id: string
  enabled: boolean
  autoDetected: boolean
  hasApiKey: boolean
  hasOAuthToken: boolean
  baseUrl: string | null
  modelCount: number
  active: boolean
}

function fileExists(p: string): boolean {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}

export function loadProviderSummaries(providersPath: string): {
  sourceExists: boolean
  activeProvider: string | null
  activeModel: string | null
  providers: ProviderSummary[]
} {
  if (!fileExists(providersPath)) {
    return { sourceExists: false, activeProvider: null, activeModel: null, providers: [] }
  }
  let parsed: {
    activeProvider?: string | null
    activeModel?: string | null
    providers?: Record<
      string,
      {
        enabled?: boolean
        apiKey?: string
        baseUrl?: string
        autoDetected?: boolean
        models?: string[]
        oauthToken?: unknown
      }
    >
  }
  try {
    parsed = JSON.parse(fs.readFileSync(providersPath, 'utf-8'))
  } catch {
    return { sourceExists: true, activeProvider: null, activeModel: null, providers: [] }
  }
  const raw = parsed.providers ?? {}
  const active = parsed.activeProvider ?? null
  const providers = Object.entries(raw).map(([id, entry]) => ({
    id,
    enabled: entry.enabled ?? false,
    autoDetected: entry.autoDetected ?? false,
    hasApiKey: typeof entry.apiKey === 'string' && entry.apiKey.length > 0,
    hasOAuthToken: entry.oauthToken !== undefined,
    baseUrl: entry.baseUrl ?? null,
    modelCount: Array.isArray(entry.models) ? entry.models.length : 0,
    active: id === active,
  }))
  providers.sort((a, b) => Number(b.active) - Number(a.active) || a.id.localeCompare(b.id))
  return {
    sourceExists: true,
    activeProvider: active,
    activeModel: parsed.activeModel ?? null,
    providers,
  }
}

// ── MCP servers (names + commands, never env values) ─────────────────────

export type McpServerSummary = {
  name: string
  kind: 'stdio' | 'remote'
  target: string | null
  envVarNames: string[]
  source: string
}

export function loadMcpSummaries(candidates: string[]): McpServerSummary[] {
  // Later candidates override earlier ones per server name — same merge
  // semantics as the runtime's loadMCPConfig (project overrides global).
  const byName = new Map<string, McpServerSummary>()
  for (const configPath of candidates) {
    let raw: string
    try {
      raw = fs.readFileSync(configPath, 'utf-8')
    } catch {
      continue
    }
    let parsed: { mcpServers?: Record<string, unknown> }
    try {
      parsed = JSON.parse(raw)
    } catch {
      byName.set('(invalid JSON)', { name: '(invalid JSON)', kind: 'stdio', target: null, envVarNames: [], source: configPath })
      continue
    }
    for (const [name, value] of Object.entries(parsed.mcpServers ?? {})) {
      if (!value || typeof value !== 'object') continue
      const server = value as { command?: unknown; url?: unknown; env?: unknown }
      const isStdio = typeof server.command === 'string'
      const envRecord =
        server.env && typeof server.env === 'object' && !Array.isArray(server.env)
          ? (server.env as Record<string, unknown>)
          : {}
      byName.set(name, {
        name,
        kind: isStdio ? 'stdio' : 'remote',
        // Command or URL — identity, not secret. Full argv is more detail
        // than the summary needs and argv can embed secrets; the binary
        // name is enough to know what will run.
        target: isStdio
          ? String(server.command)
          : typeof server.url === 'string'
            ? server.url
            : null,
        envVarNames: Object.keys(envRecord),
        source: configPath,
      })
    }
  }
  return [...byName.values()]
}

// ── Settings files (paths + hook event-type counts) ──────────────────────

export type SettingsSummary = {
  path: string
  exists: boolean
  hookEventTypes: number | null
  invalidJson: boolean
}

function loadSettingsSummaries(candidates: string[]): SettingsSummary[] {
  const seen = new Set<string>()
  const out: SettingsSummary[] = []
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    if (!fileExists(candidate)) {
      out.push({ path: candidate, exists: false, hookEventTypes: null, invalidJson: false })
      continue
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf-8')) as { hooks?: unknown }
      const hooks = parsed && typeof parsed === 'object' ? parsed.hooks : undefined
      out.push({
        path: candidate,
        exists: true,
        hookEventTypes: hooks && typeof hooks === 'object' ? Object.keys(hooks).length : 0,
        invalidJson: false,
      })
    } catch {
      out.push({ path: candidate, exists: true, hookEventTypes: null, invalidJson: true })
    }
  }
  return out
}

// ── Snapshot assembly ────────────────────────────────────────────────────

export type PrintConfigSnapshot = {
  projectRoot: string
  runtime: { platform: string; bunVersion: string | undefined }
  effort: { level: EffortLevel; maxSteps: number; isDefault: boolean }
  permission: {
    profile: string
    available: string[]
    sandboxCommands: boolean
    allowNetwork: boolean
    blockDestructiveGit: boolean
  }
  credentials: { env: Array<{ name: string; present: boolean }>; anyPresent: boolean }
  providers: {
    sourceExists: boolean
    source: string
    activeProvider: string | null
    activeModel: string | null
    entries: ProviderSummary[]
  }
  mcp: McpServerSummary[]
  settings: SettingsSummary[]
  paths: ConfigPaths
}

export function collectConfigSnapshot(
  overrides: { projectRoot?: string; homeDir?: string } = {},
): PrintConfigSnapshot {
  const paths = getConfigPaths(overrides)
  const providers = loadProviderSummaries(paths.providers)
  const credentials = envCredentialPresence()
  // run.ts boots with `trusted` unless overridden at runtime via /permissions.
  const profile = getProfile('trusted')

  return {
    projectRoot: paths.projectRoot,
    runtime: { platform: process.platform, bunVersion: process.versions.bun },
    effort: {
      level: getEffortLevel(),
      maxSteps: maxStepsForEffort(getEffortLevel()),
      isDefault: getEffortLevel() === DEFAULT_EFFORT,
    },
    permission: {
      profile: 'trusted',
      available: listProfiles(),
      sandboxCommands: profile.sandboxCommands,
      allowNetwork: profile.allowNetwork,
      blockDestructiveGit: profile.blockDestructiveGit,
    },
    credentials: { env: credentials, anyPresent: credentials.some((c) => c.present) },
    providers: { ...providers, source: paths.providers, entries: providers.providers },
    mcp: loadMcpSummaries(paths.mcpCandidates),
    settings: loadSettingsSummaries(paths.settingsCandidates),
    paths,
  }
}

// ── Renderers (doctor-style dual output) ─────────────────────────────────

export function formatConfigJson(snapshot: PrintConfigSnapshot): string {
  return JSON.stringify(snapshot, null, 2) + '\n'
}

export function formatConfigReport(snapshot: PrintConfigSnapshot): string {
  const lines: string[] = []
  lines.push('')
  lines.push('  LevelCode config')
  lines.push('  \u2500'.repeat(30))
  lines.push(`  ${'runtime'.padEnd(15)} bun ${snapshot.runtime.bunVersion ?? 'n/a'} (${snapshot.runtime.platform})`)
  lines.push(`  ${'project'.padEnd(15)} ${snapshot.projectRoot}`)
  lines.push(
    `  ${'effort'.padEnd(15)} ${snapshot.effort.level} (${snapshot.effort.maxSteps} steps)${snapshot.effort.isDefault ? ' [default]' : ''}`,
  )
  const p = snapshot.permission
  lines.push(
    `  ${'permissions'.padEnd(15)} ${p.profile} (sandbox: ${p.sandboxCommands ? 'on' : 'off'}, network: ${p.allowNetwork ? 'on' : 'off'})`,
  )
  const creds = snapshot.credentials.env
    .map((c) => `${c.name}${c.present ? '' : ' (absent)'}`)
    .join(', ')
  lines.push(`  ${'credentials'.padEnd(15)} ${snapshot.credentials.anyPresent ? creds : 'none in env'}`)
  const prov = snapshot.providers
  if (!prov.sourceExists) {
    lines.push(`  ${'providers'.padEnd(15)} no providers.json (env keys or login flow will be used)`)
  } else {
    lines.push(
      `  ${'providers'.padEnd(15)} active: ${prov.activeProvider ?? 'none'} / ${prov.activeModel ?? 'no model'}`,
    )
    for (const entry of prov.entries) {
      const flags = [
        entry.enabled ? 'enabled' : 'disabled',
        `${entry.modelCount} models`,
        entry.hasApiKey || entry.hasOAuthToken ? 'key: yes' : 'key: no',
        entry.autoDetected ? 'auto-detected' : '',
      ]
        .filter(Boolean)
        .join(', ')
      lines.push(`    ${entry.id.padEnd(18)} ${flags}`)
    }
  }
  if (snapshot.mcp.length === 0) {
    lines.push(`  ${'mcp servers'.padEnd(15)} none configured (.agents/mcp.json)`)
  } else {
    lines.push(`  ${'mcp servers'.padEnd(15)} ${snapshot.mcp.length}`)
    for (const server of snapshot.mcp) {
      const target = server.target ?? '?'
      const envPart = server.envVarNames.length > 0 ? `, env vars: ${server.envVarNames.length}` : ''
      lines.push(`    ${server.name.padEnd(18)} ${server.kind}: ${target}${envPart}`)
    }
  }
  for (const settings of snapshot.settings) {
    if (!settings.exists) continue
    const state = settings.invalidJson
      ? 'INVALID JSON'
      : `${settings.hookEventTypes ?? 0} hook event type(s)`
    lines.push(`  ${'settings'.padEnd(15)} ${settings.path} — ${state}`)
  }
  lines.push('  \u2500'.repeat(30))
  lines.push('')
  return lines.join('\n')
}
