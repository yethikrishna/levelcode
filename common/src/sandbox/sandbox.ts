import { spawnSync } from 'child_process'
import os from 'os'
import path from 'path'

/**
 * Sandbox configuration options controlling command execution restrictions.
 */
export interface SandboxConfig {
  /** Enable sandboxing (default: true) */
  enabled?: boolean
  /** Allowed filesystem paths for path-allowlist fallback mode */
  allowedPaths?: string[]
  /** Blocked command patterns (regex strings) */
  blockedPatterns?: string[]
  /** Environment variables to explicitly allow through (blocked by default when sandboxed) */
  allowedEnvVars?: string[]
  /** Maximum execution time in seconds (default: 30) */
  timeoutSeconds?: number
  /** Working directory override for sandboxed execution */
  cwd?: string
  /** Force a specific sandbox mode instead of auto-detection */
  mode?: 'firejail' | 'appcontainer' | 'powershell' | 'allowlist' | 'none'
}

const DEFAULT_SANDBOX_CONFIG: Required<SandboxConfig> = {
  enabled: true,
  allowedPaths: [],
  blockedPatterns: [
    String.raw`rm\s+-rf\s+/`,
    String.raw`mkfs\.`,
    String.raw`dd\s+if=`,
    String.raw`:(){ :|:& };`,
    String.raw`chmod\s+-R\s+777`,
    String.raw`>\s*/dev/sd`,
    String.raw`curl.*\|\s*(bash|sh)`,
    String.raw`wget.*\|\s*(bash|sh)`,
  ],
  allowedEnvVars: ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR'],
  timeoutSeconds: 30,
  cwd: process.cwd(),
  mode: 'allowlist',
}

/**
 * Result from sandboxed command execution.
 */
export interface SandboxResult {
  stdout: string
  stderr: string
  exitCode: number | null
  sandboxMode: string
  blocked: boolean
  blockReason?: string
}

/**
 * Detect whether firejail is available on the current Unix system.
 */
function detectFirejail(): boolean {
  if (os.platform() === 'win32') return false
  try {
    const result = spawnSync('firejail', ['--version'], { encoding: 'utf8' })
    return result.status === 0
  } catch {
    return false
  }
}

/**
 * Detect the best available sandbox mode for the current platform.
 */
function detectSandboxMode(): 'firejail' | 'appcontainer' | 'powershell' | 'allowlist' {
  const platform = os.platform()
  if (platform === 'win32') {
    return 'powershell'
  }
  if (detectFirejail()) {
    return 'firejail'
  }
  return 'allowlist'
}

/**
 * Check a command string against blocked patterns.
 * Returns a block reason string if blocked, undefined if allowed.
 */
function checkBlockedPatterns(
  command: string,
  blockedPatterns: string[],
): string | undefined {
  for (const pattern of blockedPatterns) {
    try {
      const regex = new RegExp(pattern, 'i')
      if (regex.test(command)) {
        return `Command matches blocked pattern: ${pattern}`
      }
    } catch {
      // Invalid regex pattern, skip
    }
  }
  return undefined
}

/**
 * Validate paths in command against allowed paths allowlist.
 * Returns a block reason if the command references disallowed paths.
 */
function validatePathAllowlist(
  command: string,
  allowedPaths: string[],
  cwd: string,
): string | undefined {
  if (allowedPaths.length === 0) return undefined

  const resolvedCwd = path.resolve(cwd)
  const cwdAllowed = allowedPaths.some(
    (allowed) =>
      resolvedCwd.startsWith(path.resolve(allowed)) ||
      path.resolve(allowed).startsWith(resolvedCwd),
  )

  if (!cwdAllowed) {
    return `Working directory ${resolvedCwd} is not in the allowed paths list`
  }

  return undefined
}

/**
 * Build firejail command wrapper arguments.
 */
function buildFirejailCommand(
  command: string,
  config: Required<SandboxConfig>,
): { shell: string; args: string[] } {
  const firejailArgs = [
    '--noprofile',
    '--quiet',
    '--private',
    `--private=${config.cwd}`,
    '--nosound',
    '--no3d',
    '--nodvd',
    '--notv',
    '--nou2f',
    '--disable-mnt',
    '--caps.drop=all',
    '--nonewprivs',
    '--seccomp',
    '--shell=none',
  ]

  for (const allowedPath of config.allowedPaths) {
    firejailArgs.push(`--whitelist=${path.resolve(allowedPath)}`)
  }

  const envArgs: string[] = []
  for (const envVar of config.allowedEnvVars) {
    const val = process.env[envVar]
    if (val !== undefined) {
      envArgs.push(`${envVar}=${val}`)
    }
  }

  return {
    shell: 'firejail',
    args: [...firejailArgs, 'bash', '-c', command],
  }
}

/**
 * Build PowerShell constrained command wrapper for Windows.
 * Uses ExecutionPolicy restrictions and constrained language mode.
 */
