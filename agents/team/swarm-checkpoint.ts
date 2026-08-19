import * as fs from 'fs'
import * as path from 'path'
import { withLock } from '../../common/src/utils/file-lock'

import type {
  SwarmState,
  SwarmAgentState,
  SwarmTaskState,
  SwarmMetrics,
} from '../../common/src/utils/swarm-state'
import type { DevPhase } from '../../common/src/types/team-config'

const CHECKPOINTS_DIRNAME = 'swarm-checkpoints'
const LEVELCODE_DIR = '.levelcode'
const CHECKPOINT_FILE_EXT = '.json'
const LABEL_MAX_LENGTH = 200
const CHECKPOINT_ID_RE = /^[a-zA-Z0-9:._-]+$/

export interface SwarmCheckpoint {
  id: string
  label: string
  createdAt: number
  teamName: string
  phase: DevPhase
  snapshot: SwarmStateSnapshot
  description?: string
  createdBy?: string
  tags?: string[]
}

export interface SwarmStateSnapshot {
  version: 1
  teamName: string
  phase: DevPhase
  timestamp: number
  agents: SwarmAgentState[]
  tasks: SwarmTaskState[]
  metrics: SwarmMetrics
  messages?: Array<{
    id: string
    from: string
    to: string
    content: string
    timestamp: number
    type: string
  }>
  activeTaskId?: string
  coordinatorState?: Record<string, unknown>
  knowledge?: SwarmState['knowledge']
  checkpoint?: SwarmState['checkpoint']
  bible?: SwarmState['bible']
  healthWarnings?: string[]
  logs?: SwarmState['logs']
}

export interface CheckpointDiff {
  checkpointA: string
  checkpointB: string
  phaseChanged: boolean
  phaseFrom?: DevPhase
  phaseTo?: DevPhase
  agentsAdded: SwarmAgentState[]
  agentsRemoved: SwarmAgentState[]
  agentsStatusChanged: Array<{
    agentId: string
    from: SwarmAgentState['status']
    to: SwarmAgentState['status']
  }>
  tasksAdded: SwarmTaskState[]
  tasksRemoved: SwarmTaskState[]
  tasksStatusChanged: Array<{
    taskId: string
    from: SwarmTaskState['status']
    to: SwarmTaskState['status']
  }>
  metricsDelta: {
    tokens?: number
    tasksCompleted?: number
    tasksFailed?: number
    duration?: number
    healthScore?: number
  }
  summary: string[]
}

export interface CheckpointOptions {
  label?: string
  description?: string
  createdBy?: string
  tags?: string[]
  includeMessages?: boolean
  includeLogs?: boolean
}

