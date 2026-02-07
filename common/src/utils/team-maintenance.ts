import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { TeamConfig, TeamTask, AgentStatus } from '../types/team-config'
import { teamConfigSchema, teamTaskSchema } from '../types/team-config-schemas'
import { loadTeamConfig, listTasks, getTeamsDir, getTasksDir, validateTeamName } from './team-fs'

function getConfigRoot(): string {
  return path.join(os.homedir(), '.config', 'levelcode')
}

function getTeamDir(teamName: string): string {
  validateTeamName(teamName)
  return path.join(getTeamsDir(), teamName)
}

function getInboxesDir(teamName: string): string {
  return path.join(getTeamDir(teamName), 'inboxes')
}

/**
 * Remove .lock files older than the given threshold (default 10 seconds).
 * Returns the list of lock file paths that were removed.
 */
export function cleanupStaleLocks(teamName: string, staleMs: number = 10_000): string[] {
  const removed: string[] = []
  const dirs = [getTeamDir(teamName), getTasksDir(teamName), getInboxesDir(teamName)]

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      continue
    }
    const entries = fs.readdirSync(dir)
    for (const entry of entries) {
      if (!entry.endsWith('.lock')) {
        continue
      }
      const lockPath = path.join(dir, entry)
      try {
        const content = fs.readFileSync(lockPath, 'utf-8')
        const lockTime = parseInt(content, 10)
        if (isNaN(lockTime) || Date.now() - lockTime > staleMs) {
          fs.unlinkSync(lockPath)
          removed.push(lockPath)
        }
      } catch {
        // Lock file may have disappeared between read and unlink
      }
    }
  }

  return removed
}

/**
 * Rebuild team config from task files if the config is corrupted or missing.
 * Returns the repaired config, or null if the team cannot be recovered.
 */
export function repairTeamConfig(teamName: string): TeamConfig | null {
  const teamDir = getTeamDir(teamName)
  const configPath = path.join(teamDir, 'config.json')

  // Try to load existing config and validate it
  let existingConfig: TeamConfig | null = null
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8')
      const parsed = JSON.parse(raw)
      const result = teamConfigSchema.safeParse(parsed)
      if (result.success) {
        // Config is valid, no repair needed
        return result.data as TeamConfig
      }
      // Config exists but is invalid - try to salvage fields
      existingConfig = parsed as Partial<TeamConfig> as TeamConfig
    } catch {
      // JSON parse failed - config is fully corrupted
    }
  }

  // Attempt to rebuild a minimal config from whatever we can recover
  const tasks = listTasks(teamName)
  const ownerNames = new Set<string>()
  let latestPhase = existingConfig?.phase ?? 'planning'
  for (const task of tasks) {
    if (task.owner) {
      ownerNames.add(task.owner)
    }
    if (task.phase) {
      latestPhase = task.phase
    }
  }

  const repairedConfig: TeamConfig = {
    name: existingConfig?.name ?? teamName,
    description: existingConfig?.description ?? `Repaired team: ${teamName}`,
    createdAt: existingConfig?.createdAt ?? Date.now(),
    leadAgentId: existingConfig?.leadAgentId ?? 'unknown',
    phase: latestPhase,
    members: existingConfig?.members ?? [],
    settings: existingConfig?.settings ?? {
      maxMembers: 20,
      autoAssign: true,
    },
  }

  // Ensure team directory exists and write the repaired config
  fs.mkdirSync(teamDir, { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(repairedConfig, null, 2))

  return repairedConfig
}

export interface PruneResult {
  archived: string[]
  archiveDir: string
}

/**
 * Archive completed tasks older than the given threshold.
 * Moves them to a `completed/` subdirectory under the tasks dir.
 * Returns the list of archived task IDs and the archive directory path.
 */
