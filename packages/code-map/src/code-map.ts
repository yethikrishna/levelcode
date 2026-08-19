import * as fs from 'fs'
import * as path from 'path'

import { getProjectFileTree, getAllFilePaths } from '@levelcode/common/project-file-tree'
import { getLanguageConfig } from './languages'
import { parseTokens } from './parse'

import type { LanguageConfig } from './languages'

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'method'
  | 'enum'
  | 'const'
  | 'import'
  | 'export'
  | 'module'

export type CodeSymbol = {
  name: string
  kind: SymbolKind
  filePath: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
  exported: boolean
  parent?: string
  signature?: string
}

export type CallEdge = {
  fromSymbol: string
  toSymbol: string
  fromFile: string
  toFile?: string
  line: number
}

export type ImportEdge = {
  fromFile: string
  toModule: string
  importedNames: string[]
  isDefault: boolean
  isNamespace: boolean
  line: number
}

export type CodeGraph = {
  version: number
  rootDir: string
  generatedAt: number
  symbols: CodeSymbol[]
  calls: CallEdge[]
  imports: ImportEdge[]
  filesIndexed: string[]
}

export type CodeMapQuery = {
  name?: string
  kind?: SymbolKind
  file?: string
  exported?: boolean
}

const CODEMAP_VERSION = 1
const DEFAULT_CACHE_DIR = '.levelcode'
const DEFAULT_CACHE_FILE = 'codemap.json'
const MAX_FILES = 5000

const TS_FUNCTION_PATTERN =
  /(?:export\s+(?:default\s+)?)?(?:async\s+)?function(?:\s+|\s*\*\s*)([A-Za-z_$][\w$]*)/g
const TS_CLASS_PATTERN =
  /(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g
const TS_INTERFACE_PATTERN =
  /(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g
const TS_TYPE_PATTERN = /(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/g
const TS_ENUM_PATTERN = /(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/g
const TS_CONST_PATTERN =
  /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/g
const TS_EXPORT_NAMED = /export\s+\{([^}]+)\}/g
const TS_IMPORT_PATTERN =
  /import\s+(?:(?:(\*\s+as\s+([A-Za-z_$][\w$]*))|(default\s+)?([A-Za-z_$][\w$]*)?(?:\s*,\s*\{([^}]+)\})?|\{([^}]+)\})\s+from\s+)?['"]([^'"]+)['"]/g
const TS_CALL_PATTERN = /([A-Za-z_$][\w$]*)\s*\(/g
const TS_METHOD_PATTERN =
  /(?:public|private|protected|static|async|\s)*\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^=]+)?\s*\{/g

const PY_FUNCTION_PATTERN =
  /(?:async\s+)?def\s+([A-Za-z_$][\w$]*)\s*\(/g
const PY_CLASS_PATTERN = /class\s+([A-Za-z_$][\w$]*)\s*(?:\(|:)/g
const PY_IMPORT_PATTERN =
  /(?:from\s+([\w.]+)\s+import\s+([\w,\s*]+)|import\s+([\w.,\s]+))/g
const PY_CALL_PATTERN = /([A-Za-z_$][\w$]*)\s*\(/g

const SUPPORTED_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.mjs',
  '.cjs',
])

function getLineAndColumn(src: string, offset: number): { line: number; column: number } {
  const before = src.slice(0, offset)
  const lines = before.split('\n')
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  }
}

function isExported(src: string, matchStart: number): boolean {
  const prefix = src.slice(Math.max(0, matchStart - 100), matchStart)
  return /export\s*$/.test(prefix.trim()) || /export\s+(default\s+)?$/.test(prefix.trim())
}

function extractTSExports(src: string, filePath: string): CodeSymbol[] {
  const symbols: CodeSymbol[] = []
  const patterns: Array<{ re: RegExp; kind: SymbolKind }> = [
    { re: TS_FUNCTION_PATTERN, kind: 'function' },
    { re: TS_CLASS_PATTERN, kind: 'class' },
    { re: TS_INTERFACE_PATTERN, kind: 'interface' },
    { re: TS_TYPE_PATTERN, kind: 'type' },
    { re: TS_ENUM_PATTERN, kind: 'enum' },
    { re: TS_CONST_PATTERN, kind: 'const' },
  ]

  for (const { re, kind } of patterns) {
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(src)) !== null) {
      const name = match[1]
      const pos = getLineAndColumn(src, match.index)
      const exported = isExported(src, match.index)
      symbols.push({
        name,
        kind,
        filePath,
        line: pos.line,
        column: pos.column,
        exported,
      })
    }
  }

  TS_EXPORT_NAMED.lastIndex = 0
  let exMatch: RegExpExecArray | null
  while ((exMatch = TS_EXPORT_NAMED.exec(src)) !== null) {
    const names = exMatch[1]
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean)
    const pos = getLineAndColumn(src, exMatch.index)
    for (const name of names) {
      symbols.push({
        name,
        kind: 'variable',
        filePath,
        line: pos.line,
        column: pos.column,
        exported: true,
      })
    }
  }

  const defaultExportMatch = src.match(/export\s+default\s+(?:class|function)?\s*([A-Za-z_$][\w$]*)?/)
  if (defaultExportMatch) {
    const name = defaultExportMatch[1] ?? 'default'
    const pos = getLineAndColumn(src, defaultExportMatch.index ?? 0)
    symbols.push({
      name,
      kind: defaultExportMatch[0].includes('class')
        ? 'class'
        : defaultExportMatch[0].includes('function')
          ? 'function'
          : 'variable',
      filePath,
      line: pos.line,
      column: pos.column,
      exported: true,
    })
  }

  return symbols
}

