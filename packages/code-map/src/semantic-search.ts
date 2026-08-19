import * as fs from 'fs'
import * as path from 'path'

import { getProjectFileTree, getAllFilePaths } from '@levelcode/common/project-file-tree'

const SEMANTIC_INDEX_VERSION = 1
const DEFAULT_CACHE_FILE = 'semantic-index.json'
const DEFAULT_CACHE_DIR = '.levelcode'

const SUPPORTED_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.mjs',
  '.cjs',
  '.md',
  '.mdx',
  '.json',
  '.css',
  '.scss',
  '.html',
])

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from',
  'has', 'have', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
  'the', 'to', 'was', 'were', 'will', 'with', 'this', 'const', 'let', 'var',
  'function', 'class', 'return', 'if', 'else', 'for', 'while', 'import',
  'export', 'from', 'default', 'async', 'await', 'new', 'try', 'catch',
  'throw', 'typeof', 'instanceof', 'true', 'false', 'null', 'undefined',
  'def', 'self', 'None', 'print', 'import', 'from', 'not', 'and', 'or',
])

const IDENTIFIER_PATTERN = /[A-Za-z_$][A-Za-z0-9_$]*/g

export type DocumentChunk = {
  id: string
  filePath: string
  startLine: number
  endLine: number
  content: string
  tokens: string[]
}

export type SearchResult = {
  filePath: string
  startLine: number
  endLine: number
  score: number
  preview: string
}

export type SerializedIndex = {
  version: number
  rootDir: string
  generatedAt: number
  documents: Array<Omit<DocumentChunk, 'tokens'> & { tf: Record<string, number> }>
  idf: Record<string, number>
  totalDocs: number
}

export type SemanticSearchOptions = {
  maxFiles?: number
  chunkSize?: number
  chunkOverlap?: number
  openRouterApiKey?: string
  openRouterModel?: string
  embeddingDimension?: number
  fileExtensions?: string[]
}

export type EmbeddingProvider = 'tfidf' | 'openrouter'

const DEFAULT_CHUNK_SIZE = 40
const DEFAULT_CHUNK_OVERLAP = 8
const DEFAULT_OPENROUTER_MODEL = 'text-embedding-3-small'

function tokenize(text: string): string[] {
  const matches = text.match(IDENTIFIER_PATTERN) ?? []
  return matches
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

function splitIntoChunks(
  source: string,
  filePath: string,
  chunkSize: number,
  overlap: number,
): DocumentChunk[] {
  const lines = source.split('\n')
  const chunks: DocumentChunk[] = []
  let start = 0

  while (start < lines.length) {
    const end = Math.min(start + chunkSize, lines.length)
    const chunkLines = lines.slice(start, end)
    const content = chunkLines.join('\n')
    const tokens = tokenize(content)
    if (tokens.length > 0) {
      chunks.push({
        id: `${filePath}:${start + 1}-${end}`,
        filePath,
        startLine: start + 1,
        endLine: end,
        content,
        tokens,
      })
    }
    if (end >= lines.length) break
    start += chunkSize - overlap
  }

  return chunks
}

function computeTF(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {}
  for (const tok of tokens) {
    tf[tok] = (tf[tok] ?? 0) + 1
  }
  const max = Math.max(...Object.values(tf), 1)
  for (const k in tf) {
    tf[k] = tf[k] / max
  }
  return tf
}

function computeIDF(documents: DocumentChunk[]): Record<string, number> {
  const df: Record<string, number> = {}
  for (const doc of documents) {
    const seen = new Set(doc.tokens)
    for (const tok of seen) {
      df[tok] = (df[tok] ?? 0) + 1
    }
  }
  const N = documents.length || 1
  const idf: Record<string, number> = {}
  for (const [tok, count] of Object.entries(df)) {
    idf[tok] = Math.log(N / count) + 1
  }
  return idf
}

function cosineSimilarityTFIDF(
  queryTokens: string[],
  docTF: Record<string, number>,
  idf: Record<string, number>,
): number {
  let dot = 0
  let magQ = 0
  let magD = 0
  const queryCounts: Record<string, number> = {}
  for (const t of queryTokens) {
    queryCounts[t] = (queryCounts[t] ?? 0) + 1
  }
  const qMax = Math.max(...Object.values(queryCounts), 1)
  const queryTF: Record<string, number> = {}
  for (const t in queryCounts) queryTF[t] = queryCounts[t] / qMax

  const vocab = new Set([...Object.keys(queryTF), ...Object.keys(docTF)])
  for (const term of vocab) {
    const wQ = (queryTF[term] ?? 0) * (idf[term] ?? 0)
    const wD = (docTF[term] ?? 0) * (idf[term] ?? 0)
    dot += wQ * wD
    magQ += wQ * wQ
    magD += wD * wD
  }

  if (magQ === 0 || magD === 0) return 0
  return dot / (Math.sqrt(magQ) * Math.sqrt(magD))
}

function cachePathFor(cwd: string): string {
  return path.join(cwd, DEFAULT_CACHE_DIR, DEFAULT_CACHE_FILE)
}

async function fetchOpenRouterEmbeddings(
  texts: string[],
  apiKey: string,
  model: string,
): Promise<number[][]> {
  const resp = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
  })
  if (!resp.ok) {
    throw new Error(`OpenRouter embeddings failed: ${resp.status} ${await resp.text()}`)
  }
  const data = (await resp.json()) as { data: Array<{ embedding: number[] }> }
  return data.data.map((d) => d.embedding)
}

