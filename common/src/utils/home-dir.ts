import * as os from 'os'

/**
 * Resolvable user home directory.
 *
 * Bun caches `os.homedir()` at first use, which makes per-test HOME
 * swapping unreliable (the first caller freezes the value for the whole
 * process). User-data paths across the monorepo go through this helper
 * instead, so tests and sandboxes can relocate the home reliably with
 * `LEVELCODE_HOME` (env reads are always live).
 */
export function getUserHomeDir(): string {
  return process.env.LEVELCODE_HOME || os.homedir()
}
