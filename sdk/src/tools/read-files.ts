import path, { isAbsolute } from 'path'

import { FILE_READ_STATUS } from '@levelcode/common/old-constants'
import { isFileIgnored } from '@levelcode/common/project-file-tree'

import type { LevelCodeFileSystem } from '@levelcode/common/types/filesystem'

export type FileFilterResult = {
  status: 'blocked' | 'allow-example' | 'allow'
}

export type FileFilter = (filePath: string) => FileFilterResult

/**
 * Max characters of file content returned inline in one tool result
 * (~16k tokens). Larger files are truncated with a head+tail notice — the
 * model can page through with offset/limit-capable tools or bash (sed -n)
 * instead of flooding the context window in one call.
 */
export const INLINE_CONTENT_LIMIT = 64_000

export async function getFiles(params: {
  filePaths: string[]
  cwd: string
  fs: LevelCodeFileSystem
  /**
   * Filter to classify files before reading.
   * If provided, the caller takes full control of filtering (no gitignore check).
   * If not provided, the SDK applies gitignore checking automatically.
   */
  fileFilter?: FileFilter
}) {
  const { filePaths, cwd, fs, fileFilter } = params
  // If caller provides a filter, they own all filtering decisions
  // If not, SDK applies default gitignore checking
  const hasCustomFilter = fileFilter !== undefined

  const result: Record<string, string | null> = {}
  const MAX_FILE_SIZE = 1024 * 1024 // 1MB in bytes

  for (const filePath of filePaths) {
    if (!filePath) {
      continue
    }

    // Convert absolute paths within project to relative paths
    const relativePath = filePath.startsWith(cwd)
      ? path.relative(cwd, filePath)
      : filePath
    // Result keys use forward slashes regardless of platform: tool output is
    // consumed by the model and matches ripgrep/git conventions.
    const resultKey = relativePath.split(path.sep).join('/')
    const fullPath = path.join(cwd, relativePath)
    // Containment via path.relative: a naive startsWith prefix check breaks
    // when cwd is a root-relative POSIX path on Windows ('/project' joins to
    // '\project\...'). relative() normalizes both sides per-platform.
    const containment = path.relative(cwd, fullPath)
    if (
      isAbsolute(relativePath) ||
      containment.startsWith('..') ||
      isAbsolute(containment)
    ) {
      result[resultKey] = FILE_READ_STATUS.OUTSIDE_PROJECT
      continue
    }

    // Apply file filter if provided
    const filterResult = fileFilter?.(relativePath)
    if (filterResult?.status === 'blocked') {
      result[resultKey] = FILE_READ_STATUS.IGNORED
      continue
    }
    const isExampleFile = filterResult?.status === 'allow-example'

    // If no custom filter provided, apply default gitignore checking
    // (allow-example files skip gitignore since they need to bypass .env.* patterns)
    if (!hasCustomFilter && !isExampleFile) {
      const ignored = await isFileIgnored({
        filePath: relativePath,
        projectRoot: cwd,
        fs,
      })
      if (ignored) {
        result[resultKey] = FILE_READ_STATUS.IGNORED
        continue
      }
    }

    try {
      const stats = await fs.stat(fullPath)
      if (stats.size > MAX_FILE_SIZE) {
        result[resultKey] =
          FILE_READ_STATUS.TOO_LARGE +
          ` [${(stats.size / (1024 * 1024)).toFixed(2)}MB]`
      } else {
        const content = await fs.readFile(fullPath, 'utf8')
        // Bound inline size: one huge file must not dominate the context
        // window. Head+tail preserved, with a notice telling the model how
        // to page through the rest.
        const bounded =
          content.length > INLINE_CONTENT_LIMIT
            ? content.slice(0, INLINE_CONTENT_LIMIT / 2) +
              `\n\n[... truncated ${(content.length - INLINE_CONTENT_LIMIT).toLocaleString()} characters of ${content.length.toLocaleString()} total; file: ${relativePath} — page through with offset/limit or bash (sed -n) ...]\n\n` +
              content.slice(-INLINE_CONTENT_LIMIT / 2)
            : content
        // Prepend TEMPLATE marker for example files
        result[resultKey] = isExampleFile
          ? FILE_READ_STATUS.TEMPLATE + '\n' + bounded
          : bounded
      }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        result[resultKey] = FILE_READ_STATUS.DOES_NOT_EXIST
      } else {
        result[resultKey] = FILE_READ_STATUS.ERROR
      }
    }
  }
  return result
}
