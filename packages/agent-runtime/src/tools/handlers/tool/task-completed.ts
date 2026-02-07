import * as fs from 'fs'
import { jsonToolResult } from '@levelcode/common/util/messages'
import {
  getTeamsDir,
  getTask,
  updateTask,
  listTasks,
  loadTeamConfig,
  sendMessage,
} from '@levelcode/common/utils/team-fs'
import {
  emitTeammateIdle,
  emitTaskCompleted,
} from '@levelcode/common/utils/team-hook-emitter'

import type { LevelCodeToolHandlerFunction } from '../handler-function-type'
import type {
  LevelCodeToolCall,
  LevelCodeToolOutput,
} from '@levelcode/common/tools/list'
import type { TrackEventFn } from '@levelcode/common/types/contracts/analytics'
import type { Logger } from '@levelcode/common/types/contracts/logger'
import type { TaskCompletedMessage } from '@levelcode/common/types/team-protocol'
import type { TeamConfig, TeamTask } from '@levelcode/common/types/team-config'

function getActiveTeamName(): string | null {
  const teamsDir = getTeamsDir()
  if (!fs.existsSync(teamsDir)) {
    return null
  }
  const entries = fs.readdirSync(teamsDir, { withFileTypes: true })
  const teamDirs = entries.filter((e) => e.isDirectory())
  if (teamDirs.length === 0) {
    return null
  }
  return teamDirs[0]!.name
}

function findAgentTask(
  teamName: string,
  agentName: string,
): TeamTask | null {
  const tasks = listTasks(teamName)
  // Find in-progress task owned by this agent
  const inProgress = tasks.find(
    (t) => t.owner === agentName && t.status === 'in_progress',
  )
  if (inProgress) {
    return inProgress
  }
  // Fallback: find any non-completed task assigned to this agent
  return (
    tasks.find(
      (t) =>
        t.owner === agentName &&
        t.status !== 'completed',
    ) ?? null
  )
}

function findUnblockedTasks(
  teamName: string,
  completedTaskId: string,
): TeamTask[] {
  const tasks = listTasks(teamName)
  return tasks.filter((t) => {
    if (t.status === 'completed') return false
    if (!t.blockedBy || t.blockedBy.length === 0) return false
    // Check if the completed task was the last blocker
    const remainingBlockers = t.blockedBy.filter((id) => {
      if (id === completedTaskId) return false
      const blockerTask = getTask(teamName, id)
      return blockerTask !== null && blockerTask.status !== 'completed'
    })
    return remainingBlockers.length === 0
  })
}

function getTeamLeadName(config: TeamConfig): string | null {
  const lead = config.members.find(
    (m) => m.agentId === config.leadAgentId,
  )
  return lead?.name ?? null
}

export const handleTaskCompleted = (async ({
  previousToolCallFinished,
  trackEvent,
  userId,
  logger,
  agentTemplate,
}: {
  previousToolCallFinished: Promise<any>
  toolCall: LevelCodeToolCall<'task_completed'>
  trackEvent: TrackEventFn
  userId: string | undefined
  logger: Logger
  agentTemplate: { name: string }
}): Promise<{ output: LevelCodeToolOutput<'task_completed'> }> => {
  await previousToolCallFinished

  const teamName = getActiveTeamName()
  if (!teamName) {
    // No team context -- just return simple completion
    return {
      output: jsonToolResult({ message: 'Task completed.' }),
    }
  }

  const config = loadTeamConfig(teamName)
  const agentName = agentTemplate.name

  // 1. Find the agent's current task and mark it completed
  const task = findAgentTask(teamName, agentName)
  let taskSummary: string
  let completedTaskId: string | undefined

  if (task) {
    completedTaskId = task.id
    taskSummary = `Task #${task.id} "${task.subject}" completed by ${agentName}.`

    try {
      updateTask(teamName, task.id, { status: 'completed' })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.warn?.(
        `Failed to mark task ${task.id} as completed: ${errorMessage}`,
      )
    }

    // 2. Fire the TaskCompleted hook event (also emits TEAM_TASK_COMPLETED analytics)
    emitTaskCompleted({
      taskId: task.id,
      taskSubject: task.subject,
      owner: agentName,
      teamName,
      trackEvent,
      userId: userId ?? '',
      logger,
    })

    // 4. Check if completing this task unblocks other tasks
    const unblockedTasks = findUnblockedTasks(teamName, task.id)
    for (const unblockedTask of unblockedTasks) {
      // Remove the completed task from blockedBy lists
      const updatedBlockedBy = (unblockedTask.blockedBy ?? []).filter(
        (id) => id !== task.id,
      )
      try {
        updateTask(teamName, unblockedTask.id, {
          blockedBy: updatedBlockedBy,
        })
      } catch {
        // Best-effort unblocking
      }
    }

    // 5. Send a notification to the team lead's inbox
    if (config) {
      const leadName = getTeamLeadName(config)
      if (leadName && leadName !== agentName) {
        const notification: TaskCompletedMessage = {
          type: 'task_completed',
          from: agentName,
          taskId: task.id,
          taskSubject: task.subject,
          timestamp: new Date().toISOString(),
        }
        try {
          sendMessage(teamName, leadName, notification)
        } catch {
          // Best-effort notification
        }
      }
    }

    // Include unblocked tasks info in summary
    if (unblockedTasks.length > 0) {
      const unblockedIds = unblockedTasks.map((t) => `#${t.id}`).join(', ')
      taskSummary += ` Unblocked tasks: ${unblockedIds}.`
    }
  } else {
    taskSummary = `Agent ${agentName} signaled task completion (no assigned task found).`
  }

  // 3. Fire TeammateIdle hook event when agent signals completion
  emitTeammateIdle({
    agentName,
    teamName,
    lastTaskId: completedTaskId,
    trackEvent,
    userId: userId ?? '',
    logger,
  })

  // 6. Return success message with task summary
  return {
    output: jsonToolResult({ message: taskSummary }),
  }
}) satisfies LevelCodeToolHandlerFunction<'task_completed'>
