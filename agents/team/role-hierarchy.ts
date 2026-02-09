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
 * All team roles — every role can spawn every other role.
 * No hierarchy restrictions on spawning.
 */
const ALL_TEAM_ROLES: TeamRole[] = [
  'cto', 'vp-engineering', 'coordinator', 'director',
  'fellow', 'distinguished-engineer', 'principal-engineer',
  'senior-staff-engineer', 'staff-engineer',
  'manager', 'sub-manager',
  'senior-engineer', 'super-senior', 'reviewer',
  'mid-level-engineer', 'junior-engineer',
  'researcher', 'scientist', 'designer', 'product-lead',
  'tester', 'intern', 'apprentice',
]

/**
 * Get the team roles that a given role is allowed to spawn as sub-agents.
 * All roles can spawn all other roles — no restrictions.
 */
export function getSpawnableRoles(_role: TeamRole): TeamRole[] {
  return ALL_TEAM_ROLES
}

