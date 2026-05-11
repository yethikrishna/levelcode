import {
  approveEntry,
  rejectEntry,
  deleteEntry,
  editEntry,
  getApprovedEntries,
  getPendingEntries,
  findEntry,
  getBibleStats,
  formatBibleStats,
  formatEntryList,
  getBibleContext,
  toggleAutoResearch,
  isAutoResearchEnabled,
  createEntry,
  type BibleEntryType,
} from '@levelcode/common/utils/memory-bible'
import { resolveActiveTeam } from './command-registry'

// ============================================================================
// Bible:pending — List pending entries
// ============================================================================

export async function handleBiblePending(teamName?: string): Promise<string> {
  const team = teamName || resolveActiveTeam()?.name
  if (!team) return 'No active team. Use /team:create first.'

  const pending = getPendingEntries(team)
  if (pending.length === 0) {
    return 'No pending bible entries. All caught up!'
  }

  return `=== Pending Bible Entries (${pending.length}) ===\n\n${formatEntryList(pending)}`
}

// ============================================================================
// Bible:approved — List approved entries
// ============================================================================

export async function handleBibleApproved(
  type?: BibleEntryType,
  teamName?: string,
): Promise<string> {
  const team = teamName || resolveActiveTeam()?.name
  if (!team) return 'No active team. Use /team:create first.'

  const approved = getApprovedEntries(team, type)
  if (approved.length === 0) {
    return type
      ? `No approved bible entries for type: ${type}`
      : 'No approved bible entries yet. Approve some pending entries first.'
  }

  return `=== Approved Bible Entries (${approved.length}) ===\n\n${formatEntryList(approved)}`
}

// ============================================================================
// Bible:approve — Approve a pending entry
// ============================================================================

export async function handleBibleApprove(
  entryId: string,
  teamName?: string,
): Promise<string> {
  const team = teamName || resolveActiveTeam()?.name
  if (!team) return 'No active team. Use /team:create first.'
  if (!entryId.trim()) return 'Usage: /bible:approve <entryId>'

  const result = approveEntry(team, entryId.trim(), 'human')
  return result.message
}

// ============================================================================
// Bible:reject — Reject a pending entry
// ============================================================================

export async function handleBibleReject(
  entryId: string,
  teamName?: string,
): Promise<string> {
  const team = teamName || resolveActiveTeam()?.name
  if (!team) return 'No active team. Use /team:create first.'
  if (!entryId.trim()) return 'Usage: /bible:reject <entryId>'

  const result = rejectEntry(team, entryId.trim(), 'human')
  return result.message
}

// ============================================================================
// Bible:delete — Delete an entry
// ============================================================================

export async function handleBibleDelete(
  entryId: string,
  teamName?: string,
): Promise<string> {
  const team = teamName || resolveActiveTeam()?.name
  if (!team) return 'No active team. Use /team:create first.'
  if (!entryId.trim()) return 'Usage: /bible:delete <entryId>'

  const result = deleteEntry(team, entryId.trim())
  return result.message
}

// ============================================================================
// Bible:edit — Edit an entry
// ============================================================================

