import * as fs from 'fs'
import * as path from 'path'
import { withLock, acquireLock } from '../utils/file-lock'

export type OpType = 'retain' | 'insert' | 'delete'

export interface TextOpComponent {
  type: OpType
  chars?: string
  count?: number
}

export class TextOperation {
  private ops: TextOpComponent[]
  private baseLength: number
  private targetLength: number

  constructor() {
    this.ops = []
    this.baseLength = 0
    this.targetLength = 0
  }

  static isRetain(op: TextOpComponent): boolean {
    return op.type === 'retain'
  }

  static isInsert(op: TextOpComponent): boolean {
    return op.type === 'insert'
  }

  static isDelete(op: TextOpComponent): boolean {
    return op.type === 'delete'
  }

  retain(n: number): TextOperation {
    if (n === 0) return this
    this.baseLength += n
    this.targetLength += n
    const last = this.ops.length > 0 ? this.ops[this.ops.length - 1] : null
    if (last && TextOperation.isRetain(last)) {
      last.count = (last.count ?? 0) + n
    } else {
      this.ops.push({ type: 'retain', count: n })
    }
    return this
  }

  insert(str: string): TextOperation {
    if (str.length === 0) return this
    this.targetLength += str.length
    const last = this.ops.length > 0 ? this.ops[this.ops.length - 1] : null
    if (last && TextOperation.isInsert(last)) {
      last.chars = (last.chars ?? '') + str
    } else if (last && TextOperation.isDelete(last)) {
      const prev = this.ops.length > 1 ? this.ops[this.ops.length - 2] : null
      if (prev && TextOperation.isInsert(prev)) {
        prev.chars = (prev.chars ?? '') + str
      } else {
        this.ops.splice(this.ops.length - 1, 0, { type: 'insert', chars: str })
      }
    } else {
      this.ops.push({ type: 'insert', chars: str })
    }
    return this
  }

  delete(n: number | string): TextOperation {
    let count: number
    if (typeof n === 'string') {
      count = n.length
    } else {
      count = n
    }
    if (count === 0) return this
    this.baseLength += count
    const last = this.ops.length > 0 ? this.ops[this.ops.length - 1] : null
    if (last && TextOperation.isDelete(last)) {
      last.count = (last.count ?? 0) + count
    } else {
      this.ops.push({ type: 'delete', count })
    }
    return this
  }

  static fromInsert(pos: number, text: string, docLength: number): TextOperation {
    const op = new TextOperation()
    if (pos > 0) op.retain(pos)
    op.insert(text)
    if (pos < docLength) op.retain(docLength - pos)
    return op
  }

  static fromDelete(pos: number, length: number, docLength: number): TextOperation {
    const op = new TextOperation()
    if (pos > 0) op.retain(pos)
    op.delete(length)
    if (pos + length < docLength) op.retain(docLength - pos - length)
    return op
  }

  static fromReplace(pos: number, oldLength: number, newText: string, docLength: number): TextOperation {
    const op = new TextOperation()
    if (pos > 0) op.retain(pos)
    if (oldLength > 0) op.delete(oldLength)
    if (newText.length > 0) op.insert(newText)
    const remaining = docLength - pos - oldLength
    if (remaining > 0) op.retain(remaining)
    return op
  }

  getOps(): TextOpComponent[] {
    return this.ops.slice()
  }

  getBaseLength(): number {
    return this.baseLength
  }

  getTargetLength(): number {
    return this.targetLength
  }

  isNoop(): boolean {
    if (this.ops.length === 0) return true
    return this.ops.every((op) => op.type === 'retain')
  }

  apply(text: string): string {
    if (text.length !== this.baseLength) {
      throw new Error(
        `Cannot apply operation: base length is ${this.baseLength} but text length is ${text.length}`,
      )
    }

    const result: string[] = []
    let strIndex = 0

    for (const op of this.ops) {
      if (op.type === 'retain') {
        const count = op.count ?? 0
        if (strIndex + count > text.length) {
          throw new Error('Cannot apply operation: retain exceeds text length')
        }
        result.push(text.slice(strIndex, strIndex + count))
        strIndex += count
      } else if (op.type === 'insert') {
        result.push(op.chars ?? '')
      } else if (op.type === 'delete') {
        const count = op.count ?? 0
        strIndex += count
      }
    }

    if (strIndex !== text.length) {
      throw new Error('Cannot apply operation: operation does not span entire text')
    }

    return result.join('')
  }

