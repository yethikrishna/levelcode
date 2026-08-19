/**
 * Repo-scoped agent memory — a persistent, human-readable memory file that
 * agents maintain across sessions (`.levelcode/MEMORY.md`).
 *
 * Unlike the team-scoped memory bible (approval workflow, per-team), this is
 * zero-friction per-repository memory: agents call the `remember` tool when
 * they learn something durable about the codebase, and every future session
 * automatically starts with those lessons in context.
 *
 * All functions here are pure string transforms so they can be unit-tested
 * and reused by both the SDK (tool execution) and the CLI (slash commands).
 */

export const MEMORY_DIR_NAME = '.levelcode'
export const MEMORY_FILE_NAME = 'MEMORY.md'
export const MEMORY_FILE_RELATIVE_PATH = `${MEMORY_DIR_NAME}/${MEMORY_FILE_NAME}`

export type MemoryCategory = 'lesson' | 'gotcha' | 'preference' | 'fact'

export interface MemoryEntry {
  category: MemoryCategory
  content: string
  /** ISO date (YYYY-MM-DD) the entry was recorded. */
  date: string
}

export const MEMORY_CATEGORIES: MemoryCategory[] = [
  'lesson',
  'gotcha',
  'preference',
  'fact',
]

const CATEGORY_HEADINGS: Record<MemoryCategory, string> = {
  lesson: 'Lessons',
  gotcha: 'Gotchas',
  preference: 'Preferences',
  fact: 'Facts',
}

const HEADING_TO_CATEGORY: Record<string, MemoryCategory> = Object.fromEntries(
  Object.entries(CATEGORY_HEADINGS).map(([category, heading]) => [
    heading.toLowerCase(),
    category as MemoryCategory,
  ]),
)

/** Hard caps to keep memory prompt-sized. */
export const MAX_ENTRIES_PER_CATEGORY = 50
export const MAX_ENTRY_LENGTH = 500
export const DEFAULT_MEMORY_PROMPT_BUDGET = 6000

const FILE_HEADER = `# LevelCode Agent Memory

> Maintained automatically by LevelCode agents via the \`remember\` tool.
> Loaded into agent context at the start of every session in this repo.
> Edit or delete entries freely — agents treat this file as ground truth.
`

/** Parse a MEMORY.md file into structured entries. Tolerant of hand edits. */
export function parseMemory(content: string): MemoryEntry[] {
  const entries: MemoryEntry[] = []
  let currentCategory: MemoryCategory | null = null

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()

    const headingMatch = /^##\s+(.+)$/.exec(line)
    if (headingMatch) {
      currentCategory =
        HEADING_TO_CATEGORY[headingMatch[1]!.trim().toLowerCase()] ?? null
      continue
    }

    if (!currentCategory) continue

    const bulletMatch = /^[-*]\s+(.*)$/.exec(line)
    if (!bulletMatch) continue

    let text = bulletMatch[1]!.trim()
    if (!text) continue

    let date = ''
    const dateMatch = /^\[(\d{4}-\d{2}-\d{2})\]\s*(.*)$/.exec(text)
    if (dateMatch) {
      date = dateMatch[1]!
      text = dateMatch[2]!.trim()
    }
    if (!text) continue

    entries.push({ category: currentCategory, content: text, date })
  }

  return entries
}

/** Serialize entries back to canonical MEMORY.md markdown. */
export function serializeMemory(entries: MemoryEntry[]): string {
  const sections: string[] = [FILE_HEADER]

  for (const category of MEMORY_CATEGORIES) {
    const categoryEntries = entries.filter((e) => e.category === category)
    if (categoryEntries.length === 0) continue

    sections.push(`## ${CATEGORY_HEADINGS[category]}\n`)
    for (const entry of categoryEntries) {
      const datePrefix = entry.date ? `[${entry.date}] ` : ''
      sections.push(`- ${datePrefix}${entry.content}`)
    }
    sections.push('')
  }

  return sections.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

function normalizeForDedupe(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim()
}

/**
 * Add an entry to an existing memory file's content, returning the new file
 * content. Deduplicates near-identical entries and enforces per-category
 * caps (oldest entries are evicted first).
 */
export function addMemoryEntry(
  existingContent: string,
  entry: { category: MemoryCategory; content: string; date?: string },
): { content: string; added: boolean; reason?: string } {
  const cleaned = entry.content.replace(/\s+/g, ' ').trim()
  if (!cleaned) {
    return { content: existingContent, added: false, reason: 'empty entry' }
  }
  if (cleaned.length > MAX_ENTRY_LENGTH) {
    return {
      content: existingContent,
      added: false,
      reason: `entry exceeds ${MAX_ENTRY_LENGTH} chars — store a shorter, more focused insight`,
    }
  }

  const entries = parseMemory(existingContent)

  const normalized = normalizeForDedupe(cleaned)
  const duplicate = entries.find(
    (e) => normalizeForDedupe(e.content) === normalized,
  )
  if (duplicate) {
    return {
      content: existingContent,
      added: false,
      reason: 'a near-identical entry already exists',
    }
  }

  const date = entry.date ?? new Date().toISOString().slice(0, 10)
  entries.push({ category: entry.category, content: cleaned, date })

  // Enforce the per-category cap, evicting the oldest entries first.
  for (const category of MEMORY_CATEGORIES) {
    const categoryEntries = entries.filter((e) => e.category === category)
    if (categoryEntries.length > MAX_ENTRIES_PER_CATEGORY) {
      const excess = categoryEntries.length - MAX_ENTRIES_PER_CATEGORY
      const toRemove = new Set(categoryEntries.slice(0, excess))
      for (let i = entries.length - 1; i >= 0; i--) {
        if (toRemove.has(entries[i]!)) entries.splice(i, 1)
      }
    }
  }

  return { content: serializeMemory(entries), added: true }
}

/**
 * Render memory for inclusion in an agent prompt, newest entries first,
 * trimmed to a character budget.
 */
export function formatMemoryForPrompt(
  content: string,
  maxChars: number = DEFAULT_MEMORY_PROMPT_BUDGET,
): string {
  const entries = parseMemory(content)
  if (entries.length === 0) return ''

  const lines: string[] = []
  for (const category of MEMORY_CATEGORIES) {
    // Newest first within each category so recent insights survive trimming.
    const categoryEntries = entries
      .filter((e) => e.category === category)
      .reverse()
    if (categoryEntries.length === 0) continue
    lines.push(`${CATEGORY_HEADINGS[category]}:`)
    for (const entry of categoryEntries) {
      lines.push(`- ${entry.content}`)
    }
  }

  const result = lines.join('\n')
  return result.length <= maxChars
    ? result
    : `${result.slice(0, maxChars)}\n... [memory truncated]`
}

/** Stats for CLI display. */
export function getMemoryStats(content: string): {
  total: number
  byCategory: Record<MemoryCategory, number>
} {
  const entries = parseMemory(content)
  const byCategory = Object.fromEntries(
    MEMORY_CATEGORIES.map((c) => [c, 0]),
  ) as Record<MemoryCategory, number>
  for (const entry of entries) {
    byCategory[entry.category]++
  }
  return { total: entries.length, byCategory }
}

/** Create an empty memory file's content. */
export function emptyMemoryFile(): string {
  return FILE_HEADER
}
