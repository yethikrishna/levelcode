import * as fs from 'fs'
import * as path from 'path'

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'const'
  | 'variable'
  | 'method'
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
  fileMtimes: Record<string, number>
}

export type CodeMapQuery = {
  name?: string
  kind?: SymbolKind
  file?: string
  exported?: boolean
}

export type Language = 'typescript' | 'javascript' | 'python' | 'unknown'

const CODEMAP_VERSION = 2
const DEFAULT_CACHE_DIR = '.levelcode'
const DEFAULT_CACHE_FILE = 'codemap.json'
const MAX_FILES = 5000

const SUPPORTED_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.mjs', '.cjs',
])

const TS_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function',
  'typeof', 'new', 'await', 'import', 'void', 'delete', 'super',
  'this', 'throw', 'else', 'do', 'in', 'of', 'instanceof', 'as',
])

const PY_KEYWORDS = new Set([
  'def', 'class', 'if', 'for', 'while', 'elif', 'except', 'import',
  'from', 'return', 'yield', 'raise', 'with', 'lambda', 'print',
  'pass', 'break', 'continue', 'not', 'and', 'or', 'in', 'is',
  'None', 'True', 'False', 'self',
])

const STRING_LITERAL_RE = /(['"`])((?:\\.|(?!\1).)*)\1/g
const LINE_COMMENT_RE = /\/\/.*$/gm
const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g
const PY_COMMENT_RE = /#.*$/gm

const TS_FN_RE = /(?:export\s+(?:default\s+)?)?(?:async\s+)?function(?:\s+|\s*\*\s*)([A-Za-z_$][\w$]*)/g
const TS_CLASS_RE = /(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g
const TS_IFACE_RE = /(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g
const TS_TYPE_RE = /(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/g
const TS_ENUM_RE = /(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/g
const TS_CONST_RE = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/g
const TS_ARROW_RE = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?\([^)]*\)\s*(?::[^=]+)?\s*=>/g
const TS_NAMED_EXPORT_RE = /export\s+\{([^}]+)\}/g
const TS_DEFAULT_EXPORT_RE = /export\s+default\s+(?:class|function)?\s*([A-Za-z_$][\w$]*)?/g
const TS_IMPORT_RE = /import\s+(?:(?:(\*\s+as\s+([A-Za-z_$][\w$]*))|(default\s+)?([A-Za-z_$][\w$]*)?(?:\s*,\s*\{([^}]+)\})?|\{([^}]+)\})\s+from\s+)?['"]([^'"]+)['"]/g
const TS_CALL_RE = /(?<![.\w])([A-Za-z_$][\w$]*)\s*\(/g
const TS_METHOD_RE = /(?:public|private|protected|static|async|\s)*\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^=]+)?\s*\{/g

const PY_FN_RE = /(?:async\s+)?def\s+([A-Za-z_$][\w$]*)\s*\(/g
const PY_CLASS_RE = /class\s+([A-Za-z_$][\w$]*)\s*(?:\(|:)/g
const PY_FROM_IMPORT_RE = /from\s+([\w.]+)\s+import\s+([\w,\s*()]+)/g
const PY_IMPORT_RE = /import\s+([\w.,\s]+)/g
const PY_CALL_RE = /(?<![.\w])([A-Za-z_$][\w$]*)\s*\(/g
const PY_ASSIGN_RE = /^([A-Za-z_$][\w$]*)\s*=/gm

/**
 * Detect the programming language of a file by its extension.
 */
export function detectLanguage(filePath: string): Language {
  const ext = path.extname(filePath).toLowerCase()
  if (['.ts', '.tsx'].includes(ext)) return 'typescript'
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return 'javascript'
  if (ext === '.py') return 'python'
  return 'unknown'
}

function stripCommentsAndStrings(source: string, lang: Language): string {
  let s = source
  if (lang === 'python') {
    s = s.replace(PY_COMMENT_RE, '')
  } else {
    s = s.replace(BLOCK_COMMENT_RE, '')
    s = s.replace(LINE_COMMENT_RE, '')
  }
  return s.replace(STRING_LITERAL_RE, '""')
}

function lineCol(src: string, offset: number): { line: number; column: number } {
  const before = src.slice(0, offset)
  const lines = before.split('\n')
  return { line: lines.length, column: lines[lines.length - 1].length + 1 }
}

function isExported(src: string, start: number): boolean {
  const prefix = src.slice(Math.max(0, start - 120), start)
  return /export\s*$/.test(prefix.trim()) || /export\s+(default\s+)?$/.test(prefix.trim())
}

function getSignature(src: string, offset: number): string {
  const ls = src.lastIndexOf('\n', offset) + 1
  let le = src.indexOf('\n', offset)
  if (le === -1) le = src.length
  const sig = src.slice(ls, le).trim()
  return sig.length > 100 ? sig.slice(0, 97) + '...' : sig
}

function parseTS(src: string, filePath: string) {
  const symbols: CodeSymbol[] = []
  const calls: CallEdge[] = []
  const imports: ImportEdge[] = []
  const clean = stripCommentsAndStrings(src, 'typescript')

  const addSym = (name: string, kind: SymbolKind, idx: number, exported?: boolean, parent?: string) => {
    const { line, column } = lineCol(src, idx)
    symbols.push({
      name, kind, filePath, line, column,
      exported: exported ?? isExported(clean, idx),
      parent,
      signature: ['function', 'method'].includes(kind) ? getSignature(src, idx) : undefined,
    })
  }

  for (const [re, kind] of [
    [TS_FN_RE, 'function' as SymbolKind],
    [TS_CLASS_RE, 'class' as SymbolKind],
    [TS_IFACE_RE, 'interface' as SymbolKind],
    [TS_TYPE_RE, 'type' as SymbolKind],
    [TS_ENUM_RE, 'enum' as SymbolKind],
  ] as const) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(clean))) addSym(m[1], kind, m.index)
  }

  {
    const re = new RegExp(TS_ARROW_RE.source, 'g')
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(clean))) {
      const name = m[1]
      if (!symbols.find((s) => s.name === name && s.kind === 'function')) {
        addSym(name, 'function', m.index)
      }
    }
  }

  {
    const re = new RegExp(TS_CONST_RE.source, 'g')
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(clean))) {
      const name = m[1]
      const ctx = clean.slice(Math.max(0, m.index - 5), m.index + name.length + 40)
      if (ctx.includes('=>') || /function\s*\(/.test(ctx)) continue
      if (!symbols.find((s) => s.name === name)) addSym(name, 'const', m.index)
    }
  }

  {
    const re = new RegExp(TS_NAMED_EXPORT_RE.source, 'g')
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(clean))) {
      const pos = lineCol(src, m.index)
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim()
        if (!name) continue
        const existing = symbols.find((s) => s.name === name)
        if (existing) existing.exported = true
        else symbols.push({ name, kind: 'variable', filePath, line: pos.line, column: pos.column, exported: true })
      }
    }
  }

  {
    const re = new RegExp(TS_DEFAULT_EXPORT_RE.source, 'g')
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(clean))) {
      const name = m[1] ?? 'default'
      const kind: SymbolKind = m[0].includes('class') ? 'class' : m[0].includes('function') ? 'function' : 'variable'
      const pos = lineCol(src, m.index)
      const existing = name !== 'default' ? symbols.find((s) => s.name === name) : undefined
      if (existing) existing.exported = true
      else symbols.push({ name, kind, filePath, line: pos.line, column: pos.column, exported: true })
    }
  }

  {
    const clsRe = /class\s+([A-Za-z_$][\w$]*)\s*(?:extends\s+[A-Za-z_$][\w$]*)?\s*\{([\s\S]*?)(?=\n\})/g
    let cm: RegExpExecArray | null
    while ((cm = clsRe.exec(clean))) {
      const clsName = cm[1]
      const body = cm[2]
      const mRe = new RegExp(TS_METHOD_RE.source, 'g')
      mRe.lastIndex = 0
      let mm: RegExpExecArray | null
      while ((mm = mRe.exec(body))) {
        if (mm[1] === 'constructor') continue
        if (TS_KEYWORDS.has(mm[1])) continue
        const absIdx = cm.index + cm[0].indexOf(body) + mm.index
        const isPub = /(?:^|\s)(public|protected)\s/.test(mm[0])
        addSym(mm[1], 'method', absIdx, isPub, clsName)
      }
    }
  }

  {
    const re = new RegExp(TS_IMPORT_RE.source, 'g')
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(clean))) {
      const mod = m[7]
      const pos = lineCol(src, m.index)
      const names: string[] = []
      let isDef = false
      if (m[2]) names.push(m[2])
      if (m[4]) { names.push(m[4]); isDef = true }
      if (m[5]) names.push(...m[5].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean))
      imports.push({ fromFile: filePath, toModule: mod, importedNames: names, isDefault: isDef, isNamespace: !!m[1], line: pos.line })
    }
  }

  {
    const re = new RegExp(TS_CALL_RE.source, 'g')
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(clean))) {
      const name = m[1]
      if (TS_KEYWORDS.has(name)) continue
      const before = clean.slice(Math.max(0, m.index - 25), m.index)
      if (/function\s*$/.test(before) || /class\s*$/.test(before) || /\.\s*$/.test(before)) continue
      const pos = lineCol(src, m.index)
      calls.push({ fromSymbol: '(unknown)', toSymbol: name, fromFile: filePath, line: pos.line })
    }
  }

  return { symbols, calls, imports }
}

