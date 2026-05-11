import type { SwarmState } from '../utils/swarm-state'
import type { TeamTask } from '../types/team-config'
import fs from 'fs'
import path from 'path'
import { getConfigDir } from '../utils/auth'

// ============================================================================
// Log Configuration
// ============================================================================

export interface DiffLogConfig {
  enabled: boolean           // Enable diff logging (default true)
  logDir: string           // Log directory (default: config/swarm/logs)
  maxLogsPerTask: number   // Max log entries per task (default 100)
  includeContext: number // Lines of context around diff (default 3)
  fileExtensions: string[] // Which files to log (.ts, .tsx, .js, .py)
}

const DEFAULT_DIFF_LOG_CONFIG: DiffLogConfig = {
  enabled: true,
  logDir: path.join(getConfigDir(), 'swarm', 'logs'),
  maxLogsPerTask: 100,
  includeContext: 3,
  fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'],
}

function getLogDir(): string {
  return path.join(getConfigDir(), 'swarm', 'logs')
}

// ============================================================================
// Log Entry
// ============================================================================

export interface DiffLogEntry {
  timestamp: number
  taskId: string
  agentId: string
  event: 'started' | 'completed' | 'failed' | 'blocked'
  file?: string
  diff?: string
  linesAdded?: number
  linesRemoved?: number
  summary?: string
}

// ============================================================================
// Diff Logging
// ============================================================================

export function logDiff(
  state: SwarmState,
  taskId: string,
  agentId: string,
  event: DiffLogEntry['event'],
  options?: {
    file?: string
    diff?: string
    linesAdded?: number
    linesRemoved?: number
    summary?: string
  },
): void {
  const config = DEFAULT_DIFF_LOG_CONFIG

  if (!config.enabled) return

  const entry: DiffLogEntry = {
    timestamp: Date.now(),
    taskId,
    agentId,
    event,
    ...options,
  }

  // Store in state
  if (!state.logs) {
    state.logs = []
  }
  state.logs.push(entry)

  // Trim if too many
  if (state.logs.length > config.maxLogsPerTask * state.tasks.length) {
    state.logs = state.logs.slice(-config.maxLogsPerTask)
  }

  // Also write to file
  writeLogToFile(state.teamName, entry)
}

async function writeLogToFile(teamName: string, entry: DiffLogEntry): Promise<void> {
  const dir = getLogDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const fileName = `${teamName}-${entry.taskId}.jsonl`
  const filePath = path.join(dir, fileName)

  const line = JSON.stringify(entry) + '\n'
  fs.appendFileSync(filePath, line, 'utf-8')
}

// ============================================================================
// Git Integration
// ============================================================================

import { execSync } from 'child_process'

export function getFileDiff(
  worktreePath: string,
  filePath: string,
  context = DEFAULT_DIFF_LOG_CONFIG.includeContext,
): string | null {
  try {
    const diff = execSync(
      `git diff -U${context} HEAD -- "${filePath}"`,
      { cwd: worktreePath, encoding: 'utf-8' },
    )
    return diff || null
  } catch {
    return null
  }
}

export function getStagedDiff(worktreePath: string): string {
  try {
    return execSync('git diff --staged', {
      cwd: worktreePath,
      encoding: 'utf-8',
    })
  } catch {
    return ''
  }
}

export function getUntrackedDiff(
  worktreePath: string,
  filePath: string,
): string | null {
  try {
    const content = fs.readFileSync(path.join(worktreePath, filePath), 'utf-8')
    return `+ ${filePath}\n${content}`
  } catch {
    return null
  }
}

// ============================================================================
// Parse Diff Stats
// ============================================================================

export function parseDiffStats(diff: string): {
  filesChanged: number
  linesAdded: number
  linesRemoved: number
  files: string[]
} {
  const stats = {
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    files: [] as string[],
  }

  const lines = diff.split('\n')
  let currentFile = ''

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      stats.filesChanged++
      const match = line.match(/b\/(.+)/)
      if (match) {
        currentFile = match[1]
        stats.files.push(currentFile)
      }
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      stats.linesAdded++
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      stats.linesRemoved++
    }
  }

  return stats
}

// ============================================================================
// Log Retrieval
// ============================================================================

export function getTaskLogs(
  teamName: string,
  taskId: string,
): DiffLogEntry[] {
  const fileName = `${teamName}-${taskId}.jsonl`
  const filePath = path.join(getLogDir(), fileName)

  if (!fs.existsSync(filePath)) {
    return []
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const entries: DiffLogEntry[] = []

  for (const line of content.split('\n')) {
    if (line.trim()) {
      try {
        entries.push(JSON.parse(line))
      } catch {
        // Skip invalid lines
      }
    }
  }

  return entries
}

export function getRecentLogs(
  teamName: string,
  limit = 20,
): DiffLogEntry[] {
  const dir = getLogDir()
  if (!fs.existsSync(dir)) {
    return []
  }

  const allEntries: DiffLogEntry[] = []
  const files = fs.readdirSync(dir).filter(f => f.startsWith(teamName))

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8')
    for (const line of content.split('\n')) {
      if (line.trim()) {
        try {
          allEntries.push(JSON.parse(line))
        } catch {
          // Skip
        }
      }
    }
  }

  return allEntries
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
}

// ============================================================================
// Formatting
// ============================================================================

export function formatLogEntry(entry: DiffLogEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString()
  const parts = [`[${time}]`, entry.event.toUpperCase()]

  if (entry.file) {
    parts.push(entry.file)
  }

  if (entry.linesAdded !== undefined || entry.linesRemoved !== undefined) {
    const stats = []
    if (entry.linesAdded) {
      stats.push(`+${entry.linesAdded}`)
    }
    if (entry.linesRemoved) {
      stats.push(`-${entry.linesRemoved}`)
    }
    parts.push(`(${stats.join(', ')})`)
  }

  if (entry.summary) {
    parts.push('-', entry.summary)
  }

  return parts.join(' ')
}

export function formatTaskLogSummary(
  teamName: string,
  taskId: string,
): string {
  const logs = getTaskLogs(teamName, taskId)

  if (logs.length === 0) {
    return `No logs for task ${taskId}`
  }

  const lines = [`=== Task ${taskId} Log Summary ===`, '']

  for (const entry of logs) {
    lines.push(formatLogEntry(entry))
  }

  return lines.join('\n')
}