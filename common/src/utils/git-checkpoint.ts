import { spawnSync } from 'child_process'
import path from 'path'

/**
 * Result from creating or restoring a git checkpoint.
 */
export interface CheckpointResult {
  /** Whether the checkpoint operation succeeded */
  success: boolean
  /** Git ref (commit hash or stash reference) for the checkpoint */
  ref?: string
  /** Human-readable message describing the result */
  message: string
  /** Error message if the operation failed */
  error?: string
}

/**
 * Options for creating a WIP checkpoint.
 */
export interface CreateCheckpointOptions {
  /** Whether to stash untracked files (default: true) */
  includeUntracked?: boolean
  /** Whether to create a commit instead of a stash (default: false) */
  useCommit?: boolean
  /** Custom label appended to the checkpoint message */
  label?: string
  /** Maximum message length in the ref label */
  maxLabelLength?: number
}

const DEFAULT_CREATE_OPTIONS: Required<CreateCheckpointOptions> = {
  includeUntracked: true,
  useCommit: false,
  label: '',
  maxLabelLength: 80,
}

/**
 * Check whether a directory is inside a git work tree.
 */
function isGitRepository(cwd: string): boolean {
  try {
    const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
    })
    return result.status === 0 && result.stdout.trim() === 'true'
  } catch {
    return false
  }
}

/**
 * Get the current git branch name or HEAD if detached.
 */
function getCurrentBranch(cwd: string): string {
  try {
    const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
    })
    if (result.status === 0) {
      return result.stdout.trim()
    }
  } catch {
    // fall through
  }
  return 'HEAD'
}

/**
 * Check whether the working directory has any changes (tracked or untracked).
 */
function hasWorkingChanges(cwd: string, includeUntracked: boolean): boolean {
  try {
    const args = ['status', '--porcelain']
    if (includeUntracked) {
      args.push('-uall')
    } else {
      args.push('-uno')
    }
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
    })
    if (result.status !== 0) return false
    return result.stdout.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Format a checkpoint message with timestamp and optional label.
 */
function formatCheckpointMessage(label: string, maxLength: number): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const prefix = `levelcode/wip-${timestamp}`
  if (!label) return prefix

  const sanitized = label
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, maxLength - prefix.length - 1)

  return sanitized ? `${prefix}-${sanitized}` : prefix
}

/**
 * Create a WIP checkpoint before a batch of edits.
 *
 * Attempts to create either a stash entry (default) or a WIP commit that can
 * be restored later via restoreCheckpoint(). If there are no working changes,
 * returns success with ref pointing to the current HEAD.
 *
 * @param cwd - Working directory (must be a git repository)
 * @param label - Optional label to include in the checkpoint message
 * @param options - Checkpoint creation options
 * @returns CheckpointResult with the git ref on success
 *
 * @example
 * ```ts
 * const checkpoint = await createWipCheckpoint('/path/to/repo', 'before-agent-edit')
 * if (checkpoint.success) {
 *   // ... perform edits ...
 *   // restoreCheckpoint('/path/to/repo', checkpoint.ref!)
 * }
 * ```
 */
export function createWipCheckpoint(
  cwd: string,
  label?: string,
  options?: CreateCheckpointOptions,
): CheckpointResult {
  const resolvedCwd = path.resolve(cwd)
  const opts: Required<CreateCheckpointOptions> = {
    ...DEFAULT_CREATE_OPTIONS,
    ...(label !== undefined ? { label } : {}),
    ...options,
  }

  if (!isGitRepository(resolvedCwd)) {
    return {
      success: false,
      message: 'Not a git repository — checkpoint skipped',
      error: `${resolvedCwd} is not inside a git work tree`,
    }
  }

  const includeUntracked = opts.includeUntracked

  if (!hasWorkingChanges(resolvedCwd, includeUntracked)) {
    try {
      const headResult = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: resolvedCwd,
        encoding: 'utf8',
        timeout: 5000,
      })
      const headRef = headResult.status === 0 ? headResult.stdout.trim() : 'HEAD'
      return {
        success: true,
        ref: headRef,
        message: 'No working changes — checkpoint at current HEAD',
      }
    } catch {
      return {
        success: true,
        ref: 'HEAD',
        message: 'No working changes — checkpoint at current HEAD',
      }
    }
  }

  const message = formatCheckpointMessage(opts.label, opts.maxLabelLength)

  if (opts.useCommit) {
    return createWipCommit(resolvedCwd, message, includeUntracked)
  }

  return createStash(resolvedCwd, message, includeUntracked)
}

