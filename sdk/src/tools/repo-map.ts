import * as fsSync from 'fs'
import * as path from 'path'

import { getFileTokenScores } from '@levelcode/code-map/parse'
import { buildCodeIndex, detectLanguage } from '@levelcode/code-map/build-index'
import {
  getProjectFileTree,
  getAllFilePaths,
} from '../../../common/src/project-file-tree'
import {
  formatRepoMap,
  DEFAULT_REPO_MAP_BUDGET,
} from '../../../common/src/utils/repo-map-format'

import type { LevelCodeToolOutput } from '../../../common/src/tools/list'
import type { CodeSymbol, CodeGraph } from '@levelcode/code-map/build-index'

export interface RepoMapOptions {
  projectPath: string
  focus_path?: string
  max_chars?: number
}

export interface GenerateRepoMapOptions {
  maxChars?: number
  maxSymbolsPerFile?: number
  maxTokensPerFile?: number
  maxFiles?: number
  focusPath?: string
  includeSignatures?: boolean
  showNonExported?: boolean
}

const REPOMAP_CACHE_VERSION = 1
const REPOMAP_CACHE_DIR = '.levelcode'
const REPOMAP_CACHE_FILE = 'repomap-cache.json'

const MAX_MAPPED_FILES = 2500
const DEFAULT_MAX_SYMBOLS_PER_FILE = 25
const KIND_ICONS: Record<string, string> = {
  function: 'fn',
  class: 'class',
  interface: 'iface',
  type: 'type',
  enum: 'enum',
  method: 'method',
  const: 'const',
  variable: 'let',
  module: 'mod',
}

function extractSignature(source: string, line: number, name: string): string | undefined {
  const lines = source.split('\n')
  if (line < 1 || line > lines.length) return undefined
  const startIdx = line - 1
  let sig = lines[startIdx]?.trim() ?? ''
  for (let i = startIdx + 1; i < Math.min(lines.length, startIdx + 5); i++) {
    if (sig.includes('{') || sig.includes(';') || sig.includes('=') && sig.includes(name)) break
    sig += ' ' + lines[i].trim()
  }
  return sig.length > 120 ? sig.slice(0, 117) + '...' : sig
}

function groupSymbolsByFile(symbols: CodeSymbol[]): Map<string, CodeSymbol[]> {
  const byFile = new Map<string, CodeSymbol[]>()
  for (const sym of symbols) {
    if (!byFile.has(sym.filePath)) {
      byFile.set(sym.filePath, [])
    }
    byFile.get(sym.filePath)!.push(sym)
  }
  return byFile
}

function sortSymbols(symbols: CodeSymbol[]): CodeSymbol[] {
  const kindOrder: Record<string, number> = {
    class: 0,
    interface: 1,
    enum: 2,
    type: 3,
    function: 4,
    method: 5,
    const: 6,
    variable: 7,
    module: 8,
  }
  return [...symbols].sort((a, b) => {
    const ka = kindOrder[a.kind] ?? 99
    const kb = kindOrder[b.kind] ?? 99
    if (ka !== kb) return ka - kb
    return a.line - b.line
  })
}

function countCalls(graph: CodeGraph, filePath: string, symbolName: string): number {
  return graph.calls.filter(
    (c) => c.toSymbol === symbolName && c.toFile === filePath,
  ).length
}

/**
 * Generate a compact markdown summary of each file showing exported symbols
 * (functions, classes, types, constants) using regex parsing. Similar to
 * Aider's repo map. Results are cached to `.levelcode/repomap-cache.json`
 * and invalidated on file mtime changes.
 *
 * Uses regex-based light parsing (no tree-sitter dependency required) for
 * broad language support (TS/JS/Python).
 *
 * @param cwd - Project root directory
 * @param options - Generation options: maxFiles, maxTokensPerFile, maxChars, focusPath, etc.
 * @returns Markdown string suitable for LLM context injection
 */
