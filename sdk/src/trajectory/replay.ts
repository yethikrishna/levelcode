import * as fs from 'fs'
import * as path from 'path'

/**
 * A single step captured within a trajectory session.
 * Follows the event format from common/src/onecontext/trajectory-capture.ts.
 */
export interface TrajectoryStep {
  /** Index of this step within the trajectory */
  index: number
  /** Step event type */
  type: 'tool_call' | 'tool_result' | 'delta' | 'agent_step' | 'user_message' | 'assistant_message'
  /** Timestamp in milliseconds since epoch */
  ts: number
  /** Tool call/result id (when applicable) */
  id?: string
  /** Tool name (when applicable) */
  name?: string
  /** Tool arguments or result data */
  data?: unknown
  /** Text content for delta/message events */
  content?: string
  /** Associated session id */
  session?: string
}

/**
 * Metadata describing a saved trajectory session.
 */
export interface TrajectorySessionInfo {
  /** Unique session identifier */
  sessionId: string
  /** Working directory for the session */
  cwd: string
  /** When the session started (ISO timestamp) */
  startedAt: string
  /** When the session last had activity (ISO timestamp) */
  lastActivityAt: string
  /** Total number of steps captured */
  stepCount: number
  /** Optional user-provided label/title */
  label?: string
}

/**
 * Full trajectory data loaded from disk, including all steps.
 */
export interface Trajectory {
  /** Session metadata */
  sessionId: string
  cwd: string
  startedAt: string
  steps: TrajectoryStep[]
  label?: string
}

/**
 * Result of resuming from a specific step — contains the messages
 * needed to reconstruct agent state up to that point.
 */
export interface ReplayState {
  /** Messages up to (and including) the target step */
  messages: Array<Record<string, unknown>>
  /** Last tool calls made before the resume point */
  pendingToolCalls: Array<{ id: string; name: string; args: unknown }>
  /** The step index resumed from */
  resumedFromStep: number
  /** Session id of the source trajectory */
  sourceSessionId: string
}

/**
 * Result of branching from a step — similar to replay but with a new
 * user prompt appended to continue in a different direction.
 */
export interface BranchState extends ReplayState {
  /** The new branch session id */
  branchSessionId: string
  /** The new prompt that triggered the branch */
  branchPrompt: string
}

/**
 * Directory name within .levelcode where trajectories are stored.
 */
const TRAJECTORIES_DIR = 'trajectories'

/**
 * Manages cross-session trajectory persistence and replay.
 *
 * Trajectories are stored as JSON files under `.levelcode/trajectories/`
 * (one file per session). This class provides listing, loading, replay,
 * and branching capabilities.
 */
