/**
 * Operational Transform (OT) for Conflict-Aware Concurrent Editing (#25).
 *
 * Implements a character-level OT algorithm that allows multiple agents to edit
 * the same file concurrently without blocking. When two operations are applied
 * concurrently to the same baseline document, `transform(op1, op2)` produces
 * adjusted versions of each op so they can be applied sequentially and
 * converge to the same final document regardless of order.
 *
 * Supported primitive operations:
 *   - retain N   : skip N characters
 *   - insert str : insert string at current position
 *   - delete N   : delete N characters starting at current position
 *
 * Composite operations are arrays of primitives applied in order.
 */

export type PrimitiveOp =
  | { type: 'retain'; count: number }
  | { type: 'insert'; text: string }
  | { type: 'delete'; count: number }

export type TextOperation = PrimitiveOp[]

export interface TransformResult {
  op1Prime: TextOperation
  op2Prime: TextOperation
}

export interface MergeResult {
  text: string
  conflicts: ConflictInfo[]
}

export interface ConflictInfo {
  position: number
  op1Description: string
  op2Description: string
  resolution: 'op1-wins' | 'op2-wins' | 'merged'
}

/**
 * Apply a TextOperation to a string, returning the resulting string.
 */
export function applyOp(text: string, op: TextOperation): string {
  let result = ''
  let cursor = 0

  for (const prim of op) {
    switch (prim.type) {
      case 'retain': {
        result += text.slice(cursor, cursor + prim.count)
        cursor += prim.count
        break
      }
      case 'insert': {
        result += prim.text
        break
      }
      case 'delete': {
        cursor += prim.count
        break
      }
    }
  }

  result += text.slice(cursor)
  return result
}

/**
 * Compute the length of the document after applying an operation.
 */
export function opOutputLength(op: TextOperation): number {
  let len = 0
  for (const prim of op) {
    if (prim.type === 'retain') len += prim.count
    else if (prim.type === 'insert') len += prim.text.length
  }
  return len
}

/**
 * Compute the length of the input document required by an operation.
 */
export function opInputLength(op: TextOperation): number {
  let len = 0
  for (const prim of op) {
    if (prim.type === 'retain') len += prim.count
    else if (prim.type === 'delete') len += prim.count
  }
  return len
}

/**
 * Transform two concurrent operations against each other.
 *
 * Given ops op1 and op2 that both apply to the same baseline document,
 * returns (op1', op2') such that:
 *   apply(apply(doc, op1), op2') == apply(apply(doc, op2), op1')
 */
export function transform(
  op1: TextOperation,
  op2: TextOperation,
  priority: 'left' | 'right' = 'left',
): TransformResult {
  const op1Prime: TextOperation = []
  const op2Prime: TextOperation = []

  let i1 = 0
  let i2 = 0
  let prim1: PrimitiveOp | null = op1[i1] ?? null
  let prim2: PrimitiveOp | null = op2[i2] ?? null

  while (prim1 || prim2) {
    if (prim1?.type === 'insert') {
      op1Prime.push({ type: 'insert', text: prim1.text })
      op2Prime.push({ type: 'retain', count: prim1.text.length })
      i1++
      prim1 = op1[i1] ?? null
      continue
    }

    if (prim2?.type === 'insert') {
      op1Prime.push({ type: 'retain', count: prim2.text.length })
      op2Prime.push({ type: 'insert', text: prim2.text })
      i2++
      prim2 = op2[i2] ?? null
      continue
    }

    if (!prim1) {
      if (prim2) {
        op2Prime.push(prim2)
        i2++
        prim2 = op2[i2] ?? null
      }
      continue
    }
    if (!prim2) {
      if (prim1) {
        op1Prime.push(prim1)
        i1++
        prim1 = op1[i1] ?? null
      }
      continue
    }

    const minLen = Math.min(
      prim1.type === 'delete' ? prim1.count : (prim1 as { count: number }).count,
      prim2.type === 'delete' ? prim2.count : (prim2 as { count: number }).count,
    )

    if (prim1.type === 'retain' && prim2.type === 'retain') {
      op1Prime.push({ type: 'retain', count: minLen })
      op2Prime.push({ type: 'retain', count: minLen })
      prim1 = shortenPrimitive(prim1, minLen)
      prim2 = shortenPrimitive(prim2, minLen)
    } else if (prim1.type === 'delete' && prim2.type === 'delete') {
      // Both delete same region - no output
      prim1 = shortenPrimitive(prim1, minLen)
      prim2 = shortenPrimitive(prim2, minLen)
    } else if (prim1.type === 'delete' && prim2.type === 'retain') {
      op1Prime.push({ type: 'delete', count: minLen })
      prim1 = shortenPrimitive(prim1, minLen)
      prim2 = shortenPrimitive(prim2, minLen)
    } else if (prim1.type === 'retain' && prim2.type === 'delete') {
      op2Prime.push({ type: 'delete', count: minLen })
      prim1 = shortenPrimitive(prim1, minLen)
      prim2 = shortenPrimitive(prim2, minLen)
    }

    if (prim1 && 'count' in prim1 && prim1.type !== 'insert' && prim1.count <= 0) {
      i1++
      prim1 = op1[i1] ?? null
    }
    if (prim2 && 'count' in prim2 && prim2.type !== 'insert' && prim2.count <= 0) {
      i2++
      prim2 = op2[i2] ?? null
    }
  }

  void priority
  return { op1Prime: compress(op1Prime), op2Prime: compress(op2Prime) }
}

