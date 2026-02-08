export type TeamRole =
  | 'coordinator'
  | 'cto'
  | 'vp-engineering'
  | 'director'
  | 'fellow'
  | 'distinguished-engineer'
  | 'principal-engineer'
  | 'senior-staff-engineer'
  | 'staff-engineer'
  | 'manager'
  | 'sub-manager'
  | 'senior-engineer'
  | 'super-senior'
  | 'mid-level-engineer'
  | 'junior-engineer'
  | 'researcher'
  | 'scientist'
  | 'designer'
  | 'product-lead'
  | 'tester'
  | 'reviewer'
  | 'intern'
  | 'apprentice'

export type DevPhase =
  | 'planning'
  | 'pre-alpha'
  | 'alpha'
  | 'beta'
  | 'production'
  | 'mature'

export type AgentStatus =
  | 'active'
  | 'idle'
  | 'working'
  | 'blocked'
  | 'completed'
  | 'failed'

export interface TeamMember {
  agentId: string
  name: string
  role: TeamRole
  agentType: string
  model: string
  joinedAt: number
  status: AgentStatus
  currentTaskId?: string
  cwd: string
  /** Tool permissions override. If set, these tools are allowed regardless of phase. Commander can grant/revoke. */
  toolOverrides?: {
    allowed?: string[]   // Extra tools this member can use beyond phase defaults
    blocked?: string[]   // Tools blocked for this member even if phase allows
  }
}

export interface TeamConfig {
  name: string
  description: string
  createdAt: number
  leadAgentId: string
  phase: DevPhase
  members: TeamMember[]
  settings: {
    maxMembers: number
    autoAssign: boolean
  }
}

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'

export interface TeamTask {
  id: string
  subject: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  priority: TaskPriority
  owner?: string
  blockedBy: string[]
  blocks: string[]
  phase: DevPhase
  activeForm?: string
  createdAt: number
  updatedAt: number
  metadata?: Record<string, unknown>
}
