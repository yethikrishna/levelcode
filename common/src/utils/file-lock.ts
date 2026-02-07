import * as fs from 'fs'
import * as path from 'path'

const DEFAULT_STALE_MS = 10_000 // 10 seconds - auto-expire to prevent deadlocks
const POLL_INTERVAL_MS = 50

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