export async function handleBibleEdit(
  args: string,
  teamName?: string,
): Promise<string> {
  const team = teamName || resolveActiveTeam()?.name
  if (!team) return 'No active team. Use /team:create first.'

  // Parse: entryId "new title" "new content"
  const parts = args.match(/"[^"]+"|'[^']+'|\S+/g)
  if (!parts || parts.length < 2) {
    return 'Usage: /bible:edit <entryId> ["title"] ["content"]'
  }

  const entryId = (parts[0] || '').replace(/^["']|["']$/g, '')
  const title = parts[1] ? parts[1].replace(/^["']|["']$/g, '') : undefined
  const content = parts[2] ? parts[2].replace(/^["']|["']$/g, '') : undefined

  const updates: { title?: string; content?: string } = {}
  if (title) updates.title = title
  if (content) updates.content = content

  if (Object.keys(updates).length === 0) {
    return 'Nothing to update. Provide a title or content.'
  }

  const result = editEntry(team, entryId, updates)
  return result.message
}

// ============================================================================
// Bible:stats — Show bible statistics
// ============================================================================

export async function handleBibleStats(teamName?: string): Promise<string> {
  const team = teamName || resolveActiveTeam()?.name
  if (!team) return 'No active team. Use /team:create first.'

  const stats = getBibleStats(team)
  return formatBibleStats(stats)
}

// ============================================================================
// Bible:add — Manually add an entry
// ============================================================================

export async function handleBibleAdd(
  args: string,
  teamName?: string,
): Promise<string> {
  const team = teamName || resolveActiveTeam()?.name
  if (!team) return 'No active team. Use /team:create first.'

  // Parse: type title content
  const parts = args.match(/(\S+)\s+"([^"]+)"\s+"([^"]+)"/) ||
    args.match(/(\S+)\s+(\S+)\s+(.+)/)

  if (!parts || parts.length < 4) {
    return `Usage: /bible:add <type> "<title>" "<content>"
Types: document, decision, intelligence, feature, product-context, market-insight`
  }

  const type = parts[1] as BibleEntryType
  const title = parts[2]
  const content = parts[3]

  const validTypes: BibleEntryType[] = [
    'document', 'decision', 'intelligence', 'feature',
    'product-context', 'market-insight',
  ]

  if (!validTypes.includes(type)) {
    return `Invalid type. Use one of: ${validTypes.join(', ')}`
  }

  const entry = createEntry(team, type, title, content, 'user', {
    autoApprove: false, // always require human review for manual adds
  })

  return `Entry created: ${entry.id} (pending review)\nTitle: ${title}`
}

// ============================================================================
// Bible:toggle-research — Toggle auto-research
// ============================================================================

export async function handleBibleToggleResearch(teamName?: string): Promise<string> {
  const team = teamName || resolveActiveTeam()?.name
  if (!team) return 'No active team. Use /team:create first.'

  const current = isAutoResearchEnabled(team)
  toggleAutoResearch(team, !current)

  return `Auto-research ${!current ? 'ENABLED' : 'DISABLED'}.`
}

// ============================================================================
// Bible:context — Show approved bible context (for agents)
// ============================================================================

export async function handleBibleContext(
  type?: BibleEntryType,
  teamName?: string,
): Promise<string> {
  const team = teamName || resolveActiveTeam()?.name
  if (!team) return 'No active team. Use /team:create first.'

  return getBibleContext(team, type)
}

// ============================================================================
// Bible:show — Show a single entry
// ============================================================================

export async function handleBibleShow(
  entryId: string,
  teamName?: string,
): Promise<string> {
  const team = teamName || resolveActiveTeam()?.name
  if (!team) return 'No active team. Use /team:create first.'
  if (!entryId.trim()) return 'Usage: /bible:show <entryId>'

  const entry = findEntry(team, entryId.trim())
  if (!entry) return `Entry ${entryId} not found.`

  const lines = [
    `=== Entry: ${entry.id} ===`,
    ``,
    `Type: ${entry.type}`,
    `Title: ${entry.title}`,
    `Status: ${entry.status}`,
    `Source: ${entry.source}`,
    `Created: ${new Date(entry.createdAt).toLocaleString()}`,
    `Updated: ${new Date(entry.updatedAt).toLocaleString()}`,
  ]

  if (entry.reviewedAt) {
    lines.push(`Reviewed: ${new Date(entry.reviewedAt).toLocaleString()}`)
  }
  if (entry.reviewedBy) {
    lines.push(`Reviewed by: ${entry.reviewedBy}`)
  }
  if (entry.confidence !== undefined) {
    lines.push(`Confidence: ${Math.round(entry.confidence * 100)}%`)
  }
  if (entry.tags && entry.tags.length > 0) {
    lines.push(`Tags: ${entry.tags.join(', ')}`)
  }

  lines.push(``, `Content:`, entry.content)

  return lines.join('\n')
}