export async function generateRepoMap(
  cwd: string,
  options: GenerateRepoMapOptions = {},
): Promise<string> {
  const {
    maxChars = DEFAULT_REPO_MAP_BUDGET * 2,
    maxSymbolsPerFile = DEFAULT_MAX_SYMBOLS_PER_FILE,
    maxTokensPerFile,
    maxFiles,
    focusPath,
    includeSignatures = false,
    showNonExported = false,
  } = options

  const effectiveMaxTokens = maxTokensPerFile ?? maxSymbolsPerFile
  const cacheDir = path.join(cwd, REPOMAP_CACHE_DIR)
  const cachePath = path.join(cacheDir, REPOMAP_CACHE_FILE)

  const graph = await buildCodeIndex(cwd, maxFiles ? { maxFiles } : {})

  const cacheKey = JSON.stringify({
    maxChars, maxSymbolsPerFile: effectiveMaxTokens, focusPath,
    includeSignatures, showNonExported, generatedAt: graph.generatedAt,
  })

  if (fsSync.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fsSync.readFileSync(cachePath, 'utf8'))
      if (cached.version === REPOMAP_CACHE_VERSION && cached.key === cacheKey) {
        return cached.markdown
      }
    } catch {}
  }

  let symbols = graph.symbols
  if (!showNonExported) {
    symbols = symbols.filter((s) => s.exported)
  }

  if (focusPath) {
    const norm = focusPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
    symbols = symbols.filter((s) => s.filePath === norm || s.filePath.startsWith(norm + '/'))
  }

  const byFile = groupSymbolsByFile(symbols)

  const fileScores = new Map<string, number>()
  for (const [file, fileSymbols] of byFile) {
    let score = 0
    for (const sym of fileSymbols) {
      score += countCalls(graph, file, sym.name) + 1
    }
    fileScores.set(file, score)
  }

  const rankedFiles = [...byFile.entries()]
    .map(([file, syms]) => ({ file, syms, score: fileScores.get(file) ?? 0 }))
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))

  const header = [
    '# Repository Map',
    '',
    `> Root: \`${path.basename(cwd)}\` | ${rankedFiles.length} files | ${symbols.length} symbols | generated at ${new Date(graph.generatedAt).toISOString()}`,
    focusPath ? `> Focus: \`${focusPath}\`` : undefined,
    '> Legend: `fn`=function, `class`=class, `iface`=interface, `type`=type alias, `enum`=enum, `const`=const, `let`=var/let',
    '',
    '---',
    '',
  ]
    .filter(Boolean)
    .join('\n')

  const lines: string[] = []
  let used = header.length
  let truncated = false

  for (const entry of rankedFiles) {
    const sorted = sortSymbols(entry.syms).slice(0, effectiveMaxTokens)
    if (sorted.length === 0) continue

    const fileHeader = `## \`${entry.file}\``
    const symbolLines: string[] = []

    for (const sym of sorted) {
      const icon = KIND_ICONS[sym.kind] ?? sym.kind
      const calls = countCalls(graph, entry.file, sym.name)
      const callHint = calls >= 3 ? ` *(called ${calls}x)*` : calls >= 1 ? ` *(called ${calls}x)*` : ''
      let sig = ''
      if (includeSignatures && sym.signature) {
        sig = ` — \`${sym.signature.replace(/`/g, "'")}\``
      } else if (includeSignatures) {
        try {
          const src = fsSync.readFileSync(path.join(cwd, entry.file), 'utf8')
          const extracted = extractSignature(src, sym.line, sym.name)
          if (extracted) sig = ` — \`${extracted.replace(/`/g, "'")}\``
        } catch {}
      }
      const parent = sym.parent ? ` (in ${sym.parent})` : ''
      symbolLines.push(`- **${icon}** \`${sym.name}\`${parent}${callHint}${sig}`)
    }

    const block = [fileHeader, '', ...symbolLines, ''].join('\n')

    if (used + block.length > maxChars) {
      truncated = true
      break
    }

    lines.push(block)
    used += block.length
  }

  let output = header + lines.join('\n')
  if (truncated) {
    const remaining = rankedFiles.length - lines.filter((l) => l.startsWith('## ')).length
    output += `\n\n---\n\n*... ${remaining} more files omitted due to character budget (raise maxChars or set focusPath to narrow scope).*\n`
  }

  try {
    if (!fsSync.existsSync(cacheDir)) fsSync.mkdirSync(cacheDir, { recursive: true })
    fsSync.writeFileSync(cachePath, JSON.stringify({
      version: REPOMAP_CACHE_VERSION,
      key: cacheKey,
      markdown: output,
    }, null, 2))
  } catch {}

  return output
}

/**
 * Build a compact file-only outline (paths + exported symbol names), one
 * line per file — useful when character budget is tight.
 */
export function generateCompactRepoMap(graph: CodeGraph, maxChars = DEFAULT_REPO_MAP_BUDGET): string {
  const exported = graph.symbols.filter((s) => s.exported)
  const byFile = groupSymbolsByFile(exported)
  const lines: string[] = [
    'Repo map (compact):',
    '',
  ]
  let used = lines.join('\n').length

  const sortedFiles = [...byFile.keys()].sort()
  for (const file of sortedFiles) {
    const syms = sortSymbols(byFile.get(file)!)
    const names = syms
      .map((s) => {
        const icon = KIND_ICONS[s.kind] ?? s.kind
        return `${icon}:${s.name}`
      })
      .join(', ')
    const line = `${file}: ${names}`
    if (used + line.length + 1 > maxChars) break
    lines.push(line)
    used += line.length + 1
  }

  return lines.join('\n')
}

/**
 * Client-side implementation of the `repo_map` tool: parse the project with
 * tree-sitter (via @levelcode/code-map), rank files and symbols by
 * cross-reference importance, and return a budgeted structural outline.
 */
export async function repoMap(
  options: RepoMapOptions,
): Promise<LevelCodeToolOutput<'repo_map'>> {
  const { projectPath, focus_path } = options
  const maxChars = options.max_chars ?? DEFAULT_REPO_MAP_BUDGET

  try {
    const fileTree = await getProjectFileTree({
      projectRoot: projectPath,
      fs: fsSync.promises,
    })
    let filePaths = getAllFilePaths(fileTree)

    if (focus_path) {
      const normalizedFocus = focus_path
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/\/$/, '')
      filePaths = filePaths.filter((filePath) => {
        const normalized = filePath.replace(/\\/g, '/')
        return (
          normalized === normalizedFocus ||
          normalized.startsWith(normalizedFocus + '/')
        )
      })
    }

    filePaths = filePaths.slice(0, MAX_MAPPED_FILES)

    const { tokenScores, tokenCallers } = await getFileTokenScores(
      projectPath,
      filePaths,
    )

    const map = formatRepoMap({
      tokenScores,
      tokenCallers,
      focusPath: focus_path,
      maxChars,
    })

    return [
      {
        type: 'json',
        value: {
          map,
          fileCount: Object.keys(tokenScores).length,
        },
      },
    ]
  } catch (error) {
    return [
      {
        type: 'json',
        value: {
          errorMessage: `Failed to build repo map: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      },
    ]
  }
}
