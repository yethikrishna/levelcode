import { execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { sync as mkdirpSync } from 'mkdirp'
const mkdirp = mkdirpSync

export interface WorktreeInfo {
  branch: string
  path: string
  agentId: string
  taskId?: string
  createdAt: number
}

const WORKTREE_DIR = '.claude/worktrees'

/**
 * Create a new git worktree for an agent.
 * Each agent gets its own branch + worktree directory.
 * This prevents file-level conflicts between parallel agents.
 */
export function createAgentWorktree(
  repoRoot: string,
  agentId: string,
  taskId?: string,
): WorktreeInfo {
  const worktreeBase = path.join(repoRoot, WORKTREE_DIR)
  const branchName = `agent/${agentId}/${taskId ?? 'task'}`
  const worktreePath = path.join(worktreeBase, agentId, taskId ?? 'main')

  // Ensure worktree base directory exists
  mkdirp(worktreeBase)

  // Remove existing worktree if it exists (clean slate)
  try {
    execSync(`git worktree remove -f "${worktreePath}"`, { cwd: repoRoot, stdio: 'pipe' })
  } catch {
    // Ignore errors if worktree doesn't exist
  }

  // Create new branch and worktree
  try {
    // Check if branch already exists
    execSync(`git rev-parse --verify ${branchName}`, { cwd: repoRoot, stdio: 'pipe' })
    // Branch exists, just create worktree
    execSync(`git worktree add "${worktreePath}" "${branchName}"`, { cwd: repoRoot, stdio: 'pipe' })
  } catch {
    // Branch doesn't exist, create new branch
    execSync(`git worktree add -b "${branchName}" "${worktreePath}" HEAD`, { cwd: repoRoot, stdio: 'pipe' })
  }

  return {
    branch: branchName,
    path: worktreePath,
    agentId,
    taskId,
    createdAt: Date.now(),
  }
}

/**
 * Remove an agent's worktree and branch.
 */
export function removeAgentWorktree(repoRoot: string, agentId: string): void {
  const worktreeBase = path.join(repoRoot, WORKTREE_DIR, agentId)

  try {
    // List worktrees and remove them
    const worktrees = execSync(`git worktree list --porcelain`, { cwd: repoRoot, encoding: 'utf-8' })

    for (const line of worktrees.split('\n')) {
      if (line.startsWith('worktree ')) {
        const wtPath = line.replace('worktree ', '').trim()
        if (wtPath.includes(`/${agentId}/`)) {
          execSync(`git worktree remove -f "${wtPath}"`, { cwd: repoRoot, stdio: 'pipe' })
        }
      }
    }

    // Delete branches for this agent
    const branches = execSync(`git branch --list "agent/${agentId}/*"`, { cwd: repoRoot, encoding: 'utf-8' })
    for (const branchLine of branches.split('\n')) {
      const branch = branchLine.replace(/^[* ]+/, '').trim()
      if (branch) {
        execSync(`git branch -D "${branch}"`, { cwd: repoRoot, stdio: 'pipe' })
      }
    }
  } catch (error) {
    // Ignore errors during cleanup
  }
}

/**
 * Commit changes in an agent's worktree.
 */
export function commitInWorktree(
  worktreePath: string,
  message: string,
  files?: string[],
): { success: boolean; commitHash?: string; error?: string } {
  try {
    // Stage files
    if (files && files.length > 0) {
      const fileList = files.map(f => `"${f}"`).join(' ')
      execSync(`git add ${fileList}`, { cwd: worktreePath, stdio: 'pipe' })
    } else {
      execSync(`git add -A`, { cwd: worktreePath, stdio: 'pipe' })
    }

    // Commit
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: worktreePath, stdio: 'pipe' })

    // Get commit hash
    const hash = execSync(`git rev-parse HEAD`, { cwd: worktreePath, encoding: 'utf-8' }).trim()

    return { success: true, commitHash: hash }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Get diff stats for an agent's worktree vs main.
 */
export function getWorktreeDiffStats(worktreePath: string, baseBranch = 'HEAD'): {
  added: number
  deleted: number
  files: number
} {
  try {
    const output = execSync(`git diff --stat "${baseBranch}"`, {
      cwd: worktreePath,
      encoding: 'utf-8',
    })

    // Parse diff stats
    const match = output.match(/(\d+) insertion[s]?\(\+\)[,\s]*(\d+) deletion[s]?\(\-\)/)
    if (match) {
      return {
        added: parseInt(match[1] ?? '0'),
        deleted: parseInt(match[2] ?? '0'),
        files: (output.match(/\n/g)?.length ?? 0) - 1,
      }
    }

    return { added: 0, deleted: 0, files: 0 }
  } catch {
    return { added: 0, deleted: 0, files: 0 }
  }
}

/**
 * Check if an agent's worktree has uncommitted changes.
 */
export function hasUncommittedChanges(worktreePath: string): boolean {
  try {
    const status = execSync(`git status --porcelain`, {
      cwd: worktreePath,
      encoding: 'utf-8',
    })
    return status.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Auto-rollback: reset a worktree to a previous commit.
 */
export function rollbackWorktree(
  worktreePath: string,
  target: string = 'HEAD~1',
): { success: boolean; error?: string } {
  try {
    execSync(`git reset --hard "${target}"`, { cwd: worktreePath, stdio: 'pipe' })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * List all active worktrees for agents.
 */
export function listAgentWorktrees(repoRoot: string): WorktreeInfo[] {
  try {
    const output = execSync(`git worktree list --porcelain`, {
      cwd: repoRoot,
      encoding: 'utf-8',
    })

    const worktrees: WorktreeInfo[] = []
    let currentPath = ''
    let currentBranch = ''

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = line.replace('worktree ', '').trim()
      } else if (line.startsWith('branch ')) {
        currentBranch = line.replace('branch ', '').replace('refs/heads/', '').trim()

        // Only include agent worktrees
        if (currentBranch.startsWith('agent/')) {
          const parts = currentBranch.replace('agent/', '').split('/')
          worktrees.push({
            branch: currentBranch,
            path: currentPath,
            agentId: parts[0] ?? 'unknown',
            taskId: parts.slice(1).join('/') || undefined,
            createdAt: Date.now(), // We don't have the actual creation time
          })
        }
      }
    }

    return worktrees
  } catch {
    return []
  }
}
