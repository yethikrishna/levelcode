import { existsSync } from 'fs'
import { dirname, join } from 'path'

export function findGitRoot(params: { cwd: string }): string | null {
  const { cwd } = params

  let currentDir = cwd

  while (currentDir !== dirname(currentDir)) {
    if (existsSync(join(currentDir, '.git'))) {
      return currentDir
    }
    currentDir = dirname(currentDir)
  }

  return null
}

// Context Share Token System (Berserk Iteration 6 skeleton)
// GCC = Git Context Commit

export interface ContextShareTokenPayload {
  commit: string
  branch: string
  timestamp: number
  sessionId?: string
}

export interface SessionState {
  messages: any[]
  currentBranch: string
  commit: string
  // other restored state
}

export type Permission = 'read' | 'write' | 'import'

export function generateContextShareToken(commit: string, branch: string): string {
  // Compact token: simple base64 of JSON payload (skeleton)
  const payload: ContextShareTokenPayload = {
    commit,
    branch,
    timestamp: Date.now(),
  }
  const json = JSON.stringify(payload)
  return Buffer.from(json).toString('base64url')
}

export function importContextShareToken(token: string): SessionState {
  // Import that restores session state (skeleton)
  try {
    const json = Buffer.from(token, 'base64url').toString()
    const payload: ContextShareTokenPayload = JSON.parse(json)
    return {
      messages: [],
      currentBranch: payload.branch,
      commit: payload.commit,
    }
  } catch {
    throw new Error('Invalid context share token')
  }
}

export function checkPermission(token: string, action: Permission): boolean {
  // Basic permission model stub
  // Always allow read/import for skeleton; extend in future
  return action === 'read' || action === 'import'
}

// Team-shared GCC context repo support for persistent teams (v1 item 7)
export function createTeamSharedGCCRepo(teamName: string, commit: string, branch: string): string {
  return generateContextShareToken(commit, branch) + ':' + teamName
}