export function pruneCompletedTasks(teamName: string, olderThanMs: number): PruneResult {
  const tasksDir = getTasksDir(teamName)
  const archiveDir = path.join(tasksDir, 'completed')
  const archived: string[] = []

  if (!fs.existsSync(tasksDir)) {
    return { archived, archiveDir }
  }

  const now = Date.now()
  const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith('.json'))

  for (const file of files) {
    const filePath = path.join(tasksDir, file)
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const task = JSON.parse(raw) as TeamTask
      if (task.status === 'completed' && now - task.updatedAt > olderThanMs) {
        fs.mkdirSync(archiveDir, { recursive: true })
        fs.renameSync(filePath, path.join(archiveDir, file))
        archived.push(task.id)
      }
    } catch {
      // Skip files that cannot be parsed
    }
  }

  return { archived, archiveDir }
}

/**
 * Remove inbox files for agents that are not listed in the team config members.
 * Returns the list of orphaned inbox names that were removed.
 */
export function cleanupOrphanedInboxes(teamName: string): string[] {
  const config = loadTeamConfig(teamName)
  if (!config) {
    return []
  }

  const inboxesDir = getInboxesDir(teamName)
  if (!fs.existsSync(inboxesDir)) {
    return []
  }

  const memberNames = new Set(config.members.map((m) => m.name))
  const removed: string[] = []

  const files = fs.readdirSync(inboxesDir).filter((f) => f.endsWith('.json'))
  for (const file of files) {
    const agentName = file.replace(/\.json$/, '')
    if (!memberNames.has(agentName)) {
      const inboxPath = path.join(inboxesDir, file)
      try {
        fs.unlinkSync(inboxPath)
        removed.push(agentName)
      } catch {
        // File may have been removed concurrently
      }
    }
  }

  return removed
}

export interface TeamStats {
  totalTasks: number
  completedTasks: number
  activeMembers: number
  idleMembers: number
  currentPhase: string
  createdAt: number
  uptime: number
}

/**
 * Return summary statistics for a team.
 */
export function getTeamStats(teamName: string): TeamStats | null {
  const config = loadTeamConfig(teamName)
  if (!config) {
    return null
  }

  const tasks = listTasks(teamName)
  const completedTasks = tasks.filter((t) => t.status === 'completed').length

  const activeStatuses: AgentStatus[] = ['active', 'working']
  const idleStatuses: AgentStatus[] = ['idle']
  const activeMembers = config.members.filter((m) => activeStatuses.includes(m.status)).length
  const idleMembers = config.members.filter((m) => idleStatuses.includes(m.status)).length

  return {
    totalTasks: tasks.length,
    completedTasks,
    activeMembers,
    idleMembers,
    currentPhase: config.phase,
    createdAt: config.createdAt,
    uptime: Date.now() - config.createdAt,
  }
}

export interface IntegrityIssue {
  type: 'missing_config' | 'invalid_config' | 'invalid_task' | 'orphaned_inbox' | 'stale_lock' | 'missing_inbox' | 'dangling_task_reference'
  message: string
  path?: string
}

/**
 * Check that config, tasks, and inboxes are consistent.
 * Returns a list of integrity issues found.
 */