function parsePython(src: string, filePath: string) {
  const symbols: CodeSymbol[] = []
  const calls: CallEdge[] = []
  const imports: ImportEdge[] = []
  const clean = stripCommentsAndStrings(src, 'python')

  const addSym = (name: string, kind: SymbolKind, idx: number, exported = true) => {
    const { line, column } = lineCol(src, idx)
    symbols.push({ name, kind, filePath, line, column, exported, signature: kind === 'function' ? getSignature(src, idx) : undefined })
  }

  {
    const re = new RegExp(PY_FN_RE.source, 'g')
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(clean))) {
      const ls = src.lastIndexOf('\n', m.index) + 1
      const indent = src.slice(ls, m.index).length - src.slice(ls, m.index).replace(/^\s*/, '').length
      const isPriv = m[1].startsWith('_') && !m[1].startsWith('__')
      addSym(m[1], 'function', m.index, !isPriv && indent === 0)
    }
  }

  {
    const re = new RegExp(PY_CLASS_RE.source, 'g')
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(clean))) addSym(m[1], 'class', m.index, !m[1].startsWith('_'))
  }

  {
    const re = new RegExp(PY_ASSIGN_RE.source, 'g')
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(clean))) {
      if (m[1].startsWith('_') || PY_KEYWORDS.has(m[1])) continue
      const ls = src.lastIndexOf('\n', m.index) + 1
      const indent = src.slice(ls, m.index).length - src.slice(ls, m.index).replace(/^\s*/, '').length
      if (indent === 0) addSym(m[1], 'const', m.index, true)
    }
  }

  {
    const re = new RegExp(PY_FROM_IMPORT_RE.source, 'g')
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(clean))) {
      const pos = lineCol(src, m.index)
      const names = m[2].split(',').map((s) => s.trim().replace(/[()]/g, '').split(/\s+as\s+/)[0].trim()).filter((n) => n && n !== '*')
      imports.push({ fromFile: filePath, toModule: m[1], importedNames: names, isDefault: false, isNamespace: false, line: pos.line })
    }
  }

  {
    const re = new RegExp(PY_IMPORT_RE.source, 'g')
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(clean))) {
      const pos = lineCol(src, m.index)
      for (const mod of m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)) {
        imports.push({ fromFile: filePath, toModule: mod, importedNames: [mod.split('.')[0]], isDefault: false, isNamespace: true, line: pos.line })
      }
    }
  }

  {
    const re = new RegExp(PY_CALL_RE.source, 'g')
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(clean))) {
      if (PY_KEYWORDS.has(m[1])) continue
      const before = clean.slice(Math.max(0, m.index - 10), m.index)
      if (/(?:def|class)\s*$/.test(before) || /\.\s*$/.test(before)) continue
      const pos = lineCol(src, m.index)
      calls.push({ fromSymbol: '(unknown)', toSymbol: m[1], fromFile: filePath, line: pos.line })
    }
  }

  return { symbols, calls, imports }
}