function cosineSimilarityVec(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

/**
 * SemanticCodeSearch provides both TF-IDF bag-of-words search (default, no
 * external dependencies) and optional neural embeddings via the OpenRouter
 * embeddings API.
 *
 * The TF-IDF index is persisted to `.levelcode/semantic-index.json` so
 * subsequent searches avoid re-indexing.
 *
 * Usage:
 * ```ts
 * const search = new SemanticCodeSearch()
 * await search.indexProject(cwd)
 * const results = await search.semanticSearch('user authentication token', 10)
 * ```
 */
export class SemanticCodeSearch {
  private cwd: string = ''
  private documents: DocumentChunk[] = []
  private docTF: Map<string, Record<string, number>> = new Map()
  private idf: Record<string, number> = {}
  private embeddings: Map<string, number[]> = new Map()
  private queryEmbeddingCache: Map<string, number[]> = new Map()
  private options: Required<SemanticSearchOptions>

  constructor(options: SemanticSearchOptions = {}) {
    this.options = {
      maxFiles: 3000,
      chunkSize: DEFAULT_CHUNK_SIZE,
      chunkOverlap: DEFAULT_CHUNK_OVERLAP,
      openRouterApiKey: options.openRouterApiKey ?? process.env.OPENROUTER_API_KEY ?? '',
      openRouterModel: options.openRouterModel ?? DEFAULT_OPENROUTER_MODEL,
      embeddingDimension: options.embeddingDimension ?? 1536,
      fileExtensions: options.fileExtensions ?? [],
    }
  }

  /**
   * Index all source files under `cwd`, chunking them and building a
   * persistent TF-IDF index. Reuses cached index when available unless
   * `forceRebuild` is set.
   */
  async indexProject(cwd: string, options: { forceRebuild?: boolean } = {}): Promise<void> {
    this.cwd = cwd
    const cachePath = cachePathFor(cwd)
    const { forceRebuild = false } = options

    if (!forceRebuild && fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as SerializedIndex
        if (cached.version === SEMANTIC_INDEX_VERSION && cached.rootDir === cwd) {
          this.loadFromCache(cached)
          return
        }
      } catch {
        // Cache invalid — rebuild
      }
    }

    const fileTree = await getProjectFileTree({
      projectRoot: cwd,
      maxFiles: this.options.maxFiles,
      fs: fs.promises,
    })
    const allPaths = getAllFilePaths(fileTree)
    let sourceFiles = allPaths.filter((f) =>
      SUPPORTED_EXTS.has(path.extname(f).toLowerCase()),
    )
    if (this.options.fileExtensions && this.options.fileExtensions.length > 0) {
      const allowedExts = new Set(this.options.fileExtensions.map((e) => e.toLowerCase().startsWith('.') ? e.toLowerCase() : '.' + e.toLowerCase()))
      sourceFiles = sourceFiles.filter((f) => allowedExts.has(path.extname(f).toLowerCase()))
    }

    const allChunks: DocumentChunk[] = []
    for (const rel of sourceFiles) {
      const full = path.join(cwd, rel)
      let source: string
      try {
        source = fs.readFileSync(full, 'utf8')
      } catch {
        continue
      }
      const norm = rel.replace(/\\/g, '/')
      const chunks = splitIntoChunks(source, norm, this.options.chunkSize, this.options.chunkOverlap)
      allChunks.push(...chunks)
    }

    this.documents = allChunks
    this.docTF.clear()
    this.embeddings.clear()
    this.queryEmbeddingCache.clear()

    for (const doc of this.documents) {
      this.docTF.set(doc.id, computeTF(doc.tokens))
    }
    this.idf = computeIDF(this.documents)

    this.saveToCache()
  }

  /**
   * Search the index for chunks matching `query`. Returns results ranked by
   * cosine similarity. Uses TF-IDF by default; switches to neural embeddings
   * when an OpenRouter API key is configured or when `preferEmbeddings` is
   * true and a key is available.
   *
   * @param query - Natural-language query string
   * @param topK - Maximum number of results to return
   * @param options - Additional search options
   */
  async semanticSearch(
    query: string,
    topK: number = 10,
    options: { preferEmbeddings?: boolean; includeContent?: boolean; fileExtensions?: string[] } = {},
  ): Promise<SearchResult[]> {
    const useEmbeddings =
      options.preferEmbeddings && !!this.options.openRouterApiKey && this.embeddings.size > 0

    let results: SearchResult[]
    if (useEmbeddings) {
      results = await this.embeddingSearch(query, topK * 3, options.includeContent)
    } else {
      results = this.tfidfSearch(query, topK * 3, options.includeContent)
    }

    if (options.fileExtensions && options.fileExtensions.length > 0) {
      const allowedExts = new Set(options.fileExtensions.map((e) => e.toLowerCase().startsWith('.') ? e.toLowerCase() : '.' + e.toLowerCase()))
      results = results.filter((r) => allowedExts.has(path.extname(r.filePath).toLowerCase()))
    }

    return results.slice(0, topK)
  }

  /**
   * Convenience alias for `semanticSearch()`. Search the TF-IDF index for
   * chunks matching the query. Returns results ranked by cosine similarity.
   *
   * @param query - Natural-language query string
   * @param topK - Maximum number of results to return (default 10)
   * @param options - Search options including file extension filtering
   * @returns Ranked search results with file paths, scores, and previews
   */
  async search(
    query: string,
    topK: number = 10,
    options: { preferEmbeddings?: boolean; includeContent?: boolean; fileExtensions?: string[] } = {},
  ): Promise<SearchResult[]> {
    return this.semanticSearch(query, topK, options)
  }

  /**
   * Pre-compute neural embeddings for all indexed chunks via OpenRouter.
   * Call this after indexProject() to enable semantic (neural) search.
   */
  async computeEmbeddings(): Promise<void> {
    if (!this.options.openRouterApiKey) {
      throw new Error(
        'computeEmbeddings() requires an OpenRouter API key. Set openRouterApiKey option or OPENROUTER_API_KEY.',
      )
    }
    if (this.documents.length === 0) {
      throw new Error('No documents indexed. Call indexProject() first.')
    }

    const batchSize = 100
    for (let i = 0; i < this.documents.length; i += batchSize) {
      const batch = this.documents.slice(i, i + batchSize)
      const texts = batch.map((d) => d.content.slice(0, 8000))
      const embs = await fetchOpenRouterEmbeddings(
        texts,
        this.options.openRouterApiKey,
        this.options.openRouterModel,
      )
      for (let j = 0; j < batch.length; j++) {
        this.embeddings.set(batch[j].id, embs[j] ?? [])
      }
    }
  }

  private tfidfSearch(
    query: string,
    topK: number,
    includeContent?: boolean,
  ): SearchResult[] {
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    const scored: SearchResult[] = []
    for (const doc of this.documents) {
      const tf = this.docTF.get(doc.id) ?? {}
      const sim = cosineSimilarityTFIDF(queryTokens, tf, this.idf)
      if (sim <= 0) continue
      scored.push({
        filePath: doc.filePath,
        startLine: doc.startLine,
        endLine: doc.endLine,
        score: sim,
        preview: includeContent
          ? doc.content
          : doc.content.split('\n').slice(0, 3).join('\n'),
      })
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }

  private async embeddingSearch(
    query: string,
    topK: number,
    includeContent?: boolean,
  ): Promise<SearchResult[]> {
    let qEmb = this.queryEmbeddingCache.get(query)
    if (!qEmb) {
      const embs = await fetchOpenRouterEmbeddings(
        [query],
        this.options.openRouterApiKey,
        this.options.openRouterModel,
      )
      qEmb = embs[0] ?? []
      this.queryEmbeddingCache.set(query, qEmb)
    }

    const scored: SearchResult[] = []
    for (const doc of this.documents) {
      const dEmb = this.embeddings.get(doc.id)
      if (!dEmb || dEmb.length === 0) continue
      const sim = cosineSimilarityVec(qEmb, dEmb)
      if (sim <= 0) continue
      scored.push({
        filePath: doc.filePath,
        startLine: doc.startLine,
        endLine: doc.endLine,
        score: sim,
        preview: includeContent
          ? doc.content
          : doc.content.split('\n').slice(0, 3).join('\n'),
      })
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }

  /**
   * Re-rank the provided documents using an additional query token overlap
   * bonus. Useful for hybrid retrieval (e.g., combining TF-IDF with a
   * keyword grep pass).
   */
  rerank(query: string, results: SearchResult[]): SearchResult[] {
    const queryTokens = new Set(tokenize(query))
    return results
      .map((r) => {
        const previewTokens = new Set(tokenize(r.preview))
        let overlap = 0
        for (const t of queryTokens) {
          if (previewTokens.has(t)) overlap++
        }
        const bonus = overlap / Math.max(queryTokens.size, 1) * 0.2
        return { ...r, score: r.score + bonus }
      })
      .sort((a, b) => b.score - a.score)
  }

  private loadFromCache(cached: SerializedIndex): void {
    this.documents = cached.documents.map((d) => ({
      ...d,
      tokens: tokenize(d.content),
    }))
    this.docTF.clear()
    for (const d of cached.documents) {
      this.docTF.set(d.id, d.tf)
    }
    this.idf = cached.idf
    this.embeddings.clear()
    this.queryEmbeddingCache.clear()
  }

  private saveToCache(): void {
    const serialized: SerializedIndex = {
      version: SEMANTIC_INDEX_VERSION,
      rootDir: this.cwd,
      generatedAt: Date.now(),
      documents: this.documents.map((d) => ({
        id: d.id,
        filePath: d.filePath,
        startLine: d.startLine,
        endLine: d.endLine,
        content: d.content.slice(0, 5000),
        tf: this.docTF.get(d.id) ?? {},
      })),
      idf: this.idf,
      totalDocs: this.documents.length,
    }
    try {
      const dir = path.join(this.cwd, DEFAULT_CACHE_DIR)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(cachePathFor(this.cwd), JSON.stringify(serialized))
    } catch {
      // Non-fatal
    }
  }

  getStats(): { totalChunks: number; totalFiles: number; hasEmbeddings: boolean } {
    const fileSet = new Set(this.documents.map((d) => d.filePath))
    return {
      totalChunks: this.documents.length,
      totalFiles: fileSet.size,
      hasEmbeddings: this.embeddings.size > 0,
    }
  }
}

/**
 * Convenience function: index and search in one call.
 */
export async function semanticSearch(
  cwd: string,
  query: string,
  topK: number = 10,
  options: SemanticSearchOptions = {},
): Promise<SearchResult[]> {
  const search = new SemanticCodeSearch(options)
  await search.indexProject(cwd)
  return search.semanticSearch(query, topK)
}

