// Golden Test Replay framework.
// Records a successful agent trajectory as a "golden" fixture,
// replays it on release, and asserts that the same set of files are modified
// (content changes are allowed — file *set* must match).

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export interface GoldenTrajectoryStep {
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: unknown
  ts: number
}

export interface GoldenFileState {
  path: string
  /** Content hash (SHA-256) at the time of recording — used for drift detection */
  contentHash: string
  /** Whether the file existed before the run */
  existedBefore: boolean
  /** Whether the file existed after the run */
  existedAfter: boolean
  /** File size after run (bytes) */
  sizeAfter: number
}

export interface GoldenTrajectory {
  name: string
  version: 1
  prompt: string
  cwd: string
  recordedAt: string
  gitSha?: string
  model: string
  steps: GoldenTrajectoryStep[]
  filesBefore: GoldenFileState[]
  filesAfter: GoldenFileState[]
  /** Files that were modified/added/deleted during the run (relative paths) */
  modifiedFiles: string[]
  /** Total duration in ms */
  durationMs: number
  /** Token usage */
  totalTokens: number
  totalCostUsd: number
}

export interface GoldenReplayResult {
  name: string
  passed: boolean
  errors: string[]
  warnings: string[]
  filesMatch: boolean
  expectedFiles: string[]
  actualFiles: string[]
  missingFiles: string[]
  unexpectedFiles: string[]
  durationMs: number
}

export interface GoldenTestOptions {
  /** Directory for golden fixtures (default: evals/golden/fixtures) */
  fixturesDir?: string
  /** Agent runner function — takes (prompt, cwd) and returns { success, filesModified, steps?, tokens?, cost?, durationMs? } */
  agentRunner: (prompt: string, cwd: string) => Promise<{
    success: boolean
    filesModified: string[]
    steps?: GoldenTrajectoryStep[]
    tokens?: number
    cost?: number
    durationMs?: number
    error?: string
  }>
  /** Function to list files in the working directory (relative paths) */
  listFiles?: (cwd: string) => string[]
  /** Function to compute file hash */
  hashFile?: (filePath: string) => string
}

const DEFAULT_FIXTURES_DIR = path.join(__dirname, 'fixtures')

function defaultListFiles(cwd: string): string[] {
  const results: string[] = []
  const excluded = new Set([
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    '.turbo',
    '.levelcode',
    'coverage',
  ])

  function walk(dir: string, rel: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (excluded.has(entry.name) || entry.name.startsWith('.')) continue
      const fullPath = path.join(dir, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(fullPath, relPath)
      } else if (entry.isFile()) {
        results.push(relPath)
      }
    }
  }

  walk(cwd, '')
  return results.sort()
}

function defaultHashFile(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath)
    const hash = new Bun.CryptoHasher('sha256')
    hash.update(content)
    return hash.digest('hex')
  } catch {
    return ''
  }
}

function getGitSha(cwd: string): string | undefined {
  try {
    return execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim()
  } catch {
    return undefined
  }
}

function snapshotFiles(cwd: string, listFiles: (cwd: string) => string[], hashFile: (p: string) => string): GoldenFileState[] {
  const relFiles = listFiles(cwd)
  return relFiles.map((rel) => {
    const abs = path.join(cwd, rel)
    let existedBefore = false
    let sizeAfter = 0
    let hash = ''
    try {
      const stat = fs.statSync(abs)
      existedBefore = true
      sizeAfter = stat.size
      hash = hashFile(abs)
    } catch {
      existedBefore = false
    }
    return {
      path: rel,
      contentHash: hash,
      existedBefore,
      existedAfter: existedBefore,
      sizeAfter,
    }
  })
}

function diffFileStates(before: GoldenFileState[], after: GoldenFileState[]): string[] {
  const beforeMap = new Map(before.map((f) => [f.path, f]))
  const afterMap = new Map(after.map((f) => [f.path, f]))
  const modified: string[] = []

  for (const f of after) {
    const b = beforeMap.get(f.path)
    if (!b) {
      if (f.existedAfter) modified.push(f.path)
    } else if (b.contentHash !== f.contentHash) {
      modified.push(f.path)
    }
  }

  for (const f of before) {
    const a = afterMap.get(f.path)
    if (!a && f.existedBefore) {
      modified.push(f.path)
    }
  }

  return Array.from(new Set(modified)).sort()
}

function ensureFixturesDir(fixturesDir: string): void {
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true })
  }
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
}