function resolveImport(edge: ImportEdge, allFiles: Set<string>, fromFile: string): string | undefined {
  if (!edge.toModule.startsWith('.')) return undefined
  const base = path.posix.dirname(fromFile.replace(/\\/g, '/'))
  const resolved = path.posix.normalize(path.posix.join(base, edge.toModule))
  for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.py', '/index.ts', '/index.tsx', '/index.js', '/index.py']) {
    if (allFiles.has(resolved + ext)) return resolved + ext
  }
  return undefined
}

function listFiles(root: string, maxFiles: number): string[] {
  const out: string[] = []
  const ignore = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.next', '.levelcode'])
  const walk = (dir: string, rel: string) => {
    if (out.length >= maxFiles) return
    let ents: fs.Dirent[]
    try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (out.length >= maxFiles) return
      if (ignore.has(e.name) || e.name.startsWith('.')) continue
      const fp = path.join(dir, e.name)
      const rp = rel ? path.posix.join(rel, e.name) : e.name
      if (e.isDirectory()) walk(fp, rp)
      else if (e.isFile() && SUPPORTED_EXTS.has(path.extname(e.name).toLowerCase())) out.push(rp.replace(/\\/g, '/'))
    }
  }
  walk(root, '')
  return out
}

function getMtimes(files: string[], root: string): Record<string, number> {
  const m: Record<string, number> = {}
  for (const f of files) {
    try { m[f] = fs.statSync(path.join(root, f)).mtimeMs } catch { m[f] = 0 }
  }
  return m
}

