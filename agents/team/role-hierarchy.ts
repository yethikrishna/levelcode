import type { TeamRole } from '@levelcode/common/types/team-config'

/**
 * Team roles ordered from lowest to highest authority.
 * Index 0 is the lowest level (intern), last element is the highest (cto).
 *
 * Specialist roles (researcher, scientist, designer, product-lead, tester)
 * are placed alongside their equivalent IC/management level.
 */
export const ROLE_HIERARCHY: TeamRole[] = [
  // Level 0 - Entry
  'intern',
  'apprentice',

  // Level 1 - Junior
  'junior-engineer',

  // Level 2 - Mid-level
  'mid-level-engineer',
  'tester',

  // Level 3 - Senior
  'senior-engineer',
  'researcher',
  'scientist',
  'designer',
  'product-lead',

  // Level 4 - Sub-management
  'sub-manager',

  // Level 5 - Staff
  'staff-engineer',
  'manager',

  // Level 6 - Senior Staff
  'senior-staff-engineer',

  // Level 7 - Principal
  'principal-engineer',

  // Level 8 - Distinguished
  'distinguished-engineer',

  // Level 9 - Fellow
  'fellow',

  // Level 10 - Director-level management
  'director',

  // Level 11 - VP
  'vp-engineering',

  // Level 12 - Coordinator (project-level top)
  'coordinator',

  // Level 13 - CTO (organization-level top)
  'cto',
]

/**
 * Maps each role to a numeric authority level.
 * Roles at the same tier share the same level number.
 */
const ROLE_LEVEL_MAP: Record<TeamRole, number> = {
  'intern': 0,
  'apprentice': 0,
  'junior-engineer': 1,
  'mid-level-engineer': 2,
  'tester': 2,
  'senior-engineer': 3,
  'super-senior': 3,
  'researcher': 3,
  'scientist': 3,
  'designer': 3,
  'product-lead': 3,
  'reviewer': 3,
  'sub-manager': 4,
  'staff-engineer': 5,
  'manager': 5,
  'senior-staff-engineer': 6,
  'principal-engineer': 7,
  'distinguished-engineer': 8,
  'fellow': 9,
  'director': 10,
  'vp-engineering': 11,
  'coordinator': 12,
  'cto': 13,
}

/**
 * Get the numeric authority level for a role.
 * 0 = intern (lowest), 13 = CTO (highest).
 */
export function getRoleLevel(role: TeamRole): number {
  return ROLE_LEVEL_MAP[role] ?? 0
}

/**
 * Returns true if the manager role has authority over the subordinate role.
 * A role can manage any role with a strictly lower level.
 */
export function canManage(
  managerRole: TeamRole,
  subordinateRole: TeamRole,
): boolean {
  return getRoleLevel(managerRole) > getRoleLevel(subordinateRole)
}

/**
 * Defines which roles a given role is allowed to spawn.
 * Management roles can spawn the IC/management roles below them.
 * IC roles generally cannot spawn team agents (they spawn utility sub-agents).
 */
const SPAWNABLE_ROLES_MAP: Partial<Record<TeamRole, TeamRole[]>> = {
  'cto': [
    'vp-engineering',
    'coordinator',
    'director',
    'fellow',
    'distinguished-engineer',
    'principal-engineer',
    'manager',
  ],
  'vp-engineering': [
    'director',
    'manager',
    'senior-staff-engineer',
    'principal-engineer',
  ],
  'coordinator': [
    'manager',
    'senior-engineer',
    'researcher',
    'designer',
    'product-lead',
    'scientist',
  ],
  'director': [
    'manager',
    'senior-engineer',
    'researcher',
    'product-lead',
  ],
  'fellow': ['senior-engineer', 'staff-engineer'],
  'distinguished-engineer': ['senior-engineer', 'staff-engineer'],
  'principal-engineer': ['senior-engineer', 'staff-engineer'],
  'senior-staff-engineer': ['senior-engineer', 'mid-level-engineer'],
  'staff-engineer': ['mid-level-engineer', 'junior-engineer'],
  'manager': ['senior-engineer', 'mid-level-engineer', 'sub-manager'],
  'sub-manager': ['mid-level-engineer', 'junior-engineer'],
  'senior-engineer': ['junior-engineer', 'intern', 'apprentice'],
}

/**
 * Get the team roles that a given role is allowed to spawn as sub-agents.
 * Returns an empty array for roles that cannot spawn other team agents.
 */
export function getSpawnableRoles(role: TeamRole): TeamRole[] {
  return SPAWNABLE_ROLES_MAP[role] ?? []
}
