import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { TeamConfig, TeamMember, TeamTask } from '../types/team-config'
import type { TeamProtocolMessage } from '../types/team-protocol'

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
  return JSON.parse(raw) as TeamConfig
}

export function saveTeamConfig(teamName: string, config: TeamConfig): void {
  const configPath = getTeamConfigPath(teamName)
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
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

export function addTeamMember(teamName: string, member: TeamMember): void {
  const config = loadTeamConfig(teamName)
  if (!config) {
    throw new Error(`Team "${teamName}" not found`)
  }
  config.members.push(member)
  saveTeamConfig(teamName, config)
}

export function removeTeamMember(teamName: string, agentId: string): void {
  const config = loadTeamConfig(teamName)
  if (!config) {
    throw new Error(`Team "${teamName}" not found`)
  }
  config.members = config.members.filter((m) => m.agentId !== agentId)
  saveTeamConfig(teamName, config)
}

export function createTask(teamName: string, task: TeamTask): void {
  const tasksDir = getTasksDir(teamName)
  fs.mkdirSync(tasksDir, { recursive: true })
  fs.writeFileSync(getTaskPath(teamName, task.id), JSON.stringify(task, null, 2))
}

export function updateTask(teamName: string, taskId: string, updates: Partial<TeamTask>): void {
  const taskPath = getTaskPath(teamName, taskId)
  if (!fs.existsSync(taskPath)) {
    throw new Error(`Task "${taskId}" not found in team "${teamName}"`)
  }
  const raw = fs.readFileSync(taskPath, 'utf-8')
  const task = JSON.parse(raw) as TeamTask
  const updated = { ...task, ...updates, updatedAt: Date.now() }
  fs.writeFileSync(taskPath, JSON.stringify(updated, null, 2))
}

export function listTasks(teamName: string): TeamTask[] {
  const tasksDir = getTasksDir(teamName)
  if (!fs.existsSync(tasksDir)) {
    return []
  }
  const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith('.json'))
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(tasksDir, f), 'utf-8')
    return JSON.parse(raw) as TeamTask
  })
}

export function getTask(teamName: string, taskId: string): TeamTask | null {
  const taskPath = getTaskPath(teamName, taskId)
  if (!fs.existsSync(taskPath)) {
    return null
  }
  const raw = fs.readFileSync(taskPath, 'utf-8')
  return JSON.parse(raw) as TeamTask
}

export function sendMessage(teamName: string, to: string, message: TeamProtocolMessage): void {
  const inboxesDir = getInboxesDir(teamName)
  fs.mkdirSync(inboxesDir, { recursive: true })
  const inboxPath = getInboxPath(teamName, to)
  let messages: TeamProtocolMessage[] = []
  if (fs.existsSync(inboxPath)) {
    const raw = fs.readFileSync(inboxPath, 'utf-8')
    messages = JSON.parse(raw) as TeamProtocolMessage[]
  }
  messages.push(message)
  fs.writeFileSync(inboxPath, JSON.stringify(messages, null, 2))
}

export function readInbox(teamName: string, agentName: string): TeamProtocolMessage[] {
  const inboxPath = getInboxPath(teamName, agentName)
  if (!fs.existsSync(inboxPath)) {
    return []
  }
  const raw = fs.readFileSync(inboxPath, 'utf-8')
  return JSON.parse(raw) as TeamProtocolMessage[]
}

export function clearInbox(teamName: string, agentName: string): void {
  const inboxPath = getInboxPath(teamName, agentName)
  if (fs.existsSync(inboxPath)) {
    fs.writeFileSync(inboxPath, JSON.stringify([], null, 2))
  }
}
