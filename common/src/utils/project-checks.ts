/**
 * Project check detection — figures out which verification commands
 * (typecheck, lint, test, build) apply to a project by inspecting its
 * manifest files. Pure logic: callers supply file contents, so this is
 * fully unit-testable and runs identically on every platform.
 *
 * Used by the `verify_changes` tool (self-healing verification loop).
 */

export type CheckKind = 'typecheck' | 'lint' | 'test' | 'build'

export interface DetectedCheck {
  kind: CheckKind
  /** Shell command to run from the project root. */
  command: string
  /** Where this check was discovered (for transparency in agent output). */
  source: string
}

/** Manifest files the detector wants to inspect, relative to project root. */
export const CHECK_MANIFEST_FILES = [
  'package.json',
  'bun.lock',
  'bun.lockb',
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'tsconfig.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'setup.py',
  'requirements.txt',
  'Makefile',
] as const

/** Map of manifest path -> file content (null/undefined if absent). */
export type ManifestFiles = Partial<
  Record<(typeof CHECK_MANIFEST_FILES)[number], string | null>
>

const CHECK_ORDER: CheckKind[] = ['typecheck', 'lint', 'test', 'build']

/** npm placeholder test script that should not count as a real test. */
const NPM_PLACEHOLDER_TEST = 'no test specified'

function detectPackageManager(files: ManifestFiles): string {
  if (files['bun.lock'] != null || files['bun.lockb'] != null) return 'bun'
  if (files['pnpm-lock.yaml'] != null) return 'pnpm'
  if (files['yarn.lock'] != null) return 'yarn'
  return 'npm'
}

function parsePackageJson(
  content: string,
): { scripts: Record<string, string> } | null {
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object') {
      return {
        scripts:
          parsed.scripts && typeof parsed.scripts === 'object'
            ? (parsed.scripts as Record<string, string>)
            : {},
      }
    }
  } catch {
    // Malformed package.json — skip JS detection.
  }
  return null
}

function detectNodeChecks(files: ManifestFiles): DetectedCheck[] {
  const packageJson = files['package.json']
  if (packageJson == null) return []
  const parsed = parsePackageJson(packageJson)
  if (!parsed) return []

  const pm = detectPackageManager(files)
  const { scripts } = parsed
  const checks: DetectedCheck[] = []

  const scriptFor = (names: string[]): string | undefined =>
    names.find((name) => typeof scripts[name] === 'string')

  const typecheckScript = scriptFor(['typecheck', 'type-check', 'check-types'])
  if (typecheckScript) {
    checks.push({
      kind: 'typecheck',
      command: `${pm} run ${typecheckScript}`,
      source: `package.json#scripts.${typecheckScript}`,
    })
  } else if (files['tsconfig.json'] != null) {
    const exec = pm === 'bun' ? 'bunx' : 'npx'
    checks.push({
      kind: 'typecheck',
      command: `${exec} tsc --noEmit`,
      source: 'tsconfig.json',
    })
  }

  const lintScript = scriptFor(['lint', 'eslint'])
  if (lintScript) {
    checks.push({
      kind: 'lint',
      command: `${pm} run ${lintScript}`,
      source: `package.json#scripts.${lintScript}`,
    })
  }

  const testScript = scriptFor(['test', 'tests', 'unit'])
  if (
    testScript &&
    !String(scripts[testScript]).includes(NPM_PLACEHOLDER_TEST)
  ) {
    checks.push({
      kind: 'test',
      command:
        pm === 'bun' && testScript === 'test'
          ? 'bun test'
          : `${pm} run ${testScript}`,
      source: `package.json#scripts.${testScript}`,
    })
  }

  const buildScript = scriptFor(['build', 'compile'])
  if (buildScript) {
    checks.push({
      kind: 'build',
      command: `${pm} run ${buildScript}`,
      source: `package.json#scripts.${buildScript}`,
    })
  }

  return checks
}

function detectRustChecks(files: ManifestFiles): DetectedCheck[] {
  if (files['Cargo.toml'] == null) return []
  return [
    { kind: 'typecheck', command: 'cargo check --all-targets', source: 'Cargo.toml' },
    { kind: 'test', command: 'cargo test', source: 'Cargo.toml' },
  ]
}

