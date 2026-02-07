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

function getConfigRoot(): string {
  return path.join(os.homedir(), '.config', 'levelcode')
}

export function getTeamsDir(): string {
  return path.join(getConfigRoot(), 'teams')
}

export function getTasksDir(teamName: string): string {
  return path.join(getConfigRoot(), 'tasks', teamName)
}

function getTeamDir(teamName: string): string {
  return path.join(getTeamsDir(), teamName)
}

function getTeamConfigPath(teamName: string): string {
  return path.join(getTeamDir(teamName), 'config.json')
}

function getInboxesDir(teamName: string): string {
  return path.join(getTeamDir(teamName), 'inboxes')
}

function getInboxPath(teamName: string, agentName: string): string {
  return path.join(getInboxesDir(teamName), `${agentName}.json`)
}

function getTaskPath(teamName: string, taskId: string): string {
  return path.join(getTasksDir(teamName), `${taskId}.json`)
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
  if (!result.success) {
    throw new Error(
      `Corrupted team config for "${teamName}": ${result.error.message}`
    )
  }
  return result.data
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
