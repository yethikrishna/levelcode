I'll create a comprehensive and well-organized set of types for LLM caching that combines the best features from both implementations while ensuring clarity and maintainability.

```typescript
import { z } from 'zod'

// ============================================================================
// Core Cache Entry Types
// ============================================================================

export interface CacheEntry {
  key: string
  value: CacheValue
  metadata: CacheMetadata
  createdAt: Date
  lastAccessed: Date
  expiresAt?: Date
  accessCount: number
  size: number
  semanticHash?: string
  embeddings?: number[]
}

export interface CacheValue {
  response: unknown
  tokens?: TokenUsage
  cost?: number
  latency?: number
  model?: string
  provider?: string
}

export interface CacheMetadata {
  promptHash: string
  parametersHash: string
  temperature?: number
  maxTokens?: number
  topP?: number
  systemPrompt?: string
  userId?: string
  sessionId?: string
  tags?: string[]
}

export interface TokenUsage {
  input: number
  output: number
  total: number
}

// ============================================================================
// Cache Configuration Types
// ============================================================================

export interface CacheConfig {
  enabled: boolean
  strategy: CacheStrategy
  ttl?: number // Time to live in seconds
  maxSize?: number // Maximum number of entries
  maxSizeBytes?: number // Maximum size in bytes
  evictionPolicy?: EvictionPolicy
  storage: StorageConfig
  compression?: CompressionConfig
  encryption?: EncryptionConfig
  invalidation?: InvalidationConfig
  semantic?: SemanticCacheConfig
  optimization?: OptimizationConfig
}

export interface StorageConfig {
  type: 'memory' | 'redis' | 'sqlite' | 'file'
  // Memory storage options
  maxItems?: number
  maxBytes?: number
  // Redis storage options
  host?: string
  port?: number
  password?: string
  db?: number
  keyPrefix?: string
  tls?: boolean
  // SQLite storage options
  path?: string
  table?: string
  // File storage options
  directory?: string
  extension?: string
}

export interface CompressionConfig {
  enabled: boolean
  algorithm?: 'gzip' | 'br' | 'deflate'
  threshold?: number
}

export interface EncryptionConfig {
  enabled: boolean
  algorithm?: 'aes-256-gcm'
  key?: string
}

export interface InvalidationConfig {
  enabled: boolean
  strategies: InvalidationStrategy[]
  cronSchedule?: string
}

export interface InvalidationStrategy {
  type: 'ttl' | 'tag' | 'pattern' | 'manual' | 'size'
  config: Record<string, unknown>
}

// ============================================================================
// Cache Strategy Types
// ============================================================================

export type CacheStrategy = 
  | 'exact-match'
  | 'semantic'
  | 'hybrid'
  | 'hierarchical'
  | 'partitioned'
  | 'lru'
  | 'lfu'
  | 'fifo'
  | 'ttl'
  | 'adaptive'

export type EvictionPolicy = 
  | 'lru'
  | 'lfu'
  | 'fifo'
  | 'random'
  | 'ttl'
  | 'size-based'
  | 'cost-based'
  | 'semantic'

// ============================================================================
// Semantic Caching Types
// ============================================================================

export interface SemanticCacheConfig {
  enabled: boolean
  embeddingModel: string
  embeddingProvider?: string
  similarityThreshold: number
  maxCandidates: number
  indexType: 'faiss' | 'annoy' | 'hnsw' | 'brute-force'
  embeddingCache?: boolean
  batchSize?: number
  maxSemanticEntries?: number
}

export interface EmbeddingVector {
  id: string
  vector: number[]
  metadata: Record<string, unknown>
  timestamp: Date
}

export interface SimilarityResult {
  key: string
  similarity: number
  distance: number
  entry: CacheEntry
}

// ============================================================================
// Cache Statistics Types
// ============================================================================

export interface CacheStats {
  hits: number
  misses: number
  hitRate: number
  evictions: number
  size: number
  sizeBytes: number
  oldestEntry?: Date
  newestEntry?: Date
  avgAccessTime: number
  totalLatencySaved: number
  totalCostSaved: number
  totalTokensSaved: number
  totalRequests: number
  averageAccessTime: number
  entriesByModel: Record<string, number>
  entriesByTag: Record<string, number>
}

export interface DetailedStats extends CacheStats {
  byModel: Record<string, ModelStats>
  byUser: Record<string, UserStats>
  byTag: Record<string, TagStats>
  timeSeries: TimeSeriesPoint[]
}

export interface ModelStats {
  hits: number
  misses: number
  hitRate: number
  avgLatency: number
  avgCost: number
  avgTokens: number
}

export interface UserStats {
  hits: number
  misses: number
  hitRate: number
  cacheSize: number
  topModels: Array<{
    model: string
    count: number
  }>
}

export interface TagStats {
  hits: number
  misses: number
  hitRate: number
  size: number
}

export interface TimeSeriesPoint {
  timestamp: Date
  hits: number
  misses: number
  hitRate: number
  size: number
}

// ============================================================================
// Performance Metrics Types
// ============================================================================

export interface CachePerformanceMetrics {
  throughput: number // requests per second
  averageLatency: number // milliseconds
  p95Latency: number // 95th percentile latency
  p99Latency: number // 99th percentile latency
  errorRate: number
  memoryUsage: number // MB
  diskUsage?: number // MB
  compressionRatio: number
  semanticSimilarityThreshold: number
}

// ============================================================================
// Optimization Types
// ============================================================================

export interface OptimizationConfig {
  enabled: boolean
  strategies: OptimizationStrategy[]
  targetMetrics: OptimizationTarget[]
  constraints: OptimizationConstraint[]
  learningRate?: number
  adaptationWindow?: number
  optimizationInterval?: number // seconds
  compressionThreshold?: number // MB
  deduplicationEnabled?: boolean
  prefetchEnabled?: boolean
  adaptiveThreshold?: number
  performanceWindow?: number // seconds
}

export interface OptimizationStrategy {
  type: 'prompt-compression' | 'response-caching' | 'batching' | 'routing' | 'adaptive'
  config: Record<string, unknown>
  enabled: boolean
}

export interface OptimizationTarget {
  metric: 'hit-rate' | 'latency' | 'cost' | 'tokens'
  target: number
  weight: number
}

export interface OptimizationConstraint {
  type: 'max-cost' | 'max-latency' | 'min-accuracy' | 'max-size'
  value: number
  weight: number
}

export interface OptimizationResult {
  strategy: string
  before: OptimizationMetrics
  after: OptimizationMetrics
  improvement: number
  recommendation: string
}

export interface OptimizationMetrics {
  hitRate: number
  avgLatency: number
  avgCost: number
  avgTokens: number
  accuracy?: number
}

export interface OptimizationReport {
  timestamp: Date
  entriesOptimized: number
  spaceSaved: number // MB
  compressionRatio: number
  duplicatesRemoved: number
  prefetchHits: number
  recommendations: string[]
}

// ============================================================================
// Event Types
// ============================================================================

export interface CacheEvent {
  type: CacheEventType
  timestamp: Date
  entry?: CacheEntry
  key?: string
  metadata?: Record<string, unknown>
}

export type CacheEventType = 
  | 'hit'
  | 'miss'
  | 'set'
  | 'evict'
  | 'clear'
  | 'optimize'
  | 'error'

// ============================================================================
// Export/Import Types
// ============================================================================

export interface CacheExport {
  version: string
  timestamp: Date
  entries: SerializedCacheEntry[]
  metadata: {
    totalEntries: number
    totalSize: number
    config: Partial<CacheConfig>
  }
}

export interface SerializedCacheEntry {
  key: string
  value: unknown // Serialized
  timestamp: string
  ttl?: number
  accessCount: number
  size: number
  metadata: CacheMetadata
  semanticHash?: string
}

// ============================================================================
// Error Types
// ============================================================================

export class CacheError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'CacheError'
  }
}

export class StorageError extends CacheError {
  constructor(message: string, public readonly storageType: string) {
    super(message, 'STORAGE_ERROR', { storageType })
  }
}

export class SerializationError extends CacheError {
  constructor(message: string, public readonly key: string) {
    super(message, 'SERIALIZATION_ERROR', { key })
  }
}

export class InvalidKeyError extends CacheError {
  constructor(key: string) {
    super(`Invalid cache key: ${key}`, 'INVALID_KEY', { key })
  }
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const CacheConfigSchema = z.object({
  enabled: z.boolean(),
  strategy: z.enum([
    'exact-match', 'semantic', 'hybrid', 'hierarchical', 'partitioned',
    'lru', 'lfu', 'fifo', 'ttl', 'adaptive'
  ]),
  ttl: z.number().positive().optional(),
  maxSize: z.number().positive().optional(),
  maxSizeBytes: z.number().positive().optional(),
  evictionPolicy: z.enum([
    'lru', 'lfu', 'fifo', 'random', 'ttl', 'size-based', 'cost-based', 'semantic'
  ]).optional(),
  storage: z.object({
    type: z.enum(['memory', 'redis', 'sqlite', 'file']),
    maxItems: z.number().positive().optional(),
    maxBytes: z.number().positive().optional(),
    host: z.string().optional(),
    port: z.number().positive().optional(),
    password: z.string().optional(),
    db: z.number().optional(),
    keyPrefix: z.string().optional(),
    tls: z.boolean().optional(),
    path: z.string().optional(),
    table: z.string().optional(),
    directory: z.string().optional(),
    extension: z.string().optional(),
  }),
  compression: z.object({
    enabled: z.boolean(),
    algorithm: z.enum(['gzip', 'br', 'deflate']).optional(),
    threshold: z.number().positive().optional(),
  }).optional(),
  encryption: z.object({
    enabled: z.boolean(),
    algorithm: z.enum(['aes-256-gcm']).optional(),
    key: z.string().optional(),
  }).optional(),
  invalidation: z.object({
    enabled: z.boolean(),
    strategies: z.array(z.object({
      type: z.enum(['ttl', 'tag', 'pattern', 'manual', 'size']),
      config: z.record(z.unknown()),
    })),
    cronSchedule: z.string().optional(),
  }).optional(),
  semantic: z.object({
    enabled: z.boolean(),
    embeddingModel: z.string(),
    embeddingProvider: z.string().optional(),
    similarityThreshold: z.number().min(0).max(1),
    maxCandidates: z.number().positive(),
    indexType: z.enum(['faiss', 'annoy', 'hnsw', 'brute-force']),
    embeddingCache: z.boolean().optional(),
    batchSize: z.number().positive().optional(),
    maxSemanticEntries: z.number().positive().optional(),
  }).optional(),
  optimization: z.object({
    enabled: z.boolean(),
    strategies: z.array(z.object({
      type: z.enum(['prompt-compression', 'response-caching', 'batching', 'routing', 'adaptive']),
      config: z.record(z.unknown()),
      enabled: z.boolean(),
    })),
    targetMetrics: z.array(z.object({
      metric: z.enum(['hit-rate', 'latency', 'cost', 'tokens']),
      target: z.number(),
      weight: z.number(),
    })),
    constraints: z.array(z.object({
      type: z.enum(['max-cost', 'max-latency', 'min-accuracy', 'max-size']),
      value: z.number(),
      weight: z.number(),
    })),
    learningRate: z.number().positive().optional(),
    adaptationWindow: z.number().positive().optional(),
    optimizationInterval: z.number().positive().optional(),
    compressionThreshold: z.number().positive().optional(),
    deduplicationEnabled: z.boolean().optional(),
    prefetchEnabled: z.boolean().optional(),
    adaptiveThreshold: z.number().positive().optional(),
    performanceWindow: z.number().positive().optional(),
  }).optional(),
})

export const CacheEntrySchema = z.object({
  key: z.string(),
  value: z.object({
    response: z.unknown(),
    tokens: z.object({
      input: z.number(),
      output: z.number(),
      total: z.number(),
    }).optional(),
    cost: z.number().optional(),
    latency: z.number().optional(),
    model: z.string().optional(),
    provider: z.string().optional(),
  }),
  metadata: z.object({
    promptHash: z.string(),
    parametersHash: z.string(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
    topP: z.number().optional(),
    systemPrompt: z.string().optional(),
    userId: z.string().optional(),
    sessionId: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  createdAt: z.date(),
  lastAccessed: z.date(),
  expiresAt: z.date().optional(),
  accessCount: z.number(),
  size: z.number(),
  semanticHash: z.string().optional(),
  embeddings: z.array(z.number()).optional(),
})

export const CacheStatsSchema = z.object({
  hits: z.number(),
  misses: z.number(),
  hitRate: z.number(),
  evictions: z.number(),
  size: z.number(),
  sizeBytes: z.number(),
  oldestEntry: z.date().optional(),
  newestEntry: z.date().optional(),
  avgAccessTime: z.number(),
  totalLatencySaved: z.number(),
  totalCostSaved: z.number(),
  totalTokensSaved: z.number(),
  totalRequests: z.number(),
  averageAccessTime: z.number(),
  entriesByModel: z.record(z.number()),
  entriesByTag: z.record(z.number()),
})
```

This comprehensive type definition system for LLM caching includes:

**Core Features:**
- **Cache Entries** with metadata, timestamps, and optional semantic embeddings
- **Flexible Configuration** supporting multiple storage backends (memory, Redis, SQLite, file)
- **Multiple Cache Strategies** including exact-match, semantic, hybrid, and traditional LRU/LFU
- **Semantic Caching** with embedding models and similarity thresholds
- **Comprehensive Statistics** tracking hits, misses, costs, and performance metrics
- **Optimization System** for adaptive cache tuning
- **Event System** for monitoring cache operations
- **Export/Import** functionality for cache persistence
- **Error Handling** with specific error classes

**Key Improvements:**
1. Unified configuration interface combining the strengths of both implementations
2. Clear separation of concerns with logical grouping
3. Comprehensive Zod schemas for runtime validation
4. Support for both traditional and semantic caching strategies
5. Detailed tracking of tokens, costs, and performance metrics
6. Flexible storage abstraction layer
7. Optimization and adaptation capabilities

The types are designed to be extensible and support various caching scenarios from simple in-memory caches to distributed semantic caches with advanced optimization features.