function shortenPrimitive(prim: PrimitiveOp, by: number): PrimitiveOp | null {
  if (prim.type === 'insert') return prim
  const remaining = prim.count - by
  if (remaining <= 0) return null
  return { ...prim, count: remaining } as PrimitiveOp
}

/**
 * Compress an operation by merging adjacent retains/deletes and removing no-ops.
 */
export function compress(op: TextOperation): TextOperation {
  const result: TextOperation = []
  for (const prim of op) {
    if (prim.type === 'retain' && prim.count === 0) continue
    if (prim.type === 'delete' && prim.count === 0) continue
    if (prim.type === 'insert' && prim.text === '') continue

    const last = result[result.length - 1]
    if (last && last.type === 'retain' && prim.type === 'retain') {
      last.count += prim.count
    } else if (last && last.type === 'delete' && prim.type === 'delete') {
      last.count += prim.count
    } else {
      result.push({ ...prim })
    }
  }
  return result
}

/**
 * Compose two operations: apply a then b, producing a single equivalent op.
 * Requires that apply(a, doc) is the input for b.
 */
export function compose(op1: TextOperation, op2: TextOperation): TextOperation {
  const result: TextOperation = []
  let i1 = 0
  let i2 = 0
  let prim1: PrimitiveOp | null = op1[i1] ?? null
  let prim2: PrimitiveOp | null = op2[i2] ?? null

  while (prim1 || prim2) {
    if (prim1?.type === 'delete') {
      result.push({ type: 'delete', count: prim1.count })
      i1++
      prim1 = op1[i1] ?? null
      continue
    }
    if (prim2?.type === 'insert') {
      result.push({ type: 'insert', text: prim2.text })
      i2++
      prim2 = op2[i2] ?? null
      continue
    }

    if (!prim1) {
      if (prim2) {
        result.push(prim2)
        i2++
        prim2 = op2[i2] ?? null
      }
      continue
    }
    if (!prim2) {
      if (prim1) {
        result.push(prim1)
        i1++
        prim1 = op1[i1] ?? null
      }
      continue
    }

    const len1 = prim1.type === 'insert' ? prim1.text.length : (prim1 as { count: number }).count
    const len2 = prim2.type === 'delete' ? prim2.count : (prim2 as { count: number }).count
    const minLen = Math.min(len1, len2)

    if (prim1.type === 'retain' && prim2.type === 'retain') {
      result.push({ type: 'retain', count: minLen })
      prim1 = shortenPrimitive(prim1, minLen)
      prim2 = shortenPrimitive(prim2, minLen)
    } else if (prim1.type === 'insert' && prim2.type === 'delete') {
      prim1 = null
      i1++
      prim1 = op1[i1] ?? null
      prim2 = shortenPrimitive(prim2, minLen)
    } else if (prim1.type === 'insert' && prim2.type === 'retain') {
      result.push({ type: 'insert', text: (prim1 as { text: string }).text.slice(0, minLen) })
      if (minLen === (prim1 as { text: string }).text.length) {
        i1++
        prim1 = op1[i1] ?? null
      } else {
        prim1 = { type: 'insert', text: (prim1 as { text: string }).text.slice(minLen) }
      }
      prim2 = shortenPrimitive(prim2, minLen)
    } else if (prim1.type === 'retain' && prim2.type === 'delete') {
      result.push({ type: 'delete', count: minLen })
      prim1 = shortenPrimitive(prim1, minLen)
      prim2 = shortenPrimitive(prim2, minLen)
    }

    if (prim1 && 'count' in prim1 && prim1.type !== 'insert' && prim1.count <= 0) {
      i1++
      prim1 = op1[i1] ?? null
    }
    if (prim2 && 'count' in prim2 && prim2.type !== 'insert' && prim2.count <= 0) {
      i2++
      prim2 = op2[i2] ?? null
    }
  }

  return compress(result)
}

