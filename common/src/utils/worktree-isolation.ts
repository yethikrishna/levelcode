import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const mkdirp = (dir: string) => fs.mkdirSync(dir, { recursive: true })

export interface WorktreeInfo {
  branch: string
  path: string
  agentId: string
  taskId?: string
  createdAt: number
}

const WORKTREE_DIR = '.levelcode/worktrees'
const WORKTREEINCLUDE_FILE = '.worktreeinclude'

function git(repoRoot: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
}

/**
 * Copy files listed in `.worktreeinclude` from the repo root into a fresh
 * worktree. Git worktrees only contain tracked files — env files, secrets
 * and local config that builds/tests need are gitignored. One path per
 * line, `#` comments allowed, trailing `/*` copies a directory's files.
 */
export function applyWorktreeInclude(repoRoot: string, worktreePath: string): string[] {
  const includeFile = path.join(repoRoot, WORKTREEINCLUDE_FILE)
  let raw: string
  try {
    raw = fs.readFileSync(includeFile, 'utf-8')
  } catch {
    return [] // No .worktreeinclude: nothing to copy
  }

  const copied: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    const entry = line.trim()
    if (!entry || entry.startsWith('#')) continue

    const isDirGlob = entry.endsWith('/*')
    const relPath = isDirGlob ? entry.slice(0, -2) : entry
    const src = path.join(repoRoot, relPath)

    try {
      if (isDirGlob || fs.statSync(src).isDirectory()) {
        // Directory copy: all immediate files
        const entries = fs.readdirSync(src, { withFileTypes: true })
        const destDir = path.join(worktreePath, relPath)
        mkdirp(destDir)
        for (const e of entries) {
          if (e.isFile()) {
            fs.copyFileSync(path.join(src, e.name), path.join(destDir, e.name))
            copied.push(path.join(relPath, e.name))
          }
        }
      } else {
        const dest = path.join(worktreePath, relPath)
        mkdirp(path.dirname(dest))
        fs.copyFileSync(src, dest)
        copied.push(relPath)
      }
    } catch {
      // Listed but missing at the root: skip silently
    }
  }
  return copied
}

/**
 * Create a new git worktree for an agent.
 * Each agent gets its own branch + worktree directory.
 * This prevents file-level conflicts between parallel agents.
 * Files listed in .worktreeinclude are copied from the repo root.
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
    git(repoRoot, ['worktree', 'remove', '-f', worktreePath])
  } catch {
    // Ignore errors if worktree doesn't exist
  }

  // Create new branch and worktree
  let branchExists = false
  try {
    git(repoRoot, ['rev-parse', '--verify', branchName])
    branchExists = true
  } catch {
    branchExists = false
  }

  if (branchExists) {
    git(repoRoot, ['worktree', 'add', worktreePath, branchName])
  } else {
    git(repoRoot, ['worktree', 'add', '-b', branchName, worktreePath, 'HEAD'])
  }

  applyWorktreeInclude(repoRoot, worktreePath)

  return {
    branch: branchName,
    path: worktreePath,
    agentId,
    taskId,
    createdAt: Date.now(),
  }
}

/**
 * Create (or reuse) a named worktree on branch `worktree/<name>`.
 * Used by `levelcode --worktree <name>`: the session boots inside the
 * worktree so interactive and headless runs are isolated from the main
 * checkout. Returns the worktree path.
 */
export function createNamedWorktree(repoRoot: string, name: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    throw new Error(
      `Invalid worktree name "${name}": use letters, digits, dot, dash, underscore`,
    )
  }
  const worktreePath = path.join(repoRoot, WORKTREE_DIR, name)
  const branchName = `worktree/${name}`
  mkdirp(path.dirname(worktreePath))

  // Existing worktree for this name: reuse it (resume semantics)
  if (fs.existsSync(path.join(worktreePath, '.git'))) {
    applyWorktreeInclude(repoRoot, worktreePath)
    return worktreePath
  }

  // Remove a stale registration if the directory exists without .git
  try {
    git(repoRoot, ['worktree', 'remove', '-f', worktreePath])
  } catch {
    // not registered
  }

  let branchExists = false
  try {
    git(repoRoot, ['rev-parse', '--verify', branchName])
    branchExists = true
  } catch {
    branchExists = false
  }

  if (branchExists) {
    git(repoRoot, ['worktree', 'add', worktreePath, branchName])
  } else {
    git(repoRoot, ['worktree', 'add', '-b', branchName, worktreePath, 'HEAD'])
  }

  applyWorktreeInclude(repoRoot, worktreePath)
  return worktreePath
}

/**
 * Remove a named worktree created by createNamedWorktree (keeps the branch).
 */
export function removeNamedWorktree(repoRoot: string, name: string): boolean {
  const worktreePath = path.join(repoRoot, WORKTREE_DIR, name)
  try {
    git(repoRoot, ['worktree', 'remove', '-f', worktreePath])
    return true
  } catch {
    return false
  }
}

/**
 * Remove an agent's worktree and branch.
 */
export function removeAgentWorktree(repoRoot: string, agentId: string): void {
  try {
    // List worktrees and remove them
    const worktrees = git(repoRoot, ['worktree', 'list', '--porcelain'])

    for (const line of worktrees.split('\n')) {
      if (line.startsWith('worktree ')) {
        const wtPath = line.replace('worktree ', '').trim()
        if (wtPath.includes(`/${agentId}/`)) {
          git(repoRoot, ['worktree', 'remove', '-f', wtPath])
        }
      }
    }

    // Delete branches for this agent
    const branches = git(repoRoot, ['branch', '--list', `agent/${agentId}/*`])
    for (const branchLine of branches.split('\n')) {
      const branch = branchLine.replace(/^[* ]+/, '').trim()
      if (branch) {
        git(repoRoot, ['branch', '-D', branch])
      }
    }
  } catch {
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
    if (files && files.length > 0) {
      git(worktreePath, ['add', '--', ...files])
    } else {
      git(worktreePath, ['add', '-A'])
    }

    git(worktreePath, ['commit', '-m', message])

    const hash = git(worktreePath, ['rev-parse', 'HEAD']).trim()
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
    const output = git(worktreePath, ['diff', '--stat', baseBranch])

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
    const status = git(worktreePath, ['status', '--porcelain'])
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
    git(worktreePath, ['reset', '--hard', target])
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
    const output = git(repoRoot, ['worktree', 'list', '--porcelain'])

    const worktrees: WorktreeInfo[] = []
    let currentPath = ''
    let currentBranch = ''

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = line.replace('worktree ', '').trim()
      } else if (line.startsWith('branch ')) {
        currentBranch = line.replace('branch ', '').replace('refs/heads/', '').trim()

        // Include agent and named (worktree/) worktrees
        if (currentBranch.startsWith('agent/') || currentBranch.startsWith('worktree/')) {
          const prefix = currentBranch.startsWith('agent/') ? 'agent/' : 'worktree/'
          const parts = currentBranch.replace(prefix, '').split('/')
          worktrees.push({
            branch: currentBranch,
            path: currentPath,
            agentId: prefix === 'worktree/' ? nameOf(currentBranch) : parts[0] ?? 'unknown',
            taskId: prefix === 'agent/' ? parts.slice(1).join('/') || undefined : undefined,
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

function nameOf(branch: string): string {
  return branch.replace('worktree/', '')
}
