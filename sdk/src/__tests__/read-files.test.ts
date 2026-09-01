import { FILE_READ_STATUS } from '@levelcode/common/old-constants'
import * as projectFileTree from '@levelcode/common/project-file-tree'
import { createNodeError } from '@levelcode/common/testing/errors'
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test'


import path from 'path'

import { getFiles, INLINE_CONTENT_LIMIT } from '../tools/read-files'

import type { LevelCodeFileSystem } from '@levelcode/common/types/filesystem'
import type { PathLike } from 'node:fs'


// Helper to create a mock filesystem
function createMockFs(config: {
  files?: Record<string, { content: string; size?: number }>
  errors?: Record<string, { code?: string; message?: string }>
}): LevelCodeFileSystem {
  const { files = {}, errors = {} } = config

  // Fixture keys are written as POSIX literals; lookups receive paths built
  // with path.join, which differ on Windows ('/project' vs '\project').
  // Normalize both sides so the mock is platform-agnostic.
  const normalizedFiles = Object.fromEntries(
    Object.entries(files).map(([key, value]) => [path.normalize(key), value]),
  )
  const normalizedErrors = Object.fromEntries(
    Object.entries(errors).map(([key, value]) => [path.normalize(key), value]),
  )
  const lookupKey = (filePath: PathLike) => path.normalize(String(filePath))

  return {
    readFile: async (filePath: PathLike) => {
      const pathStr = lookupKey(filePath)
      if (errors[pathStr]) {
        throw createNodeError(
          errors[pathStr].message || 'Unknown error',
          errors[pathStr].code || 'UNKNOWN',
        )
      }
      if (normalizedFiles[pathStr]) {
        return normalizedFiles[pathStr].content
      }
      throw createNodeError(
        `ENOENT: no such file or directory: ${pathStr}`,
        'ENOENT',
      )
    },
    stat: async (filePath: PathLike) => {
      const pathStr = lookupKey(filePath)
      if (normalizedErrors[pathStr]) {
        throw createNodeError(
          normalizedErrors[pathStr].message || 'Unknown error',
          normalizedErrors[pathStr].code || 'UNKNOWN',
        )
      }
      if (normalizedFiles[pathStr]) {
        return {
          size: normalizedFiles[pathStr].size ?? normalizedFiles[pathStr].content.length,
          isDirectory: () => false,
          isFile: () => true,
          atimeMs: Date.now(),
          mtimeMs: Date.now(),
        }
      }
      throw createNodeError(
        `ENOENT: no such file or directory: ${pathStr}`,
        'ENOENT',
      )
    },
    readdir: async () => [],
    mkdir: async () => undefined,
    writeFile: async () => undefined,
  } as unknown as LevelCodeFileSystem
}

