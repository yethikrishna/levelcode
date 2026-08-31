import { describe, test, expect } from 'bun:test'

import { fuzzyScore, fuzzyScoreFields } from '../fuzzy-match'

describe('fuzzyScore', () => {
  test('empty query matches everything with score 0', () => {
    const result = fuzzyScore('', 'anything')
    expect(result).toEqual({ score: 0, indices: [] })
  })

  test('empty target never matches a non-empty query', () => {
    expect(fuzzyScore('a', '')).toBeNull()
  })

  test('subsequence must be in order', () => {
    // 'kc' is not an in-order subsequence of 'checkpoint'
    expect(fuzzyScore('kc', 'checkpoint')).toBeNull()
    // 'ck' is: c(0), k(4)
    expect(fuzzyScore('ck', 'checkpoint')).not.toBeNull()
  })

  test('exact match beats prefix beats scattered', () => {
    const exact = fuzzyScore('new', 'new')!
    const prefix = fuzzyScore('new', 'newer')!
    const scattered = fuzzyScore('new', 'renewal')!
    expect(exact.score).toBeGreaterThan(prefix.score)
    expect(prefix.score).toBeGreaterThan(scattered.score)
  })

  test('boundary match scores higher than mid-word match', () => {
    // "create" matches at the ":" boundary inside checkpoint:create
    const boundary = fuzzyScore('create', 'checkpoint:create')!
    // "creat" matched as a mid-word prefix of "create" scores lower (no exact/prefix bonus)
    const mid = fuzzyScore('creat', 'checkpoint:create')!
    expect(boundary.score).toBeGreaterThan(0)
    expect(mid.score).toBeGreaterThan(0)
    // "create" gets the exact bonus on the boundary segment; "creat" only prefix
    expect(boundary.score).toBeGreaterThan(mid.score - 0)
  })

  test('consecutive runs score higher than gappy matches', () => {
    const tight = fuzzyScore('che', 'checkpoint')!
    const loose = fuzzyScore('cpt', 'checkpoint')!
    expect(tight.score).toBeGreaterThan(loose.score)
  })

  test('ckpt query matches checkpoint but not codemap:build', () => {
    const a = fuzzyScoreFields('ckpt', ['checkpoint:create', 'Checkpoint · Create'])
    const b = fuzzyScoreFields('ckpt', ['codemap:build', 'Codemap · Build'])
    expect(a).not.toBeNull()
    expect(b).toBeNull() // no subsequence match at all
  })

  test('indices point at matched characters in order', () => {
    // "checkpoint": c(0) h(1) e(2) c(3) k(4) p(5) o(6) i(7) n(8) t(9)
    expect(fuzzyScore('ck', 'checkpoint')!.indices).toEqual([0, 4])
    expect(fuzzyScore('pt', 'checkpoint')!.indices).toEqual([5, 9])
    expect(fuzzyScore('che', 'checkpoint')!.indices).toEqual([0, 1, 2])
  })

  test('case-insensitive matching', () => {
    expect(fuzzyScore('CK', 'checkpoint')).not.toBeNull()
    expect(fuzzyScore('ck', 'CHECKPOINT')).not.toBeNull()
  })

  test('very long targets are rejected for performance', () => {
    expect(fuzzyScore('a', 'x'.repeat(257))).toBeNull()
  })

  test('missing character fails fast', () => {
    expect(fuzzyScore('z', 'checkpoint')).toBeNull()
  })

  test('fuzzyScoreFields returns the best-scoring field', () => {
    // "list" matches both fields, but the exact-prefixed slash form wins
    const result = fuzzyScoreFields('list', ['model:list', 'Model · List'])!
    expect(result.indices).toEqual([6, 7, 8, 9])
  })
})