/**
 * Create a stash entry checkpoint.
 */
function createStash(
  cwd: string,
  message: string,
  includeUntracked: boolean,
): CheckpointResult {
  const args = ['stash', 'push', '-m', message]
  if (includeUntracked) {
    args.push('--include-untracked')
  }

  try {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 30000,
    })

    if (result.status !== 0) {
      return {
        success: false,
        message: 'Failed to create stash checkpoint',
        error: result.stderr.trim() || result.stdout.trim() || 'Unknown git error',
      }
    }

    const listResult = spawnSync('git', ['stash', 'list', '-n', '1', '--format=%gd'], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
    })

    let stashRef = 'stash@{0}'
    if (listResult.status === 0 && listResult.stdout.trim()) {
      stashRef = listResult.stdout.trim()
    }

    return {
      success: true,
      ref: stashRef,
      message: `Created stash checkpoint: ${stashRef}`,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      message: 'Exception while creating stash checkpoint',
      error: errorMessage,
    }
  }
}

/**
 * Create a WIP commit checkpoint.
 */
function createWipCommit(
  cwd: string,
  message: string,
  includeUntracked: boolean,
): CheckpointResult {
  try {
    const addArgs = ['add', '-A']
    if (includeUntracked) {
      addArgs.push('.')
    }
    const addResult = spawnSync('git', addArgs, {
      cwd,
      encoding: 'utf8',
      timeout: 30000,
    })
    if (addResult.status !== 0) {
      return {
        success: false,
        message: 'Failed to stage files for WIP commit',
        error: addResult.stderr.trim() || addResult.stdout.trim(),
      }
    }

    const commitResult = spawnSync(
      'git',
      ['commit', '--no-verify', '-m', `WIP: ${message}`, '--no-gpg-sign'],
      {
        cwd,
        encoding: 'utf8',
        timeout: 30000,
      },
    )

    if (commitResult.status !== 0) {
      return {
        success: false,
        message: 'Failed to create WIP commit checkpoint',
        error: commitResult.stderr.trim() || commitResult.stdout.trim(),
      }
    }

    const revResult = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
    })
    const commitRef =
      revResult.status === 0 ? revResult.stdout.trim() : 'HEAD'

    return {
      success: true,
      ref: commitRef,
      message: `Created WIP commit: ${commitRef.slice(0, 12)}`,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      message: 'Exception while creating WIP commit',
      error: errorMessage,
    }
  }
}

/**
 * Restore the working directory to a previous checkpoint.
 *
 * For stash refs, applies the stash and drops it. For commit refs,
 * resets to that commit (mixed reset, keeping changes in working tree).
 *
 * @param cwd - Working directory
 * @param ref - Git ref to restore (from createWipCheckpoint result)
 * @returns CheckpointResult describing the restore outcome
 *
 * @example
 * ```ts
 * const restore = restoreCheckpoint('/path/to/repo', 'stash@{0}')
 * if (restore.success) {
 *   console.log('Restored to checkpoint')
 * }
 * ```
 */
export function restoreCheckpoint(cwd: string, ref: string): CheckpointResult {
  const resolvedCwd = path.resolve(cwd)

  if (!isGitRepository(resolvedCwd)) {
    return {
      success: false,
      message: 'Not a git repository — restore skipped',
      error: `${resolvedCwd} is not inside a git work tree`,
    }
  }

  const isStash = ref.startsWith('stash@') || ref.startsWith('stash{')

  if (isStash) {
    return restoreStash(resolvedCwd, ref)
  }

  return restoreCommit(resolvedCwd, ref)
}

/**
 * Restore a stash checkpoint by popping it.
 */