function getGoldenPath(name: string, fixturesDir: string): string {
  return path.join(fixturesDir, `${sanitizeName(name)}.golden.json`)
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Record a golden trajectory by running the agent on a prompt and saving
 * the resulting file modifications and metadata.
 */
export async function recordGolden(
  name: string,
  prompt: string,
  cwd: string,
  options: GoldenTestOptions,
): Promise<GoldenTrajectory> {
  const fixturesDir = options.fixturesDir || DEFAULT_FIXTURES_DIR
  const listFiles = options.listFiles || defaultListFiles
  const hashFile = options.hashFile || defaultHashFile

  ensureFixturesDir(fixturesDir)

  const start = Date.now()
  const filesBefore = snapshotFiles(cwd, listFiles, hashFile)
  const beforeMap = new Map(filesBefore.map((f) => [f.path, f]))

  const result = await options.agentRunner(prompt, cwd)

  if (!result.success) {
    throw new Error(`Agent run failed for golden "${name}": ${result.error || 'unknown error'}`)
  }

  const filesAfterList = listFiles(cwd)
  const filesAfter: GoldenFileState[] = filesAfterList.map((rel) => {
    const abs = path.join(cwd, rel)
    let existedAfter = false
    let sizeAfter = 0
    let hash = ''
    try {
      const stat = fs.statSync(abs)
      existedAfter = true
      sizeAfter = stat.size
      hash = hashFile(abs)
    } catch {
      existedAfter = false
    }
    const before = beforeMap.get(rel)
    return {
      path: rel,
      contentHash: hash,
      existedBefore: before?.existedBefore ?? false,
      existedAfter,
      sizeAfter,
    }
  })

  const modifiedFiles = diffFileStates(filesBefore, filesAfter)

  const trajectory: GoldenTrajectory = {
    name,
    version: 1,
    prompt,
    cwd,
    recordedAt: new Date().toISOString(),
    gitSha: getGitSha(cwd),
    model: 'default',
    steps: result.steps || [],
    filesBefore,
    filesAfter,
    modifiedFiles,
    durationMs: result.durationMs ?? Date.now() - start,
    totalTokens: result.tokens ?? 0,
    totalCostUsd: result.cost ?? 0,
  }

  const goldenPath = getGoldenPath(name, fixturesDir)
  fs.writeFileSync(goldenPath, JSON.stringify(trajectory, null, 2), 'utf-8')

  return trajectory
}

/**
 * Replay a golden trajectory against the current code and compare file mods.
 * Returns a result with pass/fail status plus detailed diff information.
 */
export async function replayGolden(
  name: string,
  options: GoldenTestOptions,
): Promise<GoldenReplayResult> {
  const fixturesDir = options.fixturesDir || DEFAULT_FIXTURES_DIR
  const listFiles = options.listFiles || defaultListFiles
  const hashFile = options.hashFile || defaultHashFile

  const goldenPath = getGoldenPath(name, fixturesDir)
  if (!fs.existsSync(goldenPath)) {
    return {
      name,
      passed: false,
      errors: [`Golden fixture not found: ${goldenPath}`],
      warnings: [],
      filesMatch: false,
      expectedFiles: [],
      actualFiles: [],
      missingFiles: [],
      unexpectedFiles: [],
      durationMs: 0,
    }
  }

  const golden: GoldenTrajectory = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'))
  const start = Date.now()
  const errors: string[] = []
  const warnings: string[] = []

  const cwd = golden.cwd
  if (!fs.existsSync(cwd)) {
    return {
      name,
      passed: false,
      errors: [`Golden working directory does not exist: ${cwd}`],
      warnings: [],
      filesMatch: false,
      expectedFiles: golden.modifiedFiles,
      actualFiles: [],
      missingFiles: golden.modifiedFiles,
      unexpectedFiles: [],
      durationMs: Date.now() - start,
    }
  }

  const filesBefore = snapshotFiles(cwd, listFiles, hashFile)

  const result = await options.agentRunner(golden.prompt, cwd)
  const durationMs = result.durationMs ?? Date.now() - start

  if (!result.success) {
    errors.push(`Agent run failed during replay: ${result.error || 'unknown error'}`)
  }

  const filesAfterList = listFiles(cwd)
  const filesAfter: GoldenFileState[] = filesAfterList.map((rel) => {
    const abs = path.join(cwd, rel)
    let existedAfter = false
    let sizeAfter = 0
    let hash = ''
    try {
      const stat = fs.statSync(abs)
      existedAfter = true
      sizeAfter = stat.size
      hash = hashFile(abs)
    } catch {
      existedAfter = false
    }
    const before = filesBefore.find((f) => f.path === rel)
    return {
      path: rel,
      contentHash: hash,
      existedBefore: before?.existedBefore ?? false,
      existedAfter,
      sizeAfter,
    }
  })

  const actualFiles = diffFileStates(filesBefore, filesAfter)
  const expectedSet = new Set(golden.modifiedFiles)
  const actualSet = new Set(actualFiles)

  const missingFiles = golden.modifiedFiles.filter((f) => !actualSet.has(f))
  const unexpectedFiles = actualFiles.filter((f) => !expectedSet.has(f))
  const filesMatch = missingFiles.length === 0 && unexpectedFiles.length === 0

  if (!filesMatch) {
    if (missingFiles.length > 0) {
      errors.push(`Missing expected file modifications: ${missingFiles.join(', ')}`)
    }
    if (unexpectedFiles.length > 0) {
      errors.push(`Unexpected file modifications: ${unexpectedFiles.join(', ')}`)
    }
  }

  // Check content drift warnings (files that were modified but content changed substantially)
  for (const rel of golden.modifiedFiles) {
    if (actualSet.has(rel)) {
      const goldenAfter = golden.filesAfter.find((f) => f.path === rel)
      const actualAfter = filesAfter.find((f) => f.path === rel)
      if (goldenAfter && actualAfter && goldenAfter.contentHash !== actualAfter.contentHash) {
        warnings.push(`Content changed for ${rel} (expected — files modified but content differs)`)
      }
    }
  }

  return {
    name,
    passed: filesMatch && result.success,
    errors,
    warnings,
    filesMatch,
    expectedFiles: golden.modifiedFiles,
    actualFiles,
    missingFiles,
    unexpectedFiles,
    durationMs,
  }
}

/**
 * Assert that file modification sets match between golden and actual.
 * Throws on mismatch; returns true on match.
 */
export function assertFilesMatch(
  golden: GoldenTrajectory | string,
  actual: GoldenReplayResult | string[],
): boolean {
  let expectedFiles: string[]
  let actualFiles: string[]

  if (typeof golden === 'string') {
    const goldenPath = golden.endsWith('.json')
      ? golden
      : getGoldenPath(golden, DEFAULT_FIXTURES_DIR)
    const loaded: GoldenTrajectory = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'))
    expectedFiles = loaded.modifiedFiles
  } else {
    expectedFiles = golden.modifiedFiles
  }

  if (Array.isArray(actual)) {
    actualFiles = actual
  } else {
    actualFiles = actual.actualFiles
  }

  const expectedSet = new Set(expectedFiles)
  const actualSet = new Set(actualFiles)

  const missing = expectedFiles.filter((f) => !actualSet.has(f))
  const unexpected = actualFiles.filter((f) => !expectedSet.has(f))

  if (missing.length > 0 || unexpected.length > 0) {
    const parts: string[] = ['Golden file mismatch:']
    if (missing.length > 0) parts.push(`  Missing: ${missing.join(', ')}`)
    if (unexpected.length > 0) parts.push(`  Unexpected: ${unexpected.join(', ')}`)
    throw new Error(parts.join('\n'))
  }

  return true
}

/**
 * List all available golden fixtures.
 */
export function listGoldens(fixturesDir?: string): string[] {
  const dir = fixturesDir || DEFAULT_FIXTURES_DIR
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.golden.json'))
    .map((f) => f.replace('.golden.json', ''))
}

/**
 * Load a golden fixture by name.
 */
export function loadGolden(name: string, fixturesDir?: string): GoldenTrajectory | null {
  const dir = fixturesDir || DEFAULT_FIXTURES_DIR
  const goldenPath = getGoldenPath(name, dir)
  if (!fs.existsSync(goldenPath)) return null
  return JSON.parse(fs.readFileSync(goldenPath, 'utf-8'))
}

/**
 * Replay all available goldens and return a summary report.
 */
export async function replayAllGoldens(
  options: GoldenTestOptions,
): Promise<{ results: GoldenReplayResult[]; passed: number; failed: number; totalDurationMs: number }> {
  const names = listGoldens(options.fixturesDir)
  const results: GoldenReplayResult[] = []

  for (const name of names) {
    const result = await replayGolden(name, options)
    results.push(result)
  }

  const passed = results.filter((r) => r.passed).length
  const failed = results.length - passed
  const totalDurationMs = results.reduce((s, r) => s + r.durationMs, 0)

  return { results, passed, failed, totalDurationMs }
}

/**
 * Format replay results as a human-readable string.
 */
export function formatReplayReport(results: GoldenReplayResult[]): string {
  const lines: string[] = []
  const passed = results.filter((r) => r.passed).length
  const failed = results.length - passed

  lines.push(`Golden Replay Report: ${passed}/${results.length} passed`)
  lines.push('')

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌'
    lines.push(`${icon} ${r.name} (${(r.durationMs / 1000).toFixed(1)}s)`)
    if (!r.filesMatch) {
      if (r.missingFiles.length > 0) {
        lines.push(`   Missing:  ${r.missingFiles.join(', ')}`)
      }
      if (r.unexpectedFiles.length > 0) {
        lines.push(`   Extra:    ${r.unexpectedFiles.join(', ')}`)
      }
    }
    for (const err of r.errors) {
      lines.push(`   ERROR: ${err}`)
    }
    for (const w of r.warnings) {
      lines.push(`   WARN:  ${w}`)
    }
  }

  if (failed > 0) {
    lines.push('')
    lines.push(`${failed} golden(s) failed regression check.`)
  }

  return lines.join('\n')
}
