/**
 * `levelcode doctor` — a dependency & environment health panel.
 *
 * Checks everything a broken setup could get wrong and prints a green/red
 * panel with fix hints, then exits 0 when healthy, 1 when any required check
 * fails (so CI can use it as a smoke test).
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

type CheckStatus = 'ok' | 'warn' | 'fail'

export type Check = {
  name: string
  status: CheckStatus
  detail: string
  hint?: string
}

const STATUS_ICON: Record<CheckStatus, string> = {
  ok: '\u2713',
  warn: '!',
  fail: '\u2717',
}

const STATUS_COLOR: Record<CheckStatus, (s: string) => string> = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  fail: (s) => `\x1b[31m${s}\x1b[0m`,
}

function checkProviderKeys(): Check {
  const candidates: Array<[string, string]> = [
    ['OPENROUTER_API_KEY', 'https://openrouter.ai/keys'],
    ['ANTHROPIC_API_KEY', 'https://console.anthropic.com'],
    ['LEVELCODE_API_KEY', 'levelcode login'],
  ]
  const present = candidates.filter(([name]) => {
    const value = process.env[name]
    return typeof value === 'string' && value.length > 0
  })

  if (present.length > 0) {
    return {
      name: 'Model provider credentials',
      status: 'ok',
      detail: present.map(([name]) => name).join(', '),
    }
  }
  return {
    name: 'Model provider credentials',
    status: 'fail',
    detail: 'none found',
    hint: 'Set OPENROUTER_API_KEY (get a key at https://openrouter.ai/keys) or run `levelcode login`.',
  }
}

function checkRipgrep(): Check {
  const configured = process.env.LEVELCODE_RG_PATH
  if (configured && fs.existsSync(configured)) {
    return { name: 'ripgrep', status: 'ok', detail: configured }
  }

  // Bun embeds ripgrep-aware file ops; a system rg is a nice-to-have.
  try {
    const require = createRequire(import.meta.url)
    require.resolve('@vscode/ripgrep')
    return {
      name: 'ripgrep',
      status: 'ok',
      detail: 'bundled via @vscode/ripgrep',
    }
  } catch {
    return {
      name: 'ripgrep',
      status: 'warn',
      detail: 'not found on PATH or bundled',
      hint: 'Search tools fall back to slower implementations. Install ripgrep for best performance.',
    }
  }
}

function checkGit(overrides: { projectRoot?: string } = {}): Check {
  const root = overrides.projectRoot ?? process.cwd()
  const inRepo = fs.existsSync(path.join(root, '.git'))
  if (inRepo) {
    return { name: 'git repository', status: 'ok', detail: root }
  }
  return {
    name: 'git repository',
    status: 'warn',
    detail: 'current directory is not a git repo',
    hint: 'Checkpoints, worktrees, and safe rollbacks require git. Run `git init`.',
  }
}

function checkConfigDir(): Check {
  const configDir = path.join(os.homedir(), '.config', 'levelcode')
  try {
    fs.mkdirSync(configDir, { recursive: true })
    fs.accessSync(configDir, fs.constants.W_OK)
    return { name: 'config directory', status: 'ok', detail: configDir }
  } catch (error) {
    return {
      name: 'config directory',
      status: 'fail',
      detail: configDir,
      hint: `Not writable: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function checkNodeCompat(): Check {
  const major = Number.parseInt(process.versions.node ?? '0', 10)
  if (process.versions.bun) {
    return {
      name: 'runtime',
      status: 'ok',
      detail: `bun ${process.versions.bun}`,
    }
  }
  if (major >= 20) {
    return {
      name: 'runtime',
      status: 'ok',
      detail: `node ${process.versions.node}`,
    }
  }
  return {
    name: 'runtime',
    status: 'fail',
    detail: `node ${process.versions.node} (need >= 20 or bun)`,
    hint: 'Upgrade Node.js or install Bun: https://bun.sh',
  }
}

// ── Hooks & skills checks (syntax-level, dependency-light) ──────────────

const SETTINGS_CANDIDATES = (projectRoot: string, homeDir?: string): string[] => {
  const home = homeDir ?? os.homedir()
  const envSuffix =
    process.env.NEXT_PUBLIC_CB_ENVIRONMENT &&
    process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod'
      ? `-${process.env.NEXT_PUBLIC_CB_ENVIRONMENT}`
      : ''
  const levelcodeBase =
    process.env.LEVELCODE_DIR || path.join(home, '.levelcode')
  return [
    path.join(home, '.config', `levelcode${envSuffix}`, 'settings.json'),
    path.join(levelcodeBase, 'settings.json'),
    path.join(projectRoot, '.levelcode', 'settings.json'),
  ]
}

export type HooksCheckOverrides = { projectRoot?: string; homeDir?: string }

function checkHooksConfig(overrides: HooksCheckOverrides = {}): Check {
  const projectRoot = overrides.projectRoot ?? process.cwd()
  // Dedupe by resolved path: when the project lives inside the home dir,
  // several candidates can resolve to the same settings file.
  const seen = new Set<string>()
  const candidates = SETTINGS_CANDIDATES(projectRoot, overrides.homeDir).filter((candidate) => {
    const resolved = path.resolve(candidate)
    if (seen.has(resolved)) return false
    seen.add(resolved)
    return true
  })

  let configured = 0
  const problems: string[] = []

  for (const candidate of candidates) {
    let raw: string
    try {
      raw = fs.readFileSync(candidate, 'utf-8')
    } catch {
      continue
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      const hooks =
        parsed && typeof parsed === 'object' && 'hooks' in parsed
          ? (parsed as { hooks?: unknown }).hooks
          : undefined
      if (hooks === undefined) continue
      if (hooks && typeof hooks === 'object') {
        configured += Object.keys(hooks as Record<string, unknown>).length
      } else {
        problems.push(candidate)
      }
    } catch {
      problems.push(candidate)
    }
  }

  if (problems.length > 0) {
    return {
      name: 'hooks config',
      status: 'warn',
      detail: `${problems.length} settings file(s) with invalid JSON`,
      hint: `Fix or remove: ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}`,
    }
  }
  if (configured === 0) {
    return {
      name: 'hooks config',
      status: 'ok',
      detail: 'none configured (see docs/hooks.md)',
    }
  }
  return {
    name: 'hooks config',
    status: 'ok',
    detail: `${configured} event type(s) configured`,
  }
}

const SKILLS_DIRS = (projectRoot: string, homeDir: string): string[] => [
  path.join(projectRoot, '.agents', 'skills'),
  path.join(projectRoot, '.claude', 'skills'),
  path.join(projectRoot, '.levelcode', 'skills'),
  path.join(homeDir, '.claude', 'skills'),
  path.join(homeDir, '.agents', 'skills'),
  path.join(homeDir, '.config', 'levelcode', 'skills'),
  path.join(homeDir, '.levelcode', 'skills'),
]

function countSkillsIn(dir: string): number {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(
        (e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')),
      ).length
  } catch {
    return 0
  }
}

export type SkillsCheckOverrides = { projectRoot?: string; homeDir?: string }

function checkSkills(overrides: SkillsCheckOverrides = {}): Check {
  const projectRoot = overrides.projectRoot ?? process.cwd()
  const homeDir = overrides.homeDir ?? os.homedir()

  // Dedupe by resolved path: project and home lists overlap when the
  // project lives inside the home directory.
  const seen = new Set<string>()
  const uniqueDirs = SKILLS_DIRS(projectRoot, homeDir).filter((dir) => {
    const resolved = path.resolve(dir)
    if (seen.has(resolved)) return false
    seen.add(resolved)
    return true
  })

  let total = 0
  const sources: string[] = []
  for (const dir of uniqueDirs) {
    const n = countSkillsIn(dir)
    if (n > 0) {
      total += n
      sources.push(dir)
    }
  }

  if (total === 0) {
    return {
      name: 'skills',
      status: 'ok',
      detail: 'none installed (.agents/skills/<name>/SKILL.md)',
    }
  }
  return {
    name: 'skills',
    status: 'ok',
    detail: `${total} skill(s) in ${sources.length} location(s)`,
  }
}

function checkSandboxSupport(): Check {
  if (process.platform === 'darwin') {
    return { name: 'sandbox (Seatbelt)', status: 'ok', detail: 'macOS sandbox-exec available' }
  }
  if (process.platform === 'linux') {
    return {
      name: 'sandbox (bubblewrap)',
      status: 'ok',
      detail: 'linux; requires bwrap for enforcement',
    }
  }
  if (process.platform === 'win32') {
    return {
      name: 'sandbox',
      status: 'warn',
      detail: 'not enforced on Windows',
      hint: 'Permission prompts remain active; filesystem guards still apply.',
    }
  }
  return { name: 'sandbox', status: 'warn', detail: `unknown platform ${process.platform}` }
}

export type DoctorCheckOverrides = {
  projectRoot?: string
  homeDir?: string
}

export function runDoctorChecks(overrides: DoctorCheckOverrides = {}): Check[] {
  return [
    checkNodeCompat(),
    checkProviderKeys(),
    checkConfigDir(),
    checkHooksConfig(overrides),
    checkSkills(overrides),
    checkRipgrep(),
    checkGit(overrides),
    checkSandboxSupport(),
  ]
}

/** Machine-readable doctor output for CI pipelines. */
export function formatDoctorJson(checks: Check[]): string {
  return (
    JSON.stringify(
      {
        ok: doctorExitCode(checks) === 0,
        summary: {
          total: checks.length,
          ok: checks.filter((c) => c.status === 'ok').length,
          warnings: checks.filter((c) => c.status === 'warn').length,
          failures: checks.filter((c) => c.status === 'fail').length,
        },
        checks: checks.map((c) => ({
          name: c.name,
          status: c.status,
          detail: c.detail,
          hint: c.hint,
        })),
      },
      null,
      2,
    ) + '\n'
  )
}

export function formatDoctorReport(checks: Check[]): string {
  const lines: string[] = []
  lines.push('')
  lines.push('  LevelCode doctor')
  lines.push('  \u2500'.repeat(30))
  for (const check of checks) {
    const icon = STATUS_COLOR[check.status](STATUS_ICON[check.status])
    lines.push(`  ${icon}  ${check.name.padEnd(30)} ${check.detail}`)
    if (check.hint) {
      lines.push(`       ${STATUS_COLOR.warn('hint:')} ${check.hint}`)
    }
  }
  const failed = checks.filter((c) => c.status === 'fail').length
  const warned = checks.filter((c) => c.status === 'warn').length
  lines.push('  \u2500'.repeat(30))
  lines.push(
    `  ${checks.length - failed - warned} ok, ${warned} warnings, ${failed} failures`,
  )
  lines.push('')
  return lines.join('\n')
}

export function doctorExitCode(checks: Check[]): number {
  return checks.some((c) => c.status === 'fail') ? 1 : 0
}
