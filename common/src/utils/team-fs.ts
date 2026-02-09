import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { TeamConfig, TeamMember, TeamTask } from '../types/team-config'
import type { TeamProtocolMessage } from '../types/team-protocol'
import { withLock } from './file-lock'
import {
  teamConfigSchema,
  teamTaskSchema,
  teamProtocolMessageSchema,
} from '../types/team-config-schemas'
import { z } from 'zod'

// --- Input validation ---

const TEAM_NAME_RE = /^[a-zA-Z0-9_-]+$/
const TEAM_NAME_MAX = 50
const AGENT_NAME_RE = /^[a-zA-Z0-9_-]+$/
const AGENT_NAME_MAX = 100
const TASK_ID_RE = /^[0-9]+$/

export function validateTeamName(teamName: string): void {
  if (!teamName || typeof teamName !== 'string') {
    throw new Error('Team name is required and must be a string.')
  }
  if (teamName.length > TEAM_NAME_MAX) {
    throw new Error(`Team name must be at most ${TEAM_NAME_MAX} characters.`)
  }
  if (!TEAM_NAME_RE.test(teamName)) {
    throw new Error(
      'Team name may only contain letters, numbers, hyphens, and underscores.',
    )
  }
}

export function validateAgentName(agentName: string): void {
  if (!agentName || typeof agentName !== 'string') {
    throw new Error('Agent name is required and must be a string.')
  }
  if (agentName.length > AGENT_NAME_MAX) {
    throw new Error(`Agent name must be at most ${AGENT_NAME_MAX} characters.`)
  }
  if (!AGENT_NAME_RE.test(agentName)) {
    throw new Error(
      'Agent name may only contain letters, numbers, hyphens, and underscores.',
    )
  }
}

export function validateTaskId(taskId: string): void {
  if (!taskId || typeof taskId !== 'string') {
    throw new Error('Task ID is required and must be a string.')
  }
  if (!TASK_ID_RE.test(taskId)) {
    throw new Error('Task ID must be numeric.')
  }
}

/**
 * Ensure a resolved path is contained within an expected parent directory.
 * Prevents path traversal attacks via ../ or absolute path injection.
 */
function assertPathContained(resolvedPath: string, expectedParent: string): void {
  const normalizedPath = path.resolve(resolvedPath)
  const normalizedParent = path.resolve(expectedParent)
  if (!normalizedPath.startsWith(normalizedParent + path.sep) && normalizedPath !== normalizedParent) {
    throw new Error('Path traversal detected: resolved path escapes the expected directory.')
  }
}

// --- Path helpers ---

function getConfigRoot(): string {
  return path.join(os.homedir(), '.config', 'levelcode')
}

export function getTeamsDir(): string {
  return path.join(getConfigRoot(), 'teams')
}

export function getTasksDir(teamName: string): string {
  validateTeamName(teamName)
  const tasksDir = path.join(getConfigRoot(), 'tasks', teamName)
  assertPathContained(tasksDir, path.join(getConfigRoot(), 'tasks'))
  return tasksDir
}

function getTeamDir(teamName: string): string {
  validateTeamName(teamName)
  const teamDir = path.join(getTeamsDir(), teamName)
  assertPathContained(teamDir, getTeamsDir())
  return teamDir
}

function getTeamConfigPath(teamName: string): string {
  return path.join(getTeamDir(teamName), 'config.json')
}

function getInboxesDir(teamName: string): string {
  return path.join(getTeamDir(teamName), 'inboxes')
}

function getInboxPath(teamName: string, agentName: string): string {
  validateAgentName(agentName)
  const inboxPath = path.join(getInboxesDir(teamName), `${agentName}.json`)
  assertPathContained(inboxPath, getInboxesDir(teamName))
  return inboxPath
}

function getTaskPath(teamName: string, taskId: string): string {
  validateTaskId(taskId)
  const taskPath = path.join(getTasksDir(teamName), `${taskId}.json`)
  assertPathContained(taskPath, getTasksDir(teamName))
  return taskPath
}

export function createTeam(config: TeamConfig): void {
  const teamDir = getTeamDir(config.name)
  fs.mkdirSync(teamDir, { recursive: true })
  fs.mkdirSync(getInboxesDir(config.name), { recursive: true })
  fs.mkdirSync(getTasksDir(config.name), { recursive: true })
  fs.writeFileSync(getTeamConfigPath(config.name), JSON.stringify(config, null, 2))
}

export function loadTeamConfig(teamName: string): TeamConfig | null {
  const configPath = getTeamConfigPath(teamName)
  if (!fs.existsSync(configPath)) {
    return null
  }
  const raw = fs.readFileSync(configPath, 'utf-8')
  const parsed = JSON.parse(raw)
  const result = teamConfigSchema.safeParse(parsed)
  if (result.success) {
    return result.data
  }

  // Auto-repair: try to fix common issues like invalid roles, then re-validate
  try {
    const VALID_ROLES = [
      'coordinator', 'cto', 'vp-engineering', 'director', 'fellow',
      'distinguished-engineer', 'principal-engineer', 'senior-staff-engineer',
      'staff-engineer', 'manager', 'sub-manager', 'senior-engineer',
      'super-senior', 'mid-level-engineer', 'junior-engineer', 'researcher',
      'scientist', 'designer', 'product-lead', 'tester', 'reviewer',
      'intern', 'apprentice',
    ]
    if (Array.isArray(parsed?.members)) {
      for (const member of parsed.members) {
        if (member?.role && !VALID_ROLES.includes(member.role)) {
          // Map to closest valid role
          if (member.role.includes('director')) member.role = 'director'
          else if (member.role.includes('manager')) member.role = 'manager'
          else if (member.role.includes('engineer')) member.role = 'senior-engineer'
          else if (member.role.includes('lead')) member.role = 'product-lead'
          else member.role = 'mid-level-engineer'
        }
      }
    }
    const retryResult = teamConfigSchema.safeParse(parsed)
    if (retryResult.success) {
      // Save the repaired config back to disk
      fs.writeFileSync(configPath, JSON.stringify(retryResult.data, null, 2))
      return retryResult.data
    }
  } catch {
    // Auto-repair failed
  }

  // If still can't parse, return null instead of crashing
  return null
}

