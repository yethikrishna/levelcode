import type { ToolName } from '../tools/constants'

/**
 * Named permission profiles that control which tools and filesystem paths
 * an agent is allowed to access during execution.
 */
export type PermissionProfileName = 'readonly' | 'sandboxed' | 'trusted' | 'godmode'

/**
 * A single permission profile specifying allowed tools, path patterns,
 * and whether sandboxed command execution is enforced.
 */
export interface PermissionProfile {
  /** Profile identifier */
  name: PermissionProfileName
  /** Human-readable description */
  description: string
  /** Tools explicitly allowed in this profile */
  allowedTools: ToolName[]
  /** Glob patterns for filesystem paths the agent may read */
  readPathPatterns: string[]
  /** Glob patterns for filesystem paths the agent may write to */
  writePathPatterns: string[]
  /** Glob patterns for paths that are always denied */
  denyPathPatterns: string[]
  /** Whether terminal commands must run through the sandbox wrapper */
  sandboxCommands: boolean
  /** Whether network access is permitted */
  allowNetwork: boolean
  /** Maximum concurrent terminal commands */
  maxConcurrentCommands: number
  /** Whether git destructive operations (reset --hard, push --force) are blocked */
  blockDestructiveGit: boolean
}

/**
 * Built-in read-only tools: no writes, no commands, no edits.
 */
const READONLY_TOOLS: ToolName[] = [
  'read_files',
  'read_subtree',
  'read_docs',
  'list_directory',
  'find_files',
  'glob',
  'code_search',
  'repo_map',
  'remember',
  'think_deeply',
  'end_turn',
  'ask_user',
  'lookup_agent_info',
  'web_search',
  'skill',
  'set_output',
  'set_messages',
  'add_message',
  'suggest_followups',
  'task_completed',
  'task_get',
  'task_list',
  'write_todos',
  'add_subgoal',
  'update_subgoal',
  'create_plan',
  'send_message',
]

/**
 * Default sandboxed profile: read access + sandboxed commands + file edits.
 * This is the default and recommended profile for most use cases.
 */
const SANDBOXED_TOOLS: ToolName[] = [
  ...READONLY_TOOLS,
  'write_file',
  'str_replace',
  'propose_str_replace',
  'propose_write_file',
  'run_terminal_command',
  'verify_changes',
  'run_file_change_hooks',
  'context_branch',
  'context_commit',
  'context_merge',
  'task_create',
  'task_update',
  'spawn_agents',
  'spawn_agent_inline',
  'browser_logs',
]

/**
 * Trusted profile: all tools except explicitly destructive operations.
 * Commands still run through sandbox but with fewer restrictions.
 */
const TRUSTED_TOOLS: ToolName[] = [
  ...SANDBOXED_TOOLS,
  'team_create',
  'team_delete',
  'team_list',
  'team_load',
  'team_save',
]

/**
 * Godmode profile: every available tool, no restrictions.
 * Use with extreme caution — only for fully trusted environments.
 */
const GODMODE_TOOLS: ToolName[] = [
  ...TRUSTED_TOOLS,
]

/**
 * Default deny patterns that apply across all profiles.
 */
const DEFAULT_DENY_PATTERNS = [
  '**/.env',
  '**/.env.*',
  '**/id_rsa',
  '**/id_ed25519',
  '**/.ssh/*',
  '**/.gnupg/*',
  '**/npmrc',
  '**/.netrc',
  '**/credentials*',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
]

/**
 * Read-only profile: only read, list, search, and grep tools.
 * No writes, no commands, no edits.
 */
const readonlyProfile: PermissionProfile = {
  name: 'readonly',
  description:
    'Read-only access. Can read files, list directories, search code, but cannot write, edit, or run commands.',
  allowedTools: READONLY_TOOLS,
  readPathPatterns: ['**/*'],
  writePathPatterns: [],
  denyPathPatterns: DEFAULT_DENY_PATTERNS,
  sandboxCommands: true,
  allowNetwork: false,
  maxConcurrentCommands: 0,
  blockDestructiveGit: true,
}

/**
 * Default sandboxed profile: read access + sandboxed terminal commands + file edits.
 * This is the recommended default for AI agent execution.
 */
const sandboxedProfile: PermissionProfile = {
  name: 'sandboxed',
  description:
    'Default safe profile. Read + write files, run sandboxed terminal commands, all non-destructive tools enabled.',
  allowedTools: SANDBOXED_TOOLS,
  readPathPatterns: ['**/*'],
  writePathPatterns: ['**/*'],
  denyPathPatterns: DEFAULT_DENY_PATTERNS,
  sandboxCommands: true,
  allowNetwork: false,
  maxConcurrentCommands: 2,
  blockDestructiveGit: true,
}

/**
 * Trusted profile: all tools except team management commands.
 * Commands are still sandboxed but with relaxed path restrictions.
 */
const trustedProfile: PermissionProfile = {
  name: 'trusted',
  description:
    'Trusted mode. All editor tools enabled with sandboxed commands. Network access permitted.',
  allowedTools: TRUSTED_TOOLS,
  readPathPatterns: ['**/*'],
  writePathPatterns: ['**/*'],
  denyPathPatterns: DEFAULT_DENY_PATTERNS,
  sandboxCommands: true,
  allowNetwork: true,
  maxConcurrentCommands: 4,
  blockDestructiveGit: true,
}

/**
 * Godmode profile: every tool, no restrictions.
 * Equivalent to running without safety checks — for fully trusted environments only.
 */
