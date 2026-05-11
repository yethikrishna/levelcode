import fs from 'fs'
import path from 'path'
import { getConfigDir } from './auth'

// ============================================================================
// Bible Structure — Human-Vetted Source of Truth
// ============================================================================

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface BibleEntry {
  id: string
  type: BibleEntryType
  title: string
  content: string
  source: 'user' | 'system' | 'agent' | 'market'
  status: ReviewStatus
  createdAt: number
  updatedAt: number
  reviewedAt?: number
  reviewedBy?: string
  confidence?: number
  tags?: string[]
  relatedFiles?: string[]
  metadata?: Record<string, unknown>
}

export type BibleEntryType =
  | 'document'
  | 'decision'
  | 'intelligence'
  | 'feature'
  | 'product-context'
  | 'market-insight'

// ============================================================================
// Bible Configuration
// ============================================================================

export interface BibleConfig {
  autoResearchEnabled: boolean
  requireHumanReview: boolean
  confidenceThreshold: number  // minimum confidence to auto-promote (0-1, default 0.9 = never auto-promote)
  maxPendingItems: number
  folders: BibleFolders
}

export interface BibleFolders {
  documents: string      // user-uploaded + system-generated docs
  decisions: string      // decisions pending/approved
  intelligence: string   // user intelligence items
  features: string      // feature descriptions
  productContext: string // product context info
  market: string         // market research / insights
}

const DEFAULT_BIBLE_CONFIG: BibleConfig = {
  autoResearchEnabled: true,
  requireHumanReview: true,
  confidenceThreshold: 0.9,  // never auto-promote by default
  maxPendingItems: 100,
  folders: {
    documents: 'docs',
    decisions: 'bible/decisions',
    intelligence: 'bible/intelligence',
    features: 'bible/features',
    productContext: 'bible/context',
    market: 'bible/market',
  },
}

// ============================================================================
// Paths
// ============================================================================

function getBibleRoot(teamName: string): string {
  return path.join(getConfigDir(), 'swarm', teamName, 'bible')
}

function getFolderPath(teamName: string, folder: string): string {
  return path.join(getBibleRoot(teamName), folder)
}

function getConfigPath(teamName: string): string {
  return path.join(getBibleRoot(teamName), 'config.json')
}

function getIndexPath(teamName: string): string {
  return path.join(getBibleRoot(teamName), 'index.json')
}

// ============================================================================
// Config I/O
// ============================================================================

export function loadBibleConfig(teamName: string): BibleConfig {
  try {
    const filePath = getConfigPath(teamName)
    if (!fs.existsSync(filePath)) return { ...DEFAULT_BIBLE_CONFIG }
    return { ...DEFAULT_BIBLE_CONFIG, ...JSON.parse(fs.readFileSync(filePath, 'utf-8')) }
  } catch {
    return { ...DEFAULT_BIBLE_CONFIG }
  }
}

export function saveBibleConfig(teamName: string, config: Partial<BibleConfig>): void {
  const dir = getBibleRoot(teamName)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const existing = loadBibleConfig(teamName)
  const updated = { ...existing, ...config }
  fs.writeFileSync(getConfigPath(teamName), JSON.stringify(updated, null, 2), 'utf-8')
}

// ============================================================================
// Entry Management
// ============================================================================

function generateId(type: BibleEntryType): string {
  const prefix = type.charAt(0).toUpperCase()
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 6)
  return `${prefix}-${timestamp}-${random}`
}

export function createEntry(
  teamName: string,
  type: BibleEntryType,
  title: string,
  content: string,
  source: BibleEntry['source'],
  options?: {
    confidence?: number
    tags?: string[]
    relatedFiles?: string[]
    autoApprove?: boolean
  },
): BibleEntry {
  const config = loadBibleConfig(teamName)
  const entry: BibleEntry = {
    id: generateId(type),
    type,
    title,
    content,
    source,
    status: (options?.autoApprove || !config.requireHumanReview) ? 'approved' : 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    confidence: options?.confidence,
    tags: options?.tags,
    relatedFiles: options?.relatedFiles,
  }

  // Save to pending or approved folder
  const folder = config.folders[getFolderForType(type)]
  const dir = getFolderPath(teamName, folder)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const fileName = `${entry.status}/${entry.id}.json`
  fs.writeFileSync(path.join(dir, fileName), JSON.stringify(entry, null, 2), 'utf-8')

  // Update index
  updateIndex(teamName, entry)

  return entry
}

function getFolderForType(type: BibleEntryType): keyof BibleFolders {
  switch (type) {
    case 'document': return 'documents'
    case 'decision': return 'decisions'
    case 'intelligence': return 'intelligence'
    case 'feature': return 'features'
    case 'product-context': return 'productContext'
    case 'market-insight': return 'market'
  }
}

// ============================================================================
// Review Actions
// ============================================================================

