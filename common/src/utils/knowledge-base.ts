import fs from 'fs'
import path from 'path'
import { getConfigDir } from './auth'
import { loadPersonas } from './persona-manager'

// ============================================================================
// Knowledge Entry — Versioned + Provenance
// ============================================================================

export interface KnowledgeEntry {
  id: string
  content: string
  source: 'agent' | 'human' | 'system' | 'market'
  sourceAgentId?: string
  timestamp: number
  confidence: number        // 0-1
  tags?: string[]
  relatedFiles?: string[]
  version: number              // increment on update
  supersedes?: string[]     // IDs of entries this replaces
  validFrom: number
  validTo?: number          // null = current valid
  hash: string                // content hash for tamper detection
  embedding?: number[]     // optional vector embedding
}

export interface KnowledgeQuery {
  query: string
  tags?: string[]
  source?: KnowledgeEntry['source']
  minConfidence?: number
  maxResults?: number
  includeExpired?: boolean
}

// ============================================================================
// Storage Paths
// ============================================================================

function getKnowledgeDir(teamName: string): string {
  return path.join(getConfigDir(), 'swarm', teamName, 'knowledge')
}

function getEntriesPath(teamName: string): string {
  return path.join(getKnowledgeDir(teamName), 'entries.jsonl')
}

function getEmbeddingsPath(teamName: string): string {
  return path.join(getKnowledgeDir(teamName), 'embeddings.json')
}

// ============================================================================
// Simple Hash (for tamper detection)
// ============================================================================

export function hashContent(content: string): string {
  // Simple hash for tamper detection (not crypto-grade, but sufficient for integrity)
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(36)
}

// ============================================================================
// CRUD Operations
// ============================================================================

export function addKnowledgeEntry(
  teamName: string,
  content: string,
  source: KnowledgeEntry['source'],
  options?: {
    sourceAgentId?: string
    confidence?: number
    tags?: string[]
    relatedFiles?: string[]
  },
): KnowledgeEntry {
  const dir = getKnowledgeDir(teamName)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const entry: KnowledgeEntry = {
    id: generateKnowledgeId(),
    content,
    source,
    sourceAgentId: options?.sourceAgentId,
    timestamp: Date.now(),
    confidence: options?.confidence ?? 0.5,
    tags: options?.tags,
    relatedFiles: options?.relatedFiles,
    version: 1,
    validFrom: Date.now(),
    hash: hashContent(content),
  }

  // Append to JSONL file
  const line = JSON.stringify(entry) + '\n'
  fs.appendFileSync(getEntriesPath(teamName), line, 'utf-8')

  return entry
}

export function supersedeEntry(
  teamName: string,
  entryId: string,
  newContent: string,
  newConfidence?: number,
): KnowledgeEntry | null {
  const entries = loadAllEntries(teamName)
  const oldEntry = entries.find(e => e.id === entryId)
  if (!oldEntry) return null

  // Mark old entry as no longer valid
  oldEntry.validTo = Date.now()
  saveAllEntries(teamName, entries)

  // Create new version
  const newEntry: KnowledgeEntry = {
    id: generateKnowledgeId(),
    content: newContent,
    source: oldEntry.source,
    sourceAgentId: oldEntry.sourceAgentId,
    timestamp: Date.now(),
    confidence: newConfidence ?? oldEntry.confidence,
    tags: oldEntry.tags,
    relatedFiles: oldEntry.relatedFiles,
    version: oldEntry.version + 1,
    supersedes: [...(oldEntry.supersedes || []), oldEntry.id],
    validFrom: Date.now(),
    hash: hashContent(newContent),
  }

  const line = JSON.stringify(newEntry) + '\n'
  fs.appendFileSync(getEntriesPath(teamName), line, 'utf-8')

  return newEntry
}

export function invalidateEntry(
  teamName: string,
  entryId: string,
): boolean {
  const entries = loadAllEntries(teamName)
  const entry = entries.find(e => e.id === entryId)
  if (!entry) return false

  entry.validTo = Date.now()
  saveAllEntries(teamName, entries)
  return true
}

// ============================================================================
// Query + Similarity Search
// ============================================================================

export function queryKnowledge(
  teamName: string,
  query: KnowledgeQuery,
): KnowledgeEntry[] {
  let entries = loadAllEntries(teamName)

  // Filter by validity (unless includeExpired)
  if (!query.includeExpired) {
    const now = Date.now()
    entries = entries.filter(e => e.validFrom <= now && (!e.validTo || e.validTo > now))
  }

  // Filter by source
  if (query.source) {
    entries = entries.filter(e => e.source === query.source)
  }

  // Filter by confidence
  if (query.minConfidence !== undefined) {
    entries = entries.filter(e => e.confidence >= query.minConfidence!)
  }

  // Filter by tags
  if (query.tags && query.tags.length > 0) {
    entries = entries.filter(e =>
      e.tags && query.tags!.some(t => e.tags!.includes(t))
    )
  }

  // Score by relevance (TF-IDF based)
  const scored = entries.map(entry => ({
    entry,
    score: calculateRelevance(entry, query.query),
  }))

  scored.sort((a, b) => b.score - a.score)

  const maxResults = query.maxResults ?? 10
  return scored.slice(0, maxResults).map(s => s.entry)
}

