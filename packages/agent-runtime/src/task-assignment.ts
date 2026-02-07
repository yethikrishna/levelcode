import {
  listTasks,
  getTask,
  updateTask,
  loadTeamConfig,
  saveTeamConfig,
  sendMessage,
} from '@levelcode/common/utils/team-fs'
import type { TeamTask, TeamMember, TeamRole, TaskPriority } from '@levelcode/common/types/team-config'
import type { TaskCompletedMessage } from '@levelcode/common/types/team-protocol'

/**
 * Role seniority levels used for task-to-agent matching.
 * Higher numbers represent more senior roles.
 */
const ROLE_SENIORITY: Record<TeamRole, number> = {
  intern: 1,
  apprentice: 2,
  'junior-engineer': 3,
  'mid-level-engineer': 4,
  designer: 4,
  tester: 4,
  researcher: 5,
  scientist: 5,
  'product-lead': 5,
  'senior-engineer': 6,
  'super-senior': 7,
  'staff-engineer': 8,
  'senior-staff-engineer': 9,
  'sub-manager': 9,
  manager: 10,
  'principal-engineer': 10,
  'distinguished-engineer': 11,
  fellow: 12,
  director: 13,
  'vp-engineering': 14,
  cto: 15,
  coordinator: 15,
  reviewer: 5,
}

/**
 * Numeric weight for each priority level. Higher = more urgent.
 * Used to sort tasks so that critical/high tasks are assigned first.
 */
const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

/**
 * Minimum seniority level required for a task based on its metadata.
 * Tasks with metadata.seniority = 'senior' require seniority >= 6.
 * Tasks with metadata.seniority = 'junior' require seniority >= 1.
 * Default (no seniority metadata): seniority >= 1.
 */
const TASK_SENIORITY_THRESHOLDS: Record<string, number> = {
  senior: 6,
  mid: 4,
  junior: 1,
}

// ---------------------------------------------------------------------------
// Dependency Resolution
// ---------------------------------------------------------------------------

/**
 * Checks whether a task is blocked by looking at its blockedBy list.
 * A task is blocked if any of its blockedBy tasks are not yet completed.
 */
export function isTaskBlocked(teamName: string, taskId: string): boolean {
  const task = getTask(teamName, taskId)
  if (!task) {
    return true
  }
  if (task.blockedBy.length === 0) {
    return false
  }
  for (const blockerId of task.blockedBy) {
    const blocker = getTask(teamName, blockerId)
    if (!blocker || blocker.status !== 'completed') {
      return true
    }
  }
  return false
}

function getPriorityWeight(task: TeamTask): number {
  return PRIORITY_WEIGHT[task.priority ?? 'medium'] ?? PRIORITY_WEIGHT.medium
}

/**
 * Returns all pending tasks whose dependencies have been fully resolved.
 * Results are sorted by priority (critical first), then by task ID (lowest first) as a tiebreaker.
 */
export function getUnblockedTasks(teamName: string): TeamTask[] {
  const tasks = listTasks(teamName)
  return tasks
    .filter((t) => t.status === 'pending' && !isTaskBlocked(teamName, t.id))
    .sort((a, b) => {
      // Higher priority weight = more urgent, so sort descending
      const priorityDiff = getPriorityWeight(b) - getPriorityWeight(a)
      if (priorityDiff !== 0) {
        return priorityDiff
      }
      // Tiebreaker: lower ID first
      const aNum = parseInt(a.id, 10)
      const bNum = parseInt(b.id, 10)
      if (isNaN(aNum) || isNaN(bNum)) {
        return a.id.localeCompare(b.id)
      }
      return aNum - bNum
    })
}

// ---------------------------------------------------------------------------
// Finding Available Tasks & Idle Agents
// ---------------------------------------------------------------------------

/**
 * Returns pending tasks with no owner and no unresolved blockers,
 * sorted by ID ascending (lowest first = highest priority).
 */
export function findAvailableTasks(teamName: string): TeamTask[] {
  return getUnblockedTasks(teamName).filter((t) => !t.owner)
}

/**
 * Returns team members whose status is 'idle' and who do not
 * currently own any in_progress task.
 */
export function findIdleAgents(teamName: string): TeamMember[] {
  const config = loadTeamConfig(teamName)
  if (!config) {
    return []
  }
  const tasks = listTasks(teamName)
  const busyAgentIds = new Set(
    tasks
      .filter((t) => t.status === 'in_progress' && t.owner)
      .map((t) => t.owner!),
  )
  return config.members.filter(
    (m) => m.status === 'idle' && !busyAgentIds.has(m.name),
  )
}

// ---------------------------------------------------------------------------
// Role Suitability
// ---------------------------------------------------------------------------

function getRoleSeniority(role: TeamRole): number {
  return ROLE_SENIORITY[role] ?? 4
}

function getRequiredSeniority(task: TeamTask): number {
  const seniorityTag = task.metadata?.seniority
  if (typeof seniorityTag === 'string' && seniorityTag in TASK_SENIORITY_THRESHOLDS) {
    return TASK_SENIORITY_THRESHOLDS[seniorityTag]!
  }
  return 1 // default: any agent can take it
}

/**
 * Checks if an agent's role is senior enough for a given task.
 */
export function isAgentSuitableForTask(agent: TeamMember, task: TeamTask): boolean {
  return getRoleSeniority(agent.role) >= getRequiredSeniority(task)
}

// ---------------------------------------------------------------------------
// Auto-Assignment
// ---------------------------------------------------------------------------

export interface AssignmentResult {
  agentName: string
  taskId: string
}

/**
 * Matches idle agents to available tasks by role suitability.
 * Tasks are processed in ID order (lowest first).
 * Each idle agent is assigned at most one task.
 * Returns the list of assignments that were made.
 */