export function approveEntry(
  teamName: string,
  entryId: string,
  reviewedBy?: string,
): { success: boolean; message: string } {
  const entry = findEntry(teamName, entryId)
  if (!entry) {
    return { success: false, message: `Entry ${entryId} not found` }
  }

  if (entry.status === 'approved') {
    return { success: true, message: `Entry ${entryId} already approved` }
  }

  entry.status = 'approved'
  entry.reviewedAt = Date.now()
  entry.updatedAt = Date.now()
  if (reviewedBy) entry.reviewedBy = reviewedBy

  // Move from pending/ to approved/
  const config = loadBibleConfig(teamName)
  const folder = config.folders[getFolderForType(entry.type)]
  const pendingPath = path.join(getFolderPath(teamName, folder), 'pending', `${entryId}.json`)
  const approvedPath = path.join(getFolderPath(teamName, folder), 'approved', `${entryId}.json`)

  if (fs.existsSync(pendingPath)) {
    fs.renameSync(pendingPath, approvedPath)
  } else {
    // Just write to approved
    fs.writeFileSync(approvedPath, JSON.stringify(entry, null, 2), 'utf-8')
  }

  updateIndex(teamName, entry)
  return { success: true, message: `Entry ${entryId} approved and added to bible` }
}

export function rejectEntry(
  teamName: string,
  entryId: string,
  reviewedBy?: string,
): { success: boolean; message: string } {
  const entry = findEntry(teamName, entryId)
  if (!entry) {
    return { success: false, message: `Entry ${entryId} not found` }
  }

  entry.status = 'rejected'
  entry.reviewedAt = Date.now()
  entry.updatedAt = Date.now()
  if (reviewedBy) entry.reviewedBy = reviewedBy

  // Move to rejected/
  const config = loadBibleConfig(teamName)
  const folder = config.folders[getFolderForType(entry.type)]
  const pendingPath = path.join(getFolderPath(teamName, folder), 'pending', `${entryId}.json`)
  const rejectedPath = path.join(getFolderPath(teamName, folder), 'rejected', `${entryId}.json`)

  if (!fs.existsSync(path.dirname(rejectedPath))) {
    fs.mkdirSync(path.dirname(rejectedPath), { recursive: true })
  }

  if (fs.existsSync(pendingPath)) {
    fs.renameSync(pendingPath, rejectedPath)
  } else {
    fs.writeFileSync(rejectedPath, JSON.stringify(entry, null, 2), 'utf-8')
  }

  updateIndex(teamName, entry)
  return { success: true, message: `Entry ${entryId} rejected` }
}

export function editEntry(
  teamName: string,
  entryId: string,
  updates: { title?: string; content?: string; tags?: string[]; relatedFiles?: string[] },
): { success: boolean; message: string } {
  const entry = findEntry(teamName, entryId)
  if (!entry) {
    return { success: false, message: `Entry ${entryId} not found` }
  }

  if (updates.title) entry.title = updates.title
  if (updates.content) entry.content = updates.content
  if (updates.tags) entry.tags = updates.tags
  if (updates.relatedFiles) entry.relatedFiles = updates.relatedFiles
  entry.updatedAt = Date.now()

  // Reset to pending if edited and was approved
  if (entry.status === 'approved' && (updates.content || updates.title)) {
    entry.status = 'pending'
  }

  saveEntry(teamName, entry)
  updateIndex(teamName, entry)
  return { success: true, message: `Entry ${entryId} updated` }
}

