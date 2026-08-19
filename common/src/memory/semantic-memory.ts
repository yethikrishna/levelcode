import * as fs from 'fs'
import * as path from 'path'

/**
 * Metadata attached to a memory fact.
 */
export interface MemoryMetadata {
  /** Tags for categorization and tag-based search */
  tags?: string[]
  /** Source of the fact (agent id, user, tool, etc.) */
  source?: string
  /** Importance score 0.0 - 1.0 (higher = more likely to be recalled) */
  importance?: number
  /** ISO timestamp when the fact was created */
  createdAt?: string
  /** Arbitrary key-value metadata */
  [key: string]: unknown
}

/**
 * A single memory fact stored in the semantic memory.
 */
export interface MemoryFact {
  /** Unique identifier */
  id: string
  /** The factual content */
  fact: string
  /** Metadata including tags, source, importance */
  metadata: MemoryMetadata
  /** Timestamp when stored (ms since epoch) */
  timestamp: number
}

/**
 * Result of a recall query, including relevance score.
 */
export interface MemoryRecallResult {
  /** The matching fact */
  fact: MemoryFact
  /** Relevance score 0.0 - 1.0 (higher = more relevant) */
  score: number
}

/**
 * Backend storage interface for the memory store.
 * Allows pluggable SQLite vs JSON implementations.
 */
interface MemoryStorage {
  initialize(): void
  insert(fact: MemoryFact): void
  delete(id: string): boolean
  getAll(): MemoryFact[]
  close(): void
}

// ============================================================================
// Simple tokenizer for lightweight semantic matching (JSON fallback)
// ============================================================================

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
  'when', 'where', 'why', 'how', 'all', 'both', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
  'or', 'if', 'while', 'that', 'this', 'these', 'those', 'it', 'its',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his',
  'she', 'her', 'they', 'them', 'their', 'what', 'which', 'who', 'whom',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
}

