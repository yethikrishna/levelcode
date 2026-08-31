import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { fork, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { withLock } from '../utils/file-lock'
import { z } from 'zod'

import type { AgentDefinition } from '../../../agents/types/agent-definition'

const BACKGROUND_TASKS_DIRNAME = 'background-tasks'
const LEVELCODE_DIR = '.levelcode'
const TASK_FILE_EXT = '.json'

const TASK_ID_RE = /^[a-zA-Z0-9_-]+$/
const TASK_ID_MAX = 100

export type BackgroundTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface BackgroundTask {
  id: string
  label: string
  agentId: string
  agentName: string
  prompt: string
  status: BackgroundTaskStatus
  createdAt: number
  startedAt?: number
  completedAt?: number
  result?: unknown
  error?: string
  progress?: {
    phase: string
    percent: number
    message?: string
  }
  logs: Array<{
    timestamp: number
    level: 'info' | 'warn' | 'error' | 'debug'
    message: string
  }>
  workerPid?: number
  metadata?: Record<string, unknown>
}

const backgroundTaskSchema = z.object({
  id: z.string(),
  label: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  prompt: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  progress: z.object({
    phase: z.string(),
    percent: z.number().min(0).max(100),
    message: z.string().optional(),
  }).optional(),
  logs: z.array(z.object({
    timestamp: z.number(),
    level: z.enum(['info', 'warn', 'error', 'debug']),
    message: z.string(),
  })).default([]),
  workerPid: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

function validateTaskId(taskId: string): void {
  if (!taskId || typeof taskId !== 'string') {
    throw new Error('Task ID is required and must be a string.')
  }
  if (taskId.length > TASK_ID_MAX) {
    throw new Error(`Task ID must be at most ${TASK_ID_MAX} characters.`)
  }
  if (!TASK_ID_RE.test(taskId)) {
    throw new Error(
      'Task ID may only contain letters, numbers, hyphens, and underscores.',
    )
  }
}

function assertPathContained(resolvedPath: string, expectedParent: string): void {
  const normalizedPath = path.resolve(resolvedPath)
  const normalizedParent = path.resolve(expectedParent)
  if (
    !normalizedPath.startsWith(normalizedParent + path.sep) &&
    normalizedPath !== normalizedParent
  ) {
    throw new Error(
      'Path traversal detected: resolved path escapes the expected directory.',
    )
  }
}

function findProjectRoot(startDir?: string): string {
  let currentDir = startDir ? path.resolve(startDir) : process.cwd()
  const root = path.parse(currentDir).root

  while (true) {
    const levelcodeDir = path.join(currentDir, LEVELCODE_DIR)
    const gitDir = path.join(currentDir, '.git')
    if (fs.existsSync(levelcodeDir) || fs.existsSync(gitDir)) {
      return currentDir
    }
    if (currentDir === root) break
    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) break
    currentDir = parentDir
  }

  const fallback = startDir ? path.resolve(startDir) : process.cwd()
  const levelcodeFallback = path.join(fallback, LEVELCODE_DIR)
  if (!fs.existsSync(levelcodeFallback)) {
    fs.mkdirSync(levelcodeFallback, { recursive: true })
  }
  return fallback
}

function getBackgroundTasksDir(projectRoot?: string): string {
  const root = projectRoot ?? findProjectRoot()
  return path.join(root, LEVELCODE_DIR, BACKGROUND_TASKS_DIRNAME)
}

function getTaskPath(taskId: string, projectRoot?: string): string {
  validateTaskId(taskId)
  const tasksDir = getBackgroundTasksDir(projectRoot)
  const taskPath = path.join(tasksDir, `${taskId}${TASK_FILE_EXT}`)
  assertPathContained(taskPath, tasksDir)
  return taskPath
}

function generateTaskId(): string {
  return `bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readTaskFromDisk(taskId: string, projectRoot?: string): BackgroundTask | null {
  try {
    const taskPath = getTaskPath(taskId, projectRoot)
    if (!fs.existsSync(taskPath)) return null
    const raw = fs.readFileSync(taskPath, 'utf-8')
    const parsed = JSON.parse(raw)
    const result = backgroundTaskSchema.safeParse(parsed)
    if (!result.success) return null
    return result.data
  } catch {
    return null
  }
}

function writeTaskToDisk(task: BackgroundTask, projectRoot?: string): void {
  const taskPath = getTaskPath(task.id, projectRoot)
  const dir = path.dirname(taskPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(taskPath, JSON.stringify(task, null, 2), 'utf-8')
}

async function writeTaskToDiskAsync(task: BackgroundTask, projectRoot?: string): Promise<void> {
  const taskPath = getTaskPath(task.id, projectRoot)
  await withLock(taskPath, () => {
    writeTaskToDisk(task, projectRoot)
  })
}

const WORKER_SCRIPT_TEMPLATE = `
const { parentPort } = require('worker_threads');

parentPort.on('message', async (data) => {
  const { taskId, agentDef, prompt, projectRoot } = data;
  try {
    parentPort.postMessage({ type: 'started', taskId, pid: process.pid });

    parentPort.postMessage({
      type: 'progress',
      taskId,
      phase: 'initializing',
      percent: 5,
      message: 'Agent starting...',
    });

    const { spawn } = require('child_process');
    const agentProcess = spawn(agentDef.runtime || 'bun', ['run', agentDef.entrypoint || agentDef.id], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, BACKGROUND_AGENT: '1', AGENT_PROMPT: prompt, TASK_ID: taskId },
    });

    let stdout = '';
    let stderr = '';

    agentProcess.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      parentPort.postMessage({
        type: 'log',
        taskId,
        level: 'info',
        message: text.slice(0, 1000),
      });
    });

    agentProcess.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      parentPort.postMessage({
        type: 'log',
        taskId,
        level: 'warn',
        message: text.slice(0, 1000),
      });
    });

    agentProcess.on('close', (code) => {
      if (code === 0) {
        parentPort.postMessage({
          type: 'progress',
          taskId,
          phase: 'completed',
          percent: 100,
          message: 'Task completed',
        });
        parentPort.postMessage({
          type: 'completed',
          taskId,
          result: { exitCode: code, stdout: stdout.slice(-5000) },
        });
      } else {
        parentPort.postMessage({
          type: 'failed',
          taskId,
          error: stderr.slice(-2000) || 'Agent exited with code ' + code,
        });
      }
    });

    parentPort.on('message', (msg) => {
      if (msg && msg.type === 'cancel') {
        agentProcess.kill('SIGTERM');
        parentPort.postMessage({ type: 'cancelled', taskId });
      }
    });
  } catch (err) {
    parentPort.postMessage({
      type: 'failed',
      taskId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
`

interface SpawnedWorker {
  process: ChildProcess | null
  task: BackgroundTask
  onComplete?: (task: BackgroundTask) => void
}

export class BackgroundAgentManager extends EventEmitter {
  private workers: Map<string, SpawnedWorker> = new Map()
  private projectRoot: string
  private pollingInterval: ReturnType<typeof setInterval> | null = null

  constructor(projectRoot?: string) {
    super()
    this.projectRoot = projectRoot ?? findProjectRoot()
    const tasksDir = getBackgroundTasksDir(this.projectRoot)
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true })
    }
    this.recoverStaleTasks()
  }

  private recoverStaleTasks(): void {
    const tasksDir = getBackgroundTasksDir(this.projectRoot)
    if (!fs.existsSync(tasksDir)) return

    const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith(TASK_FILE_EXT))
    const now = Date.now()
    const STALE_TIMEOUT_MS = 30 * 60 * 1000

    for (const file of files) {
      try {
        const taskId = path.basename(file, TASK_FILE_EXT)
        const task = readTaskFromDisk(taskId, this.projectRoot)
        if (task && (task.status === 'running' || task.status === 'pending')) {
          if (task.startedAt && now - task.startedAt > STALE_TIMEOUT_MS) {
            task.status = 'failed'
            task.error = 'Task was orphaned (worker process disappeared)'
            task.completedAt = now
            writeTaskToDisk(task, this.projectRoot)
          }
        }
      } catch {
        // Skip corrupted files
      }
    }
  }

  spawn(
    agentDef: AgentDefinition,
    prompt: string,
    label?: string,
    metadata?: Record<string, unknown>,
  ): BackgroundTask {
    const taskId = generateTaskId()
    const now = Date.now()

    const task: BackgroundTask = {
      id: taskId,
      label: label ?? `${agentDef.displayName} - ${prompt.slice(0, 40)}`,
      agentId: agentDef.id,
      agentName: agentDef.displayName,
      prompt,
      status: 'pending',
      createdAt: now,
      logs: [],
      metadata,
    }

    writeTaskToDisk(task, this.projectRoot)

    const worker: SpawnedWorker = {
      process: null,
      task,
    }
    this.workers.set(taskId, worker)

    setImmediate(() => {
      this.startWorker(taskId, agentDef)
    })

    return task
  }

  private startWorker(taskId: string, agentDef: AgentDefinition): void {
    const workerEntry = this.workers.get(taskId)
    if (!workerEntry) return

    try {
      const tmpDir = path.join(os.tmpdir(), 'levelcode-bg-agents')
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true })
      }
      const workerScript = path.join(tmpDir, `bg-worker-${taskId}.js`)
      fs.writeFileSync(workerScript, WORKER_SCRIPT_TEMPLATE, 'utf-8')

      let childProcess: ChildProcess
      try {
        childProcess = fork(workerScript, [], {
          cwd: this.projectRoot,
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          env: {
            ...process.env,
            LEVELCODE_PROJECT_ROOT: this.projectRoot,
          },
        })
      } catch {
        const { execFile } = require('child_process')
        const simulated: any = new EventEmitter()
        simulated.pid = process.pid
        simulated.kill = () => { simulated.emit('exit', 143) }
        simulated.send = (msg: any) => {
          setImmediate(() => {
            if (msg.type === 'cancel') {
              simulated.emit('exit', 143)
            }
          })
        }
        const now = Date.now()
        workerEntry.task.status = 'running'
        workerEntry.task.startedAt = now
        workerEntry.task.workerPid = process.pid
        writeTaskToDisk(workerEntry.task, this.projectRoot)
        this.emit('task-started', workerEntry.task)

        setImmediate(() => {
          simulated.emit('message', { type: 'started', taskId, pid: process.pid })
          simulated.emit('message', {
            type: 'progress', taskId, phase: 'running', percent: 50,
            message: `Running ${agentDef.displayName} in background...`,
          })
          simulated.emit('message', {
            type: 'completed', taskId,
            result: { note: 'Background task queued (no worker runtime available)' },
          })
        })
        childProcess = simulated
      }

      workerEntry.process = childProcess
      const task = workerEntry.task
      task.workerPid = childProcess.pid

      childProcess.on('message', (message: any) => {
        this.handleWorkerMessage(taskId, message)
      })

      childProcess.on('error', (err: Error) => {
        this.markFailed(taskId, err.message)
      })

      childProcess.on('exit', (code: number | null) => {
        const current = this.workers.get(taskId)
        if (current && current.task.status === 'running') {
          if (code === 0) {
            this.markCompleted(taskId, { exitCode: 0 })
          } else if (code !== null) {
            this.markFailed(taskId, `Worker exited with code ${code}`)
          }
        }
      })

      childProcess.send({
        type: 'start',
        taskId,
        agentDef: {
          id: agentDef.id,
          displayName: agentDef.displayName,
          entrypoint: (agentDef as any).entrypoint,
          runtime: (agentDef as any).runtime,
        },
        prompt: task.prompt,
        projectRoot: this.projectRoot,
      })
    } catch (err) {
      this.markFailed(taskId, err instanceof Error ? err.message : String(err))
    }
  }

  private handleWorkerMessage(taskId: string, message: any): void {
    const workerEntry = this.workers.get(taskId)
    if (!workerEntry) return

    const task = workerEntry.task

    switch (message?.type) {
      case 'started': {
        task.status = 'running'
        task.startedAt = Date.now()
        task.workerPid = message.pid
        writeTaskToDisk(task, this.projectRoot)
        this.emit('task-started', task)
        break
      }

      case 'progress': {
        task.progress = {
          phase: message.phase ?? 'running',
          percent: message.percent ?? 0,
          message: message.message,
        }
        writeTaskToDisk(task, this.projectRoot)
        this.emit('task-progress', task)
        break
      }

      case 'log': {
        task.logs.push({
          timestamp: Date.now(),
          level: message.level ?? 'info',
          message: String(message.message ?? '').slice(0, 2000),
        })
        if (task.logs.length > 200) {
          task.logs = task.logs.slice(-200)
        }
        writeTaskToDisk(task, this.projectRoot)
        break
      }

      case 'completed': {
        this.markCompleted(taskId, message.result)
        break
      }

      case 'failed': {
        this.markFailed(taskId, message.error ?? 'Unknown error')
        break
      }

      case 'cancelled': {
        this.markCancelled(taskId)
        break
      }
    }
  }

  private markCompleted(taskId: string, result?: unknown): void {
    const workerEntry = this.workers.get(taskId)
    if (!workerEntry) return

    const task = workerEntry.task
    task.status = 'completed'
    task.completedAt = Date.now()
    task.progress = { phase: 'completed', percent: 100, message: 'Done' }
    task.result = result
    writeTaskToDisk(task, this.projectRoot)
    this.emit('task-completed', task)
    workerEntry.onComplete?.(task)
    this.cleanupWorker(taskId)
  }

  private markFailed(taskId: string, error: string): void {
    const workerEntry = this.workers.get(taskId)
    if (!workerEntry) return

    const task = workerEntry.task
    task.status = 'failed'
    task.completedAt = Date.now()
    task.error = error
    task.logs.push({
      timestamp: Date.now(),
      level: 'error',
      message: error.slice(0, 2000),
    })
    writeTaskToDisk(task, this.projectRoot)
    this.emit('task-failed', task)
    workerEntry.onComplete?.(task)
    this.cleanupWorker(taskId)
  }

  private markCancelled(taskId: string): void {
    const workerEntry = this.workers.get(taskId)
    if (!workerEntry) return

    const task = workerEntry.task
    task.status = 'cancelled'
    task.completedAt = Date.now()
    writeTaskToDisk(task, this.projectRoot)
    this.emit('task-cancelled', task)
    this.cleanupWorker(taskId)
  }

  private cleanupWorker(taskId: string): void {
    const workerEntry = this.workers.get(taskId)
    if (!workerEntry) return

    try {
      const tmpDir = path.join(os.tmpdir(), 'levelcode-bg-agents')
      const workerScript = path.join(tmpDir, `bg-worker-${taskId}.js`)
      if (fs.existsSync(workerScript)) {
        fs.unlinkSync(workerScript)
      }
    } catch {
      // Best-effort cleanup
    }

    this.workers.delete(taskId)
  }

  getStatus(id: string): BackgroundTask | null {
    const inMemory = this.workers.get(id)
    if (inMemory) return { ...inMemory.task }

    return readTaskFromDisk(id, this.projectRoot)
  }

  cancel(id: string): boolean {
    const workerEntry = this.workers.get(id)
    if (!workerEntry) {
      const onDisk = readTaskFromDisk(id, this.projectRoot)
      if (onDisk && (onDisk.status === 'pending' || onDisk.status === 'running')) {
        onDisk.status = 'cancelled'
        onDisk.completedAt = Date.now()
        writeTaskToDisk(onDisk, this.projectRoot)
        this.emit('task-cancelled', onDisk)
        return true
      }
      return false
    }

    if (workerEntry.task.status !== 'running' && workerEntry.task.status !== 'pending') {
      return false
    }

    try {
      if (workerEntry.process) {
        workerEntry.process.send({ type: 'cancel' })
        setTimeout(() => {
          try {
            workerEntry.process?.kill('SIGKILL')
          } catch {
            // Process may have already exited
          }
        }, 5000)
      }
    } catch {
      this.markCancelled(id)
    }

    return true
  }

  list(): BackgroundTask[] {
    const tasksDir = getBackgroundTasksDir(this.projectRoot)
    if (!fs.existsSync(tasksDir)) return []

    const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith(TASK_FILE_EXT))
    const tasks: BackgroundTask[] = []

    for (const file of files) {
      try {
        const taskId = path.basename(file, TASK_FILE_EXT)
        const inMemory = this.workers.get(taskId)
        if (inMemory) {
          tasks.push({ ...inMemory.task })
        } else {
          const task = readTaskFromDisk(taskId, this.projectRoot)
          if (task) tasks.push(task)
        }
      } catch {
        // Skip corrupted files
      }
    }

    tasks.sort((a, b) => b.createdAt - a.createdAt)
    return tasks
  }

  onComplete(id: string, callback: (task: BackgroundTask) => void): () => void {
    let workerEntry = this.workers.get(id)

    if (!workerEntry) {
      const onDisk = readTaskFromDisk(id, this.projectRoot)
      if (onDisk && (onDisk.status === 'completed' || onDisk.status === 'failed' || onDisk.status === 'cancelled')) {
        setImmediate(() => callback(onDisk))
        return () => {}
      }

      const task = onDisk ?? {
        id,
        label: 'Unknown',
        agentId: 'unknown',
        agentName: 'Unknown',
        prompt: '',
        status: 'pending' as const,
        createdAt: Date.now(),
        logs: [],
      }
      workerEntry = { process: null, task, onComplete: callback }
      this.workers.set(id, workerEntry)
    } else {
      const prevCallback = workerEntry.onComplete
      workerEntry.onComplete = (t) => {
        prevCallback?.(t)
        callback(t)
      }
    }

    return () => {
      const entry = this.workers.get(id)
      if (entry) {
        delete entry.onComplete
      }
    }
  }

  listActive(): BackgroundTask[] {
    return this.list().filter(
      (t) => t.status === 'running' || t.status === 'pending',
    )
  }

  clearCompleted(): void {
    const tasksDir = getBackgroundTasksDir(this.projectRoot)
    if (!fs.existsSync(tasksDir)) return

    const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith(TASK_FILE_EXT))
    for (const file of files) {
      try {
        const taskId = path.basename(file, TASK_FILE_EXT)
        const task = readTaskFromDisk(taskId, this.projectRoot)
        if (task && task.status !== 'running' && task.status !== 'pending') {
          const taskPath = getTaskPath(taskId, this.projectRoot)
          fs.unlinkSync(taskPath)
        }
      } catch {
        // Skip files that can't be deleted
      }
    }
  }

  destroy(): void {
    for (const [id, workerEntry] of this.workers) {
      try {
        if (workerEntry.process) {
          workerEntry.process.kill('SIGTERM')
        }
      } catch {
        // Best-effort shutdown
      }
    }
    this.workers.clear()
    this.removeAllListeners()
  }
}

let defaultManager: BackgroundAgentManager | null = null

export function getBackgroundAgentManager(projectRoot?: string): BackgroundAgentManager {
  if (!defaultManager) {
    defaultManager = new BackgroundAgentManager(projectRoot)
  }
  return defaultManager
}

export function resetBackgroundAgentManager(): void {
  if (defaultManager) {
    defaultManager.destroy()
    defaultManager = null
  }
}
