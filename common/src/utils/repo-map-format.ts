/**
 * Repo map formatting — turns tree-sitter token scores (from
 * @levelcode/code-map) into a compact, budgeted symbol outline that gives an
 * agent structural awareness of an entire codebase for a few thousand tokens.
 *
 * Pure formatting logic; the SDK's `repo_map` tool feeds it live data.
 */

export interface RepoMapInput {
  /** filePath -> token -> importance score (from code-map getFileTokenScores). */
  tokenScores: Record<string, Record<string, number>>
  /** filePath -> token -> list of caller files (optional, enriches hot symbols). */
  tokenCallers?: Record<string, Record<string, string[]>>
  /** Restrict the map to paths under this prefix (e.g. "src/auth"). */
  focusPath?: string
  /** Maximum output size in characters. Default 8000 (~2k tokens). */
  maxChars?: number
  /** Max symbols listed per file. Default 12. */
  maxTokensPerFile?: number
}

export const DEFAULT_REPO_MAP_BUDGET = 8000
const DEFAULT_MAX_TOKENS_PER_FILE = 12
const MIN_TOKENS_PER_FILE = 3

interface RankedFile {
  path: string
  totalScore: number
  tokens: Array<{ name: string; score: number; callers: number }>
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '')
}

function rankFiles(input: RepoMapInput): RankedFile[] {
  const { tokenScores, tokenCallers, focusPath } = input
  const focus = focusPath ? normalizePath(focusPath).replace(/\/$/, '') : null

  const ranked: RankedFile[] = []
  for (const [rawPath, tokens] of Object.entries(tokenScores)) {
    const path = normalizePath(rawPath)
    if (focus && path !== focus && !path.startsWith(focus + '/')) continue

    const tokenEntries = Object.entries(tokens)
    if (tokenEntries.length === 0) continue

    const callers = tokenCallers?.[rawPath] ?? {}
    const rankedTokens = tokenEntries
      .map(([name, score]) => ({
        name,
        score,
        callers: callers[name]?.length ?? 0,
      }))
      .sort((a, b) => b.score - a.score || b.callers - a.callers)

    const totalScore = rankedTokens.reduce((sum, t) => sum + t.score, 0)
    ranked.push({ path, totalScore, tokens: rankedTokens })
  }

  return ranked.sort((a, b) => b.totalScore - a.totalScore)
}

/**
 * Format a repo map within a character budget.
 *
 * Output shape (one line per file, most important files first):
 *
 *   src/auth/session.ts: createSession*, validateToken*, SessionStore, refresh
 *   src/db/client.ts: getClient*, runMigrations, DbConfig
 *
 * A trailing `*` marks symbols referenced from 3+ other files (API surface).
 */
export function formatRepoMap(input: RepoMapInput): string {
  const maxChars = input.maxChars ?? DEFAULT_REPO_MAP_BUDGET
  const maxTokensPerFile = Math.max(
    MIN_TOKENS_PER_FILE,
    input.maxTokensPerFile ?? DEFAULT_MAX_TOKENS_PER_FILE,
  )

  const ranked = rankFiles(input)
  if (ranked.length === 0) {
    return input.focusPath
      ? `No mapped symbols found under "${input.focusPath}". The path may not exist, may contain no source files, or may use a language the code map does not parse yet.`
      : 'No mapped symbols found in this project.'
  }

  const header = input.focusPath
    ? `Repo map (focus: ${normalizePath(input.focusPath)}) — files ranked by importance; * marks symbols used by 3+ other files:\n`
    : `Repo map — files ranked by importance; * marks symbols used by 3+ other files:\n`

  const lines: string[] = []
  let used = header.length
  let filesIncluded = 0

  for (const file of ranked) {
    const tokens = file.tokens
      .slice(0, maxTokensPerFile)
      .map((t) => (t.callers >= 3 ? `${t.name}*` : t.name))
      .join(', ')
    const line = `${file.path}: ${tokens}`

    if (used + line.length + 1 > maxChars) {
      const remaining = ranked.length - filesIncluded
      if (remaining > 0) {
        lines.push(`... and ${remaining} more files (raise maxChars or pass focusPath to see them)`)
      }
      break
    }
    lines.push(line)
    used += line.length + 1
    filesIncluded++
  }

  return header + lines.join('\n')
}