const godmodeProfile: PermissionProfile = {
  name: 'godmode',
  description:
    'Unrestricted god mode. All tools enabled, no sandboxing, no path restrictions. Use with extreme caution.',
  allowedTools: GODMODE_TOOLS,
  readPathPatterns: ['**/*'],
  writePathPatterns: ['**/*'],
  denyPathPatterns: [],
  sandboxCommands: false,
  allowNetwork: true,
  maxConcurrentCommands: 16,
  blockDestructiveGit: false,
}

const PROFILES: Record<PermissionProfileName, PermissionProfile> = {
  readonly: readonlyProfile,
  sandboxed: sandboxedProfile,
  trusted: trustedProfile,
  godmode: godmodeProfile,
}

/**
 * Retrieve a permission profile by name.
 *
 * @param name - The profile name to look up
 * @returns The corresponding PermissionProfile
 * @throws Error if the profile name is not recognized
 */
export function getProfile(name: PermissionProfileName): PermissionProfile {
  const profile = PROFILES[name]
  if (!profile) {
    throw new Error(
      `Unknown permission profile: ${name}. Valid profiles: ${Object.keys(PROFILES).join(', ')}`,
    )
  }
  return { ...profile }
}

/**
 * Check whether a tool is allowed under the given profile.
 *
 * @param profileName - Active permission profile
 * @param toolName - Tool to check
 * @returns true if the tool is allowed
 */
export function isToolAllowed(
  profileName: PermissionProfileName,
  toolName: ToolName | string,
): boolean {
  const profile = getProfile(profileName)
  return profile.allowedTools.includes(toolName as ToolName)
}

/**
 * Check whether a given filesystem path matches a glob pattern.
 * Uses simple micromatch-style glob matching for common patterns.
 */
function matchesGlobPattern(filePath: string, pattern: string): boolean {
  if (pattern === '**/*') return true

  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '<<GLOBSTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<GLOBSTAR>>/g, '.*')
    .replace(/\?/g, '.')

  try {
    const regex = new RegExp(`^${regexPattern}$`, 'i')
    const normalizedPath = filePath.replace(/\\/g, '/')
    return regex.test(normalizedPath) || regex.test(`./${normalizedPath}`)
  } catch {
    return false
  }
}

/**
 * Check whether a filesystem path is permitted for read access under the active profile.
 *
 * @param profileName - Active permission profile
 * @param filePath - Path to validate
 * @returns true if the path may be read
 */
export function isPathReadAllowed(
  profileName: PermissionProfileName,
  filePath: string,
): boolean {
  const profile = getProfile(profileName)

  for (const denyPattern of profile.denyPathPatterns) {
    if (matchesGlobPattern(filePath, denyPattern)) return false
  }

  for (const readPattern of profile.readPathPatterns) {
    if (matchesGlobPattern(filePath, readPattern)) return true
  }

  return false
}

/**
 * Check whether a filesystem path is permitted for write access under the active profile.
 *
 * @param profileName - Active permission profile
 * @param filePath - Path to validate
 * @returns true if the path may be written
 */
export function isPathWriteAllowed(
  profileName: PermissionProfileName,
  filePath: string,
): boolean {
  const profile = getProfile(profileName)

  for (const denyPattern of profile.denyPathPatterns) {
    if (matchesGlobPattern(filePath, denyPattern)) return false
  }

  for (const writePattern of profile.writePathPatterns) {
    if (matchesGlobPattern(filePath, writePattern)) return true
  }

  return false
}

/**
 * Check whether a terminal command should be sandboxed under the active profile.
 */
export function shouldSandboxCommands(profileName: PermissionProfileName): boolean {
  return getProfile(profileName).sandboxCommands
}

/**
 * Check whether network access is permitted under the active profile.
 */
export function isNetworkAllowed(profileName: PermissionProfileName): boolean {
  return getProfile(profileName).allowNetwork
}

/**
 * Check whether destructive git operations (reset --hard, push --force, clean -fd)
 * are blocked under the active profile.
 */
export function isDestructiveGitBlocked(profileName: PermissionProfileName): boolean {
  return getProfile(profileName).blockDestructiveGit
}

/**
 * List all available permission profile names.
 */
export function listProfiles(): PermissionProfileName[] {
  return Object.keys(PROFILES) as PermissionProfileName[]
}

/**
 * Validate and assert a tool call is permitted, returning an error message if denied.
 * Returns undefined if the call is permitted.
 */
export function validateToolCall(
  profileName: PermissionProfileName,
  toolName: ToolName | string,
  filePath?: string,
): string | undefined {
  if (!isToolAllowed(profileName, toolName)) {
    return `Tool "${toolName}" is not permitted under the "${profileName}" permission profile. Allowed tools: ${getProfile(profileName).allowedTools.join(', ')}`
  }

  if (filePath) {
    const writeTools: ToolName[] = ['write_file', 'str_replace', 'propose_str_replace', 'propose_write_file']
    if (writeTools.includes(toolName as ToolName)) {
      if (!isPathWriteAllowed(profileName, filePath)) {
        return `Write access denied for path "${filePath}" under the "${profileName}" profile.`
      }
    } else {
      if (!isPathReadAllowed(profileName, filePath)) {
        return `Read access denied for path "${filePath}" under the "${profileName}" profile.`
      }
    }
  }

  return undefined
}

export { PROFILES as permissionProfiles }
