import path from 'path'

import { LEVELCODE_MEMORY_FILE_NAMES_LOWERCASE } from '../constants/knowledge'
import { getErrorObject } from '../util/error'

import type { LevelCodeFileSystem } from '../types/filesystem'
import type { Logger } from '../types/contracts/logger'

/**
 * Selects the highest priority LevelCode memory file from a list of entries in a directory.
 * Priority order: levelcode.md > .levelcode.md > levelcode.local.md (case-insensitive).
 * Returns undefined if no levelcode memory files are found.
 */
export function selectLevelCodeMemoryFile(
  entries: string[],
): string | undefined {
  const lowerToActual = new Map<string, string>()
  for (const entry of entries) {
    const lower = entry.toLowerCase()
    if (LEVELCODE_MEMORY_FILE_NAMES_LOWERCASE.includes(lower)) {
      lowerToActual.set(lower, entry)
    }
  }
  for (const priorityName of LEVELCODE_MEMORY_FILE_NAMES_LOWERCASE) {
    const actual = lowerToActual.get(priorityName)
    if (actual) return actual
  }
  return undefined
}

/**
 * Walks up the directory tree starting from `startDir`, looking for LevelCode memory
 * files (levelcode.md, .levelcode.md, levelcode.local.md) in each directory.
 * Files closer to startDir take precedence (override parent files with same relative key).
 *
 * Returns a record mapping relative path (e.g., "levelcode.md") to file contents.
 * Similar to how CLAUDE.md works - the deepest file wins when there are multiple,
 * but all discovered files are included so parent context is available too.
 *
 * @param startDir - The starting directory (typically cwd).
 * @param fs - File system implementation (uses Node fs by default).
 * @param logger - Optional logger for debug output.
 * @param stopAt - Optional directory to stop at (filesystem root is used if not provided).
 */
export async function findLevelCodeMemoryFiles(params: {
  startDir: string
  fs: LevelCodeFileSystem
  logger?: Logger
  stopAt?: string
}): Promise<Record<string, string>> {
  const { startDir, fs, logger, stopAt } = params
  const results: Record<string, string> = {}

  let currentDir = path.resolve(startDir)
  const root = stopAt ? path.resolve(stopAt) : path.parse(currentDir).root

  while (true) {
    let entries: string[]
    try {
      entries = await fs.readdir(currentDir)
    } catch (error) {
      logger?.debug?.(
        { dir: currentDir, error: getErrorObject(error) },
        'Failed to read directory while searching for levelcode memory files',
      )
      break
    }

    const selectedFile = selectLevelCodeMemoryFile(entries)
    if (selectedFile) {
      const filePath = path.join(currentDir, selectedFile)
      try {
        const content = await fs.readFile(filePath, 'utf8')
        const key = currentDir === path.resolve(startDir)
          ? selectedFile
          : path.relative(startDir, filePath)
        results[key] = content
      } catch (error) {
        logger?.debug?.(
          { filePath, error: getErrorObject(error) },
          'Failed to read levelcode memory file',
        )
      }
    }

    if (currentDir === root) break
    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) break
    currentDir = parentDir
  }

  return results
}

/**
 * Synchronous version of findLevelCodeMemoryFiles using the real Node.js fs module.
 * Convenience for CLI/sync contexts where async is not needed.
 */
export function findLevelCodeMemoryFilesSync(
  startDir: string,
  stopAt?: string,
): Record<string, string> {
  const fs = require('fs') as typeof import('fs')
  const results: Record<string, string> = {}

  let currentDir = path.resolve(startDir)
  const root = stopAt ? path.resolve(stopAt) : path.parse(currentDir).root

  while (true) {
    let entries: string[]
    try {
      entries = fs.readdirSync(currentDir)
    } catch {
      break
    }

    const selectedFile = selectLevelCodeMemoryFile(entries)
    if (selectedFile) {
      const filePath = path.join(currentDir, selectedFile)
      try {
        const content = fs.readFileSync(filePath, 'utf8')
        const key = currentDir === path.resolve(startDir)
          ? selectedFile
          : path.relative(startDir, filePath)
        results[key] = content
      } catch {
        // Ignore unreadable files
      }
    }

    if (currentDir === root) break
    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) break
    currentDir = parentDir
  }

  return results
}
