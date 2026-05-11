import { nanoid } from 'nanoid'
import type {
  EvaluationConfig,
 EvaluationResult,
  ModelResult,
  TaskResult,
  ModelOutput,
  CacheConfig,
  CacheStats,
  CacheEntry,
} from './types'

// ============================================================================
// Cache Manager
// ============================================================================

export class CacheManager {
  private cache = new Map<string, CacheEntry>()
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    evictions: 0,
    size: 0,
    maxSize: 0,
    averageAccessTime: 0,
  }
  
  constructor(private enabled: boolean) {
    this.enabled = enabled
    this.stats.maxSize = 1024 * 1024 * 100 // 1GB default
  }
  
  async getResults(
    modelId: string,
    tasks: any[]
  ): Promise<ModelResult | null> {
    // Check cache first
    const cacheKey = this.generateCacheKey(modelId, tasks)
    const cached = this.cache.get(cacheKey)
    
    if (cached) {
      this.updateStats(true)
      return {
        modelId,
        modelName: cached.modelName || modelId,
        status: 'completed',
        taskResults: cached.taskResults,
        aggregatedMetrics: cached.aggregatedMetrics,
        totalCost: cached.totalCost,
        totalTime: cached.totalTime,
        error: undefined,
      }
    }
    
    return null
  }
  
  async saveResults(
    evaluationId: string,
    result: EvaluationResult
  ): Promise<void> {
    if (!this.enabled) {
      return
    }
    
    // Cache each model's results
    for (const model of result.modelResults) {
      const tasks = model.taskResults
      const cacheKey = this.generateCacheKey(model.modelId, tasks)
      const aggregatedMetrics = await this.aggregateMetrics(tasks)
      
      const entry: CacheEntry = {
        key: cacheKey,
        value: {
          modelId: model.modelId,
          modelName: model.modelName,
          taskResults: tasks,
          aggregatedMetrics,
          totalCost: model.totalCost,
          totalTime: model.totalTime,
          timestamp: new Date(),
          ttl: 3600, // 1 hour
          accessCount: 0,
          size: this.calculateSize(tasks),
          metadata: {},
        },
      }
      
      this.cache.set(cacheKey, entry)
    }
    
    this.updateCacheStats()
  }
  
  private generateCacheKey(modelId: string, tasks: TaskResult[]): string {
    // Generate cache key based on model ID and task hashes
    const taskHashes = tasks.map(t => 
      `${t.taskId}-${t.timestamp.getTime()}`
    ).join('|')
    const promptHash = this.hashString(tasks.map(t => t.input.prompt || '').slice(0, 100))
    
    return `${modelId}-${promptHash}-${taskHashes}`
  }
  
  private hashString(text: string): string {
    // Simple hash function for demonstration
    let hash = 0
    for (let i = 0; i < text.length; i++) {
n      hash = ((hash << 5) - hash) + text.charCodeAt(i)) | 0
    }
    return hash.toString(36)
  }
  
  private calculateSize(tasks: TaskResult[]): number {
    // Rough estimate of memory usage
    return tasks.reduce((sum, task) => sum + JSON.stringify(task).length * 2, 0)
  }
  
  private updateCacheStats(hit: boolean): void {
    if (hit) {
      this.stats.hits++
    } else {
      this.stats.misses++
    }
    
    this.stats.hitRate = this.stats.hits / (this.stats.hits + this.stats.misses)
    
    // Update cache size
    const currentSize = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.size, 0)
    this.stats.size = currentSize
    
    // Update evictions if necessary
    if (this.stats.size > this.stats.maxSize * 1024 * 1024) {
      this.evictions++
      // Would trigger eviction in a real implementation
      this.stats.evictions++
      this.stats.size = this.stats.maxSize * 1024 * 1024
    }
  }
  
  getCacheStats(): CacheStats {
    return { ...this.stats }
  }
  
  clearCache(): void {
    this.cache.clear()
    this.stats = {
      hits: 0,
      misses: 0,
n      hitRate: 0,
n      evictions: 0,
n      size: 0,
n      maxSize: this.stats.maxSize,
n      averageAccessTime: 0,
    }
  }
}

// ============================================================================
// Semantic Cache (Advanced Feature)
// ============================================================================