function extractTSImports(src: string, filePath: string): ImportEdge[] {
  const edges: ImportEdge[] = []
  TS_IMPORT_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TS_IMPORT_PATTERN.exec(src)) !== null) {
    const moduleName = match[6]
    const isNamespace = !!match[1]
    const namespaceName = match[2]
    const defaultImport = match[4]
    const namedImports = match[5] || match[6] === match[6] ? match[5] : null
    const pos = getLineAndColumn(src, match.index)

    const importedNames: string[] = []
    let isDefault = false

    if (isNamespace && namespaceName) {
      importedNames.push(namespaceName)
    }
    if (defaultImport) {
      importedNames.push(defaultImport)
      isDefault = true
    }
    if (namedImports) {
      const names = namedImports
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean)
      importedNames.push(...names)
    }

    edges.push({
      fromFile: filePath,
      toModule: moduleName,
      importedNames,
      isDefault,
      isNamespace,
      line: pos.line,
    })
  }
  return edges
}

function extractTSCalls(src: string, filePath: string): CallEdge[] {
  const calls: CallEdge[] = []
  TS_CALL_PATTERN.lastIndex = 0
  const keywords = new Set([
    'if',
    'for',
    'while',
    'switch',
    'catch',
    'return',
    'function',
    'typeof',
    'new',
    'await',
    'import',
    'void',
    'delete',
  ])
  let match: RegExpExecArray | null
  while ((match = TS_CALL_PATTERN.exec(src)) !== null) {
    const name = match[1]
    if (keywords.has(name)) continue
    const before = src.slice(Math.max(0, match.index - 20), match.index)
    if (/function\s*$/.test(before)) continue
    const pos = getLineAndColumn(src, match.index)
    calls.push({
      fromSymbol: '(unknown)',
      toSymbol: name,
      fromFile: filePath,
      line: pos.line,
    })
  }
  return calls
}

function extractTSMethods(src: string, filePath: string, parentClass: string): CodeSymbol[] {
  const symbols: CodeSymbol[] = []
  TS_METHOD_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TS_METHOD_PATTERN.exec(src)) !== null) {
    const name = match[1]
    if (
      ['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(name)
    ) {
      continue
    }
    const pos = getLineAndColumn(src, match.index)
    symbols.push({
      name,
      kind: 'method',
      filePath,
      line: pos.line,
      column: pos.column,
      exported: false,
      parent: parentClass,
    })
  }
  return symbols
}

