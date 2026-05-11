import path from 'path'
import os from 'os'

// ============================================================================
// Config Directory
// ============================================================================

export function getConfigDir(): string {
  const home = os.homedir()
  // Use .levelcode in home directory
  const baseDir = process.env.LEVELCODE_DIR || path.join(home, '.levelcode')
  return baseDir
}

// ============================================================================
// Additional utilities commonly needed
// ============================================================================

export function getDataDir(): string {
  return path.join(getConfigDir(), 'data')
}

export function getTempDir(): string {
  return path.join(getConfigDir(), 'temp')
}

export function getCacheDir(): string {
  return path.join(getConfigDir(), 'cache')
}