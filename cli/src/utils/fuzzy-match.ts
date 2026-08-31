/**
 * Subsequence fuzzy matcher with a tuned scoring model.
 *
 * Used by interactive pickers (command palette) where ranking quality is the
 * product: "ckpt" should rank `checkpoint:create` above `codemap:build`, and
 * an exact alias hit ("new") must outrank everything else.
 *
 * Scoring rules (higher is better):
 *  - Subsequence match is required (all query chars appear in order).
 *  - +START bonus when a char matches at a word boundary (start, or right
 *    after `/`, `:`, `-`, `_`, `.`, space).
 *  - +CONSECUTIVE bonus for each char that directly follows the previous
 *    match (runs of contiguous text rank above scattered matches).
 *  - +PREFIX bonus when the whole target starts with the query.
 *  - +EXACT bonus when query equals the target.
 *  - -GAP penalty proportional to the distance between matched chars, so
 *    tight matches rank above loose ones.
 */

export interface FuzzyMatchResult {
  score: number
  /** Indices in `target` of the matched characters, in order. */
  indices: number[]
}

const WORD_BOUNDARY = new Set(['/', ':', '-', '_', '.', ' '])

const START_BONUS = 12
const CONSECUTIVE_BONUS = 8
const PREFIX_BONUS = 20
const EXACT_BONUS = 30
const GAP_PENALTY = -1

export function fuzzyScore(query: string, target: string): FuzzyMatchResult | null {
  if (query.length === 0) {
    return { score: 0, indices: [] }
  }
  if (target.length === 0 || target.length > 256) {
    return null
  }

  const q = query.toLowerCase()
  const t = target.toLowerCase()

  // Fast reject: all query chars must exist somewhere in the target.
  for (const ch of q) {
    if (!t.includes(ch)) return null
  }

  const indices: number[] = []
  let score = 0
  let prevIndex = -1

  for (let qi = 0; qi < q.length; qi++) {
    const startSearch = prevIndex + 1
    const ch = q[qi]

    // Prefer the earliest boundary-aligned match; fall back to any match.
    let matchIndex = -1
    for (let i = startSearch; i < t.length; i++) {
      if (t[i] === ch) {
        const isBoundary = i === 0 || WORD_BOUNDARY.has(t[i - 1]!)
        if (isBoundary) {
          matchIndex = i
          break
        }
        if (matchIndex === -1) matchIndex = i
      }
    }
    if (matchIndex === -1) return null

    if (matchIndex === 0 || WORD_BOUNDARY.has(t[matchIndex - 1]!)) {
      score += START_BONUS
    }
    if (prevIndex !== -1) {
      if (matchIndex === prevIndex + 1) {
        score += CONSECUTIVE_BONUS
      } else {
        score += GAP_PENALTY * Math.min(matchIndex - prevIndex - 1, 16)
      }
    }

    indices.push(matchIndex)
    prevIndex = matchIndex
  }

  if (t === q) score += EXACT_BONUS
  if (t.startsWith(q)) score += PREFIX_BONUS

  return { score, indices }
}

/**
 * Score `target` against the best of several candidate field strings
 * (e.g. the command name and its human-readable label).
 */
export function fuzzyScoreFields(
  query: string,
  targets: string[],
): FuzzyMatchResult | null {
  let best: FuzzyMatchResult | null = null
  for (const target of targets) {
    const result = fuzzyScore(query, target)
    if (result && (!best || result.score > best.score)) {
      best = result
    }
  }
  return best
}
