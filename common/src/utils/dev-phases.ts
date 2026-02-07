import type { ToolName } from '../tools/constants.js'
import type { DevPhase, TeamConfig } from '../types/team-config.js'

export const PHASE_ORDER: readonly DevPhase[] = [
  'planning',
  'pre-alpha',
  'alpha',
  'beta',
  'production',
  'mature',
] as const

export function getPhaseOrder(phase: DevPhase): number {
  const index = PHASE_ORDER.indexOf(phase)
  if (index === -1) {
    throw new Error(`Unknown phase: ${phase}`)
  }
  return index
}

export function canTransition(currentPhase: DevPhase, targetPhase: DevPhase): boolean {
  const currentIndex = getPhaseOrder(currentPhase)
  const targetIndex = getPhaseOrder(targetPhase)
  return targetIndex === currentIndex + 1
}

export function transitionPhase(teamConfig: TeamConfig, targetPhase: DevPhase): TeamConfig {
  if (!canTransition(teamConfig.phase, targetPhase)) {
    throw new Error(
      `Cannot transition from "${teamConfig.phase}" to "${targetPhase}". Only forward single-step transitions are allowed.`,
    )
  }
  return {
    ...teamConfig,
    phase: targetPhase,
  }
}

export function getPhaseDescription(phase: DevPhase): string {
  switch (phase) {
    case 'planning':
      return 'Initial planning phase. Define goals, architecture, and task breakdown. No implementation yet.'
    case 'pre-alpha':
      return 'Early development phase. Core scaffolding and foundational work begins. Team communication enabled.'
    case 'alpha':
      return 'Active development phase. Features are being built and integrated. All tools available.'
    case 'beta':
      return 'Stabilization phase. Focus on testing, bug fixes, and polish. All tools available.'
    case 'production':
      return 'Release phase. Code is production-ready and deployed. All tools available.'
    case 'mature':
      return 'Maintenance phase. Stable product with ongoing maintenance and incremental improvements.'
  }
}

/**
 * Team tool names that are subject to phase gating.
 * Non-team tools (read_files, str_replace, etc.) are not gated by dev phase.
 */
export const TEAM_TOOL_NAMES: readonly ToolName[] = [
  'task_create',
  'task_get',
  'task_update',
  'task_list',
  'send_message',
  'team_create',
  'team_delete',
  'spawn_agents',
  'spawn_agent_inline',
] as const

export function getPhaseTools(phase: DevPhase): ToolName[] {
  switch (phase) {
    case 'planning':
      return ['task_create', 'task_update', 'task_get', 'task_list']
    case 'pre-alpha':
      return ['task_create', 'task_update', 'task_get', 'task_list', 'send_message', 'team_create']
    case 'alpha':
    case 'beta':
    case 'production':
    case 'mature':
      return [
        'task_create',
        'task_update',
        'task_get',
        'task_list',
        'send_message',
        'team_create',
        'team_delete',
        'spawn_agents',
        'spawn_agent_inline',
      ]
  }
}

/**
 * Checks whether a specific tool is allowed in the given dev phase.
 * Only team tools are gated by phase. Non-team tools always return true.
 */
export function isToolAllowedInPhase(toolName: string, phase: DevPhase): boolean {
  if (!(TEAM_TOOL_NAMES as readonly string[]).includes(toolName)) {
    return true
  }
  return getPhaseTools(phase).includes(toolName as ToolName)
}

/**
 * Returns the minimum phase required to use a given team tool.
 * Returns null for non-team tools (they are always allowed).
 */
export function getMinimumPhaseForTool(toolName: string): DevPhase | null {
  if (!(TEAM_TOOL_NAMES as readonly string[]).includes(toolName)) {
    return null
  }
  for (const phase of PHASE_ORDER) {
    if (getPhaseTools(phase).includes(toolName as ToolName)) {
      return phase
    }
  }
  return null
}