export interface SemanticCacheConfig extends CacheConfig {
  semanticHashProvider?: 'openai' | 'cohere' | 'sentence-transformers' | 'universal-sentence-encoder'
  semanticThreshold?: number // Similarity threshold for semantic matching
  semanticModel?: 'text-embedding-ada002' | 'mpnet' | 'universal-sentence-encoder'
  useHybrid?: boolean // Combine semantic and exact matching
}

export interface CacheEntry {
  key: string
  value: ModelResult
  timestamp: Date
  ttl?: number
  accessCount: number
  size: number
  metadata: Record<string, any>
  semanticHash?: string
}

export interface SemanticCacheStats extends CacheStats {
  semanticHits: number
  semanticMisses: number
  semanticHitRate: number
  avgSemanticSimilarity: number
}

// ============================================================================
// Advanced Cache Manager with Semantic Capabilities
// ============================================================================

export class AdvancedCacheManager extends CacheManager {
  private semanticCache: Map<string, string> = new Map()
  private semanticConfig: SemanticCacheConfig
  
  constructor(
    config: CacheConfig,
    semanticConfig?: SemanticCacheConfig
  ) {
    super(config.enabled)
    this.semanticConfig = semanticConfig || {
      semanticHashProvider: 'openai',
      semanticThreshold: 0.85,
      useHybrid: true,
    }
  }
  
  async getResults(
    modelId: string,
    tasks: any[]
  ): Promise<ModelResult | null> {
    // Check semantic cache first
    const cacheKey = this.generateSemanticCacheKey(modelId, tasks)
    const semanticHash = this.semanticCache.get(cacheKey)
    
    if (semanticHash) {
      this.updateStats(true, true)
      
      // Find the most similar cached result
      const cached = this.findMostSimilar(semanticHash, modelId, tasks)
      if (cached) {
        return cached
      }
    }
    
    // Fall back to regular cache
    return super.getResults(modelId, tasks)
  }
  
  async saveResults(
    evaluationId: string,
    result: EvaluationResult
  ): Promise<void> {
    // Save to both regular and semantic caches
    await super.saveResults(evaluationId, result)
    
    // Also store semantic hashes
    if (this.semanticConfig.useHybrid) {
      for (const model of result.modelResults) {
        const tasks = model.taskResults
        const cacheKey = this.generateSemanticCacheKey(model.modelId, tasks)
        const semanticHash = this.calculateSemanticHash(model.output.text)
        
        if (semanticHash) {
          this.semanticCache.set(cacheKey, semanticHash)
        }
      }
    }
  }
  
  private generateSemanticCacheKey(modelId: string, tasks: TaskResult[]): string {
    // Generate semantic cache key
    const taskTexts = tasks.map(t => t.output.text).join(' ')
    return `semantic-${modelId}-${this.hashString(taskTexts)}`
  }
  
  private calculateSemanticHash(text: string): string {
    // This would use actual semantic embedding models in practice
    // For now, return a simple hash
    return this.hashString(text)
  }
  
  private findMostSimilar(
    targetHash: string,
    modelId: string,
    tasks: TaskResult[]
  ): ModelResult | null {
    let bestMatch: ModelResult | null
    let bestSimilarity = 0
    
    for (const model of result.modelResults) {
      if (model.modelId !== modelId) {
        continue
      }
      
      const cacheKey = this.generateSemanticCacheKey(model.modelId, tasks)
      const semanticHash = this.semanticCache.get(cacheKey)
      
      if (semanticHash && semanticHash === targetHash) {
        bestMatch = model
        bestSimilarity = 1.0
      }
    }
    
    return bestMatch
  }
  
  getSemanticCacheStats(): SemanticCacheStats {
    return {
      semanticHits: 0,
      semanticMisses: 0,
      semanticHitRate: 0,
      avgSemanticSimilarity: 0,
    }
  }
}

// ============================================================================
// Cache Factory
// ============================================================================

export class CacheManagerFactory {
  static create(
    config: CacheConfig,
    semanticConfig?: SemanticCacheConfig
  ): CacheManager {
    if (config.semanticHashProvider) {
      return new AdvancedCacheManager(config, semanticConfig)
    }
    
    return new CacheManager(config.enabled)
  }
}