  compose(other: TextOperation): TextOperation {
    if (this.targetLength !== other.baseLength) {
      throw new Error(
        `Cannot compose operations: this target length ${this.targetLength} != other base length ${other.baseLength}`,
      )
    }

    const result = new TextOperation()
    const ops1 = this.ops.slice()
    const ops2 = other.ops.slice()
    let i1 = 0, i2 = 0
    let op1: TextOpComponent | null = ops1.length > 0 ? ops1[i1++] : null
    let op2: TextOpComponent | null = ops2.length > 0 ? ops2[i2++] : null

    while (op1 || op2) {
      if (op1 && TextOperation.isDelete(op1)) {
        result.delete(op1.count ?? 0)
        op1 = i1 < ops1.length ? ops1[i1++] : null
        continue
      }
      if (op2 && TextOperation.isInsert(op2)) {
        result.insert(op2.chars ?? '')
        op2 = i2 < ops2.length ? ops2[i2++] : null
        continue
      }

      if (!op1) {
        throw new Error('Cannot compose: op1 exhausted before op2')
      }
      if (!op2) {
        throw new Error('Cannot compose: op2 exhausted before op1')
      }

      const len1 = op1.type === 'retain' ? (op1.count ?? 0) : (op1.chars?.length ?? 0)
      const len2 = op2.type === 'retain' ? (op2.count ?? 0) : (op2.type === 'delete' ? (op2.count ?? 0) : 0)

      if (len1 === len2) {
        if (op1.type === 'retain' && op2.type === 'retain') {
          result.retain(len1)
        } else if (op1.type === 'insert' && op2.type === 'delete') {
          // Both cancel out
        }
        op1 = i1 < ops1.length ? ops1[i1++] : null
        op2 = i2 < ops2.length ? ops2[i2++] : null
      } else if (len1 > len2) {
        if (op1.type === 'retain') {
          if (op2.type === 'retain') result.retain(len2)
          else if (op2.type === 'delete') result.delete(len2)
          op1 = { type: 'retain', count: len1 - len2 }
        } else if (op1.type === 'insert') {
          result.insert((op1.chars ?? '').slice(0, len2))
          op1 = { type: 'insert', chars: (op1.chars ?? '').slice(len2) }
        }
        op2 = i2 < ops2.length ? ops2[i2++] : null
      } else {
        if (op1.type === 'retain' && op2.type === 'retain') {
          result.retain(len1)
          op2 = { type: 'retain', count: len2 - len1 }
        } else if (op1.type === 'retain' && op2.type === 'delete') {
          result.delete(len1)
          op2 = { type: 'delete', count: len2 - len1 }
        } else if (op1.type === 'insert' && op2.type === 'delete') {
          // insert canceled by delete
          op2 = { type: 'delete', count: len2 - len1 }
        }
        op1 = i1 < ops1.length ? ops1[i1++] : null
      }
    }

    return result
  }

  invert(text: string): TextOperation {
    const inverse = new TextOperation()
    let strIndex = 0

    for (const op of this.ops) {
      if (op.type === 'retain') {
        const count = op.count ?? 0
        inverse.retain(count)
        strIndex += count
      } else if (op.type === 'insert') {
        const chars = op.chars ?? ''
        inverse.delete(chars.length)
      } else if (op.type === 'delete') {
        const count = op.count ?? 0
        inverse.insert(text.slice(strIndex, strIndex + count))
        strIndex += count
      }
    }

    return inverse
  }

  clone(): TextOperation {
    const cloned = new TextOperation()
    cloned.ops = this.ops.map((op) => ({ ...op }))
    cloned.baseLength = this.baseLength
    cloned.targetLength = this.targetLength
    return cloned
  }

  toJSON(): object {
    return {
      ops: this.ops.map((op) => {
        if (op.type === 'retain') return { type: 'retain', count: op.count }
        if (op.type === 'insert') return { type: 'insert', chars: op.chars }
        return { type: 'delete', count: op.count }
      }),
      baseLength: this.baseLength,
      targetLength: this.targetLength,
    }
  }

  static fromJSON(json: any): TextOperation {
    const op = new TextOperation()
    if (!json || !Array.isArray(json.ops)) return op
    for (const component of json.ops) {
      if (component.type === 'retain') {
        op.retain(component.count ?? 0)
      } else if (component.type === 'insert') {
        op.insert(component.chars ?? '')
      } else if (component.type === 'delete') {
        op.delete(component.count ?? 0)
      }
    }
    return op
  }
}

type TransformPriority = 'left' | 'right'

