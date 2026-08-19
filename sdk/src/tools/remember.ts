import * as fsSync from 'fs'
import * as path from 'path'

import {
  addMemoryEntry,
  emptyMemoryFile,
  getMemoryStats,
  MEMORY_DIR_NAME,
  MEMORY_FILE_NAME,
} from '../../../common/src/utils/agent-memory'

import type { MemoryCategory } from '../../../common/src/utils/agent-memory'
import type { LevelCodeToolOutput } from '../../../common/src/tools/list'

export interface RememberOptions {
  projectPath: string
  category: MemoryCategory
  content: string
}

/**
 * Client-side implementation of the `remember` tool: persist a durable
 * insight to .levelcode/MEMORY.md so every future session starts smarter.
 */
export async function remember(
  options: RememberOptions,
): Promise<LevelCodeToolOutput<'remember'>> {
  const { projectPath, category, content } = options

  try {
    const memoryDir = path.join(projectPath, MEMORY_DIR_NAME)
    const memoryPath = path.join(memoryDir, MEMORY_FILE_NAME)

    let existing = emptyMemoryFile()
    try {
      existing = fsSync.readFileSync(memoryPath, 'utf8')
    } catch {
      // No memory file yet — start fresh.
    }

    const result = addMemoryEntry(existing, { category, content })
    if (!result.added) {
      return [
        {
          type: 'json',
          value: {
            saved: false,
            message: `Memory not saved: ${result.reason ?? 'unknown reason'}.`,
          },
        },
      ]
    }

    fsSync.mkdirSync(memoryDir, { recursive: true })
    fsSync.writeFileSync(memoryPath, result.content, 'utf8')

    const stats = getMemoryStats(result.content)
    return [
      {
        type: 'json',
        value: {
          saved: true,
          message: `Saved ${category} to ${MEMORY_DIR_NAME}/${MEMORY_FILE_NAME}. Future sessions in this repo will start with this insight in context.`,
          totalMemories: stats.total,
        },
      },
    ]
  } catch (error) {
    return [
      {
        type: 'json',
        value: {
          errorMessage: `Failed to save memory: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      },
    ]
  }
}