export async function autoAssignTasks(teamName: string): Promise<AssignmentResult[]> {
  const config = loadTeamConfig(teamName)
  if (!config || !config.settings.autoAssign) {
    return []
  }

  const available = findAvailableTasks(teamName)
  const idle = findIdleAgents(teamName)
  const assignments: AssignmentResult[] = []
  const assignedAgents = new Set<string>()

  for (const task of available) {
    if (idle.length === 0) {
      break
    }
    // Find the first suitable idle agent that hasn't been assigned yet
    const agentIndex = idle.findIndex(
      (a) => !assignedAgents.has(a.name) && isAgentSuitableForTask(a, task),
    )
    if (agentIndex === -1) {
      continue
    }
    const agent = idle[agentIndex]!
    assignedAgents.add(agent.name)

    // Assign the task
    await updateTask(teamName, task.id, {
      owner: agent.name,
      status: 'in_progress',
    })

    // Update member status
    const memberIndex = config.members.findIndex((m) => m.name === agent.name)
    if (memberIndex !== -1) {
      config.members[memberIndex]!.status = 'active'
      config.members[memberIndex]!.currentTaskId = task.id
    }

    assignments.push({ agentName: agent.name, taskId: task.id })
  }

  if (assignments.length > 0) {
    await saveTeamConfig(teamName, config)
  }

  return assignments
}

// ---------------------------------------------------------------------------
// Task Claiming (Agent Self-Service)
// ---------------------------------------------------------------------------

export interface ClaimResult {
  success: boolean
  error?: string
}

/**
 * Allows an agent to claim an available task.
 * Sets the task owner and marks it as in_progress.
 */
export async function claimTask(teamName: string, agentName: string, taskId: string): Promise<ClaimResult> {
  const task = getTask(teamName, taskId)
  if (!task) {
    return { success: false, error: `Task "${taskId}" not found.` }
  }
  if (task.status !== 'pending') {
    return { success: false, error: `Task "${taskId}" is not pending (status: ${task.status}).` }
  }
  if (task.owner) {
    return { success: false, error: `Task "${taskId}" is already owned by "${task.owner}".` }
  }
  if (isTaskBlocked(teamName, taskId)) {
    return { success: false, error: `Task "${taskId}" is blocked by unresolved dependencies.` }
  }

  await updateTask(teamName, taskId, {
    owner: agentName,
    status: 'in_progress',
  })

  // Update member status in team config
  const config = loadTeamConfig(teamName)
  if (config) {
    const memberIndex = config.members.findIndex((m) => m.name === agentName)
    if (memberIndex !== -1) {
      config.members[memberIndex]!.status = 'active'
      config.members[memberIndex]!.currentTaskId = taskId
    }
    await saveTeamConfig(teamName, config)
  }

  return { success: true }
}

/**
 * Releases a task back to pending, removing the owner.
 */
export async function releaseTask(teamName: string, taskId: string): Promise<ClaimResult> {
  const task = getTask(teamName, taskId)
  if (!task) {
    return { success: false, error: `Task "${taskId}" not found.` }
  }

  const previousOwner = task.owner

  await updateTask(teamName, taskId, {
    owner: undefined,
    status: 'pending',
  })

  // Update member status in team config
  if (previousOwner) {
    const config = loadTeamConfig(teamName)
    if (config) {
      const memberIndex = config.members.findIndex((m) => m.name === previousOwner)
      if (memberIndex !== -1) {
        config.members[memberIndex]!.status = 'idle'
        config.members[memberIndex]!.currentTaskId = undefined
      }
      await saveTeamConfig(teamName, config)
    }
  }

  return { success: true }
}

/**
 * Marks a task as completed, updates the owning agent's status,
 * and sends a TaskCompleted protocol message to the team lead.
 * After completion, checks if any blocked tasks are now unblocked.
 * Returns the list of task IDs that were newly unblocked.
 */
export async function completeTask(
  teamName: string,
  taskId: string,
): Promise<{ success: boolean; error?: string; unblockedTaskIds: string[] }> {
  const task = getTask(teamName, taskId)
  if (!task) {
    return { success: false, error: `Task "${taskId}" not found.`, unblockedTaskIds: [] }
  }
  if (task.status === 'completed') {
    return { success: false, error: `Task "${taskId}" is already completed.`, unblockedTaskIds: [] }
  }

  const previousOwner = task.owner

  await updateTask(teamName, taskId, {
    status: 'completed',
  })

  // Update member status in team config
  const config = loadTeamConfig(teamName)
  if (config && previousOwner) {
    const memberIndex = config.members.findIndex((m) => m.name === previousOwner)
    if (memberIndex !== -1) {
      config.members[memberIndex]!.status = 'idle'
      config.members[memberIndex]!.currentTaskId = undefined
    }
    await saveTeamConfig(teamName, config)

    // Fire TaskCompleted protocol message to team lead
    const leadMember = config.members.find((m) => m.agentId === config.leadAgentId)
    const leadName = leadMember?.name ?? 'team-lead'
    const message: TaskCompletedMessage = {
      type: 'task_completed',
      from: previousOwner,
      taskId,
      taskSubject: task.subject,
      timestamp: new Date().toISOString(),
    }
    await sendMessage(teamName, leadName, message)
  }

  // Check which tasks that list this task in their blockedBy are now unblocked
  const unblockedTaskIds: string[] = []
  const allTasks = listTasks(teamName)
  for (const candidate of allTasks) {
    if (candidate.status !== 'pending') {
      continue
    }
    if (!candidate.blockedBy.includes(taskId)) {
      continue
    }
    if (!isTaskBlocked(teamName, candidate.id)) {
      unblockedTaskIds.push(candidate.id)
    }
  }

  return { success: true, unblockedTaskIds }
}
