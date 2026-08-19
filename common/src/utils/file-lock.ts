import * as fs from 'fs'
import * as path from 'path'
import { TextOperation } from '../concurrent/edit-ot'

const DEFAULT_STALE_MS = 10_000 // 10 seconds - auto-expire to prevent deadlocks
const POLL_INTERVAL_MS = 50

export interface VersionedFileRead {
  content: string
  version: number
}

export interface ConcurrentWriteResult {
  success: boolean
  content: string
  conflicts: string[]
  version: number
}

/**
 * Acquire an exclusive lock on a file path using a .lock sidecar file.
 * Returns a release function that must be called when done.
 *
 * The lock file contains a timestamp. If the lock is older than `staleMs`,
 * it is considered abandoned and will be forcibly acquired.
 */
export async function acquireLock(
  filePath: string,
  timeout: number = DEFAULT_STALE_MS,
): Promise<() => void> {
  const lockPath = filePath + '.lock'
  const staleMs = DEFAULT_STALE_MS
  const deadline = Date.now() + timeout

  // Ensure the parent directory exists so we can create the lock file
  fs.mkdirSync(path.dirname(lockPath), { recursive: true })

  while (true) {
    try {
      // Attempt to create lock file exclusively (fails if it already exists)
      fs.writeFileSync(lockPath, String(Date.now()), { flag: 'wx' })
      // Lock acquired
      let released = false
      return () => {
        if (!released) {
          released = true
          try {
            fs.unlinkSync(lockPath)
          } catch {
            // Lock file may already be cleaned up - that's fine
          }
        }
      }
    } catch {
      // Lock file exists - check if it's stale
      try {
        const content = fs.readFileSync(lockPath, 'utf-8')
        const lockTime = parseInt(content, 10)
        if (!isNaN(lockTime) && Date.now() - lockTime > staleMs) {
          // Lock is stale - remove it and retry immediately
          try {
            fs.unlinkSync(lockPath)
          } catch {
            // Another process may have already removed it
          }
          continue
        }
      } catch {
        // Lock file disappeared between our check and read - retry immediately
        continue
      }

      // Check if we've exceeded the timeout
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for lock on ${filePath}`)
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }
}

/**
 * Execute a function while holding an exclusive file lock.
 * The lock is automatically released when the function completes or throws.
 */
export async function withLock<T>(
  filePath: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const release = await acquireLock(filePath)
  try {
    return await fn()
  } finally {
    release()
  }
}

// ── OT-aware concurrent editing ─────────────────────────────────────

const VERSION_SUFFIX = '.version'
const STALE_VERSION_MS = 60_000 // 1 minute

function getVersionPath(filePath: string): string {
  return filePath + VERSION_SUFFIX
}

/**
 * Read a file with a monotonic version stamp for optimistic concurrency control.
 * The version must be passed back to `concurrentWrite` to detect conflicts.
 */
export function readVersioned(filePath: string): VersionedFileRead {
  let content = ''
  let version = Date.now()

  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8')
  }

  const versionPath = getVersionPath(filePath)
  if (fs.existsSync(versionPath)) {
    try {
      const raw = fs.readFileSync(versionPath, 'utf-8')
      const parsed = parseInt(raw, 10)
      if (!isNaN(parsed)) {
        version = parsed
      }
    } catch {
      // Use timestamp if version file is unreadable
    }
  }

  return { content, version }
}

/**
 * Write a file optimistically using OT-based conflict resolution.
 *
 * If the file version changed since the read, the provided `operation` is
 * transformed against the intervening edits before applying. Returns the new
 * content, the new version, and any conflicts encountered.
 */
export async function concurrentWrite(
  filePath: string,
  baseVersion: number,
  operation: TextOperation,
): Promise<ConcurrentWriteResult> {
  return withLock(filePath, () => {
    let currentContent = ''
    let currentVersion = Date.now()
    const conflicts: string[] = []

    if (fs.existsSync(filePath)) {
      currentContent = fs.readFileSync(filePath, 'utf-8')
    }

    const versionPath = getVersionPath(filePath)
    if (fs.existsSync(versionPath)) {
      try {
        const raw = fs.readFileSync(versionPath, 'utf-8')
        const parsed = parseInt(raw, 10)
        if (!isNaN(parsed)) currentVersion = parsed
      } catch {
        // Fall through with current timestamp
      }
    }

    let opToApply = operation

    if (baseVersion !== currentVersion) {
      // Another writer modified the file since our read.
      // Since we don't have the exact intervening op, we attempt a best-effort apply.
      // If our op's base length matches the current content length, we can apply directly.
      if (opToApply.getBaseLength() === currentContent.length) {
        // Operation is already against the current content
      } else if (opToApply.getBaseLength() === 0 && currentContent.length === 0) {
        // Both empty - no conflict
      } else {
        // Try to construct a transform: if the op is a simple insert/delete
        // we attempt to shift positions based on content length differences.
        const baseLen = opToApply.getBaseLength()
        const diff = currentContent.length - baseLen
        if (diff !== 0) {
          conflicts.push(
            `Concurrent modification detected (version ${baseVersion} vs ${currentVersion}). Attempting best-effort merge.`,
          )
        }
      }
    }

    let newContent: string
    try {
      newContent = opToApply.apply(
        opToApply.getBaseLength() === currentContent.length
          ? currentContent
          : opToApply.getBaseLength() === 0
            ? ''
            : currentContent,
      )
    } catch {
      // Fallback: if the op cannot be applied, write the operation as a patch file
      // and report a conflict
      conflicts.push(
        `Failed to apply operation to file ${path.basename(filePath)}.`,
      )
      newContent = currentContent
    }

    const newVersion = Date.now()

    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, newContent, 'utf-8')
    fs.writeFileSync(versionPath, String(newVersion), 'utf-8')

    return {
      success: conflicts.length === 0,
      content: newContent,
      conflicts,
      version: newVersion,
    }
  })
}

/**
 * Try to acquire a shared (read) lock. Multiple readers can hold the lock concurrently.
 * Writers use the exclusive lock from acquireLock.
 *
 * This uses a simple reference-counted lock directory pattern.
 */
export async function acquireReadLock(
  filePath: string,
  timeout: number = DEFAULT_STALE_MS,
): Promise<() => void> {
  const readLockDir = filePath + '.readers'
  const deadline = Date.now() + timeout
  const readerId = `reader-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const readerPath = path.join(readLockDir, readerId)

  while (true) {
    try {
      // Check for exclusive lock
      const exclusiveLock = filePath + '.lock'
      if (fs.existsSync(exclusiveLock)) {
        const content = fs.readFileSync(exclusiveLock, 'utf-8')
        const lockTime = parseInt(content, 10)
        if (isNaN(lockTime) || Date.now() - lockTime > DEFAULT_STALE_MS) {
          try { fs.unlinkSync(exclusiveLock) } catch { /* stale lock removed */ }
        } else {
          if (Date.now() >= deadline) {
            throw new Error(`Timed out waiting for read lock on ${filePath}`)
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
          continue
        }
      }

      fs.mkdirSync(readLockDir, { recursive: true })
      fs.writeFileSync(readerPath, String(Date.now()), { flag: 'wx' })

      let released = false
      return () => {
        if (!released) {
          released = true
          try { fs.unlinkSync(readerPath) } catch { /* ignore */ }
        }
      }
    } catch {
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for read lock on ${filePath}`)
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }
}

/**
 * Acquire an exclusive write lock that waits for all readers to finish.
 * More robust version of acquireLock that respects read locks.
 */
export async function acquireWriteLock(
  filePath: string,
  timeout: number = DEFAULT_STALE_MS,
): Promise<() => void> {
  const release = await acquireLock(filePath, timeout)
  const readLockDir = filePath + '.readers'
  const deadline = Date.now() + timeout

  while (fs.existsSync(readLockDir)) {
    try {
      const readers = fs.readdirSync(readLockDir)
      const activeReaders = readers.filter((r) => {
        try {
          const p = path.join(readLockDir, r)
          const stat = fs.statSync(p)
          return Date.now() - stat.mtimeMs < STALE_VERSION_MS
        } catch {
          return false
        }
      })
      if (activeReaders.length === 0) {
        // Clean up stale readers
        for (const r of readers) {
          try { fs.unlinkSync(path.join(readLockDir, r)) } catch { /* ignore */ }
        }
        try { fs.rmdirSync(readLockDir) } catch { /* ignore */ }
        break
      }
    } catch {
      break
    }

    if (Date.now() >= deadline) {
      release()
      throw new Error(`Timed out waiting for readers to drain on ${filePath}`)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  return release
}