function cacheValid(cached: CodeGraph, mtimes: Record<string, number>): boolean {
  if (cached.version !== CODEMAP_VERSION) return false
  const a = new Set(cached.filesIndexed), b = new Set(Object.keys(mtimes))
  if (a.size !== b.size) return false
  for (const f of a) if (!b.has(f)) return false
  for (const [f, mt] of Object.entries(mtimes)) {
    const cm = cached.fileMtimes?.[f]
    if (cm === undefined || Math.abs(cm - mt) > 1000) return false
  }
  return true
}

function cachePath(cwd: string) {
  return path.join(cwd, DEFAULT_CACHE_DIR, DEFAULT_CACHE_FILE)
}

/**
 * Build a persistent code graph index using regex-based light parsing.
 *
 * Detects language by file extension (TS/JS/Python) and extracts functions,
 * classes, interfaces, type aliases, enums, constants, imports, exports,
 * and builds a directed call graph. Cached to `.levelcode/codemap.json`
 * with mtime-based invalidation.
 *
 * @param cwd - Project root directory
 * @param options - Build options
 * @returns The constructed CodeGraph
 */
export async function buildCodeIndex(
  cwd: string,
  options: { forceRebuild?: boolean; maxFiles?: number } = {},
): Promise<CodeGraph> {
  const { forceRebuild = false, maxFiles = MAX_FILES } = options
  const cp = cachePath(cwd)
  const files = listFiles(cwd, maxFiles)
  const mtimes = getMtimes(files, cwd)

  if (!forceRebuild && fs.existsSync(cp)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cp, 'utf8')) as CodeGraph
      if (cacheValid(cached, mtimes)) return cached
    } catch {}
  }

  const allFiles = new Set(files)
  const symbols: CodeSymbol[] = [], calls: CallEdge[] = [], imports: ImportEdge[] = [], indexed: string[] = []

  for (const rel of files) {
    const full = path.join(cwd, rel)
    let src: string
    try { src = fs.readFileSync(full, 'utf8') } catch { continue }
    indexed.push(rel)
    const lang = detectLanguage(full)
    let result
    if (lang === 'typescript' || lang === 'javascript') result = parseTS(src, rel)
    else if (lang === 'python') result = parsePython(src, rel)
    else continue
    symbols.push(...result.symbols)
    calls.push(...result.calls)
    imports.push(...result.imports)
  }

  const byFile = new Map<string, Map<string, CodeSymbol>>()
  for (const s of symbols) {
    if (!byFile.has(s.filePath)) byFile.set(s.filePath, new Map())
    byFile.get(s.filePath)!.set(s.name, s)
  }

  for (const call of calls) {
    const imp = imports.find((i) => i.fromFile === call.fromFile && i.importedNames.includes(call.toSymbol))
    if (imp) {
      const resolved = resolveImport(imp, allFiles, call.fromFile)
      if (resolved) call.toFile = resolved
    } else {
      for (const [fp, sm] of byFile) {
        if (fp === call.fromFile) continue
        if (sm.has(call.toSymbol)) { call.toFile = fp; break }
      }
    }
  }

  const graph: CodeGraph = { version: CODEMAP_VERSION, rootDir: cwd, generatedAt: Date.now(), symbols, calls, imports, filesIndexed: indexed, fileMtimes: mtimes }
  try {
    const dir = path.join(cwd, DEFAULT_CACHE_DIR)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(cp, JSON.stringify(graph, null, 2))
  } catch {}
  return graph
}