// Simple TF-IDF relevance scoring
function calculateRelevance(entry: KnowledgeEntry, query: string): number {
  const queryTerms = tokenize(query)
  const contentTerms = tokenize(entry.content)

  let score = 0
  for (const term of queryTerms) {
    const count = contentTerms.filter(t => t === term).length
    if (count > 0) {
      score += count * entry.confidence
    }
  }

  // Boost for matching tags
  if (entry.tags) {
    for (const tag of entry.tags) {
      if (query.toLowerCase().includes(tag.toLowerCase())) {
        score += 5
      }
    }
  }

  return score
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2)
}

// ============================================================================
// Embedding Support (hooks for real vector DB)
// ============================================================================

export function storeEmbedding(
  teamName: string,
  entryId: string,
  embedding: number[],
): void {
  const dir = getKnowledgeDir(teamName)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const embPath = getEmbeddingsPath(teamName)
  let embeddings: Array<{ id: string; vector: number[] }> = []
  if (fs.existsSync(embPath)) {
    try {
      embeddings = JSON.parse(fs.readFileSync(embPath, 'utf-8'))
    } catch {
      embeddings = []
    }
  }

  embeddings = embeddings.filter(e => e.id !== entryId)
  embeddings.push({ id: entryId, vector: embedding })

  fs.writeFileSync(embPath, JSON.stringify(embeddings, null, 2), 'utf-8')
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ============================================================================
// Load/Save All Entries
// ============================================================================

export function loadAllEntries(teamName: string): KnowledgeEntry[] {
  const filePath = getEntriesPath(teamName)
  if (!fs.existsSync(filePath)) return []

  const content = fs.readFileSync(filePath, 'utf-8')
  const entries: KnowledgeEntry[] = []
  for (const line of content.split('\n')) {
    if (line.trim()) {
      try {
        entries.push(JSON.parse(line))
      } catch {
        // Skip invalid lines
      }
    }
  }
  return entries
}

function saveAllEntries(teamName: string, entries: KnowledgeEntry[]): void {
  const dir = getKnowledgeDir(teamName)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n'
  fs.writeFileSync(getEntriesPath(teamName), lines, 'utf-8')
}

function generateKnowledgeId(): string {
  const prefix = 'K'
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 6)
  return `${prefix}-${timestamp}-${random}`
}

// ============================================================================
// Agent-Friendly: Get High-Confidence Context
// ============================================================================

export function getAgentContext(
  teamName: string,
  query: string,
  minConfidence = 0.8,
): string {
  const entries = queryKnowledge(teamName, {
    query,
    minConfidence,
    maxResults: 5,
  })

  if (entries.length === 0) return 'No relevant knowledge found.'

  const lines = ['=== Knowledge Base (High-Confidence) ===', '']
  for (const entry of entries) {
    const source = entry.source === 'human' ? '✅' : '⚠️'
    lines.push(`${source} [${entry.source}] ${entry.content.slice(0, 200)}...`)
    if (entry.confidence < 0.8) {
      lines.push(`   ⚠️ Confidence: ${Math.round(entry.confidence * 100)}% — needs human review`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ============================================================================
// Stats
// ============================================================================

export function getKnowledgeStats(teamName: string): {
  total: number
  valid: number
  expired: number
  bySource: Record<string, number>
  avgConfidence: number
} {
  const entries = loadAllEntries(teamName)
  const now = Date.now()

  const valid = entries.filter(e => e.validFrom <= now && (!e.validTo || e.validTo > now))
  const expired = entries.filter(e => e.validTo && e.validTo <= now)

  const bySource: Record<string, number> = {}
  for (const e of entries) {
    bySource[e.source] = (bySource[e.source] || 0) + 1
  }

  const avgConfidence = entries.length > 0
    ? entries.reduce((sum, e) => sum + e.confidence, 0) / entries.length
    : 0

  return {
    total: entries.length,
    valid: valid.length,
    expired: expired.length,
    bySource,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
  }
}

export function formatKnowledgeStats(stats: ReturnType<typeof getKnowledgeStats>): string {
  const lines = [
    '=== Knowledge Base Stats ===',
    '',
    `Total entries: ${stats.total}`,
    `Valid (current): ${stats.valid}`,
    `Expired: ${stats.expired}`,
    `Avg confidence: ${Math.round(stats.avgConfidence * 100)}%`,
    '',
    'By source:',
  ]

  for (const [source, count] of Object.entries(stats.bySource)) {
    lines.push(`  ${source}: ${count}`)
  }

  return lines.join('\n')
}