function extractPythonSymbols(src: string, filePath: string): CodeSymbol[] {
  const symbols: CodeSymbol[] = []
  PY_FUNCTION_PATTERN.lastIndex = 0
  let fnMatch: RegExpExecArray | null
  while ((fnMatch = PY_FUNCTION_PATTERN.exec(src)) !== null) {
    const name = fnMatch[1]
    if (name.startsWith('_')) continue
    const pos = getLineAndColumn(src, fnMatch.index)
    const lineStart = src.lastIndexOf('\n', fnMatch.index) + 1
    const linePrefix = src.slice(lineStart, fnMatch.index)
    const exported = !name.startsWith('_')
    symbols.push({
      name,
      kind: 'function',
      filePath,
      line: pos.line,
      column: pos.column,
      exported,
    })
  }

  PY_CLASS_PATTERN.lastIndex = 0
  let clsMatch: RegExpExecArray | null
  while ((clsMatch = PY_CLASS_PATTERN.exec(src)) !== null) {
    const name = clsMatch[1]
    const pos = getLineAndColumn(src, clsMatch.index)
    symbols.push({
      name,
      kind: 'class',
      filePath,
      line: pos.line,
      column: pos.column,
      exported: true,
    })
  }

  return symbols
}

function extractPythonImports(src: string, filePath: string): ImportEdge[] {
  const edges: ImportEdge[] = []
  PY_IMPORT_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = PY_IMPORT_PATTERN.exec(src)) !== null) {
    const pos = getLineAndColumn(src, match.index)
    if (match[1]) {
      const names = match[2]
        .split(',')
        .map((s) => s.trim().replace(/[()]/g, '').split(/\s+as\s+/)[0].trim())
        .filter((n) => n && n !== '*')
      edges.push({
        fromFile: filePath,
        toModule: match[1],
        importedNames: names,
        isDefault: false,
        isNamespace: false,
        line: pos.line,
      })
    } else if (match[3]) {
      const modules = match[3]
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean)
      for (const mod of modules) {
        edges.push({
          fromFile: filePath,
          toModule: mod,
          importedNames: [],
          isDefault: false,
          isNamespace: true,
          line: pos.line,
        })
      }
    }
  }
  return edges
}

function extractPythonCalls(src: string, filePath: string): CallEdge[] {
  const calls: CallEdge[] = []
  PY_CALL_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  const keywords = new Set(['def', 'class', 'if', 'for', 'while', 'elif', 'except'])
  while ((match = PY_CALL_PATTERN.exec(src)) !== null) {
    const name = match[1]
    if (keywords.has(name)) continue
    const before = src.slice(Math.max(0, match.index - 10), match.index)
    if (/(?:def|class)\s*$/.test(before)) continue
    const pos = getLineAndColumn(src, match.index)
    calls.push({
      fromSymbol: '(unknown)',
      toSymbol: name,
      fromFile: filePath,
      line: pos.line,
    })
  }
  return calls
}

function parseFileWithRegex(
  filePath: string,
  source: string,
): { symbols: CodeSymbol[]; calls: CallEdge[]; imports: ImportEdge[] } {
  const ext = path.extname(filePath).toLowerCase()
  const isPython = ext === '.py'
  const isTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)

  if (isTS) {
    const symbols = extractTSExports(source, filePath)
    const imports = extractTSImports(source, filePath)
    const calls = extractTSCalls(source, filePath)
    const classBodies = source.match(/class\s+[A-Za-z_$][\w$]*\s*\{[\s\S]*?\n\}/g)
    if (classBodies) {
      for (const clsBody of classBodies) {
        const nameMatch = clsBody.match(/class\s+([A-Za-z_$][\w$]*)/)
        if (nameMatch) {
          symbols.push(...extractTSMethods(clsBody, filePath, nameMatch[1]))
        }
      }
    }
    return { symbols, calls, imports }
  }

  if (isPython) {
    const symbols = extractPythonSymbols(source, filePath)
    const imports = extractPythonImports(source, filePath)
    const calls = extractPythonCalls(source, filePath)
    return { symbols, calls, imports }
  }

  return { symbols: [], calls: [], imports: [] }
}