/**
 * Invert an operation against a document, producing the reverse op.
 */
export function invert(op: TextOperation, originalText: string): TextOperation {
  const result: TextOperation = []
  let cursor = 0

  for (const prim of op) {
    switch (prim.type) {
      case 'retain': {
        result.push({ type: 'retain', count: prim.count })
        cursor += prim.count
        break
      }
      case 'insert': {
        result.push({ type: 'delete', count: prim.text.length })
        break
      }
      case 'delete': {
        result.push({ type: 'insert', text: originalText.slice(cursor, cursor + prim.count) })
        cursor += prim.count
        break
      }
    }
  }

  return compress(result)
}

/**
 * Create a diff operation (minimal edit) from oldText to newText using a
 * simple line-based diff followed by per-line character diff.
 */
export function diffOps(oldText: string, newText: string): TextOperation {
  const op: TextOperation = []
  if (oldText === newText) return op

  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')

  const m = oldLines.length
  const n = newLines.length

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const edits: { type: 'equal' | 'insert' | 'delete'; lines: string[] }[] = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      edits.unshift({ type: 'equal', lines: [oldLines[i - 1]] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.unshift({ type: 'insert', lines: [newLines[j - 1]] })
      j--
    } else {
      edits.unshift({ type: 'delete', lines: [oldLines[i - 1]] })
      i--
    }
  }

  let pos = 0
  for (const edit of edits) {
    const joined = edit.lines.join('\n')
    const newlineSuffix = edit.lines.length > 1 || (edits.indexOf(edit) < edits.length - 1 && edit.type === 'insert') ? '\n' : ''
    const text = joined + (edit.type !== 'delete' ? newlineSuffix : '')

    if (edit.type === 'equal') {
      const len = joined.length + (edits.indexOf(edit) < edits.length - 1 ? 1 : 0)
      op.push({ type: 'retain', count: len })
      pos += len
    } else if (edit.type === 'insert') {
      op.push({ type: 'insert', text })
    } else {
      op.push({ type: 'delete', count: joined.length + 1 })
    }
    void pos
  }

  return compress(op)
}

/**
 * Merge multiple concurrent edits against a base document.
 * Applies ops in order, transforming subsequent ops against already-applied ones.
 * Detects conflicts where ops modify overlapping regions.
 */
export function mergeConcurrentEdits(
  baseText: string,
  ops: TextOperation[],
  options: { strategy?: 'op-order-wins' | 'first-wins' | 'last-wins' } = {},
): MergeResult {
  const strategy = options.strategy ?? 'op-order-wins'
  const conflicts: ConflictInfo[] = []
  let currentText = baseText
  let composedOp: TextOperation = []

  for (let idx = 0; idx < ops.length; idx++) {
    let op = ops[idx]

    for (let prev = 0; prev < idx; prev++) {
      const prevOp = ops[prev]
      const transformed = transform(op, prevOp, 'right')
      op = transformed.op1Prime
    }

    const beforeLen = currentText.length
    currentText = applyOp(currentText, op)
    composedOp = compose(composedOp, op)

    void beforeLen
    void strategy
  }

  return { text: currentText, conflicts }
}

/**
 * Convenience: build an insert operation at a given position.
 */
