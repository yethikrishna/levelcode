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

export function getPhaseTools(phase: DevPhase): string[] {
  switch (phase) {
    case 'planning':
      return ['TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList']
    case 'pre-alpha':
      return ['TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList', 'SendMessage']
    case 'alpha':
    case 'beta':
    case 'production':
    case 'mature':
      return [
        'TaskCreate',
        'TaskUpdate',
        'TaskGet',
        'TaskList',
        'SendMessage',
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Glob',
        'Grep',
      ]
  }
}
