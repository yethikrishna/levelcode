import * as fs from 'fs'
import * as path from 'path'

import { buildCodeIndex } from './build-index'

import type { CodeGraph, CodeSymbol, CallEdge, CodeMapQuery, SymbolKind } from './build-index'

const DEFAULT_CACHE_DIR = '.levelcode'
const DEFAULT_CACHE_FILE = 'codemap.json'

function cachePath(cwd: string): string {
  return path.join(cwd, DEFAULT_CACHE_DIR, DEFAULT_CACHE_FILE)
}

async function loadOrBuildGraph(cwdOrGraph: string | CodeGraph): Promise<CodeGraph> {
  if (typeof cwdOrGraph !== 'string') return cwdOrGraph
  const cp = cachePath(cwdOrGraph)
  if (fs.existsSync(cp)) {
    try {
      return JSON.parse(fs.readFileSync(cp, 'utf8')) as CodeGraph
    } catch {}
  }
  return buildCodeIndex(cwdOrGraph)
}

/**
 * Query the code map for symbols matching the given criteria.
 *
 * Loads the cached graph from `.levelcode/codemap.json` or builds it if
 * necessary. Supports filtering by name (substring match, case-insensitive),
 * kind, file path, and export status.
 *
 * @param query - Query filters (name, kind, file, exported)
 * @param cwdOrGraph - Project root path or an existing CodeGraph instance
 * @returns Array of matching CodeSymbol entries
 */
export async function queryCodeMap(
  query: CodeMapQuery,
  cwdOrGraph: string | CodeGraph,
): Promise<CodeSymbol[]> {
  const graph = await loadOrBuildGraph(cwdOrGraph)
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
 * Find all callers of a given symbol — i.e., call edges where `toSymbol`
 * matches the provided name. Optionally narrow to callers within a specific
 * target file.
 *
 * @param cwdOrGraph - Project root or pre-built CodeGraph
 * @param symbolName - The symbol name to find callers for
 * @param filePath - Optional file path to restrict the callee definition
 * @returns Array of CallEdge objects representing incoming calls
 */
export async function findCallers(
  cwdOrGraph: string | CodeGraph,
  symbolName: string,
  filePath?: string,
): Promise<CallEdge[]> {
  const graph = await loadOrBuildGraph(cwdOrGraph)
  return graph.calls.filter(
    (c) => c.toSymbol === symbolName && (!filePath || c.toFile === filePath),
  )
}

/**
 * Find all symbols that a given symbol calls (outgoing calls / callees).
 *
 * Because the regex parser does not perfectly attribute every call site to a
 * specific enclosing function, this works best when the caller is identified
 * by file + symbol name. If `callerSymbol` is `'(unknown)'` or omitted and
 * `callerFile` is provided, returns all calls made from that file.
 *
 * @param cwdOrGraph - Project root or pre-built CodeGraph
 * @param callerSymbol - The name of the calling symbol
 * @param callerFile - Optional file containing the caller (disambiguates same-named symbols)
 * @returns Array of CallEdge objects representing outgoing calls
 */
export async function findCallees(
  cwdOrGraph: string | CodeGraph,
  callerSymbol: string,
  callerFile?: string,
): Promise<CallEdge[]> {
  const graph = await loadOrBuildGraph(cwdOrGraph)
  return graph.calls.filter((c) => {
    if (callerFile && c.fromFile !== callerFile.replace(/\\/g, '/')) return false
    if (callerSymbol && callerSymbol !== '(unknown)') {
      return c.fromSymbol === callerSymbol
    }
    return true
  })
}

/**
 * Find all incoming import edges for a given module path.
 * Returns files that import the specified module.
 */
export async function findImporters(
  cwdOrGraph: string | CodeGraph,
  modulePath: string,
): Promise<Array<{ fromFile: string; importedNames: string[] }>> {
  const graph = await loadOrBuildGraph(cwdOrGraph)
  const normModule = modulePath.replace(/\\/g, '/')
  return graph.imports
    .filter((i) => i.toModule.includes(normModule))
    .map((i) => ({ fromFile: i.fromFile, importedNames: i.importedNames }))
}

/**
 * Find all outgoing import edges from a given file.
 */
export async function findImports(
  cwdOrGraph: string | CodeGraph,
  filePath: string,
): Promise<Array<{ toModule: string; importedNames: string[] }>> {
  const graph = await loadOrBuildGraph(cwdOrGraph)
  const normPath = filePath.replace(/\\/g, '/')
  return graph.imports
    .filter((i) => i.fromFile === normPath)
    .map((i) => ({ toModule: i.toModule, importedNames: i.importedNames }))
}

/**
 * Resolve a symbol name to the file where it is defined.
 * Uses both import resolution and cross-file symbol lookup.
 */
export async function resolveSymbol(
  cwdOrGraph: string | CodeGraph,
  symbolName: string,
  fromFile?: string,
): Promise<CodeSymbol | undefined> {
  const graph = await loadOrBuildGraph(cwdOrGraph)

  if (fromFile) {
    const normFrom = fromFile.replace(/\\/g, '/')
    const localSym = graph.symbols.find(
      (s) => s.name === symbolName && s.filePath === normFrom,
    )
    if (localSym) return localSym

    const importForSym = graph.imports.find(
      (imp) => imp.fromFile === normFrom && imp.importedNames.includes(symbolName),
    )
    if (importForSym && importForSym.toModule.startsWith('.')) {
      const allFiles = new Set(graph.filesIndexed)
      const base = path.posix.dirname(normFrom)
      const resolved = path.posix.normalize(path.posix.join(base, importForSym.toModule))
      for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.py', '/index.ts', '/index.js']) {
        const candidate = resolved + ext
        if (allFiles.has(candidate)) {
          const target = graph.symbols.find(
            (s) => s.name === symbolName && s.filePath === candidate,
          )
          if (target) return target
        }
      }
    }
  }

  let best: CodeSymbol | undefined
  let bestScore = -1
  for (const sym of graph.symbols) {
    if (sym.name !== symbolName) continue
    const callers = graph.calls.filter((c) => c.toSymbol === symbolName && c.toFile === sym.filePath).length
    const score = (sym.exported ? 10 : 0) + callers + (sym.kind === 'class' ? 5 : sym.kind === 'function' ? 3 : 1)
    if (score > bestScore) {
      bestScore = score
      best = sym
    }
  }
  return best
}

/**
 * Get graph statistics: total symbols, calls, files indexed, etc.
 */
export async function getGraphStats(cwdOrGraph: string | CodeGraph): Promise<{
  totalSymbols: number
  totalCalls: number
  totalImports: number
  filesIndexed: number
  generatedAt: number
  kinds: Record<string, number>
}> {
  const graph = await loadOrBuildGraph(cwdOrGraph)
  const kinds: Record<string, number> = {}
  for (const sym of graph.symbols) {
    kinds[sym.kind] = (kinds[sym.kind] ?? 0) + 1
  }
  return {
    totalSymbols: graph.symbols.length,
    totalCalls: graph.calls.length,
    totalImports: graph.imports.length,
    filesIndexed: graph.filesIndexed.length,
    generatedAt: graph.generatedAt,
    kinds,
  }
}

export type { CodeGraph, CodeSymbol, CallEdge, CodeMapQuery, SymbolKind }