export class TrajectoryReplay {
  /**
   * Lists all saved trajectory sessions in the given working directory.
   *
   * @param cwd - Project root / working directory to look for trajectories in
   * @returns Array of session metadata, sorted by last activity (most recent first)
   */
  static listSessions(cwd: string): TrajectorySessionInfo[] {
    const dir = path.join(cwd, '.levelcode', TRAJECTORIES_DIR)
    if (!fs.existsSync(dir)) {
      return []
    }

    const entries = fs.readdirSync(dir)
    const sessions: TrajectorySessionInfo[] = []

    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      const filePath = path.join(dir, entry)
      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        const parsed = JSON.parse(raw) as Partial<Trajectory> & {
          steps?: TrajectoryStep[]
        }
        const stats = fs.statSync(filePath)
        sessions.push({
          sessionId: parsed.sessionId ?? path.basename(entry, '.json'),
          cwd: parsed.cwd ?? cwd,
          startedAt: parsed.startedAt ?? stats.birthtime.toISOString(),
          lastActivityAt:
            parsed.steps && parsed.steps.length > 0
              ? new Date(parsed.steps[parsed.steps.length - 1]!.ts).toISOString()
              : stats.mtime.toISOString(),
          stepCount: parsed.steps?.length ?? 0,
          label: parsed.label,
        })
      } catch {
        // Skip malformed files
      }
    }

    sessions.sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
    )
    return sessions
  }

  /**
   * Loads a full trajectory from disk.
   *
   * @param cwd - Working directory containing the .levelcode folder
   * @param sessionId - Session identifier to load
   * @returns The full trajectory with all steps
   * @throws If the trajectory file does not exist or cannot be parsed
   */
  static loadTrajectory(cwd: string, sessionId: string): Trajectory {
    const filePath = path.join(cwd, '.levelcode', TRAJECTORIES_DIR, `${sessionId}.json`)
    if (!fs.existsSync(filePath)) {
      throw new Error(`Trajectory session not found: ${sessionId}`)
    }
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Trajectory
    return parsed
  }

  /**
   * Creates a replay state from a specific step index.
   * Reconstructs the message history up to and including that step
   * so execution can resume from that point.
   *
   * @param trajectory - Loaded trajectory to replay from
   * @param stepIndex - Zero-based step index to resume from (inclusive)
   * @returns ReplayState containing messages and state up to that step
   */
  static replayFromStep(trajectory: Trajectory, stepIndex: number): ReplayState {
    if (stepIndex < 0 || stepIndex >= trajectory.steps.length) {
      throw new RangeError(
        `stepIndex ${stepIndex} out of range [0, ${trajectory.steps.length - 1}]`,
      )
    }

    const messages: Array<Record<string, unknown>> = []
    const pendingToolCalls: Array<{ id: string; name: string; args: unknown }> = []

    // Walk through steps up to the target index, building message history
    for (let i = 0; i <= stepIndex; i++) {
      const step = trajectory.steps[i]!
      switch (step.type) {
        case 'user_message':
          messages.push({
            role: 'user',
            content: step.content ?? '',
            ts: step.ts,
          })
          // Clear pending tool calls when new user message arrives
          pendingToolCalls.length = 0
          break
        case 'assistant_message':
        case 'delta':
          messages.push({
            role: 'assistant',
            content: step.content ?? '',
            ts: step.ts,
          })
          break
        case 'tool_call':
          pendingToolCalls.push({
            id: step.id ?? `call_${i}`,
            name: step.name ?? 'unknown',
            args: step.data,
          })
          break
        case 'tool_result':
          // Match up with a pending tool call
          const pendingIdx = pendingToolCalls.findIndex((c) => c.id === step.id)
          if (pendingIdx !== -1) {
            const call = pendingToolCalls.splice(pendingIdx, 1)[0]!
            messages.push({
              role: 'assistant',
              tool_calls: [
                {
                  id: call.id,
                  type: 'function',
                  function: { name: call.name, arguments: JSON.stringify(call.args) },
                },
              ],
              ts: step.ts,
            })
          }
          messages.push({
            role: 'tool',
            tool_call_id: step.id,
            content: typeof step.data === 'string' ? step.data : JSON.stringify(step.data),
            ts: step.ts,
          })
          break
        case 'agent_step':
          // Generic agent step — pass through as structured content
          messages.push({
            role: 'system',
            content: `[agent-step ${step.ts}] ${JSON.stringify(step.data ?? step.content ?? '')}`,
            ts: step.ts,
          })
          break
      }
    }

    return {
      messages,
      pendingToolCalls: [...pendingToolCalls],
      resumedFromStep: stepIndex,
      sourceSessionId: trajectory.sessionId,
    }
  }

  /**
   * Creates a new branch from a specific step, appending a new user prompt
   * to continue the trajectory in a different direction.
   *
   * @param trajectory - Loaded trajectory to branch from
   * @param stepIndex - Step index to branch from (inclusive)
   * @param newPrompt - The new user prompt to start the branch with
   * @returns BranchState with replayed history plus the new prompt
   */
  static branchFromStep(
    trajectory: Trajectory,
    stepIndex: number,
    newPrompt: string,
  ): BranchState {
    const replay = TrajectoryReplay.replayFromStep(trajectory, stepIndex)
    const branchSessionId = `${trajectory.sessionId}-branch-${Date.now()}`

    const messages = [
      ...replay.messages,
      {
        role: 'user',
        content: newPrompt,
        ts: Date.now(),
        branchedFrom: {
          sessionId: trajectory.sessionId,
          stepIndex,
        },
      },
    ]

    return {
      ...replay,
      messages,
      branchSessionId,
      branchPrompt: newPrompt,
    }
  }

  /**
   * Saves a trajectory session to disk.
   * Useful for tests or programmatic trajectory creation.
   *
   * @param cwd - Working directory to save into
   * @param trajectory - The trajectory (with steps) to persist
   */
  static saveTrajectory(cwd: string, trajectory: Trajectory): void {
    const dir = path.join(cwd, '.levelcode', TRAJECTORIES_DIR)
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${trajectory.sessionId}.json`)
    fs.writeFileSync(filePath, JSON.stringify(trajectory, null, 2), 'utf-8')
  }

  /**
   * Deletes a trajectory session from disk.
   *
   * @param cwd - Working directory
   * @param sessionId - Session id to delete
   * @returns true if the file existed and was deleted, false otherwise
   */
  static deleteTrajectory(cwd: string, sessionId: string): boolean {
    const filePath = path.join(cwd, '.levelcode', TRAJECTORIES_DIR, `${sessionId}.json`)
    if (!fs.existsSync(filePath)) return false
    fs.unlinkSync(filePath)
    return true
  }

  /**
   * Appends steps to an existing trajectory (or creates a new one).
   *
   * @param cwd - Working directory
   * @param sessionId - Session id to append to
   * @param steps - New steps to append
   * @param label - Optional label to set (only applied on creation)
   */
  static appendSteps(
    cwd: string,
    sessionId: string,
    steps: TrajectoryStep[],
    label?: string,
  ): Trajectory {
    const dir = path.join(cwd, '.levelcode', TRAJECTORIES_DIR)
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${sessionId}.json`)

    let trajectory: Trajectory
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      trajectory = JSON.parse(raw) as Trajectory
    } else {
      trajectory = {
        sessionId,
        cwd,
        startedAt: new Date().toISOString(),
        steps: [],
        label,
      }
    }

    const startIndex = trajectory.steps.length
    const indexedSteps = steps.map((step, i) => ({
      ...step,
      index: startIndex + i,
    }))
    trajectory.steps.push(...indexedSteps)

    fs.writeFileSync(filePath, JSON.stringify(trajectory, null, 2), 'utf-8')
    return trajectory
  }
}
