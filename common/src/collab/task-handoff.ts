/**
 * Async Task Handoff
 *
 * Park/pickup model for pausing work on a task and resuming it later
 * (potentially by a different agent or after a process restart). A parked
 * task captures the full execution context — prompt, state, scratchpad
 * summaries, trajectory checkpoint, and modified files — so the pickup
 * agent can resume seamlessly.
 *
 * Parked tasks are serialized to `.levelcode/handoffs/<handoffId>.json`.
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// Types
// ============================================================================

/**
 * Snapshot of trajectory state at the handoff point.
 */
export interface TrajectoryCheckpoint {
  /** Session id of the source trajectory */
  sessionId: string
  /** Step index where handoff occurred */
  stepIndex: number
  /** Total steps completed so far */
  totalSteps: number
  /** Last N messages for context replay */
  recentMessages: Array<Record<string, unknown>>
  /** Pending tool calls that had not yet returned */
  pendingToolCalls?: Array<{ id: string; name: string; args: unknown }>
}

/**
 * A task parked for later pickup, including all context needed to resume.
 */
export interface HandoffTask {
  /** Unique handoff identifier */
  handoffId: string
  /** The original user prompt / task description */
  prompt: string
  /** Full context state (messages, memory, scratchpads, etc.) */
  contextState: Record<string, unknown>
  /** Per-agent scratchpad summaries at handoff time */
  scratchpadSummaries: Record<string, string>
  /** Trajectory checkpoint for replay/resumption */
  trajectoryCheckpoint?: TrajectoryCheckpoint
  /** Files that were modified before parking (relative paths) */
  filesModified: string[]
  /** Agent id that parked the task */
  parkedBy: string
  /** Optional agent id the task is intended for (null = any agent) */
  intendedFor: string | null
  /** When the task was parked (ISO timestamp) */
  parkedAt: string
  /** When the task was picked up (ISO timestamp, or null if still parked) */
  pickedUpAt: string | null
  /** Agent that picked up the task (null if unclaimed) */
  pickedUpBy: string | null
  /** Final result after completion (null if not yet completed) */
  result: unknown | null
  /** When the handoff was completed (ISO timestamp, or null) */
  completedAt: string | null
  /** Status */
  status: 'parked' | 'claimed' | 'completed' | 'abandoned'
  /** Optional tags/categories */
  tags?: string[]
  /** Optional priority (higher = more urgent) */
  priority?: number
}

/**
 * Lightweight metadata for listing parked tasks without loading full state.
 */
export interface HandoffTaskMeta {
  handoffId: string
  prompt: string
  parkedBy: string
  intendedFor: string | null
  parkedAt: string
  status: HandoffTask['status']
  filesModified: string[]
  tags?: string[]
  priority?: number
}

interface SerializedHandoff {
  handoffId: string
  prompt: string
  contextState: Record<string, unknown>
  scratchpadSummaries: Record<string, string>
  trajectoryCheckpoint?: TrajectoryCheckpoint
  filesModified: string[]
  parkedBy: string
  intendedFor: string | null
  parkedAt: string
  pickedUpAt: string | null
  pickedUpBy: string | null
  result: unknown | null
  completedAt: string | null
  status: HandoffTask['status']
  tags?: string[]
  priority?: number
}

// ============================================================================
// TaskHandoffManager
// ============================================================================

/**
 * Manages asynchronous task handoffs between agents (or agent restarts).
 *
 * An agent calls {@link parkTask} to serialize its current state to disk
 * before pausing. Another agent (or the same agent after restart) calls
 * {@link pickupTask} to restore the state and continue work. The manager
 * tracks lifecycle: parked → claimed → completed/abandoned.
 */
export class TaskHandoffManager {
  private handoffs: Map<string, HandoffTask> = new Map()
  private persistDir: string | null = null

  constructor() {}

  /**
   * Enable on-disk persistence. Handoffs are written to
   * `<cwd>/.levelcode/handoffs/<handoffId>.json`. Existing handoffs are
   * auto-loaded from disk.
   *
   * @param cwd - Working directory that contains (or will contain) `.levelcode/`
   */
  persistToDisk(cwd: string): void {
    this.persistDir = path.join(cwd, '.levelcode', 'handoffs').replace(/\\/g, '/')
    fs.mkdirSync(this.persistDir, { recursive: true })
    this.loadFromDisk()
  }