function transformComponent(
  a: TextOpComponent,
  b: TextOpComponent,
  priority: TransformPriority,
): [TextOpComponent, TextOpComponent] {
  if (TextOperation.isInsert(a) && TextOperation.isInsert(b)) {
    if (priority === 'left') {
      return [
        { type: 'insert', chars: a.chars },
        { type: 'retain', count: a.chars?.length ?? 0 },
      ]
    } else {
      return [
        { type: 'retain', count: b.chars?.length ?? 0 },
        { type: 'insert', chars: b.chars },
      ]
    }
  }

  if (TextOperation.isInsert(a) && TextOperation.isRetain(b)) {
    return [
      { type: 'insert', chars: a.chars },
      { type: 'retain', count: a.chars?.length ?? 0 },
    ]
  }

  if (TextOperation.isRetain(a) && TextOperation.isInsert(b)) {
    return [
      { type: 'retain', count: b.chars?.length ?? 0 },
      { type: 'insert', chars: b.chars },
    ]
  }

  if (TextOperation.isInsert(a) && TextOperation.isDelete(b)) {
    return [
      { type: 'insert', chars: a.chars },
      { type: 'delete', count: b.count },
    ]
  }

  if (TextOperation.isDelete(a) && TextOperation.isInsert(b)) {
    return [
      { type: 'delete', count: a.count },
      { type: 'insert', chars: b.chars },
    ]
  }

  if (TextOperation.isDelete(a) && TextOperation.isDelete(b)) {
    return [{ type: 'delete', count: a.count }, { type: 'delete', count: b.count }]
  }

  if (TextOperation.isRetain(a) && TextOperation.isRetain(b)) {
    const countA = a.count ?? 0
    const countB = b.count ?? 0
    if (countA === countB) {
      return [{ type: 'retain', count: countA }, { type: 'retain', count: countB }]
    } else if (countA > countB) {
      return [{ type: 'retain', count: countB }, { type: 'retain', count: countB }]
    } else {
      return [{ type: 'retain', count: countA }, { type: 'retain', count: countA }]
    }
  }

  if (TextOperation.isDelete(a) && TextOperation.isRetain(b)) {
    const countA = a.count ?? 0
    const countB = b.count ?? 0
    if (countA === countB) {
      return [{ type: 'delete', count: countA }, { type: 'retain', count: 0 }]
    } else if (countA > countB) {
      return [{ type: 'delete', count: countB }, { type: 'retain', count: 0 }]
    } else {
      return [{ type: 'delete', count: countA }, { type: 'retain', count: 0 }]
    }
  }

  if (TextOperation.isRetain(a) && TextOperation.isDelete(b)) {
    const countA = a.count ?? 0
    const countB = b.count ?? 0
    if (countA === countB) {
      return [{ type: 'retain', count: 0 }, { type: 'delete', count: countB }]
    } else if (countA > countB) {
      return [{ type: 'retain', count: 0 }, { type: 'delete', count: countB }]
    } else {
      return [{ type: 'retain', count: 0 }, { type: 'delete', count: countA }]
    }
  }

  return [a, b]
}

export function transform(
  op1: TextOperation,
  op2: TextOperation,
): [TextOperation, TextOperation] {
  if (op1.getBaseLength() !== op2.getBaseLength()) {
    throw new Error(
      `Cannot transform operations: base lengths differ (${op1.getBaseLength()} vs ${op2.getBaseLength()})`,
    )
  }

  const prime1 = new TextOperation()
  const prime2 = new TextOperation()

  const ops1 = op1.getOps()
  const ops2 = op2.getOps()
  let i1 = 0, i2 = 0
  let curr1: TextOpComponent | null = ops1.length > 0 ? ops1[i1++] : null
  let curr2: TextOpComponent | null = ops2.length > 0 ? ops2[i2++] : null

  while (curr1 || curr2) {
    if (curr1 && TextOperation.isInsert(curr1)) {
      prime1.insert(curr1.chars ?? '')
      prime2.retain(curr1.chars?.length ?? 0)
      curr1 = i1 < ops1.length ? ops1[i1++] : null
      continue
    }
    if (curr2 && TextOperation.isInsert(curr2)) {
      prime1.retain(curr2.chars?.length ?? 0)
      prime2.insert(curr2.chars ?? '')
      curr2 = i2 < ops2.length ? ops2[i2++] : null
      continue
    }

    if (!curr1) {
      throw new Error('Cannot transform: op1 exhausted before op2')
    }
    if (!curr2) {
      throw new Error('Cannot transform: op2 exhausted before op1')
    }

    const len1 = curr1.type === 'retain' ? (curr1.count ?? 0) : (curr1.count ?? 0)
    const len2 = curr2.type === 'retain' ? (curr2.count ?? 0) : (curr2.count ?? 0)
    const minLen = Math.min(len1, len2)

    if (curr1.type === 'retain' && curr2.type === 'retain') {
      prime1.retain(minLen)
      prime2.retain(minLen)
    } else if (curr1.type === 'delete' && curr2.type === 'retain') {
      prime1.delete(minLen)
    } else if (curr1.type === 'retain' && curr2.type === 'delete') {
      prime2.delete(minLen)
    } else if (curr1.type === 'delete' && curr2.type === 'delete') {
      // Both delete the same text - nothing added to either prime
    }

    if (len1 === minLen) {
      curr1 = i1 < ops1.length ? ops1[i1++] : null
    } else if (curr1.type === 'retain') {
      curr1 = { type: 'retain', count: len1 - minLen }
    } else if (curr1.type === 'delete') {
      curr1 = { type: 'delete', count: len1 - minLen }
    }

    if (len2 === minLen) {
      curr2 = i2 < ops2.length ? ops2[i2++] : null
    } else if (curr2.type === 'retain') {
      curr2 = { type: 'retain', count: len2 - minLen }
    } else if (curr2.type === 'delete') {
      curr2 = { type: 'delete', count: len2 - minLen }
    }
  }

  return [prime1, prime2]
}

