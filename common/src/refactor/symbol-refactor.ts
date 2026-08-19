import * as fs from 'fs'
import * as path from 'path'

const SUPPORTED_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.mjs', '.cjs'])
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.next', '.levelcode'])

const STRING_LITERAL_RE = /(['"`])(?:\\.|(?!\1).)*\1/g
const LINE_COMMENT_RE = /\/\/.*$/gm
const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g
const PY_COMMENT_RE = /#.*$/gm
const TEMPLATE_LITERAL_RE = /`(?:\\[\s\S]|\$\{[^}]*\}|[^`\\])*`/g

type FileLang = 'ts' | 'py' | 'unknown'

function detectLang(filePath: string): FileLang {
  const ext = path.extname(filePath).toLowerCase()
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return 'ts'
  if (ext === '.py') return 'py'
  return 'unknown'
}

function stripNonCode(src: string, lang: FileLang): string {
  let s = src
  s = s.replace(BLOCK_COMMENT_RE, (m) => ' '.repeat(m.length))
  s = s.replace(LINE_COMMENT_RE, (m) => ' '.repeat(m.length))
  if (lang === 'py') {
    s = s.replace(PY_COMMENT_RE, (m) => ' '.repeat(m.length))
  }
  s = s.replace(STRING_LITERAL_RE, (m) => ' '.repeat(m.length))
  s = s.replace(TEMPLATE_LITERAL_RE, (m) => ' '.repeat(m.length))
  return s
}

function wordBoundaryRegex(name: string, lang: FileLang): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (lang === 'py') {
    return new RegExp(`(?<![\\w.])${escaped}(?![\\w])`, 'g')
  }
  return new RegExp(`(?<![\\w$.])${escaped}(?![\\w])`, 'g')
}

function listFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string, rel: string) => {
    let ents: fs.Dirent[]
    try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (IGNORE_DIRS.has(e.name) || e.name.startsWith('.')) continue
      const fp = path.join(dir, e.name)
      const rp = rel ? path.posix.join(rel, e.name) : e.name
      if (e.isDirectory()) walk(fp, rp)
      else if (e.isFile() && SUPPORTED_EXTS.has(path.extname(e.name).toLowerCase())) out.push(rp)
    }
  }
  walk(root, '')
  return out
}

function readFile(cwd: string, relPath: string): { content: string; fullPath: string } | null {
  const full = path.join(cwd, relPath)
  try {
    const content = fs.readFileSync(full, 'utf8')
    return { content, fullPath: full }
  } catch {
    return null
  }
}

function writeFile(fullPath: string, content: string): void {
  fs.writeFileSync(fullPath, content, 'utf8')
}

export interface Reference {
  filePath: string
  line: number
  column: number
  context: string
}

export interface RenameResult {
  oldName: string
  newName: string
  filesModified: string[]
  referencesReplaced: number
}

export interface ExtractResult {
  filePath: string
  newFunctionName: string
  startLine: number
  endLine: number
  newFunctionLine: number
}

export interface MoveResult {
  fromPath: string
  toPath: string
  symbolName: string
  filesModified: string[]
  exportsUpdated: number
  importsUpdated: number
}

/**
 * Find all references to a symbol across the project.
 *
 * Uses word-boundary regex matching that respects string literals and
 * comments so references inside strings/comments are not reported.
 *
 * @param symbolName - The symbol name to search for
 * @param cwd - Project root directory
 * @param scope - Optional file or directory path to restrict search scope
 * @returns Array of Reference objects with file, line, column, and context
 */
export function findReferences(
  symbolName: string,
  cwd: string,
  scope?: string,
): Reference[] {
  const allFiles = listFiles(cwd)
  const references: Reference[] = []
  const normalizedScope = scope ? scope.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '') : undefined

  for (const rel of allFiles) {
    if (normalizedScope) {
      if (rel !== normalizedScope && !rel.startsWith(normalizedScope + '/')) continue
    }
    const file = readFile(cwd, rel)
    if (!file) continue
    const lang = detectLang(rel)
    if (lang === 'unknown') continue

    const stripped = stripNonCode(file.content, lang)
    const re = wordBoundaryRegex(symbolName, lang)
    let match: RegExpExecArray | null
    while ((match = re.exec(stripped)) !== null) {
      const before = file.content.slice(0, match.index)
      const line = before.split('\n').length
      const lineStart = file.content.lastIndexOf('\n', match.index) + 1
      const lineEnd = file.content.indexOf('\n', match.index)
      const lineEndPos = lineEnd === -1 ? file.content.length : lineEnd
      const col = match.index - lineStart + 1
      const context = file.content.slice(lineStart, lineEndPos).trim()
      references.push({
        filePath: rel,
        line,
        column: col,
        context: context.length > 120 ? context.slice(0, 117) + '...' : context,
      })
    }
  }

  return references
}

/**
 * Scope-aware renaming of a symbol across the codebase.
 *
 * Respects word boundaries and avoids replacements inside string literals
 * and comments. When `scope` is provided, renaming is limited to that file
 * or directory. Handles TS/JS/Python.
 *
 * @param cwd - Project root directory
 * @param oldName - Current symbol name
 * @param newName - New symbol name
 * @param scope - Optional file or directory to restrict renaming
 * @returns RenameResult with files modified and count of replacements
 */
export function renameSymbol(
  cwd: string,
  oldName: string,
  newName: string,
  scope?: string,
): RenameResult {
  if (oldName === newName) {
    return { oldName, newName, filesModified: [], referencesReplaced: 0 }
  }

  const allFiles = listFiles(cwd)
  const filesModified: string[] = []
  let totalReplaced = 0
  const normalizedScope = scope ? scope.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '') : undefined

  for (const rel of allFiles) {
    if (normalizedScope) {
      if (rel !== normalizedScope && !rel.startsWith(normalizedScope + '/')) continue
    }
    const file = readFile(cwd, rel)
    if (!file) continue
    const lang = detectLang(rel)
    if (lang === 'unknown') continue

    let replacedCount = 0
    const stripped = stripNonCode(file.content, lang)
    const re = wordBoundaryRegex(oldName, lang)
    let result = ''
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = re.exec(stripped)) !== null) {
      result += file.content.slice(lastIndex, match.index)
      result += newName
      lastIndex = match.index + match[0].length
      replacedCount++
    }
    result += file.content.slice(lastIndex)

    if (replacedCount > 0) {
      writeFile(file.fullPath, result)
      filesModified.push(rel)
      totalReplaced += replacedCount
    }
  }

  return {
    oldName,
    newName,
    filesModified,
    referencesReplaced: totalReplaced,
  }
}

/**
 * Extract a code block (line range) into a new named function.
 *
 * Works for TypeScript/JavaScript and Python. Replaces the selected lines
 * with a call to the new function and inserts the new function definition
 * at an appropriate location (after the containing function or at module level).
 *
 * @param cwd - Project root directory
 * @param filePath - Relative or absolute path to the file
 * @param lineRange - [startLine, endLine] 1-based inclusive line numbers
 * @param funcName - Name for the extracted function
 * @returns ExtractResult with details of the extraction
 */
export function extractFunction(
  cwd: string,
  filePath: string,
  lineRange: [number, number],
  funcName: string,
): ExtractResult {
  const normPath = filePath.replace(/\\/g, '/').replace(/^\.\//, '')
  const file = readFile(cwd, normPath)
  if (!file) throw new Error(`File not found: ${normPath}`)

  const lang = detectLang(normPath)
  if (lang === 'unknown') throw new Error(`Unsupported file type: ${normPath}`)

  const lines = file.content.split('\n')
  const [startLine, endLine] = lineRange
  if (startLine < 1 || endLine > lines.length || startLine > endLine) {
    throw new Error(`Invalid line range ${startLine}-${endLine} for file with ${lines.length} lines`)
  }

  const startIdx = startLine - 1
  const endIdx = endLine - 1
  const extractedBlock = lines.slice(startIdx, endIdx + 1)
  const indentMatch = extractedBlock[0].match(/^(\s*)/)
  const baseIndent = indentMatch ? indentMatch[1] : ''
  const innerIndent = '  '

  const cleanedBlock = extractedBlock.map((l) => {
    if (l.startsWith(baseIndent)) return innerIndent + l.slice(baseIndent.length)
    return innerIndent + l
  })

  const returnMatch = cleanedBlock.join('\n').match(/return\s+([^;]+)/)
  const returnValue = returnMatch ? returnMatch[1].trim() : undefined

  let newFunc: string
  let replacementCall: string

  if (lang === 'ts') {
    const params = detectParams(extractedBlock.join('\n'))
    newFunc = `\n${baseIndent}function ${funcName}(${params.join(', ')}) {\n${cleanedBlock.join('\n')}\n${baseIndent}}\n`
    replacementCall = `${baseIndent}${returnValue ? `const ${returnValue.split('.')[0]}_result = ` : ''}${funcName}(${params.join(', ')});`
  } else {
    const params = detectParams(extractedBlock.join('\n'))
    newFunc = `\n${baseIndent}def ${funcName}(${params.join(', ')}):\n${cleanedBlock.join('\n')}\n\n`
    replacementCall = `${baseIndent}${funcName}(${params.join(', ')})`
  }

  const insertLine = findFunctionInsertionPoint(lines, endIdx, lang)
  const newLines = [
    ...lines.slice(0, startIdx),
    replacementCall,
    ...lines.slice(endIdx + 1),
  ]

  newLines.splice(insertLine, 0, ...newFunc.split('\n').slice(0, -1))

  const finalContent = newLines.join('\n')
  writeFile(file.fullPath, finalContent)

  return {
    filePath: normPath,
    newFunctionName: funcName,
    startLine,
    endLine,
    newFunctionLine: insertLine + 1,
  }
}

function detectParams(block: string): string[] {
  const used = new Set<string>()
  const re = /(?<![\w$])([a-z_$][a-z0-9_$]*)/gi
  let m: RegExpExecArray | null
  const defined = new Set(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'await', 'new', 'try', 'catch', 'throw', 'true', 'false', 'null', 'undefined', 'this', 'def', 'self', 'None', 'print', 'class', 'import', 'from', 'not', 'and', 'or', 'in', 'is', 'True', 'False', 'len', 'str', 'int', 'bool', 'list', 'dict'])
  while ((m = re.exec(block)) !== null) {
    const name = m[1]
    if (!defined.has(name) && name.length > 1) {
      const before = block.slice(Math.max(0, m.index - 20), m.index)
      if (!/\b(?:const|let|var|function|def|class|new|typeof)\s*$/.test(before)) {
        used.add(name)
      }
    }
  }
  return [...used].slice(0, 8)
}

function findFunctionInsertionPoint(lines: string[], afterLine: number, _lang: FileLang): number {
  let braceCount = 0
  for (let i = afterLine; i >= 0; i--) {
    const line = lines[i]
    for (const ch of line) {
      if (ch === '}') braceCount++
      if (ch === '{') braceCount--
    }
    if (braceCount < 0) return i + 1
  }
  return lines.length
}

/**
 * Move an exported symbol from one file to another, updating imports in all
 * files that reference the moved symbol.
 *
 * Extracts the symbol definition (function, class, const) from `fromPath`,
 * appends it to `toPath`, adds an export/re-export in `toPath` if needed,
 * and updates all import statements across the project.
 *
 * @param cwd - Project root directory
 * @param fromPath - Source file (relative to cwd)
 * @param toPath - Destination file (relative to cwd)
 * @param symbolName - Name of the exported symbol to move
 * @returns MoveResult with files modified and counts of updates
 */
export function moveSymbol(
  cwd: string,
  fromPath: string,
  toPath: string,
  symbolName: string,
): MoveResult {
  const normFrom = fromPath.replace(/\\/g, '/').replace(/^\.\//, '')
  const normTo = toPath.replace(/\\/g, '/').replace(/^\.\//, '')

  const fromFile = readFile(cwd, normFrom)
  if (!fromFile) throw new Error(`Source file not found: ${normFrom}`)

  let toContent = ''
  let toFullPath = ''
  const toFile = readFile(cwd, normTo)
  if (toFile) {
    toContent = toFile.content
    toFullPath = toFile.fullPath
  } else {
    toFullPath = path.join(cwd, normTo)
    const toDir = path.dirname(toFullPath)
    if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true })
    toContent = ''
  }

  const lang = detectLang(normFrom)
  const toLang = detectLang(normTo)
  if (lang === 'unknown') throw new Error(`Unsupported source file type: ${normFrom}`)

  const { symbolBlock, lineStart } = extractSymbolBlock(fromFile.content, symbolName, lang)
  if (!symbolBlock) throw new Error(`Symbol "${symbolName}" not found in ${normFrom}`)

  const importFromTo = computeRelativeImport(normFrom, normTo)
  const importToFrom = computeRelativeImport(normTo, normFrom)

  let newToContent = toContent
  if (!toContent.trimEnd().endsWith('\n')) newToContent += '\n'
  newToContent += '\n' + symbolBlock.trimEnd() + '\n'

  if (lang === 'ts' && !newToContent.includes(`export ${symbolName.includes(' ') ? '' : ''}`)) {
    if (!newToContent.match(new RegExp(`export\\s+(?:default\\s+)?(?:class|function|const|let|var|interface|type|enum)?\\s*${symbolName}\\b`))) {
      newToContent = newToContent.replace(
        new RegExp(`^(const|let|var|function|class|interface|type|enum)\\s+${symbolName}\\b`, 'm'),
        `export $1 ${symbolName}`,
      )
    }
  }

  writeFile(toFullPath, newToContent)

  const newFromContent = removeSymbolBlock(fromFile.content, lineStart, symbolBlock, lang)
  const exportInFrom = lang === 'ts'
    ? `export { ${symbolName} } from '${importFromTo.replace(/\.[jt]sx?$/, '')}';`
    : `from ${importFromTo.replace(/\.py$/, '')} import ${symbolName}`
  let finalFromContent = newFromContent
  if (lang === 'ts') {
    if (!finalFromContent.includes(exportInFrom)) {
      const importLines = finalFromContent.split('\n').filter((l) => l.startsWith('import '))
      const lastImportLine = importLines.length > 0
        ? finalFromContent.lastIndexOf(importLines[importLines.length - 1]) + importLines[importLines.length - 1].length
        : -1
      if (lastImportLine >= 0) {
        const insertPos = finalFromContent.indexOf('\n', lastImportLine) + 1
        finalFromContent = finalFromContent.slice(0, insertPos) + exportInFrom + '\n' + finalFromContent.slice(insertPos)
      } else {
        finalFromContent = exportInFrom + '\n' + finalFromContent
      }
    }
  } else {
    if (!finalFromContent.includes(`import ${symbolName}`)) {
      finalFromContent = `from ${importFromTo.replace(/\.py$/, '')} import ${symbolName}\n` + finalFromContent
    }
  }

  writeFile(fromFile.fullPath, finalFromContent)

  const filesModified = [normFrom, normTo]
  let importsUpdated = 0

  const allFiles = listFiles(cwd)
  for (const rel of allFiles) {
    if (rel === normFrom || rel === normTo) continue
    const file = readFile(cwd, rel)
    if (!file) continue
    const fLang = detectLang(rel)
    if (fLang === 'unknown') continue

    let updated = file.content
    const fromImportRe = fLang === 'ts'
      ? new RegExp(`import\\s+(?:\{[^}]*\\b${symbolName}\\b[^}]*\}|\\w+\\s*,\\s*\{[^}]*\\b${symbolName}\\b[^}]*\})\\s+from\\s+['"]([^'"]+)['"]`, 'g')
      : new RegExp(`from\\s+([\\w.]+)\\s+import\\s+[^\\n]*\\b${symbolName}\\b`, 'g')

    updated = updated.replace(fromImportRe, (match, importPath) => {
      const resolvedBase = path.posix.dirname(rel)
      const resolved = path.posix.normalize(path.posix.join(resolvedBase, importPath.replace(/\.[jt]sx?$/, '')))
      const targetBase = path.posix.dirname(normFrom).replace(/\.[jt]sx?$/, '')
      if (resolved === targetBase || resolved === targetBase.replace(/\/index$/, '')) {
        const newPath = computeRelativeImport(rel, normTo).replace(/\.[jt]sx?$/, '').replace(/\.py$/, '')
        importsUpdated++
        return match.replace(importPath, newPath)
      }
      return match
    })

    if (updated !== file.content) {
      writeFile(file.fullPath, updated)
      filesModified.push(rel)
    }
  }

  return {
    fromPath: normFrom,
    toPath: normTo,
    symbolName,
    filesModified,
    exportsUpdated: 1,
    importsUpdated,
  }
}

function computeRelativeImport(from: string, to: string): string {
  const fromDir = path.posix.dirname(from)
  let rel = path.posix.relative(fromDir, to)
  if (!rel.startsWith('.')) rel = './' + rel
  return rel.replace(/\\/g, '/')
}

function extractSymbolBlock(src: string, name: string, lang: FileLang): { symbolBlock: string | null; lineStart: number } {
  const lines = src.split('\n')
  const patterns = lang === 'ts'
    ? [
        new RegExp(`export\\s+(?:default\\s+)?(?:async\\s+)?function\\s+\\*?\\s*${name}\\b`),
        new RegExp(`export\\s+(?:default\\s+)?(?:abstract\\s+)?class\\s+${name}\\b`),
        new RegExp(`export\\s+interface\\s+${name}\\b`),
        new RegExp(`export\\s+type\\s+${name}\\b`),
        new RegExp(`export\\s+enum\\s+${name}\\b`),
        new RegExp(`export\\s+(?:const|let|var)\\s+${name}\\b`),
        new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+\\*?\\s*${name}\\b`),
        new RegExp(`^(?:export\\s+)?(?:abstract\\s+)?class\\s+${name}\\b`),
        new RegExp(`^(?:const|let|var)\\s+${name}\\s*=`),
      ]
    : [
        new RegExp(`^(?:async\\s+)?def\\s+${name}\\s*\\(`),
        new RegExp(`^class\\s+${name}\\b`),
      ]

  for (let i = 0; i < lines.length; i++) {
    for (const p of patterns) {
      if (p.test(lines[i])) {
        const block = extractBlock(lines, i, lang)
        return { symbolBlock: block, lineStart: i }
      }
    }
  }
  return { symbolBlock: null, lineStart: -1 }
}

