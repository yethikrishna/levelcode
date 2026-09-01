/**
 * The effort dial — one setting that scales how hard the agent works:
 * how many steps it may take before being stopped.
 *
 * `medium` matches the historical default (100 steps) so the dial is purely
 * opt-in. `low` is for quick questions where a runaway loop is the failure
 * mode you most want to avoid; `high`/`max` for long autonomous runs.
 *
 * Also scales the visual density of the swarm later (per-agent step budgets)
 * — this module is the single source of the mapping.
 */

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'max'] as const

export type EffortLevel = (typeof EFFORT_LEVELS)[number]

export const EFFORT_MAX_STEPS: Record<EffortLevel, number> = {
  low: 30,
  medium: 100,
  high: 200,
  max: 400,
}

export const DEFAULT_EFFORT: EffortLevel = 'medium'

let currentEffort: EffortLevel = DEFAULT_EFFORT

export function setEffortLevel(effort: EffortLevel): void {
  currentEffort = effort
}

export function getEffortLevel(): EffortLevel {
  return currentEffort
}

/** Pure lookup so callers (and tests) can resolve without global state. */
export function maxStepsForEffort(effort: EffortLevel): number {
  return EFFORT_MAX_STEPS[effort] ?? EFFORT_MAX_STEPS[DEFAULT_EFFORT]
}

/** Parse + validate a user-supplied level; returns null when invalid. */
export function parseEffortLevel(input: string | undefined): EffortLevel | null {
  if (!input) return null
  const normalized = input.trim().toLowerCase()
  return (EFFORT_LEVELS as readonly string[]).includes(normalized)
    ? (normalized as EffortLevel)
    : null
}