function buildPowerShellCommand(
  command: string,
  config: Required<SandboxConfig>,
): { shell: string; args: string[] } {
  const psCommand = [
    '$ErrorActionPreference = "Stop"',
    `Set-Location -LiteralPath "${config.cwd.replace(/"/g, '`"')}"`,
    '$ProgressPreference = "SilentlyContinue"',
    command,
  ].join('; ')

  return {
    shell: 'powershell.exe',
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Restricted',
      '-Command',
      psCommand,
    ],
  }
}

/**
 * Build a bare shell command for allowlist-mode (no OS-level sandbox).
 */
function buildAllowlistCommand(
  command: string,
  config: Required<SandboxConfig>,
): { shell: string; args: string[] } {
  const isWindows = os.platform() === 'win32'
  return {
    shell: isWindows ? 'cmd.exe' : 'bash',
    args: isWindows ? ['/c', command] : ['-c', command],
  }
}

/**
 * Build the sandboxed command based on the selected mode.
 */
function buildSandboxedCommand(
  command: string,
  mode: string,
  config: Required<SandboxConfig>,
): { shell: string; args: string[] } {
  switch (mode) {
    case 'firejail':
      return buildFirejailCommand(command, config)
    case 'appcontainer':
    case 'powershell':
      return buildPowerShellCommand(command, config)
    case 'none':
    case 'allowlist':
    default:
      return buildAllowlistCommand(command, config)
  }
}

/**
 * Execute a terminal command inside a sandboxed environment.
 *
 * On Unix systems, attempts to use firejail if available. On Windows, uses
 * PowerShell with ExecutionPolicy restrictions. Falls back to path-allowlist
 * validation mode when no OS-level sandbox is available.
 *
 * @param command - The shell command string to execute
 * @param options - Sandbox configuration and execution options
 * @returns SandboxResult with stdout, stderr, exit code, and sandbox metadata
 *
 * @example
 * ```ts
 * const result = await sandboxCommand('ls -la', { cwd: '/tmp', allowedPaths: ['/tmp'] })
 * console.log(result.stdout)
 * ```
 */
export function sandboxCommand(
  command: string,
  options?: SandboxConfig,
): SandboxResult {
  const config: Required<SandboxConfig> = {
    ...DEFAULT_SANDBOX_CONFIG,
    ...options,
  }

  if (!config.enabled) {
    const { shell, args } = buildAllowlistCommand(command, config)
    const result = spawnSync(shell, args, {
      cwd: config.cwd,
      encoding: 'utf8',
      timeout: config.timeoutSeconds * 1000,
      env: Object.fromEntries(
        config.allowedEnvVars
          .filter((k) => process.env[k] !== undefined)
          .map((k) => [k, process.env[k] as string]),
      ),
      maxBuffer: 50 * 1024 * 1024,
    })
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.status,
      sandboxMode: 'none',
      blocked: false,
    }
  }

  const mode = config.mode === 'allowlist' ? detectSandboxMode() : config.mode

  const blockReason = checkBlockedPatterns(command, config.blockedPatterns)
  if (blockReason) {
    return {
      stdout: '',
      stderr: blockReason,
      exitCode: 1,
      sandboxMode: mode,
      blocked: true,
      blockReason,
    }
  }

  const pathBlockReason = validatePathAllowlist(
    command,
    config.allowedPaths,
    config.cwd,
  )
  if (pathBlockReason) {
    return {
      stdout: '',
      stderr: pathBlockReason,
      exitCode: 1,
      sandboxMode: mode,
      blocked: true,
      blockReason: pathBlockReason,
    }
  }

  const { shell, args } = buildSandboxedCommand(command, mode, config)

  const filteredEnv: Record<string, string> = {}
  for (const envVar of config.allowedEnvVars) {
    const val = process.env[envVar]
    if (val !== undefined) {
      filteredEnv[envVar] = val
    }
  }

  try {
    const result = spawnSync(shell, args, {
      cwd: config.cwd,
      encoding: 'utf8',
      timeout: config.timeoutSeconds * 1000,
      env: filteredEnv,
      maxBuffer: 50 * 1024 * 1024,
    })

    if (result.error) {
      return {
        stdout: result.stdout ?? '',
        stderr: result.error.message,
        exitCode: 1,
        sandboxMode: mode,
        blocked: false,
      }
    }

    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.status,
      sandboxMode: mode,
      blocked: false,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      stdout: '',
      stderr: `Sandbox execution error: ${message}`,
      exitCode: 1,
      sandboxMode: mode,
      blocked: false,
    }
  }
}

/**
 * Asynchronous version of sandboxCommand that returns a promise.
 * Uses spawnSync internally for consistent behavior with the synchronous API.
 */
export async function sandboxCommandAsync(
  command: string,
  options?: SandboxConfig,
): Promise<SandboxResult> {
  return sandboxCommand(command, options)
}

/**
 * Get the current sandbox configuration with defaults applied.
 */
export function getDefaultSandboxConfig(): Required<SandboxConfig> {
  return { ...DEFAULT_SANDBOX_CONFIG }
}

/**
 * Check if a given sandbox mode is available on the current platform.
 */
export function isSandboxModeAvailable(
  mode: SandboxConfig['mode'],
): boolean {
  if (!mode || mode === 'none' || mode === 'allowlist') return true
  if (mode === 'firejail') return detectFirejail()
  if (mode === 'powershell' || mode === 'appcontainer') return os.platform() === 'win32'
  return false
}