function validateCheckpointId(id: string): void {
  if (!id || typeof id !== 'string') {
    throw new Error('Checkpoint ID is required and must be a string.')
  }
  if (!CHECKPOINT_ID_RE.test(id)) {
    throw new Error(
      'Checkpoint ID may only contain letters, numbers, colons, dots, hyphens, and underscores.',
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

function getCheckpointsDir(teamName: string, projectRoot?: string): string {
  const root = projectRoot ?? findProjectRoot()
  return path.join(root, LEVELCODE_DIR, CHECKPOINTS_DIRNAME, teamName)
}

function getCheckpointPath(id: string, teamName: string, projectRoot?: string): string {
  validateCheckpointId(id)
  const dir = getCheckpointsDir(teamName, projectRoot)
  const checkpointPath = path.join(dir, `${id}${CHECKPOINT_FILE_EXT}`)
  const normalizedPath = path.resolve(checkpointPath)
  const normalizedDir = path.resolve(dir)
  if (
    !normalizedPath.startsWith(normalizedDir + path.sep) &&
    normalizedPath !== normalizedDir
  ) {
    throw new Error('Path traversal detected in checkpoint ID.')
  }
  return checkpointPath
}

function generateCheckpointId(): string {
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const rand = Math.random().toString(36).slice(2, 6)
  return `cp-${timestamp}-${rand}`
}

function sanitizeLabel(label: string): string {
  return label.slice(0, LABEL_MAX_LENGTH).replace(/[<>:"/\\|?*]/g, '_')
}

function readCheckpointFromDisk(
  id: string,
  teamName: string,
  projectRoot?: string,
): SwarmCheckpoint | null {
  try {
    const checkpointPath = getCheckpointPath(id, teamName, projectRoot)
    if (!fs.existsSync(checkpointPath)) return null
    const raw = fs.readFileSync(checkpointPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed.id || !parsed.snapshot || parsed.snapshot.version !== 1) {
      return null
    }
    return parsed as SwarmCheckpoint
  } catch {
    return null
  }
}

function writeCheckpointToDisk(
  checkpoint: SwarmCheckpoint,
  teamName: string,
  projectRoot?: string,
): void {
  const checkpointPath = getCheckpointPath(checkpoint.id, teamName, projectRoot)
  const dir = path.dirname(checkpointPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf-8')
}

function captureSnapshot(
  state: SwarmState,
  options: CheckpointOptions = {},
): SwarmStateSnapshot {
  const snapshot: SwarmStateSnapshot = {
    version: 1,
    teamName: state.teamName,
    phase: state.phase,
    timestamp: Date.now(),
    agents: state.agents.map((a) => ({ ...a })),
    tasks: state.tasks.map((t) => ({ ...t })),
    metrics: { ...state.metrics },
    knowledge: state.knowledge ? [...state.knowledge] : undefined,
    checkpoint: state.checkpoint ? { ...state.checkpoint } : undefined,
    bible: state.bible ? JSON.parse(JSON.stringify(state.bible)) : undefined,
    healthWarnings: state.healthWarnings ? [...state.healthWarnings] : undefined,
  }

  if (options.includeLogs && state.logs) {
    snapshot.logs = state.logs.slice(-100)
  }

  return snapshot
}

export class SwarmCheckpointManager {
  private projectRoot: string
  private teamName: string

  constructor(teamName: string, projectRoot?: string) {
    this.teamName = teamName
    this.projectRoot = projectRoot ?? findProjectRoot()
    const dir = getCheckpointsDir(teamName, this.projectRoot)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  checkpoint(
    swarmState: SwarmState,
    labelOrOptions?: string | CheckpointOptions,
  ): SwarmCheckpoint {
    const options: CheckpointOptions =
      typeof labelOrOptions === 'string'
        ? { label: labelOrOptions }
        : labelOrOptions ?? {}

    const id = generateCheckpointId()
    const label = sanitizeLabel(options.label ?? `Checkpoint ${id}`)
    const now = Date.now()

    const snapshot = captureSnapshot(swarmState, options)

    const checkpoint: SwarmCheckpoint = {
      id,
      label,
      createdAt: now,
      teamName: this.teamName,
      phase: swarmState.phase,
      snapshot,
      description: options.description,
      createdBy: options.createdBy,
      tags: options.tags,
    }

    writeCheckpointToDisk(checkpoint, this.teamName, this.projectRoot)
    return checkpoint
  }

  async checkpointAsync(
    swarmState: SwarmState,
    labelOrOptions?: string | CheckpointOptions,
  ): Promise<SwarmCheckpoint> {
    const checkpoint = this.checkpoint(swarmState, labelOrOptions)
    const checkpointPath = getCheckpointPath(checkpoint.id, this.teamName, this.projectRoot)
    await withLock(checkpointPath, () => {
      writeCheckpointToDisk(checkpoint, this.teamName, this.projectRoot)
    })
    return checkpoint
  }

  getCheckpoint(id: string): SwarmCheckpoint | null {
    return readCheckpointFromDisk(id, this.teamName, this.projectRoot)
  }

  listCheckpoints(): SwarmCheckpoint[] {
    const dir = getCheckpointsDir(this.teamName, this.projectRoot)
    if (!fs.existsSync(dir)) return []

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(CHECKPOINT_FILE_EXT))

    const checkpoints: SwarmCheckpoint[] = []
    for (const file of files) {
      try {
        const id = path.basename(file, CHECKPOINT_FILE_EXT)
        const cp = readCheckpointFromDisk(id, this.teamName, this.projectRoot)
        if (cp) checkpoints.push(cp)
      } catch {
        // Skip corrupted files
      }
    }

    checkpoints.sort((a, b) => b.createdAt - a.createdAt)
    return checkpoints
  }

  getLatestCheckpoint(): SwarmCheckpoint | null {
    const all = this.listCheckpoints()
    return all.length > 0 ? all[0] : null
  }

  rollback(checkpointId: string): SwarmState | null {
    const checkpoint = readCheckpointFromDisk(
      checkpointId,
      this.teamName,
      this.projectRoot,
    )
    if (!checkpoint) return null

    const restoredState: SwarmState = {
      version: 1,
      teamName: checkpoint.teamName,
      phase: checkpoint.snapshot.phase,
      updatedAt: Date.now(),
      agents: checkpoint.snapshot.agents.map((a) => ({ ...a })),
      tasks: checkpoint.snapshot.tasks.map((t) => ({ ...t })),
      metrics: { ...checkpoint.snapshot.metrics },
      knowledge: checkpoint.snapshot.knowledge
        ? checkpoint.snapshot.knowledge.map((k) => ({ ...k }))
        : undefined,
      checkpoint: checkpoint.snapshot.checkpoint
        ? { ...checkpoint.snapshot.checkpoint }
        : undefined,
      bible: checkpoint.snapshot.bible
        ? JSON.parse(JSON.stringify(checkpoint.snapshot.bible))
        : undefined,
      healthWarnings: checkpoint.snapshot.healthWarnings
        ? [...checkpoint.snapshot.healthWarnings]
        : undefined,
      logs: checkpoint.snapshot.logs
        ? checkpoint.snapshot.logs.map((l) => ({ ...l }))
        : undefined,
    }

    return restoredState
  }

  async rollbackAndPersist(
    checkpointId: string,
    currentState: SwarmState,
  ): Promise<SwarmState | null> {
    const restored = this.rollback(checkpointId)
    if (!restored) return null

    const autoCheckpoint: SwarmCheckpoint = {
      id: generateCheckpointId(),
      label: `Auto-checkpoint before rollback to ${checkpointId}`,
      createdAt: Date.now(),
      teamName: this.teamName,
      phase: currentState.phase,
      snapshot: captureSnapshot(currentState),
      description: 'Automatically created before rollback',
      tags: ['auto', 'pre-rollback'],
    }
    writeCheckpointToDisk(autoCheckpoint, this.teamName, this.projectRoot)

    return restored
  }

  diffCheckpoints(
    checkpointIdA: string,
    checkpointIdB: string,
  ): CheckpointDiff | null {
    const a = readCheckpointFromDisk(checkpointIdA, this.teamName, this.projectRoot)
    const b = readCheckpointFromDisk(checkpointIdB, this.teamName, this.projectRoot)

    if (!a || !b) return null

    const agentMapA = new Map(a.snapshot.agents.map((ag) => [ag.agentId, ag]))
    const agentMapB = new Map(b.snapshot.agents.map((ag) => [ag.agentId, ag]))

    const agentsAdded: SwarmAgentState[] = []
    const agentsRemoved: SwarmAgentState[] = []
    const agentsStatusChanged: CheckpointDiff['agentsStatusChanged'] = []

    for (const [id, agentB] of agentMapB) {
      if (!agentMapA.has(id)) {
        agentsAdded.push(agentB)
      } else {
        const agentA = agentMapA.get(id)!
        if (agentA.status !== agentB.status) {
          agentsStatusChanged.push({
            agentId: id,
            from: agentA.status,
            to: agentB.status,
          })
        }
      }
    }
    for (const [id, agentA] of agentMapA) {
      if (!agentMapB.has(id)) {
        agentsRemoved.push(agentA)
      }
    }

    const taskMapA = new Map(a.snapshot.tasks.map((t) => [t.taskId, t]))
    const taskMapB = new Map(b.snapshot.tasks.map((t) => [t.taskId, t]))

    const tasksAdded: SwarmTaskState[] = []
    const tasksRemoved: SwarmTaskState[] = []
    const tasksStatusChanged: CheckpointDiff['tasksStatusChanged'] = []

    for (const [id, taskB] of taskMapB) {
      if (!taskMapA.has(id)) {
        tasksAdded.push(taskB)
      } else {
        const taskA = taskMapA.get(id)!
        if (taskA.status !== taskB.status) {
          tasksStatusChanged.push({
            taskId: id,
            from: taskA.status,
            to: taskB.status,
          })
        }
      }
    }
    for (const [id, taskA] of taskMapA) {
      if (!taskMapB.has(id)) {
        tasksRemoved.push(taskA)
      }
    }

    const phaseChanged = a.snapshot.phase !== b.snapshot.phase
    const metricsDelta = {
      tokens: b.snapshot.metrics.totalTokens - a.snapshot.metrics.totalTokens,
      tasksCompleted:
        b.snapshot.metrics.tasksCompleted - a.snapshot.metrics.tasksCompleted,
      tasksFailed:
        b.snapshot.metrics.tasksFailed - a.snapshot.metrics.tasksFailed,
      duration: b.snapshot.metrics.totalDuration - a.snapshot.metrics.totalDuration,
      healthScore:
        b.snapshot.metrics.healthScore - a.snapshot.metrics.healthScore,
    }

    const summary: string[] = []
    if (phaseChanged) {
      summary.push(`Phase: ${a.snapshot.phase} \u2192 ${b.snapshot.phase}`)
    }
    if (agentsAdded.length > 0) {
      summary.push(`Agents added: ${agentsAdded.length} (${agentsAdded.map((a) => a.name).join(', ')})`)
    }
    if (agentsRemoved.length > 0) {
      summary.push(`Agents removed: ${agentsRemoved.length}`)
    }
    if (agentsStatusChanged.length > 0) {
      summary.push(`Agents changed status: ${agentsStatusChanged.length}`)
    }
    if (tasksAdded.length > 0) {
      summary.push(`Tasks added: ${tasksAdded.length}`)
    }
    if (tasksRemoved.length > 0) {
      summary.push(`Tasks removed: ${tasksRemoved.length}`)
    }
    if (tasksStatusChanged.length > 0) {
      summary.push(`Tasks changed status: ${tasksStatusChanged.length}`)
    }
    if (metricsDelta.tokens !== 0) {
      summary.push(`Tokens: ${metricsDelta.tokens > 0 ? '+' : ''}${metricsDelta.tokens}`)
    }
    if (metricsDelta.healthScore !== 0) {
      summary.push(`Health: ${metricsDelta.healthScore > 0 ? '+' : ''}${metricsDelta.healthScore}`)
    }
    if (summary.length === 0) {
      summary.push('No changes between checkpoints.')
    }

    return {
      checkpointA: checkpointIdA,
      checkpointB: checkpointIdB,
      phaseChanged,
      phaseFrom: phaseChanged ? a.snapshot.phase : undefined,
      phaseTo: phaseChanged ? b.snapshot.phase : undefined,
      agentsAdded,
      agentsRemoved,
      agentsStatusChanged,
      tasksAdded,
      tasksRemoved,
      tasksStatusChanged,
      metricsDelta,
      summary,
    }
  }

  deleteCheckpoint(id: string): boolean {
    const checkpointPath = getCheckpointPath(id, this.teamName, this.projectRoot)
    if (!fs.existsSync(checkpointPath)) return false
    try {
      fs.unlinkSync(checkpointPath)
      return true
    } catch {
      return false
    }
  }

  pruneOldCheckpoints(maxCount: number = 20): number {
    const all = this.listCheckpoints()
    if (all.length <= maxCount) return 0

    const toDelete = all.slice(maxCount)
    let deleted = 0
    for (const cp of toDelete) {
      if (cp.tags?.includes('protected')) continue
      if (this.deleteCheckpoint(cp.id)) deleted++
    }
    return deleted
  }

  exportCheckpoint(id: string): string | null {
    const cp = this.getCheckpoint(id)
    if (!cp) return null
    return JSON.stringify(cp, null, 2)
  }

  importCheckpoint(json: string): SwarmCheckpoint | null {
    try {
      const parsed = JSON.parse(json) as SwarmCheckpoint
      if (!parsed.id || !parsed.snapshot) return null
      validateCheckpointId(parsed.id)
      const id = parsed.id.includes('-imported-')
        ? parsed.id
        : `${parsed.id}-imported-${Date.now().toString(36)}`
      const imported: SwarmCheckpoint = {
        ...parsed,
        id,
        createdAt: parsed.createdAt ?? Date.now(),
      }
      writeCheckpointToDisk(imported, this.teamName, this.projectRoot)
      return imported
    } catch {
      return null
    }
  }

  getTeamName(): string {
    return this.teamName
  }

  getCheckpointsDir(): string {
    return getCheckpointsDir(this.teamName, this.projectRoot)
  }
}

const managerCache = new Map<string, SwarmCheckpointManager>()

export function getSwarmCheckpointManager(
  teamName: string,
  projectRoot?: string,
): SwarmCheckpointManager {
  const key = `${projectRoot ?? process.cwd()}:${teamName}`
  if (!managerCache.has(key)) {
    managerCache.set(key, new SwarmCheckpointManager(teamName, projectRoot))
  }
  return managerCache.get(key)!
}

export function resetSwarmCheckpointManagerCache(): void {
  managerCache.clear()
}
