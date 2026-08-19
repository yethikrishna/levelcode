import * as fs from 'fs'
import * as path from 'path'
import { getConfigDir } from '@levelcode/common/utils/auth'

/**
 * Built-in roles in the LevelCode RBAC system.
 */
export type Role = 'owner' | 'admin' | 'member' | 'viewer'

/**
 * Permissions that can be granted to roles within a scope.
 */
export type Permission =
  | 'run_agent'
  | 'edit_files'
  | 'approve_edits'
  | 'manage_team'
  | 'invite_members'
  | 'manage_billing'
  | 'install_plugins'

/**
 * Hierarchical scope — organizations contain teams/repos.
 */
export interface Scope {
  id: string
  name: string
  parentId?: string
  createdAt: number
}

/**
 * Role assignment for a user within a scope (or globally if no scopeId).
 */
export interface RoleAssignment {
  userId: string
  role: Role
  scopeId?: string
  assignedAt: number
  assignedBy?: string
}

/**
 * Shape of the on-disk RBAC database.
 */
interface RbacData {
  scopes: Record<string, Scope>
  assignments: RoleAssignment[]
  version: 1
}

/**
 * Role → Permission matrix. Each role inherits permissions from roles
 * listed in `inheritsFrom`. Owner > Admin > Member > Viewer.
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    'run_agent',
    'edit_files',
    'approve_edits',
    'manage_team',
    'invite_members',
    'manage_billing',
    'install_plugins',
  ],
  admin: [
    'run_agent',
    'edit_files',
    'approve_edits',
    'manage_team',
    'invite_members',
    'install_plugins',
  ],
  member: [
    'run_agent',
    'edit_files',
  ],
  viewer: [
    'run_agent',
  ],
}

const ROLE_HIERARCHY: Record<Role, Role[]> = {
  owner: ['admin', 'member', 'viewer'],
  admin: ['member', 'viewer'],
  member: ['viewer'],
  viewer: [],
}

/**
 * Manages role-based access control for LevelCode teams and organizations.
 *
 * Roles are hierarchical: owners have all permissions, admins inherit from
 * members, etc. Permissions can be checked globally or within a specific
 * scope (org/repo/team). Scope hierarchies are supported via parentId;
 * permissions cascade down the tree unless overridden.
 *
 * Persisted to `.levelcode/rbac.json`.
 */
export class RBACManager {
  private dataPath: string
  private data: RbacData

  constructor(baseDir?: string) {
    const root = baseDir ?? getConfigDir()
    this.dataPath = path.join(root, 'rbac.json')
    this.data = this.loadData()
  }

  /**
   * Assign a role to a user within an optional scope. If no scope is provided,
   * the role is global.
   */
  assignRole(userId: string, role: Role, scopeId?: string, assignedBy?: string): RoleAssignment {
    if (!userId) throw new Error('userId is required')
    if (!ROLE_PERMISSIONS[role]) throw new Error(`Invalid role: ${role}`)
    if (scopeId && !this.data.scopes[scopeId]) {
      throw new Error(`Scope "${scopeId}" does not exist. Create it with createScope first.`)
    }

    const existingIdx = this.data.assignments.findIndex(
      a => a.userId === userId && a.scopeId === scopeId,
    )

    const assignment: RoleAssignment = {
      userId,
      role,
      scopeId,
      assignedAt: Date.now(),
      assignedBy,
    }

    if (existingIdx >= 0) {
      this.data.assignments[existingIdx] = assignment
    } else {
      this.data.assignments.push(assignment)
    }

    this.saveData()
    return assignment
  }

  /**
   * Check whether a user has a specific permission, optionally within a scope.
   * Scope hierarchy is traversed upward (child → parent → global) to find
   * the nearest applicable assignment.
   */
  checkPermission(userId: string, permission: Permission, scopeId?: string): boolean {
    const roles = this.getRoles(userId, scopeId)
    for (const role of roles) {
      if (ROLE_PERMISSIONS[role]?.includes(permission)) {
        return true
      }
    }
    return false
  }