async function parseFileWithTreeSitter(
  filePath: string,
  source: string,
  langConfig: LanguageConfig,
): Promise<{ symbols: CodeSymbol[]; calls: CallEdge[]; imports: ImportEdge[] } | null> {
  try {
    if (!langConfig.parser || !langConfig.query) return null
    const parseResults = parseTokens(filePath, langConfig, () => source)
    const identifiers = parseResults.identifiers ?? []
    const calls = parseResults.calls ?? []

    const symbols: CodeSymbol[] = []
    const callEdges: CallEdge[] = []
    const importEdges: ImportEdge[] = []

    for (let i = 0; i < identifiers.length; i++) {
      symbols.push({
        name: identifiers[i],
        kind: 'variable',
        filePath,
        line: 0,
        column: 0,
        exported: false,
      })
    }

    for (const call of calls) {
      callEdges.push({
        fromSymbol: '(unknown)',
        toSymbol: call,
        fromFile: filePath,
        line: 0,
      })
    }

    return { symbols, calls: callEdges, imports: importEdges }
  } catch {
    return null
  }
}

function resolveImport(
  importEdge: ImportEdge,
  allFiles: Set<string>,
  fromFile: string,
): string | undefined {
  const mod = importEdge.toModule
  if (mod.startsWith('.')) {
    const base = path.dirname(fromFile)
    const resolved = path.normalize(path.join(base, mod))
    const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', '/index.ts', '/index.tsx', '/index.js']
    for (const ext of exts) {
      const candidate = resolved.replace(/\\/g, '/') + ext
      if (allFiles.has(candidate)) return candidate
      const candidate2 = resolved.replace(/\\/g, '/').replace(/\/index$/, '') + ext
      if (allFiles.has(candidate2)) return candidate2
    }
  }
  return undefined
}

function cacheDirFor(cwd: string): string {
  return path.join(cwd, DEFAULT_CACHE_DIR)
}

function cachePathFor(cwd: string): string {
  return path.join(cacheDirFor(cwd), DEFAULT_CACHE_FILE)
}

export function getCachePath(cwd: string): string {
  return cachePathFor(cwd)
}

/**
 * Build a persistent code graph index for a project directory.
 *
 * Extracts functions, classes, interfaces, types, imports, and call edges
 * from TypeScript/JavaScript/Python files. Uses tree-sitter-wasm when available,
 * falling back to regex-based parsing for broader file coverage.
 *
 * Results are cached to `.levelcode/codemap.json` relative to cwd.
 *
 * @param cwd - Project root directory
 * @param options - Optional build options
 * @returns The constructed CodeGraph
 */