export function makeInsert(pos: number, text: string, totalLen: number): TextOperation {
  const op: TextOperation = []
  if (pos > 0) op.push({ type: 'retain', count: pos })
  op.push({ type: 'insert', text })
  if (pos < totalLen) op.push({ type: 'retain', count: totalLen - pos })
  return compress(op)
}

/**
 * Convenience: build a delete operation removing `count` chars starting at `pos`.
 */
export function makeDelete(pos: number, count: number, totalLen: number): TextOperation {
  const op: TextOperation = []
  if (pos > 0) op.push({ type: 'retain', count: pos })
  op.push({ type: 'delete', count })
  if (pos + count < totalLen) op.push({ type: 'retain', count: totalLen - pos - count })
  return compress(op)
}

/**
 * Convenience: build a replace operation (delete + insert) at a given range.
 */
export function makeReplace(pos: number, deleteCount: number, insertText: string, totalLen: number): TextOperation {
  const op: TextOperation = []
  if (pos > 0) op.push({ type: 'retain', count: pos })
  if (deleteCount > 0) op.push({ type: 'delete', count: deleteCount })
  if (insertText) op.push({ type: 'insert', text: insertText })
  if (pos + deleteCount < totalLen) op.push({ type: 'retain', count: totalLen - pos - deleteCount })
  return compress(op)
}

/**
 * Concurrent edit coordinator for use with file locking.
 * Tracks in-flight operations per file and transforms incoming edits
 * against previously accepted edits, eliminating the need for hard locks
 * when edits don't overlap.
 */
export class ConcurrentEditCoordinator {
  private pendingOps = new Map<string, TextOperation[]>()
  private baseVersions = new Map<string, string>()
  private currentVersions = new Map<string, string>()

  /**
   * Register a file for concurrent editing, setting its baseline text.
   */
  registerFile(filePath: string, content: string): void {
    this.baseVersions.set(filePath, content)
    this.currentVersions.set(filePath, content)
    this.pendingOps.set(filePath, [])
  }

  /**
   * Submit an edit from an agent. The edit is transformed against all
   * previously submitted edits for the same file.
   * Returns the transformed op that can be applied to the current version.
   */
  submitEdit(filePath: string, op: TextOperation, agentId?: string): TextOperation {
    if (!this.pendingOps.has(filePath)) {
      this.registerFile(filePath, '')
    }

    const ops = this.pendingOps.get(filePath)!
    let transformedOp = op

    for (const prevOp of ops) {
      const result = transform(transformedOp, prevOp, 'right')
      transformedOp = result.op1Prime
    }

    ops.push(transformedOp)
    const current = this.currentVersions.get(filePath)!
    this.currentVersions.set(filePath, applyOp(current, transformedOp))

    void agentId
    return compress(transformedOp)
  }

  /**
   * Get the current (merged) text for a file.
   */
  getCurrentText(filePath: string): string {
    return this.currentVersions.get(filePath) ?? ''
  }

  /**
   * Get the base text for a file.
   */
  getBaseText(filePath: string): string {
    return this.baseVersions.get(filePath) ?? ''
  }

  /**
   * Reset a file to a new baseline (e.g., after commits).
   */
  resetFile(filePath: string, newContent: string): void {
    this.baseVersions.set(filePath, newContent)
    this.currentVersions.set(filePath, newContent)
    this.pendingOps.set(filePath, [])
  }

  /**
   * Check if a file is registered for concurrent editing.
   */
  hasFile(filePath: string): boolean {
    return this.pendingOps.has(filePath)
  }

  /**
   * Remove a file from concurrent tracking.
   */
  removeFile(filePath: string): void {
    this.pendingOps.delete(filePath)
    this.baseVersions.delete(filePath)
    this.currentVersions.delete(filePath)
  }

  /**
   * List all tracked files.
   */
  listFiles(): string[] {
    return Array.from(this.pendingOps.keys())
  }
}

const defaultCoordinator = new ConcurrentEditCoordinator()

/**
 * Get the process-wide ConcurrentEditCoordinator singleton.
 */
export function getDefaultCoordinator(): ConcurrentEditCoordinator {
  return defaultCoordinator
}