function detectGoChecks(files: ManifestFiles): DetectedCheck[] {
  if (files['go.mod'] == null) return []
  return [
    { kind: 'typecheck', command: 'go vet ./...', source: 'go.mod' },
    { kind: 'build', command: 'go build ./...', source: 'go.mod' },
    { kind: 'test', command: 'go test ./...', source: 'go.mod' },
  ]
}

function detectPythonChecks(files: ManifestFiles): DetectedCheck[] {
  const pyproject = files['pyproject.toml']
  const hasPythonProject =
    pyproject != null ||
    files['setup.py'] != null ||
    files['requirements.txt'] != null
  if (!hasPythonProject) return []

  const checks: DetectedCheck[] = []
  const pyprojectContent = pyproject ?? ''

  if (/\bmypy\b/.test(pyprojectContent)) {
    checks.push({ kind: 'typecheck', command: 'mypy .', source: 'pyproject.toml' })
  }
  if (/\bruff\b/.test(pyprojectContent)) {
    checks.push({ kind: 'lint', command: 'ruff check .', source: 'pyproject.toml' })
  }
  if (
    /\bpytest\b/.test(pyprojectContent) ||
    (files['requirements.txt'] ?? '').includes('pytest')
  ) {
    checks.push({ kind: 'test', command: 'pytest -x -q', source: 'pytest config' })
  }
  return checks
}

function detectMakefileChecks(files: ManifestFiles): DetectedCheck[] {
  const makefile = files['Makefile']
  if (makefile == null) return []

  const targets = new Set<string>()
  for (const line of makefile.split('\n')) {
    const match = /^([A-Za-z0-9_-]+):/.exec(line)
    if (match) targets.add(match[1]!)
  }

  const mapping: Array<[string, CheckKind]> = [
    ['typecheck', 'typecheck'],
    ['lint', 'lint'],
    ['test', 'test'],
    ['check', 'test'],
    ['build', 'build'],
  ]

  const checks: DetectedCheck[] = []
  for (const [target, kind] of mapping) {
    if (targets.has(target)) {
      checks.push({ kind, command: `make ${target}`, source: `Makefile#${target}` })
    }
  }
  return checks
}

/**
 * Detect the verification commands for a project from its manifest files.
 *
 * Order of results follows CHECK_ORDER (typecheck -> lint -> test -> build),
 * with at most one command per check kind (first detector wins; detectors are
 * tried in ecosystem order: node, rust, go, python, make).
 */
export function detectProjectChecks(
  files: ManifestFiles,
  options?: { only?: CheckKind[] },
): DetectedCheck[] {
  const all = [
    ...detectNodeChecks(files),
    ...detectRustChecks(files),
    ...detectGoChecks(files),
    ...detectPythonChecks(files),
    ...detectMakefileChecks(files),
  ]

  const byKind = new Map<CheckKind, DetectedCheck>()
  for (const check of all) {
    if (!byKind.has(check.kind)) {
      byKind.set(check.kind, check)
    }
  }

  const wanted = options?.only?.length ? options.only : CHECK_ORDER
  return CHECK_ORDER.filter((kind) => wanted.includes(kind))
    .map((kind) => byKind.get(kind))
    .filter((check): check is DetectedCheck => Boolean(check))
}

/**
 * Extract the most relevant lines from failing check output so agents can fix
 * issues without reading thousands of lines. Keeps error-looking lines plus
 * the tail of the output, capped at maxChars.
 */
export function summarizeCheckOutput(
  output: string,
  maxChars: number = 4000,
): string {
  const trimmed = output.trim()
  if (trimmed.length <= maxChars) return trimmed

  const lines = trimmed.split('\n')
  const errorPattern =
    /\b(error|err!|fail|failed|failing|exception|traceback|panic|assert|expected|received|✗|✖|×)\b/i
  const errorLines = lines.filter((line) => errorPattern.test(line))

  const head = errorLines.slice(0, 60).join('\n')
  const tail = lines.slice(-40).join('\n')
  const combined = head.length > 0 ? `${head}\n...\n${tail}` : tail

  return combined.length <= maxChars
    ? combined
    : `${combined.slice(0, maxChars)}\n... [output truncated]`
}