function buildTermFrequency(text: string): Map<string, number> {
  const tf = new Map<string, number>()
  for (const token of tokenize(text)) {
    tf.set(token, (tf.get(token) ?? 0) + 1)
  }
  return tf
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0
  let magA = 0
  let magB = 0
  for (const [term, freq] of a) {
    magA += freq * freq
    const bf = b.get(term) ?? 0
    dot += freq * bf
  }
  for (const freq of b.values()) {
    magB += freq * freq
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

function generateId(): string {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

// ============================================================================
// JSON Storage Backend (fallback when SQLite is not available)
// ============================================================================

class JsonMemoryStorage implements MemoryStorage {
  private readonly filePath: string
  private facts: Map<string, MemoryFact> = new Map()

  constructor(dbPath: string) {
    this.filePath = dbPath.replace(/\.db$/, '.json')
  }

  initialize(): void {
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8')
        const data = JSON.parse(raw) as { facts: MemoryFact[] }
        for (const fact of data.facts ?? []) {
          this.facts.set(fact.id, fact)
        }
      } catch {
        this.facts = new Map()
      }
    }
  }

  insert(fact: MemoryFact): void {
    this.facts.set(fact.id, fact)
    this.persist()
  }

  delete(id: string): boolean {
    const existed = this.facts.delete(id)
    if (existed) this.persist()
    return existed
  }

  getAll(): MemoryFact[] {
    return Array.from(this.facts.values())
  }

  close(): void {
    this.persist()
  }

  private persist(): void {
    const data = { facts: Array.from(this.facts.values()) }
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
  }
}

// ============================================================================
// SQLite Storage Backend (uses bun:sqlite when available)
// ============================================================================

class SqliteMemoryStorage implements MemoryStorage {
  private db: any
  private readonly dbPath: string

  constructor(dbPath: string) {
    this.dbPath = dbPath
  }

  initialize(): void {
    const dir = path.dirname(this.dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    try {
      const { Database } = require('bun:sqlite') as typeof import('bun:sqlite')
      this.db = new Database(this.dbPath)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          fact TEXT NOT NULL,
          metadata TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp);
      `)
    } catch {
      throw new Error('bun:sqlite not available, falling back to JSON storage')
    }
  }

  insert(fact: MemoryFact): void {
    const tags = JSON.stringify(fact.metadata.tags ?? [])
    this.db
      .prepare(
        'INSERT OR REPLACE INTO memories (id, fact, metadata, timestamp, tags) VALUES (?, ?, ?, ?, ?)',
      )
      .run(fact.id, fact.fact, JSON.stringify(fact.metadata), fact.timestamp, tags)
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id)
    return result.changes > 0
  }

  getAll(): MemoryFact[] {
    const rows = this.db.prepare('SELECT id, fact, metadata, timestamp FROM memories').all() as Array<{
      id: string
      fact: string
      metadata: string
      timestamp: number
    }>
    return rows.map((r) => ({
      id: r.id,
      fact: r.fact,
      metadata: JSON.parse(r.metadata) as MemoryMetadata,
      timestamp: r.timestamp,
    }))
  }

  close(): void {
    if (this.db) {
      this.db.close()
    }
  }
}

// ============================================================================
// SemanticMemoryStore
// ============================================================================

/**
 * Semantic memory store for persisting agent knowledge across sessions.
 *
 * Uses SQLite (bun:sqlite) with a straightforward relational schema;
 * if sqlite is unavailable, falls back to a JSON-file based store with
 * lightweight TF-IDF/cosine-similarity search.
 *
 * Storage location: `.levelcode/memory.db` (or `.levelcode/memory.json`).
 *
 * Usage:
 * ```ts
 * const store = new SemanticMemoryStore(cwd)
 * store.remember('The project uses Bun as its runtime', { tags: ['runtime', 'tooling'], source: 'setup' })
 * const results = store.recall('What runtime does the project use?', 5)
 * store.forget(results[0].fact.id)
 * ```
 */
export class SemanticMemoryStore {
  private storage: MemoryStorage
  private readonly backend: 'sqlite' | 'json'
  private initialized = false

  /**
   * Creates a new semantic memory store.
   *
   * @param cwd - Project root / working directory (`.levelcode/` lives here)
   * @param dbPath - Optional explicit path; defaults to `.levelcode/memory.db`
   */
  constructor(cwd: string, dbPath?: string) {
    const resolvedPath = dbPath ?? path.join(cwd, '.levelcode', 'memory.db')

    // Try SQLite first, fall back to JSON
    try {
      const sqlite = new SqliteMemoryStorage(resolvedPath)
      sqlite.initialize()
      this.storage = sqlite
      this.backend = 'sqlite'
    } catch {
      const json = new JsonMemoryStorage(resolvedPath)
      json.initialize()
      this.storage = json
      this.backend = 'json'
    }
    this.initialized = true
  }

  /**
   * Store a new fact in semantic memory.
   *
   * @param fact - The factual content to remember
   * @param metadata - Optional metadata (tags, source, importance, etc.)
   * @returns The stored MemoryFact with assigned id and timestamp
   */
  remember(fact: string, metadata: MemoryMetadata = {}): MemoryFact {
    if (!fact || fact.trim().length === 0) {
      throw new Error('Cannot remember an empty fact')
    }

    const entry: MemoryFact = {
      id: generateId(),
      fact: fact.trim(),
      metadata: {
        tags: metadata.tags ?? [],
        source: metadata.source,
        importance: metadata.importance ?? 0.5,
        createdAt: metadata.createdAt ?? new Date().toISOString(),
        ...metadata,
      },
      timestamp: Date.now(),
    }

    this.storage.insert(entry)
    return entry
  }

  /**
   * Recall facts relevant to a query, sorted by semantic similarity.
   * Uses cosine similarity over token frequency vectors for the JSON backend,
   * and full-text LIKE matching for SQLite.
   *
   * @param query - The search query
   * @param topK - Maximum number of results to return (default 5)
   * @returns Array of recall results with relevance scores, highest first
   */
  recall(query: string, topK: number = 5): MemoryRecallResult[] {
    const allFacts = this.storage.getAll()
    if (allFacts.length === 0) return []

    const queryVec = buildTermFrequency(query)
    const scored: MemoryRecallResult[] = allFacts.map((fact) => {
      const factVec = buildTermFrequency(fact.fact)
      const similarity = cosineSimilarity(queryVec, factVec)
      const tagBoost = this.tagMatchBoost(query, fact.metadata.tags ?? [])
      const importance = fact.metadata.importance ?? 0.5
      const recency = Math.min(1, fact.timestamp / Date.now())
      // Combined score: similarity weighted with tag boost, importance, and light recency
      const score = Math.min(
        1,
        similarity * 0.6 + tagBoost * 0.2 + importance * 0.15 + recency * 0.05,
      )
      return { fact, score }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored.filter((r) => r.score > 0).slice(0, topK)
  }

  /**
   * Delete a fact from memory by its id.
   *
   * @param id - The fact id to forget
   * @returns true if the fact existed and was deleted
   */
  forget(id: string): boolean {
    return this.storage.delete(id)
  }

  /**
   * Search for facts that have a specific tag.
   *
   * @param tag - Tag to filter by
   * @returns Array of facts containing the specified tag, newest first
   */
  searchByTag(tag: string): MemoryFact[] {
    const normalizedTag = tag.toLowerCase()
    return this.storage
      .getAll()
      .filter((f) => (f.metadata.tags ?? []).some((t) => t.toLowerCase() === normalizedTag))
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Returns the total number of facts stored.
   */
  count(): number {
    return this.storage.getAll().length
  }

  /**
   * Returns which storage backend is active (`'sqlite'` or `'json'`).
   */
  getBackend(): 'sqlite' | 'json' {
    return this.backend
  }

  /**
   * Close the store and flush pending writes.
   */
  close(): void {
    if (this.initialized) {
      this.storage.close()
      this.initialized = false
    }
  }

  /**
   * Compute a boost score for tag overlap between query and fact.
   */
  private tagMatchBoost(query: string, tags: string[]): number {
    if (tags.length === 0) return 0
    const queryTokens = new Set(tokenize(query))
    let matches = 0
    for (const tag of tags) {
      for (const token of tokenize(tag)) {
        if (queryTokens.has(token)) {
          matches++
          break
        }
      }
    }
    return matches / tags.length
  }
}
