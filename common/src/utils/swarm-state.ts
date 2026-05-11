import fs from 'fs'
import path from 'path'
import { getConfigDir } from '../utils/auth'
import type { TeamConfig, TeamMember, DevPhase, TeamTask } from '../types/team-config'

// ============================================================================
// Swarm State Schema
// ============================================================================

export type AgentStatus = 'idle' | 'working' | 'writing_test' | 'reviewing' | 'blocked' | 'completed' | 'failed' | 'stuck'

export interface SwarmAgentState {
  agentId: string
  name: string
  role: string
  status: AgentStatus
  currentTaskId?: string
  health: 'green' | 'yellow' | 'red'
  confidence?: number
  tokensUsed: number
  timeElapsed: number
  lastEvent: string
  lastEventTime: number
  diffStats?: { added: number; deleted: number }
}

export interface SwarmTaskState {
  taskId: string
  subject: string
  status: TeamTask['status']
  owner?: string
  priority: TeamTask['priority']
  phase: DevPhase
  dependencies: string[]  // task IDs that must complete first
  iterationCount: number
  maxIterations: number
  confidenceScore?: number
  lastReview?: {
    agentId: string
    status: 'approved' | 'changes_requested' | 'failed'
    summary: string
    confidence: number
  }
}

export interface SwarmMetrics {
  totalTokens: number
  totalCost: number
  totalDuration: number  // ms
  startTime: number
  tasksCompleted: number
  tasksFailed: number
  testsGenerated: number
  reviewsCompleted: number
  averageTaskTime: number
  healthScore: number  // 0-100
}

export interface SwarmState {
  version: 1
  teamName: string
  phase: DevPhase          // Current phase
  updatedAt: number
  agents: SwarmAgentState[]
  tasks: SwarmTaskState[]
  metrics: SwarmMetrics
  checkpoint?: {
    phase: DevPhase
    approvedBy?: string
    approvedAt?: number
    summary: string
  }
  knowledge?: Array<{
    sourceAgentId: string
    content: string
    timestamp: number
  }>
  reflection?: {
    lastReflection: number
    outcomes: Array<{
      phase: string
      completed: number
      failed: number
      duration: number
      tokensUsed: number
      keyLearnings: string[]
      suggestions: string[]
    }>
  }
  logs?: Array<{
    timestamp: number
    taskId: string
    agentId: string
    event: string
    file?: string
    diff?: string
    linesAdded?: number
    linesRemoved?: number
    summary?: string
  }>
  healthWarnings?: string[]
  bible?: {
    documents: { total: number; lastIndexed: string }
    decisions: { pending: number; approved: number }
    intelligence: { pending: number; approved: number }
    features: { pending: number; approved: number }
    productContext: { pending: number; approved: number }
    market: { autoResearchEnabled: boolean; lastResearch: string; reviewedPoints: number }
  }
}

export const DEFAULT_SWARM_STATE: SwarmState = {
  version: 1,
  teamName: '',
  phase: 'planning',
  updatedAt: 0,
  agents: [],
  tasks: [],
  metrics: {
    totalTokens: 0,
    totalCost: 0,
    totalDuration: 0,
    startTime: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    testsGenerated: 0,
    reviewsCompleted: 0,
    averageTaskTime: 0,
    healthScore: 100,
  },
  bible: {
    documents: { total: 0, lastIndexed: '' },
    decisions: { pending: 0, approved: 0 },
    intelligence: { pending: 0, approved: 0 },
    features: { pending: 0, approved: 0 },
    productContext: { pending: 0, approved: 0 },
    market: { autoResearchEnabled: true, lastResearch: '', reviewedPoints: 0 },
  },
}

// ============================================================================
// File I/O
// ============================================================================

function getSwarmStatePath(teamName: string): string {
  return path.join(getConfigDir(), 'swarm', `${teamName}.json`)
}

export function loadSwarmState(teamName: string): SwarmState {
  try {
    const filePath = getSwarmStatePath(teamName)
    if (!fs.existsSync(filePath)) {
      return { ...DEFAULT_SWARM_STATE, teamName, updatedAt: Date.now() }
    }
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed.version !== 1) {
      return { ...DEFAULT_SWARM_STATE, teamName, updatedAt: Date.now() }
    }
    return parsed as SwarmState
  } catch {
    return { ...DEFAULT_SWARM_STATE, teamName, updatedAt: Date.now() }
  }
}

export function saveSwarmState(state: SwarmState): void {
  const filePath = getSwarmStatePath(state.teamName)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  state.updatedAt = Date.now()
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')
}

// ============================================================================
// State Update Helpers
// ============================================================================

export function updateAgentStatus(
  state: SwarmState,
  agentId: string,
  status: AgentStatus,
  extra?: Partial<SwarmAgentState>,
): void {
  const agent = state.agents.find(a => a.agentId === agentId)
  if (agent) {
    agent.status = status
    agent.lastEventTime = Date.now()
    if (extra) Object.assign(agent, extra)
  }
}

export function updateTaskState(
  state: SwarmState,
  taskId: string,
  updates: Partial<SwarmTaskState>,
): void {
  const task = state.tasks.find(t => t.taskId === taskId)
  if (task) {
    Object.assign(task, updates)
  }
}

export function addKnowledgeEntry(
  state: SwarmState,
  sourceAgentId: string,
  content: string,
): void {
  if (!state.knowledge) state.knowledge = []
  state.knowledge.push({
    sourceAgentId,
    content,
    timestamp: Date.now(),
  })
  // Keep only last 50 entries
  if (state.knowledge.length > 50) {
    state.knowledge = state.knowledge.slice(-50)
  }
}

export function calculateHealthScore(state: SwarmState): number {
  const agents = state.agents
  if (agents.length === 0) return 100

  let score = 100
  const stuckAgents = agents.filter(a => a.status === 'stuck' || a.status === 'failed').length
  const blockedAgents = agents.filter(a => a.status === 'blocked').length

  score -= (stuckAgents / agents.length) * 50
  score -= (blockedAgents / agents.length) * 20

  // Factor in token budget
  const maxBudget = 100000 // default hard limit
  if (state.metrics.totalTokens > maxBudget * 0.9) {
    score -= 30
  } else if (state.metrics.totalTokens > maxBudget * 0.7) {
    score -= 15
  }

  return Math.max(0, Math.round(score))
}