describe('getFiles', () => {
  let isFileIgnoredSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    // Default: no files are ignored
    isFileIgnoredSpy = spyOn(projectFileTree, 'isFileIgnored').mockResolvedValue(
      false,
    )
  })

  afterEach(() => {
    mock.restore()
  })

  describe('reading normal files', () => {
    test('should return file content for a valid file', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/src/index.ts': { content: 'console.log("hello")' },
        },
      })

      const result = await getFiles({
        filePaths: ['src/index.ts'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['src/index.ts']).toBe('console.log("hello")')
    })

    test('should handle multiple files', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/src/a.ts': { content: 'file a' },
          '/project/src/b.ts': { content: 'file b' },
        },
      })

      const result = await getFiles({
        filePaths: ['src/a.ts', 'src/b.ts'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['src/a.ts']).toBe('file a')
      expect(result['src/b.ts']).toBe('file b')
    })

    test('should skip empty file paths', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/src/index.ts': { content: 'content' },
        },
      })

      const result = await getFiles({
        filePaths: ['', 'src/index.ts', ''],
        cwd: '/project',
        fs: mockFs,
      })

      expect(Object.keys(result)).toEqual(['src/index.ts'])
      expect(result['src/index.ts']).toBe('content')
    })
  })

  describe('file not found', () => {
    test('should return DOES_NOT_EXIST for missing files', async () => {
      const mockFs = createMockFs({
        files: {},
      })

      const result = await getFiles({
        filePaths: ['nonexistent.ts'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['nonexistent.ts']).toBe(FILE_READ_STATUS.DOES_NOT_EXIST)
    })
  })

  describe('file outside project', () => {
    test('should return OUTSIDE_PROJECT for absolute paths outside project', async () => {
      const mockFs = createMockFs({
        files: {},
      })

      const result = await getFiles({
        filePaths: ['/etc/passwd'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['/etc/passwd']).toBe(FILE_READ_STATUS.OUTSIDE_PROJECT)
    })

    test('should return OUTSIDE_PROJECT for relative paths that escape project', async () => {
      const mockFs = createMockFs({
        files: {},
      })

      const result = await getFiles({
        filePaths: ['../outside/secret.txt'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['../outside/secret.txt']).toBe(
        FILE_READ_STATUS.OUTSIDE_PROJECT,
      )
    })
  })

  describe('file too large', () => {
    test('should return TOO_LARGE for files over 1MB', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/large.bin': {
            content: 'x',
            size: 2 * 1024 * 1024, // 2MB
          },
        },
      })

      const result = await getFiles({
        filePaths: ['large.bin'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['large.bin']).toContain(FILE_READ_STATUS.TOO_LARGE)
      expect(result['large.bin']).toContain('2.00MB')
    })

    test('should read files exactly at 1MB limit', async () => {
      const oneMBContent = 'x'.repeat(1024 * 1024)
      const mockFs = createMockFs({
        files: {
          '/project/exactly1mb.bin': {
            content: oneMBContent,
            size: 1024 * 1024, // exactly 1MB
          },
        },
      })

      const result = await getFiles({
        filePaths: ['exactly1mb.bin'],
        cwd: '/project',
        fs: mockFs,
      })

      // With the inline cap, a 1MB read returns bounded head+tail, not the raw file
      const exact = result['exactly1mb.bin'] as string
      expect(exact.length).toBeLessThan(oneMBContent.length)
      expect(exact).toContain('truncated')
    })
  })

  describe('gitignore blocking', () => {
    test('should return IGNORED for gitignored files', async () => {
      isFileIgnoredSpy.mockResolvedValue(true)

      const mockFs = createMockFs({
        files: {
          '/project/node_modules/package/index.js': { content: 'module code' },
        },
      })

      const result = await getFiles({
        filePaths: ['node_modules/package/index.js'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['node_modules/package/index.js']).toBe(
        FILE_READ_STATUS.IGNORED,
      )
    })

    test('should call isFileIgnored with correct parameters', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/src/index.ts': { content: 'content' },
        },
      })

      await getFiles({
        filePaths: ['src/index.ts'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(isFileIgnoredSpy).toHaveBeenCalledWith({
        filePath: 'src/index.ts',
        projectRoot: '/project',
        fs: mockFs,
      })
    })

    test('should handle mix of ignored and non-ignored files', async () => {
      // First call returns false (not ignored), second returns true (ignored)
      isFileIgnoredSpy
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)

      const mockFs = createMockFs({
        files: {
          '/project/src/index.ts': { content: 'main code' },
          '/project/node_modules/pkg/index.js': { content: 'dependency' },
        },
      })

      const result = await getFiles({
        filePaths: ['src/index.ts', 'node_modules/pkg/index.js'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['src/index.ts']).toBe('main code')
      expect(result['node_modules/pkg/index.js']).toBe(FILE_READ_STATUS.IGNORED)
    })
  })

  describe('default gitignore behavior', () => {
    test('should block gitignored files when no fileFilter is provided', async () => {
      isFileIgnoredSpy.mockResolvedValue(true)

      const mockFs = createMockFs({
        files: {
          '/project/node_modules/pkg/index.js': { content: 'module code' },
        },
      })

      const result = await getFiles({
        filePaths: ['node_modules/pkg/index.js'],
        cwd: '/project',
        fs: mockFs,
        // No fileFilter provided - SDK applies default gitignore checking
      })

      expect(result['node_modules/pkg/index.js']).toBe(FILE_READ_STATUS.IGNORED)
      expect(isFileIgnoredSpy).toHaveBeenCalled()
    })

    test('should NOT check gitignore when fileFilter is provided (caller owns filtering)', async () => {
      // File would normally be ignored by gitignore
      isFileIgnoredSpy.mockResolvedValue(true)

      const mockFs = createMockFs({
        files: {
          '/project/node_modules/pkg/index.js': { content: 'module code' },
        },
      })

      const result = await getFiles({
        filePaths: ['node_modules/pkg/index.js'],
        cwd: '/project',
        fs: mockFs,
        // Caller provides a filter that allows everything
        fileFilter: () => ({ status: 'allow' }),
      })

      // File should be read since caller's filter allowed it
      expect(result['node_modules/pkg/index.js']).toBe('module code')
      // isFileIgnored should NOT have been called since caller provided a filter
      expect(isFileIgnoredSpy).not.toHaveBeenCalled()
    })
  })

  describe('file read errors', () => {
    test('should return ERROR for unexpected read errors', async () => {
      const mockFs = createMockFs({
        files: {},
        errors: {
          '/project/broken.ts': { code: 'EACCES', message: 'Permission denied' },
        },
      })

      // Need to also make stat fail with same error
      const originalStat = mockFs.stat
      Object.assign(mockFs, {
        stat: async (filePath: PathLike) => {
          const pathStr = String(filePath)
          if (pathStr === '/project/broken.ts') {
            throw createNodeError('Permission denied', 'EACCES')
          }
          return originalStat(pathStr)
        },
      })

      const result = await getFiles({
        filePaths: ['broken.ts'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['broken.ts']).toBe(FILE_READ_STATUS.ERROR)
    })
  })

  describe('path normalization', () => {
    test('should convert absolute paths within project to relative paths', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/src/index.ts': { content: 'content' },
        },
      })

      const result = await getFiles({
        filePaths: ['/project/src/index.ts'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['src/index.ts']).toBe('content')
    })
  })

  describe('fileFilter option', () => {
    test('should block files when filter returns blocked status', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/.env': { content: 'SECRET=value' },
          '/project/src/index.ts': { content: 'normal file' },
        },
      })

      const result = await getFiles({
        filePaths: ['.env', 'src/index.ts'],
        cwd: '/project',
        fs: mockFs,
        fileFilter: (path) => {
          if (path === '.env') return { status: 'blocked' }
          return { status: 'allow' }
        },
      })

      expect(result['.env']).toBe(FILE_READ_STATUS.IGNORED)
      expect(result['src/index.ts']).toBe('normal file')
    })

    test('should mark template files with TEMPLATE prefix', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/.env.example': { content: 'API_KEY=your_key_here' },
        },
      })

      const result = await getFiles({
        filePaths: ['.env.example'],
        cwd: '/project',
        fs: mockFs,
        fileFilter: () => ({ status: 'allow-example' }),
      })

      expect(result['.env.example']).toBe(
        FILE_READ_STATUS.TEMPLATE + '\n' + 'API_KEY=your_key_here',
      )
    })

    test('should skip gitignore check for allow-example files', async () => {
      // When caller provides a filter that returns allow-example,
      // the file is read and marked with TEMPLATE prefix
      isFileIgnoredSpy.mockResolvedValue(true)

      const mockFs = createMockFs({
        files: {
          '/project/.env.example': { content: 'template content' },
        },
      })

      const result = await getFiles({
        filePaths: ['.env.example'],
        cwd: '/project',
        fs: mockFs,
        fileFilter: () => ({ status: 'allow-example' }),
      })

      // Should NOT be blocked since caller's filter marked it as allow-example
      expect(result['.env.example']).toBe(
        FILE_READ_STATUS.TEMPLATE + '\n' + 'template content',
      )
      // When a custom filter is provided, gitignore is not checked
      expect(isFileIgnoredSpy).not.toHaveBeenCalled()
    })

    test('should run filter before gitignore check', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/secret.key': { content: 'private key' },
        },
      })

      const result = await getFiles({
        filePaths: ['secret.key'],
        cwd: '/project',
        fs: mockFs,
        fileFilter: () => ({ status: 'blocked' }),
      })

      expect(result['secret.key']).toBe(FILE_READ_STATUS.IGNORED)
      // isFileIgnored should not have been called since filter blocked first
      expect(isFileIgnoredSpy).not.toHaveBeenCalled()
    })

    test('should still enforce other checks for template files', async () => {
      const mockFs = createMockFs({
        files: {},
      })

      const result = await getFiles({
        filePaths: ['/etc/passwd', 'nonexistent.txt'],
        cwd: '/project',
        fs: mockFs,
        fileFilter: () => ({ status: 'allow-example' }),
      })

      // Should still block files outside project
      expect(result['/etc/passwd']).toBe(FILE_READ_STATUS.OUTSIDE_PROJECT)
      // Should still report missing files
      expect(result['nonexistent.txt']).toBe(FILE_READ_STATUS.DOES_NOT_EXIST)
    })
  })
})

