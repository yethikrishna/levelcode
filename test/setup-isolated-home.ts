/**
 * Global test preload: give every test a fresh, isolated home directory
 * via LEVELCODE_HOME.
 *
 * Why: bun caches os.homedir() at first use, so swapping HOME/USERPROFILE
 * per test does not move user-data paths after the first caller — tests
 * leaked state into each other (and on CI, into the runner's real home).
 * Every user-data path in the monorepo goes through
 * `getUserHomeDir()` (common/src/utils/home-dir.ts), which prefers
 * LEVELCODE_HOME. Env reads are live, so this per-test override is reliable
 * on every platform.
 *
 * Tests that want a specific home can set LEVELCODE_HOME themselves; the
 * preload restores the previous value afterwards. Temp dirs are cleaned up.
 */

import { beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

let currentHome: string | null = null
let savedValue: string | undefined

beforeEach(() => {
  savedValue = process.env.LEVELCODE_HOME
  try {
    currentHome = fs.mkdtempSync(path.join(os.tmpdir(), 'levelcode-home-'))
  } catch {
    currentHome = null // Fall back to whatever homedir resolves to
  }
  if (currentHome) {
    process.env.LEVELCODE_HOME = currentHome
  }
})

afterEach(() => {
  if (savedValue !== undefined) {
    process.env.LEVELCODE_HOME = savedValue
  } else {
    delete process.env.LEVELCODE_HOME
  }
  if (currentHome) {
    try {
      fs.rmSync(currentHome, { recursive: true, force: true })
    } catch {
      // Best-effort cleanup
    }
    currentHome = null
  }
})