function restoreStash(cwd: string, stashRef: string): CheckpointResult {
  try {
    const result = spawnSync('git', ['stash', 'pop', stashRef], {
      cwd,
      encoding: 'utf8',
      timeout: 30000,
    })

    if (result.status !== 0) {
      const dropResult = spawnSync('git', ['stash', 'drop', stashRef], {
        cwd,
        encoding: 'utf8',
        timeout: 5000,
      })

      return {
        success: false,
        ref: stashRef,
        message: `Stash apply had conflicts — stash ${dropResult.status === 0 ? 'dropped' : 'kept'}`,
        error: result.stderr.trim() || result.stdout.trim() || 'Stash apply conflict',
      }
    }

    return {
      success: true,
      ref: stashRef,
      message: `Restored from stash: ${stashRef}`,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      ref: stashRef,
      message: 'Exception while restoring stash',
      error: errorMessage,
    }
  }
}

/**
 * Restore to a specific commit ref using mixed reset.
 * This leaves the working tree intact while resetting the index.
 */
function restoreCommit(cwd: string, commitRef: string): CheckpointResult {
  try {
    const verifyResult = spawnSync('git', ['rev-parse', '--verify', commitRef], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
    })

    if (verifyResult.status !== 0) {
      return {
        success: false,
        ref: commitRef,
        message: 'Invalid commit ref',
        error: `Ref "${commitRef}" could not be resolved`,
      }
    }

    const result = spawnSync('git', ['reset', '--mixed', commitRef], {
      cwd,
      encoding: 'utf8',
      timeout: 30000,
    })

    if (result.status !== 0) {
      return {
        success: false,
        ref: commitRef,
        message: 'Failed to reset to checkpoint commit',
        error: result.stderr.trim() || result.stdout.trim(),
      }
    }

    return {
      success: true,
      ref: commitRef,
      message: `Restored to commit: ${commitRef.slice(0, 12)}`,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      ref: commitRef,
      message: 'Exception while restoring commit',
      error: errorMessage,
    }
  }
}

/**
 * List all LevelCode-created WIP checkpoints in the current repository.
 * Returns stash entries and WIP commits on the current branch.
 */
export function listCheckpoints(cwd: string): Array<{
  ref: string
  message: string
  type: 'stash' | 'commit'
}> {
  const resolvedCwd = path.resolve(cwd)
  const checkpoints: Array<{ ref: string; message: string; type: 'stash' | 'commit' }> = []

  if (!isGitRepository(resolvedCwd)) {
    return checkpoints
  }

  try {
    const stashResult = spawnSync(
      'git',
      ['stash', 'list', '--format=%gd%x09%s'],
      {
        cwd: resolvedCwd,
        encoding: 'utf8',
        timeout: 5000,
      },
    )

    if (stashResult.status === 0) {
      for (const line of stashResult.stdout.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const tabIdx = trimmed.indexOf('\t')
        if (tabIdx === -1) continue
        const ref = trimmed.slice(0, tabIdx)
        const message = trimmed.slice(tabIdx + 1)
        if (message.includes('levelcode/wip')) {
          checkpoints.push({ ref, message, type: 'stash' })
        }
      }
    }
  } catch {
    // ignore stash listing errors
  }

  try {
    const logResult = spawnSync(
      'git',
      ['log', '--oneline', '-20', '--grep=^WIP: levelcode/wip'],
      {
        cwd: resolvedCwd,
        encoding: 'utf8',
        timeout: 5000,
      },
    )

    if (logResult.status === 0) {
      for (const line of logResult.stdout.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const spaceIdx = trimmed.indexOf(' ')
        if (spaceIdx === -1) continue
        const ref = trimmed.slice(0, spaceIdx)
        const message = trimmed.slice(spaceIdx + 1)
        checkpoints.push({ ref, message, type: 'commit' })
      }
    }
  } catch {
    // ignore log listing errors
  }

  return checkpoints
}

/**
 * Async wrapper for createWipCheckpoint.
 */
export async function createWipCheckpointAsync(
  cwd: string,
  label?: string,
  options?: CreateCheckpointOptions,
): Promise<CheckpointResult> {
  return createWipCheckpoint(cwd, label, options)
}

/**
 * Async wrapper for restoreCheckpoint.
 */
export async function restoreCheckpointAsync(
  cwd: string,
  ref: string,
): Promise<CheckpointResult> {
  return restoreCheckpoint(cwd, ref)
}