  /**
   * Get all roles assigned to a user, considering scope inheritance.
   * Returns roles from narrowest to broadest scope (specific → global).
   */
  getRoles(userId: string, scopeId?: string): Role[] {
    const roles: Role[] = []
    const seen = new Set<string>()

    const addRole = (role: Role, source: string) => {
      const key = `${role}:${source}`
      if (!seen.has(key)) {
        seen.add(key)
        roles.push(role)
        for (const inherited of ROLE_HIERARCHY[role] ?? []) {
          addRole(inherited, `${source}:inherited`)
        }
      }
    }

    if (scopeId) {
      let currentScopeId: string | undefined = scopeId
      const visited = new Set<string>()
      while (currentScopeId && !visited.has(currentScopeId)) {
        visited.add(currentScopeId)
        const assignment = this.data.assignments.find(
          a => a.userId === userId && a.scopeId === currentScopeId,
        )
        if (assignment) {
          addRole(assignment.role, currentScopeId)
        }
        const scope: Scope | undefined = this.data.scopes[currentScopeId]
        currentScopeId = scope?.parentId
      }
    }

    const globalAssignment = this.data.assignments.find(
      a => a.userId === userId && !a.scopeId,
    )
    if (globalAssignment) {
      addRole(globalAssignment.role, 'global')
    }

    return roles
  }

  /**
   * Create a new scope (organization, team, repository, etc.).
   * Scopes may optionally have a parent scope for hierarchy-based
   * permission inheritance.
   */
  createScope(name: string, parentId?: string): Scope {
    if (!name) throw new Error('Scope name is required')
    if (parentId && !this.data.scopes[parentId]) {
      throw new Error(`Parent scope "${parentId}" does not exist`)
    }

    const id = `scope-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const scope: Scope = {
      id,
      name,
      parentId,
      createdAt: Date.now(),
    }
    this.data.scopes[id] = scope
    this.saveData()
    return scope
  }

  /**
   * Get a scope by id.
   */
  getScope(scopeId: string): Scope | null {
    return this.data.scopes[scopeId] ?? null
  }

  /**
   * List all scopes, optionally filtered by parent.
   */
  listScopes(parentId?: string): Scope[] {
    return Object.values(this.data.scopes)
      .filter(s => parentId === undefined || s.parentId === parentId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  /**
   * Revoke a role assignment for a user in a given scope.
   */
  revokeRole(userId: string, scopeId?: string): boolean {
    const idx = this.data.assignments.findIndex(
      a => a.userId === userId && a.scopeId === scopeId,
    )
    if (idx < 0) return false
    this.data.assignments.splice(idx, 1)
    this.saveData()
    return true
  }

  /**
   * List all role assignments, optionally filtered by scope or user.
   */
  listAssignments(filter?: { userId?: string; scopeId?: string }): RoleAssignment[] {
    return this.data.assignments.filter(a => {
      if (filter?.userId && a.userId !== filter.userId) return false
      if (filter?.scopeId && a.scopeId !== filter.scopeId) return false
      return true
    })
  }

  /**
   * Get all users with a specific role or permission in a scope.
   */
  getUsersWithPermission(permission: Permission, scopeId?: string): string[] {
    const users = new Set<string>()
    for (const assignment of this.data.assignments) {
      const effectiveScopeId = assignment.scopeId
      if (scopeId && effectiveScopeId !== scopeId) {
        if (!this.scopeInheritsFrom(scopeId, effectiveScopeId)) {
          continue
        }
      }
      if (ROLE_PERMISSIONS[assignment.role]?.includes(permission)) {
        users.add(assignment.userId)
      }
    }
    return Array.from(users)
  }

  /**
   * Return the role-permission matrix (useful for UI display).
   */
  getRoleMatrix(): Record<Role, Permission[]> {
    return { ...ROLE_PERMISSIONS }
  }

  // ── Persistence ────────────────────────────────────────────────────

  private loadData(): RbacData {
    try {
      if (!fs.existsSync(this.dataPath)) {
        return { scopes: {}, assignments: [], version: 1 }
      }
      const raw = fs.readFileSync(this.dataPath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<RbacData>
      return {
        scopes: parsed.scopes ?? {},
        assignments: parsed.assignments ?? [],
        version: 1,
      }
    } catch {
      return { scopes: {}, assignments: [], version: 1 }
    }
  }

  private saveData(): void {
    const dir = path.dirname(this.dataPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  /**
   * Returns true if `childScopeId` is a descendant of `ancestorScopeId`
   * (i.e. permission checks cascade downward).
   */
  private scopeInheritsFrom(childScopeId: string, ancestorScopeId: string | undefined): boolean {
    if (!ancestorScopeId) return true
    let current: Scope | undefined = this.data.scopes[childScopeId]
    const visited = new Set<string>()
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      if (current.id === ancestorScopeId) return true
      current = current.parentId ? this.data.scopes[current.parentId] : undefined
    }
    return false
  }
}

/**
 * Get the global singleton RBAC manager.
 */
let globalManager: RBACManager | null = null

export function getRBACManager(baseDir?: string): RBACManager {
  if (!globalManager) {
    globalManager = new RBACManager(baseDir)
  }
  return globalManager
}

export function resetRBACManager(): void {
  globalManager = null
}