describe('getFiles inline content cap', () => {
  function makeFs(files: Record<string, string>): LevelCodeFileSystem {
    const normalized = Object.fromEntries(
      Object.entries(files).map(([key, value]) => [path.normalize(key), value]),
    )
    return {
      readFile: async (filePath: PathLike) => {
        const key = path.normalize(String(filePath))
        if (normalized[key] !== undefined) return normalized[key]
        throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' })
      },
      stat: async (filePath: PathLike) => {
        const key = path.normalize(String(filePath))
        if (normalized[key] !== undefined) {
          return {
            size: normalized[key]!.length,
            isDirectory: () => false,
            isFile: () => true,
            atimeMs: Date.now(),
            mtimeMs: Date.now(),
          }
        }
        throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' })
      },
      readdir: async () => [],
      mkdir: async () => undefined,
      writeFile: async () => undefined,
    } as unknown as LevelCodeFileSystem
  }

  test('returns small files inline untouched', async () => {
    const result = await getFiles({
      filePaths: ['a.ts'],
      cwd: '/project',
      fs: makeFs({ '/project/a.ts': 'x'.repeat(1000) }),
    })
    expect(result['a.ts']).toHaveLength(1000)
  })

  test('truncates oversized files with head+tail and a paging notice', async () => {
    const big = 'A'.repeat(INLINE_CONTENT_LIMIT) + 'M'.repeat(INLINE_CONTENT_LIMIT)
    const result = await getFiles({
      filePaths: ['big.ts'],
      cwd: '/project',
      fs: makeFs({ '/project/big.ts': big }),
    })

    const returned = result['big.ts'] as string
    expect(returned.length).toBeLessThan(big.length)
    expect(returned).toContain('truncated')
    // Head and tail preserved
    expect(returned.startsWith('A')).toBe(true)
    expect(returned.endsWith('M')).toBe(true)
  })

  test('keeps truncation bounded even for a 1MB file', async () => {
    const big = 'x'.repeat(1024 * 1024)
    const result = await getFiles({
      filePaths: ['huge.ts'],
      cwd: '/project',
      fs: makeFs({ '/project/huge.ts': big }),
    })
    const returned = result['huge.ts'] as string
    // head + tail + notice, well under the raw size
    expect(returned.length).toBeLessThan(INLINE_CONTENT_LIMIT * 1.1)
  })
})