export function applyOp(text: string, op: TextOperation): string {
  return op.apply(text)
}

export interface ConcurrentEdit {
  agentId: string
  op: TextOperation
  timestamp: number
  baseVersion?: number
}

export interface MergeResult {
  mergedText: string
  mergedOp: TextOperation
  conflicts: Array<{
    agentId: string
    position: number
    description: string
  }>
  transformTrace: Array<{
    step: number
    agentId: string
    opType: string
  }>
}

export function mergeConcurrentEdits(
  baseText: string,
  edits: ConcurrentEdit[],
): MergeResult {
  if (edits.length === 0) {
    const noop = new TextOperation()
    noop.retain(baseText.length)
    return {
      mergedText: baseText,
      mergedOp: noop,
      conflicts: [],
      transformTrace: [],
    }
  }

  const sortedEdits = [...edits].sort((a, b) => a.timestamp - b.timestamp)

  let currentText = baseText
  let composedOp: TextOperation | null = null
  const conflicts: MergeResult['conflicts'] = []
  const trace: MergeResult['transformTrace'] = []

  for (let i = 0; i < sortedEdits.length; i++) {
    const edit = sortedEdits[i]
    let op = edit.op.clone()

    if (op.getBaseLength() !== baseText.length && composedOp === null) {
      if (op.getBaseLength() === currentText.length) {
        // Operation was already based on a version that includes previous transforms
      } else {
        // Try to adapt: if base lengths don't match, we need to detect the correct version
        // For simplicity, we transform against the composed operation
      }
    }

    if (composedOp) {
      try {
        const [opPrime] = transform(op, composedOp)
        op = opPrime
      } catch {
        conflicts.push({
          agentId: edit.agentId,
          position: 0,
          description: `Could not transform edit from ${edit.agentId} - potential conflict`,
        })
        // Attempt to apply anyway by composing
      }
    }

    try {
      const newText = op.apply(currentText)
      if (composedOp) {
        composedOp = composedOp.compose(op)
      } else {
        composedOp = op
      }
      currentText = newText

      for (const component of op.getOps()) {
        if (component.type !== 'retain') {
          trace.push({
            step: i + 1,
            agentId: edit.agentId,
            opType: component.type,
          })
        }
      }
    } catch (err) {
      conflicts.push({
        agentId: edit.agentId,
        position: 0,
        description: `Failed to apply edit from ${edit.agentId}: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  if (!composedOp) {
    composedOp = new TextOperation()
    composedOp.retain(baseText.length)
  }

  return {
    mergedText: currentText,
    mergedOp: composedOp,
    conflicts,
    transformTrace: trace,
  }
}

export interface FileEditSession {
  filePath: string
  baseText: string
  baseVersion: number
  pendingEdits: ConcurrentEdit[]
  lastModified: number
}

export class ConcurrentFileEditor {
  private sessions: Map<string, FileEditSession> = new Map()
  private lockDir: string

  constructor(projectRoot?: string) {
    const root = projectRoot ?? process.cwd()
    this.lockDir = path.join(root, '.levelcode', 'edit-sessions')
    if (!fs.existsSync(this.lockDir)) {
      fs.mkdirSync(this.lockDir, { recursive: true })
    }
  }

  private getSessionPath(filePath: string): string {
    const safeName = Buffer.from(filePath).toString('base64url')
    return path.join(this.lockDir, `${safeName}.json`)
  }

  openFile(filePath: string): FileEditSession {
    const absolutePath = path.resolve(filePath)
    let text = ''
    if (fs.existsSync(absolutePath)) {
      text = fs.readFileSync(absolutePath, 'utf-8')
    }

    const session: FileEditSession = {
      filePath: absolutePath,
      baseText: text,
      baseVersion: Date.now(),
      pendingEdits: [],
      lastModified: Date.now(),
    }

    this.sessions.set(absolutePath, session)
    this.persistSession(session)
    return session
  }

  getSession(filePath: string): FileEditSession | null {
    const absolutePath = path.resolve(filePath)
    if (this.sessions.has(absolutePath)) {
      return this.sessions.get(absolutePath)!
    }
    const sessionPath = this.getSessionPath(absolutePath)
    if (fs.existsSync(sessionPath)) {
      try {
        const raw = fs.readFileSync(sessionPath, 'utf-8')
        const parsed = JSON.parse(raw)
        const session: FileEditSession = {
          ...parsed,
          pendingEdits: (parsed.pendingEdits ?? []).map((e: any) => ({
            ...e,
            op: TextOperation.fromJSON(e.op),
          })),
        }
        this.sessions.set(absolutePath, session)
        return session
      } catch {
        return null
      }
    }
    return null
  }

  submitEdit(filePath: string, edit: ConcurrentEdit): MergeResult {
    let session = this.getSession(filePath)
    if (!session) {
      session = this.openFile(filePath)
    }

    session.pendingEdits.push(edit)
    session.lastModified = Date.now()

    const result = mergeConcurrentEdits(session.baseText, session.pendingEdits)
    this.persistSession(session)
    return result
  }

  flushEdits(filePath: string): MergeResult | null {
    const session = this.getSession(filePath)
    if (!session || session.pendingEdits.length === 0) return null

    const result = mergeConcurrentEdits(session.baseText, session.pendingEdits)
    const absolutePath = path.resolve(filePath)

    fs.writeFileSync(absolutePath, result.mergedText, 'utf-8')

    session.baseText = result.mergedText
    session.baseVersion = Date.now()
    session.pendingEdits = []
    session.lastModified = Date.now()
    this.persistSession(session)

    return result
  }

  async flushEditsWithLock(filePath: string): Promise<MergeResult | null> {
    const absolutePath = path.resolve(filePath)
    return withLock(absolutePath, () => {
      return this.flushEdits(absolutePath)
    })
  }

  private persistSession(session: FileEditSession): void {
    const sessionPath = this.getSessionPath(session.filePath)
    const dir = path.dirname(sessionPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const serializable = {
      ...session,
      pendingEdits: session.pendingEdits.map((e) => ({
        ...e,
        op: e.op.toJSON(),
      })),
    }
    fs.writeFileSync(sessionPath, JSON.stringify(serializable, null, 2), 'utf-8')
  }

  closeFile(filePath: string, flush = true): MergeResult | null {
    const absolutePath = path.resolve(filePath)
    let result: MergeResult | null = null
    if (flush) {
      result = this.flushEdits(absolutePath)
    }
    this.sessions.delete(absolutePath)
    const sessionPath = this.getSessionPath(absolutePath)
    if (fs.existsSync(sessionPath)) {
      try {
        fs.unlinkSync(sessionPath)
      } catch {
        // Best effort cleanup
      }
    }
    return result
  }

  listSessions(): Array<{ filePath: string; pendingCount: number; lastModified: number }> {
    return Array.from(this.sessions.values()).map((s) => ({
      filePath: s.filePath,
      pendingCount: s.pendingEdits.length,
      lastModified: s.lastModified,
    }))
  }
}

export function diffOperations(op1: TextOperation, op2: TextOperation): {
  onlyIn1: TextOpComponent[]
  onlyIn2: TextOpComponent[]
} {
  const ops1 = op1.getOps()
  const ops2 = op2.getOps()
  const onlyIn1: TextOpComponent[] = []
  const onlyIn2: TextOpComponent[] = []

  const normalize = (ops: TextOpComponent[]) =>
    ops.filter((o) => o.type !== 'retain')

  onlyIn1.push(...normalize(ops1))
  onlyIn2.push(...normalize(ops2))

  return { onlyIn1, onlyIn2 }
}

let defaultEditor: ConcurrentFileEditor | null = null

export function getConcurrentFileEditor(projectRoot?: string): ConcurrentFileEditor {
  if (!defaultEditor) {
    defaultEditor = new ConcurrentFileEditor(projectRoot)
  }
  return defaultEditor
}

export function resetConcurrentFileEditor(): void {
  if (defaultEditor) {
    defaultEditor = null
  }
}