  /**
   * Park a task — serialize full context to disk and return a handoffId
   * that another agent can use to resume work.
   *
   * @param task - The task to park (handoffId is auto-generated if not provided)
   * @returns The handoffId (generated if not supplied)
   */
  parkTask(task: Omit<HandoffTask, 'handoffId' | 'parkedAt' | 'pickedUpAt' | 'pickedUpBy' | 'result' | 'completedAt' | 'status'> & { handoffId?: string }): string {
    const handoffId = task.handoffId ?? `ho_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
    const now = new Date().toISOString()

    const full: HandoffTask = {
      handoffId,
      prompt: task.prompt,
      contextState: task.contextState,
      scratchpadSummaries: task.scratchpadSummaries ?? {},
      trajectoryCheckpoint: task.trajectoryCheckpoint,
      filesModified: task.filesModified ?? [],
      parkedBy: task.parkedBy,
      intendedFor: task.intendedFor ?? null,
      parkedAt: now,
      pickedUpAt: null,
      pickedUpBy: null,
      result: null,
      completedAt: null,
      status: 'parked',
      tags: task.tags,
      priority: task.priority ?? 0,
    }

    this.handoffs.set(handoffId, full)
    this.flushToDisk(full)
    return handoffId
  }

  /**
   * Pick up (claim) a parked task, restoring its full context.
   *
   * @param handoffId - Identifier returned by parkTask()
   * @param agentId - Agent claiming the task
   * @returns The full HandoffTask with context state
   * @throws If the handoff doesn't exist or is already claimed/completed
   */
  pickupTask(handoffId: string, agentId?: string): HandoffTask {
    let task = this.handoffs.get(handoffId)
    if (!task && this.persistDir) {
      const filePath = path.join(this.persistDir, `${handoffId}.json`)
      if (fs.existsSync(filePath)) {
        task = this.readFromDisk(filePath)
        this.handoffs.set(handoffId, task)
      }
    }
    if (!task) throw new Error(`Handoff ${handoffId} not found`)
    if (task.status === 'completed') throw new Error(`Handoff ${handoffId} is already completed`)
    if (task.status === 'claimed' && task.pickedUpBy !== agentId) {
      throw new Error(`Handoff ${handoffId} is already claimed by ${task.pickedUpBy}`)
    }

    task.status = 'claimed'
    task.pickedUpAt = new Date().toISOString()
    task.pickedUpBy = agentId ?? null
    this.flushToDisk(task)
    return task
  }

  /**
   * List all parked (available) tasks as lightweight metadata.
   *
   * @param includeCompleted - If true, also include completed/abandoned tasks
   * @returns Array of task metadata sorted by priority (desc) then parkedAt (desc)
   */
  listParkedTasks(includeCompleted = false): HandoffTaskMeta[] {
    const tasks = Array.from(this.handoffs.values())
    const filtered = includeCompleted ? tasks : tasks.filter((t) => t.status === 'parked')
    return filtered
      .map((t) => ({
        handoffId: t.handoffId,
        prompt: t.prompt,
        parkedBy: t.parkedBy,
        intendedFor: t.intendedFor,
        parkedAt: t.parkedAt,
        status: t.status,
        filesModified: t.filesModified,
        tags: t.tags,
        priority: t.priority,
      }))
      .sort((a, b) => {
        const pa = a.priority ?? 0
        const pb = b.priority ?? 0
        if (pb !== pa) return pb - pa
        return b.parkedAt.localeCompare(a.parkedAt)
      })
  }

  /**
   * Mark a handoff as completed with a result.
   *
   * @param handoffId - The handoff to complete
   * @param result - Final result data (arbitrary serializable value)
   */
  completeHandoff(handoffId: string, result: unknown): void {
    const task = this.handoffs.get(handoffId)
    if (!task) throw new Error(`Handoff ${handoffId} not found`)
    task.status = 'completed'
    task.result = result
    task.completedAt = new Date().toISOString()
    this.flushToDisk(task)
  }

  /**
   * Mark a handoff as abandoned (e.g., agent gave up).
   *
   * @param handoffId - The handoff to abandon
   * @param reason - Optional reason for abandonment
   */
  abandonHandoff(handoffId: string, reason?: string): void {
    const task = this.handoffs.get(handoffId)
    if (!task) throw new Error(`Handoff ${handoffId} not found`)
    task.status = 'abandoned'
    task.result = reason ?? { abandoned: true }
    task.completedAt = new Date().toISOString()
    this.flushToDisk(task)
  }

  /**
   * Get a single handoff task by id.
   */
  getTask(handoffId: string): HandoffTask | undefined {
    return this.handoffs.get(handoffId)
  }

  /**
   * Delete a handoff (remove from memory and disk).
   */
  deleteHandoff(handoffId: string): void {
    this.handoffs.delete(handoffId)
    if (this.persistDir) {
      const filePath = path.join(this.persistDir, `${handoffId}.json`)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  private flushToDisk(task: HandoffTask): void {
    if (!this.persistDir) return
    const serialized: SerializedHandoff = {
      handoffId: task.handoffId,
      prompt: task.prompt,
      contextState: task.contextState,
      scratchpadSummaries: task.scratchpadSummaries,
      trajectoryCheckpoint: task.trajectoryCheckpoint,
      filesModified: task.filesModified,
      parkedBy: task.parkedBy,
      intendedFor: task.intendedFor,
      parkedAt: task.parkedAt,
      pickedUpAt: task.pickedUpAt,
      pickedUpBy: task.pickedUpBy,
      result: task.result,
      completedAt: task.completedAt,
      status: task.status,
      tags: task.tags,
      priority: task.priority,
    }
    const filePath = path.join(this.persistDir, `${task.handoffId}.json`)
    fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2), 'utf-8')
  }

  private readFromDisk(filePath: string): HandoffTask {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as SerializedHandoff
    return { ...data }
  }

  private loadFromDisk(): void {
    if (!this.persistDir) return
    if (!fs.existsSync(this.persistDir)) return
    const files = fs.readdirSync(this.persistDir).filter((f) => f.endsWith('.json'))
    for (const f of files) {
      try {
        const task = this.readFromDisk(path.join(this.persistDir, f))
        this.handoffs.set(task.handoffId, task)
      } catch {
        // Skip corrupt files
      }
    }
  }
}

let defaultManager: TaskHandoffManager | null = null

export function getDefaultTaskHandoffManager(): TaskHandoffManager {
  if (!defaultManager) defaultManager = new TaskHandoffManager()
  return defaultManager
}

export function resetDefaultTaskHandoffManager(): void {
  defaultManager = null
}