export async function buildCodeMap(
  cwd: string,
  options: { forceRebuild?: boolean; maxFiles?: number } = {},
): Promise<CodeGraph> {
  const { forceRebuild = false, maxFiles = MAX_FILES } = options
  const cachePath = cachePathFor(cwd)

  if (!forceRebuild && fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as CodeGraph
      if (cached.version === CODEMAP_VERSION && cached.rootDir === cwd) {
        return cached
      }
    } catch {
      // Cache is corrupted, rebuild
    }
  }

  const fileTree = await getProjectFileTree({
    projectRoot: cwd,
    maxFiles,
    fs: fs.promises,
  })
  const allPaths = getAllFilePaths(fileTree)
  const sourceFiles = allPaths.filter((f) => SUPPORTED_EXTS.has(path.extname(f).toLowerCase()))
  const allFilesSet = new Set(sourceFiles.map((f) => f.replace(/\\/g, '/')))

  const allSymbols: CodeSymbol[] = []
  const allCalls: CallEdge[] = []
  const allImports: ImportEdge[] = []
  const filesIndexed: string[] = []

  for (const relPath of sourceFiles) {
    const fullPath = path.join(cwd, relPath)
    let source: string
    try {
      source = fs.readFileSync(fullPath, 'utf8')
    } catch {
      continue
    }

    const normPath = relPath.replace(/\\/g, '/')
    filesIndexed.push(normPath)

    const langConfig = await getLanguageConfig(fullPath)

    let parseResult: {
      symbols: CodeSymbol[]
      calls: CallEdge[]
      imports: ImportEdge[]
    } | null = null

    if (langConfig) {
      parseResult = await parseFileWithTreeSitter(normPath, source, langConfig)
    }

    if (!parseResult) {
      parseResult = parseFileWithRegex(normPath, source)
    }

    allSymbols.push(...parseResult.symbols)
    allCalls.push(...parseResult.calls)
    allImports.push(...parseResult.imports)
  }

  const symbolByFile = new Map<string, Map<string, CodeSymbol>>()
  for (const sym of allSymbols) {
    if (!symbolByFile.has(sym.filePath)) {
      symbolByFile.set(sym.filePath, new Map())
    }
    symbolByFile.get(sym.filePath)!.set(sym.name, sym)
  }

  for (const call of allCalls) {
    const importForCall = allImports.find(
      (imp) =>
        imp.fromFile === call.fromFile && imp.importedNames.includes(call.toSymbol),
    )
    if (importForCall) {
      const resolvedFile = resolveImport(importForCall, allFilesSet, call.fromFile)
      if (resolvedFile) {
        call.toFile = resolvedFile
      }
    } else {
      for (const [filePath, symMap] of symbolByFile) {
        if (filePath === call.fromFile) continue
        if (symMap.has(call.toSymbol)) {
          call.toFile = filePath
          break
        }
      }
    }
  }

  const graph: CodeGraph = {
    version: CODEMAP_VERSION,
    rootDir: cwd,
    generatedAt: Date.now(),
    symbols: allSymbols,
    calls: allCalls,
    imports: allImports,
    filesIndexed,
  }

  try {
    const cacheDir = cacheDirFor(cwd)
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }
    fs.writeFileSync(cachePath, JSON.stringify(graph, null, 2))
  } catch {
    // Cache write failure is non-fatal
  }

  return graph
}

/**
 * Query the code graph for symbols matching the given criteria.
 *
 * If no graph is supplied, attempts to load the cached graph from
 * `.levelcode/codemap.json`.
 *
 * @param query - Query filters (name, kind, file, exported)
 * @param cwdOrGraph - Project root (to load cached graph) or an existing CodeGraph
 * @returns Matching symbols
 */
export async function queryCodeMap(
  query: CodeMapQuery,
  cwdOrGraph: string | CodeGraph,
): Promise<CodeSymbol[]> {
  let graph: CodeGraph
  if (typeof cwdOrGraph === 'string') {
    const cachePath = cachePathFor(cwdOrGraph)
    if (!fs.existsSync(cachePath)) {
      graph = await buildCodeMap(cwdOrGraph)
    } else {
      graph = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as CodeGraph
    }
  } else {
    graph = cwdOrGraph
  }

  const { name, kind, file, exported } = query
  const nameLower = name?.toLowerCase()

  return graph.symbols.filter((sym) => {
    if (nameLower && !sym.name.toLowerCase().includes(nameLower)) return false
    if (kind && sym.kind !== kind) return false
    if (file) {
      const normFile = file.replace(/\\/g, '/')
      if (!sym.filePath.includes(normFile)) return false
    }
    if (exported !== undefined && sym.exported !== exported) return false
    return true
  })
}

/**
 * Find callers of a given symbol name across the codebase.
 */
export function findCallers(
  graph: CodeGraph,
  symbolName: string,
  filePath?: string,
): CallEdge[] {
  return graph.calls.filter(
    (c) => c.toSymbol === symbolName && (!filePath || c.toFile === filePath),
  )
}

/**
 * Get the files a given file imports.
 */
export function getOutgoingImports(graph: CodeGraph, filePath: string): ImportEdge[] {
  const normPath = filePath.replace(/\\/g, '/')
  return graph.imports.filter((i) => i.fromFile === normPath)
}

/**
 * Get files that import from a given module path.
 */
export function getIncomingImports(graph: CodeGraph, modulePath: string): ImportEdge[] {
  const normPath = modulePath.replace(/\\/g, '/')
  return graph.imports.filter((i) => i.toModule.includes(normPath))
}