function extractBlock(lines: string[], startLine: number, lang: FileLang): string {
  if (lang === 'ts') {
    if (lines[startLine].includes('=') && (lines[startLine].includes('const ') || lines[startLine].includes('let ') || lines[startLine].includes('var '))) {
      let block = lines[startLine]
      if (!block.includes(';') && !block.match(/=\s*[^=,;]+$/)) {
        for (let i = startLine + 1; i < Math.min(lines.length, startLine + 20); i++) {
          block += '\n' + lines[i]
          if (lines[i].trim().endsWith(';') || lines[i].includes(';')) break
        }
      }
      return block
    }
    let braceCount = 0
    let started = false
    const block: string[] = []
    for (let i = startLine; i < lines.length; i++) {
      block.push(lines[i])
      for (const ch of lines[i]) {
        if (ch === '{' || ch === '(') { braceCount++; started = true }
        if (ch === '}' || ch === ')') braceCount--
      }
      if (started && braceCount <= 0 && block.length > 1) break
      if (lines[startLine].includes(';') && block.length === 1) break
    }
    return block.join('\n')
  } else {
    const indent = lines[startLine].match(/^(\s*)/)?.[1] ?? ''
    const block = [lines[startLine]]
    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim() === '') { block.push(line); continue }
      const lineIndent = line.match(/^(\s*)/)?.[1] ?? ''
      if (lineIndent.length <= indent.length && line.trim().length > 0) break
      block.push(line)
    }
    return block.join('\n')
  }
}

function removeSymbolBlock(src: string, startLine: number, block: string, lang: FileLang): string {
  const lines = src.split('\n')
  const blockLines = block.split('\n').length
  const before = lines.slice(0, startLine)
  const after = lines.slice(startLine + blockLines)
  while (before.length > 0 && before[before.length - 1].trim() === '') before.pop()
  return [...before, ...after].join('\n')
}