export async function saveTeamConfig(teamName: string, config: TeamConfig): Promise<void> {
  const configPath = getTeamConfigPath(teamName)
  await withLock(configPath, () => {
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  })
}

export function deleteTeam(teamName: string): void {
  const teamDir = getTeamDir(teamName)
  if (fs.existsSync(teamDir)) {
    fs.rmSync(teamDir, { recursive: true, force: true })
  }
  const tasksDir = getTasksDir(teamName)
  if (fs.existsSync(tasksDir)) {
    fs.rmSync(tasksDir, { recursive: true, force: true })
  }
}

export async function addTeamMember(teamName: string, member: TeamMember): Promise<void> {
  const configPath = getTeamConfigPath(teamName)
  await withLock(configPath, () => {
    const config = loadTeamConfig(teamName)
    if (!config) {
      throw new Error(`Team "${teamName}" not found`)
    }
    config.members.push(member)
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  })
}

export async function removeTeamMember(teamName: string, agentId: string): Promise<void> {
  const configPath = getTeamConfigPath(teamName)
  await withLock(configPath, () => {
    const config = loadTeamConfig(teamName)
    if (!config) {
      throw new Error(`Team "${teamName}" not found`)
    }
    config.members = config.members.filter((m) => m.agentId !== agentId)
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  })
}

export async function createTask(teamName: string, task: TeamTask): Promise<void> {
  const taskPath = getTaskPath(teamName, task.id)
  await withLock(taskPath, () => {
    const tasksDir = getTasksDir(teamName)
    fs.mkdirSync(tasksDir, { recursive: true })
    fs.writeFileSync(taskPath, JSON.stringify(task, null, 2))
  })
}

export async function updateTask(teamName: string, taskId: string, updates: Partial<TeamTask>): Promise<void> {
  const taskPath = getTaskPath(teamName, taskId)
  await withLock(taskPath, () => {
    if (!fs.existsSync(taskPath)) {
      throw new Error(`Task "${taskId}" not found in team "${teamName}"`)
    }
    const raw = fs.readFileSync(taskPath, 'utf-8')
    const task = JSON.parse(raw) as TeamTask
    const updated = { ...task, ...updates, updatedAt: Date.now() }
    fs.writeFileSync(taskPath, JSON.stringify(updated, null, 2))
  })
}

export function listTasks(teamName: string): TeamTask[] {
  const tasksDir = getTasksDir(teamName)
  if (!fs.existsSync(tasksDir)) {
    return []
  }
  const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith('.json'))
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(tasksDir, f), 'utf-8')
    const parsed = JSON.parse(raw)
    const result = teamTaskSchema.safeParse(parsed)
    if (!result.success) {
      throw new Error(
        `Corrupted task file "${f}" in team "${teamName}": ${result.error.message}`
      )
    }
    return result.data
  })
}

export function getTask(teamName: string, taskId: string): TeamTask | null {
  const taskPath = getTaskPath(teamName, taskId)
  if (!fs.existsSync(taskPath)) {
    return null
  }
  const raw = fs.readFileSync(taskPath, 'utf-8')
  const parsed = JSON.parse(raw)
  const result = teamTaskSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Corrupted task "${taskId}" in team "${teamName}": ${result.error.message}`
    )
  }
  return result.data
}

export async function sendMessage(teamName: string, to: string, message: TeamProtocolMessage): Promise<void> {
  const inboxPath = getInboxPath(teamName, to)
  await withLock(inboxPath, () => {
    const inboxesDir = getInboxesDir(teamName)
    fs.mkdirSync(inboxesDir, { recursive: true })
    let messages: TeamProtocolMessage[] = []
    if (fs.existsSync(inboxPath)) {
      const raw = fs.readFileSync(inboxPath, 'utf-8')
      messages = JSON.parse(raw) as TeamProtocolMessage[]
    }
    messages.push(message)
    fs.writeFileSync(inboxPath, JSON.stringify(messages, null, 2))
  })
}

export function readInbox(teamName: string, agentName: string): TeamProtocolMessage[] {
  const inboxPath = getInboxPath(teamName, agentName)
  if (!fs.existsSync(inboxPath)) {
    return []
  }
  const raw = fs.readFileSync(inboxPath, 'utf-8')
  const parsed = JSON.parse(raw)
  const result = z.array(teamProtocolMessageSchema).safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Corrupted inbox for "${agentName}" in team "${teamName}": ${result.error.message}`
    )
  }
  return result.data
}

export function clearInbox(teamName: string, agentName: string): void {
  const inboxPath = getInboxPath(teamName, agentName)
  if (fs.existsSync(inboxPath)) {
    fs.writeFileSync(inboxPath, JSON.stringify([], null, 2))
  }
}