export function validateTeamIntegrity(teamName: string): IntegrityIssue[] {
  const issues: IntegrityIssue[] = []
  const teamDir = getTeamDir(teamName)
  const configPath = path.join(teamDir, 'config.json')

  // 1. Check config exists and is valid
  if (!fs.existsSync(configPath)) {
    issues.push({
      type: 'missing_config',
      message: `Team config not found for "${teamName}"`,
      path: configPath,
    })
    return issues
  }

  let config: TeamConfig | null = null
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(raw)
    const result = teamConfigSchema.safeParse(parsed)
    if (!result.success) {
      issues.push({
        type: 'invalid_config',
        message: `Team config validation failed: ${result.error.message}`,
        path: configPath,
      })
    } else {
      config = result.data as TeamConfig
    }
  } catch (err) {
    issues.push({
      type: 'invalid_config',
      message: `Team config is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      path: configPath,
    })
  }

  // 2. Validate each task file
  const tasksDir = getTasksDir(teamName)
  if (fs.existsSync(tasksDir)) {
    const taskFiles = fs.readdirSync(tasksDir).filter((f) => f.endsWith('.json'))
    const taskIds = new Set<string>()

    for (const file of taskFiles) {
      const taskPath = path.join(tasksDir, file)
      try {
        const raw = fs.readFileSync(taskPath, 'utf-8')
        const parsed = JSON.parse(raw)
        const result = teamTaskSchema.safeParse(parsed)
        if (!result.success) {
          issues.push({
            type: 'invalid_task',
            message: `Task file "${file}" failed validation: ${result.error.message}`,
            path: taskPath,
          })
        } else {
          taskIds.add(result.data.id)
        }
      } catch (err) {
        issues.push({
          type: 'invalid_task',
          message: `Task file "${file}" is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
          path: taskPath,
        })
      }
    }

    // Check for dangling blockedBy/blocks references
    for (const file of taskFiles) {
      const taskPath = path.join(tasksDir, file)
      try {
        const raw = fs.readFileSync(taskPath, 'utf-8')
        const task = JSON.parse(raw) as TeamTask
        for (const ref of [...task.blockedBy, ...task.blocks]) {
          if (!taskIds.has(ref)) {
            issues.push({
              type: 'dangling_task_reference',
              message: `Task "${task.id}" references non-existent task "${ref}"`,
              path: taskPath,
            })
          }
        }
      } catch {
        // Already reported above
      }
    }
  }

  // 3. Check inbox consistency
  if (config) {
    const inboxesDir = getInboxesDir(teamName)
    const memberNames = new Set(config.members.map((m) => m.name))

    if (fs.existsSync(inboxesDir)) {
      const inboxFiles = fs.readdirSync(inboxesDir).filter((f) => f.endsWith('.json'))
      for (const file of inboxFiles) {
        const agentName = file.replace(/\.json$/, '')
        if (!memberNames.has(agentName)) {
          issues.push({
            type: 'orphaned_inbox',
            message: `Inbox exists for "${agentName}" who is not a team member`,
            path: path.join(inboxesDir, file),
          })
        }
      }
    }

    // Check for members without inboxes
    for (const member of config.members) {
      const inboxPath = path.join(inboxesDir, `${member.name}.json`)
      if (fs.existsSync(inboxesDir) && !fs.existsSync(inboxPath)) {
        issues.push({
          type: 'missing_inbox',
          message: `Member "${member.name}" does not have an inbox file`,
          path: inboxPath,
        })
      }
    }
  }

  // 4. Check for stale lock files
  const dirs = [teamDir, tasksDir, getInboxesDir(teamName)]
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      continue
    }
    const entries = fs.readdirSync(dir)
    for (const entry of entries) {
      if (!entry.endsWith('.lock')) {
        continue
      }
      const lockPath = path.join(dir, entry)
      try {
        const content = fs.readFileSync(lockPath, 'utf-8')
        const lockTime = parseInt(content, 10)
        if (isNaN(lockTime) || Date.now() - lockTime > 10_000) {
          issues.push({
            type: 'stale_lock',
            message: `Stale lock file found: ${entry}`,
            path: lockPath,
          })
        }
      } catch {
        issues.push({
          type: 'stale_lock',
          message: `Unreadable lock file: ${entry}`,
          path: lockPath,
        })
      }
    }
  }

  return issues
}

/**
 * Move a team to an archive directory instead of permanently deleting it.
 * Returns the archive path where the team was moved to.
 */
export function archiveTeam(teamName: string): string | null {
  const teamDir = getTeamDir(teamName)
  const tasksDir = getTasksDir(teamName)

  if (!fs.existsSync(teamDir)) {
    return null
  }

  const archiveRoot = path.join(getConfigRoot(), 'archive')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const archiveDir = path.join(archiveRoot, `${teamName}-${timestamp}`)

  fs.mkdirSync(archiveDir, { recursive: true })

  // Move team directory
  const archivedTeamDir = path.join(archiveDir, 'team')
  fs.renameSync(teamDir, archivedTeamDir)

  // Move tasks directory if it exists
  if (fs.existsSync(tasksDir)) {
    const archivedTasksDir = path.join(archiveDir, 'tasks')
    fs.renameSync(tasksDir, archivedTasksDir)
  }

  return archiveDir
}