export function deleteEntry(
  teamName: string,
  entryId: string,
): { success: boolean; message: string } {
  const entry = findEntry(teamName, entryId)
  if (!entry) {
    return { success: false, message: `Entry ${entryId} not found` }
  }

  const config = loadBibleConfig(teamName)
  const folder = config.folders[getFolderForType(entry.type)]
  const locations = ['pending', 'approved', 'rejected']

  for (const loc of locations) {
    const filePath = path.join(getFolderPath(teamName, folder), loc, `${entryId}.json`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }

  // Remove from index
  const indexPath = getIndexPath(teamName)
  if (fs.existsSync(indexPath)) {
    const index: BibleEntry[] = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    const updated = index.filter(e => e.id !== entryId)
    fs.writeFileSync(indexPath, JSON.stringify(updated, null, 2), 'utf-8')
  }

  return { success: true, message: `Entry ${entryId} deleted` }
}

// ============================================================================
// Market Research (Auto-Research)
// ============================================================================

export function toggleAutoResearch(teamName: string, enabled: boolean): void {
  saveBibleConfig(teamName, { autoResearchEnabled: enabled })
}

export function isAutoResearchEnabled(teamName: string): boolean {
  return loadBibleConfig(teamName).autoResearchEnabled
}

export function addMarketInsight(
  teamName: string,
  title: string,
  content: string,
  source: 'system' | 'agent' = 'system',
  options?: { confidence?: number; tags?: string[] },
): BibleEntry {
  // Auto-research results go to pending by default
  // Human must review before agents trust them
  return createEntry(teamName, 'market-insight', title, content, source, {
    confidence: options?.confidence,
    tags: options?.tags,
    autoApprove: false, // never auto-approve market research
  })
}

// ============================================================================
// Querying — Agents Only See Approved
// ============================================================================

export function getApprovedEntries(
  teamName: string,
  type?: BibleEntryType,
): BibleEntry[] {
  const index = loadIndex(teamName)
  return index.filter(e =>
    e.status === 'approved' && (type ? e.type === type : true)
  )
}

export function getPendingEntries(
  teamName: string,
  type?: BibleEntryType,
): BibleEntry[] {
  const index = loadIndex(teamName)
  return index.filter(e =>
    e.status === 'pending' && (type ? e.type === type : true)
  )
}

export function findEntry(
  teamName: string,
  entryId: string,
): BibleEntry | null {
  const index = loadIndex(teamName)
  return index.find(e => e.id === entryId) || null
}

// Get approved content as a single "bible" string for agent context
export function getBibleContext(
  teamName: string,
  type?: BibleEntryType,
): string {
  const entries = getApprovedEntries(teamName, type)
  if (entries.length === 0) return 'No approved bible entries yet.'

  const lines: string[] = ['=== LEVELCODE BIBLE (Human-Vetted Truth) ===', '']

  for (const entry of entries) {
    lines.push(`[${entry.type.toUpperCase()}] ${entry.title}`)
    lines.push(entry.content)
    if (entry.tags && entry.tags.length > 0) {
      lines.push(`Tags: ${entry.tags.join(', ')}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ============================================================================
// Index Management
// ============================================================================

function loadIndex(teamName: string): BibleEntry[] {
  const indexPath = getIndexPath(teamName)
  if (!fs.existsSync(indexPath)) return []
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
}

function updateIndex(teamName: string, entry: BibleEntry): void {
  const indexPath = getIndexPath(teamName)
  const dir = path.dirname(indexPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const index = loadIndex(teamName)
  const existingIdx = index.findIndex(e => e.id === entry.id)

  if (existingIdx >= 0) {
    index[existingIdx] = entry
  } else {
    index.push(entry)
  }

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8')
}

function saveEntry(teamName: string, entry: BibleEntry): void {
  const config = loadBibleConfig(teamName)
  const folder = config.folders[getFolderForType(entry.type)]
  const subFolder = entry.status
  const dir = path.join(getFolderPath(teamName, folder), subFolder)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const filePath = path.join(dir, `${entry.id}.json`)
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8')
}

// ============================================================================
// Statistics
// ============================================================================

export function getBibleStats(teamName: string): {
  total: number
  approved: number
  pending: number
  rejected: number
  byType: Record<string, { approved: number; pending: number; rejected: number }>
} {
  const index = loadIndex(teamName)
  const stats = {
    total: index.length,
    approved: 0,
    pending: 0,
    rejected: 0,
    byType: {} as Record<string, { approved: number; pending: number; rejected: number }>,
  }

  for (const entry of index) {
    stats[entry.status]++
    if (!stats.byType[entry.type]) {
      stats.byType[entry.type] = { approved: 0, pending: 0, rejected: 0 }
    }
    stats.byType[entry.type][entry.status]++
  }

  return stats
}

// ============================================================================
// Formatting
// ============================================================================

export function formatBibleStats(stats: ReturnType<typeof getBibleStats>): string {
  const lines = [
    '=== Bible Statistics ===',
    '',
    `Total entries: ${stats.total}`,
    `Approved: ${stats.approved}`,
    `Pending: ${stats.pending}`,
    `Rejected: ${stats.rejected}`,
    '',
    'By type:',
  ]

  for (const [type, counts] of Object.entries(stats.byType)) {
    lines.push(`  ${type}: ${counts.approved} approved, ${counts.pending} pending, ${counts.rejected} rejected`)
  }

  return lines.join('\n')
}

export function formatEntryList(entries: BibleEntry[], showContent = false): string {
  if (entries.length === 0) return 'No entries found.'

  const lines: string[] = []
  for (const entry of entries) {
    const icon = entry.status === 'approved' ? '✅' :
                  entry.status === 'pending' ? '⏸️' : '❌'
    lines.push(`${icon} [${entry.id}] ${entry.title} (${entry.type})`)
    if (entry.confidence !== undefined) {
      lines.push(`   Confidence: ${Math.round(entry.confidence * 100)}%`)
    }
    if (showContent) {
      lines.push(`   Content: ${entry.content.slice(0, 100)}${entry.content.length > 100 ? '...' : ''}`)
    }
  }

  return lines.join('\n')
}
