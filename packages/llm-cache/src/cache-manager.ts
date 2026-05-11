I'll implement the main cache manager with all the requested eviction strategies (LRU, LFU, FIFO, TTL, and adaptive). The implementation will include comprehensive caching features with strategy pattern for different eviction policies.

```typescript
import { EventEmitter } from 'events'
import { createHash } from 'crypto'
import { promisify } from 'util'
import { gzip, gunzip } from 'zlib'
import type {
  CacheConfig,
  CacheEntry,
  CacheStats,
  CacheEntryMetadata,
  CacheEvent,
  CacheEventType,
  SerializedCacheEntry,
  CacheExport,
  EvictionPolicy,
  CacheStrategy
} from './types'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

// ============================================================================
// Cache Manager
// ============================================================================

export class CacheManager extends EventEmitter {
  private cache: Map<string, CacheEntry> = new Map()
  private config: CacheConfig
  private stats: CacheStats
  private strategy: CacheStrategy
  private accessTimes: Map<string, number> = new Map()
  private performanceMetrics: number[] = []

  constructor(config: Partial<CacheConfig> = {}) {
    super()
    
    this.config = {
      enabled: true,
      ttl: 3600, // 1 hour
      maxSize: 100, // 100 MB
      strategy: 'lru',
      compressionEnabled: true,
      invalidationPolicy: 'hybrid',
      semanticEnabled: false,
      persistenceEnabled: false,
      ...config
    }

    this.stats = this.initializeStats()
    this.strategy = this.createCacheStrategy()
  }

  // --------------------------------------------------------------------------
  // Core Cache Operations
  // --------------------------------------------------------------------------

  async get(key: string): Promise<any | null> {
    if (!this.config.enabled) {
      this.emitEvent('miss', { key })
      return null
    }

    const startTime = Date.now()

    try {
      const entry = this.cache.get(key)
      
      if (!entry) {
        this.updateStats('miss')
        this.emitEvent('miss', { key })
        this.recordPerformanceMetrics(Date.now() - startTime)
        return null
      }

      // Check TTL
      if (this.isExpired(entry)) {
        this.cache.delete(key)
        this.strategy.onEvict?.(key, entry)
        this.updateStats('miss')
        this.emitEvent('evict', { key, entry })
        this.recordPerformanceMetrics(Date.now() - startTime)
        return null
      }

      // Update access information
      entry.accessCount++
      this.accessTimes.set(key, Date.now())
      this.strategy.onAccess?.(key, entry)

      // Decompress if needed
      let value = entry.value
      if (entry.metadata.compressed) {
        value = await this.decompressValue(value)
      }

      this.updateStats('hit', entry)
      this.emitEvent('hit', { key, entry })
      this.recordPerformanceMetrics(Date.now() - startTime)
      
      return value
    } catch (error) {
      this.emitEvent('error', { key, error })
      this.recordPerformanceMetrics(Date.now() - startTime)
      return null
    }
  }

  async set(key: string, value: any, metadata: Partial<CacheEntryMetadata> = {}): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    try {
      // Calculate size and compress if needed
      let serializedValue = JSON.stringify(value)
      let compressed = false
      
      if (this.config.compressionEnabled && serializedValue.length > 1024) {
        serializedValue = await this.compressValue(serializedValue)
        compressed = true
      }

      const size = this.calculateEntrySize(key, serializedValue, metadata)

      // Check if we need to evict entries
      await this.ensureCapacity(size)

      // Create cache entry
      const entry: CacheEntry = {
        key,
        value: compressed ? serializedValue : value,
        timestamp: new Date(),
        ttl: this.config.ttl,
        accessCount: 1,
        size,
        metadata: {
          model: 'unknown',
          prompt: '',
          response: '',
          tokens: { input: 0, output: 0, total: 0 },
          cost: 0,
          latency: 0,
          compressed,
          ...metadata
        }
      }

      // Store entry
      this.cache.set(key, entry)
      this.accessTimes.set(key, Date.now())
      this.strategy.onSet?.(key, entry)

      this.updateStats('set', entry)
      this.emitEvent('set', { key, entry })
    } catch (error) {
      this.emitEvent('error', { key, error })
    }
  }

  async delete(key: string): Promise<boolean> {
    const entry = this.cache.get(key)
    if (!entry) {
      return false
    }

    this.cache.delete(key)
    this.accessTimes.delete(key)
    this.strategy.onDelete?.(key, entry)

    this.emitEvent('evict', { key, entry })
    return true
  }

  async clear(): Promise<void> {
    this.cache.clear()
    this.accessTimes.clear()
    this.strategy.onClear?.()

    this.stats = this.initializeStats()
    this.emitEvent('clear', {})
  }

  // --------------------------------------------------------------------------
  // Cache Strategy Implementation
  // --------------------------------------------------------------------------

  private createCacheStrategy(): CacheStrategy {
    switch (this.config.strategy) {
      case 'lru':
        return new LRUStrategy()
      case 'lfu':
        return new LFUStrategy()
      case 'fifo':
        return new FIFOStrategy()
      case 'ttl':
        return new TTLStrategy()
      case 'adaptive':
        return new AdaptiveStrategy()
      default:
        return new LRUStrategy()
    }
  }

  private async ensureCapacity(requiredSize: number): Promise<void> {
    const currentSize = this.getCurrentSize()
    const maxSizeBytes = this.config.maxSize * 1024 * 1024

    if (currentSize + requiredSize <= maxSizeBytes) {
      return
    }

    // Get entries to evict based on strategy
    const entriesToEvict = this.strategy.selectEvictionCandidates(
      Array.from(this.cache.entries()),
      requiredSize,
      maxSizeBytes
    )

    // Evict entries
    for (const [key, entry] of entriesToEvict) {
      await this.delete(key)
      this.stats.evictions++
    }
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  private isExpired(entry: CacheEntry): boolean {
    if (!entry.ttl) {
      return false
    }

    const elapsed = (Date.now() - entry.timestamp.getTime()) / 1000
    return elapsed > entry.ttl
  }

  private calculateEntrySize(key: string, value: string, metadata: any): number {
    const keySize = key.length * 2 // UTF-16
    const valueSize = value.length * 2
    const metadataSize = JSON.stringify(metadata).length * 2
    
    // Add overhead for Map entry structure
    const overhead = 100
    
    return keySize + valueSize + metadataSize + overhead
  }

  private getCurrentSize(): number {
    return Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.size, 0)
  }

  private async compressValue(value: string): Promise<string> {
    const buffer = Buffer.from(value, 'utf8')
    const compressed = await gzipAsync(buffer)
    return compressed.toString('base64')
  }

  private async decompressValue(compressedValue: string): Promise<any> {
    const buffer = Buffer.from(compressedValue, 'base64')
    const decompressed = await gunzipAsync(buffer)
    const jsonString = decompressed.toString('utf8')
    return JSON.parse(jsonString)
  }

  // --------------------------------------------------------------------------
  // Statistics and Monitoring
  // --------------------------------------------------------------------------

  private initializeStats(): CacheStats {
    return {
      hits: 0,
      misses: 0,
      hitRate: 0,
      evictions: 0,
      size: 0,
      maxSize: this.config.maxSize * 1024 * 1024,
      averageAccessTime: 0,
      totalRequests: 0,
      totalSavedCost: 0,
      totalSavedLatency: 0,
      entriesByModel: {},
      entriesByTag: {}
    }
  }

  private updateStats(type: 'hit' | 'miss' | 'set', entry?: CacheEntry): void {
    this.stats.totalRequests++

    if (type === 'hit') {
      this.stats.hits++
      if (entry) {
        this.stats.totalSavedCost += entry.metadata.cost || 0
        this.stats.totalSavedLatency += entry.metadata.latency || 0
        
        // Update model stats
        const model = entry.metadata.model || 'unknown'
        this.stats.entriesByModel[model] = (this.stats.entriesByModel[model] || 0) + 1
        
        // Update tag stats
        if (entry.metadata.tags) {
          for (const tag of entry.metadata.tags) {
            this.stats.entriesByTag[tag] = (this.stats.entriesByTag[tag] || 0) + 1
          }
        }
      }
    } else if (type === 'miss') {
      this.stats.misses++
    }

    this.stats.hitRate = this.stats.totalRequests > 0 
      ? this.stats.hits / this.stats.totalRequests 
      : 0

    this.stats.size = this.getCurrentSize()
  }

  private recordPerformanceMetrics(latency: number): void {
    this.performanceMetrics.push(latency)
    
    // Keep only last 1000 measurements
    if (this.performanceMetrics.length > 1000) {
      this.performanceMetrics = this.performanceMetrics.slice(-1000)
    }

    // Update average access time
    this.stats.averageAccessTime = this.performanceMetrics.reduce((sum, lat) => sum + lat, 0) / this.performanceMetrics.length
  }

  private emitEvent(type: CacheEventType, data: any): void {
    const event: CacheEvent = {
      type,
      timestamp: new Date(),
      ...data
    }
    
    this.emit('cache:event', event)
    this.emit(`cache:${type}`, event)
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  getStats(): CacheStats {
    return { ...this.stats }
  }

  getPerformanceMetrics(): {
    averageLatency: number
    p95Latency: number
    p99Latency: number
    throughput: number
  } {
    if (this.performanceMetrics.length === 0) {
      return {
        averageLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        throughput: 0
      }
    }

    const sorted = [...this.performanceMetrics].sort((a, b) => a - b)
    const averageLatency = this.performanceMetrics.reduce((sum, lat) => sum + lat, 0) / this.performanceMetrics.length
    const p95Latency = sorted[Math.floor(sorted.length * 0.95)]
    const p99Latency = sorted[Math.floor(sorted.length * 0.99)]
    
    // Calculate throughput (requests per second over last minute)
    const oneMinuteAgo = Date.now() - 60000
    const recentRequests = this.performanceMetrics.filter((_, index) => {
      const timestamp = Date.now() - (this.performanceMetrics.length - index) * 10 // Rough estimate
      return timestamp > oneMinuteAgo
    }).length
    const throughput = recentRequests / 60

    return {
      averageLatency,
      p95Latency,
      p99Latency,
      throughput
    }
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key)
    if (!entry) {
      return false
    }
    
    return !this.isExpired(entry)
  }

  async getOrSet(
    key: string, 
    factory: () => Promise<any>, 
    metadata?: Partial<CacheEntryMetadata>
  ): Promise<any> {
    const cached = await this.get(key)
    if (cached !== null) {
      return cached
    }

    const value = await factory()
    await this.set(key, value, metadata)
    return value
  }

  updateConfig(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config }
    
    // Recreate strategy if it changed
    if (config.strategy) {
      this.strategy = this.createCacheStrategy()
    }
  }

  // --------------------------------------------------------------------------
  // Export/Import
  // --------------------------------------------------------------------------

  async export(): Promise<CacheExport> {
    const entries: SerializedCacheEntry[] = []
    
    for (const [key, entry] of this.cache) {
      entries.push({
        key,
        value: entry.metadata.compressed ? entry.value : JSON.stringify(entry.value),
        timestamp: entry.timestamp.toISOString(),
        ttl: entry.ttl,
        accessCount: entry.accessCount,
        size: entry.size,
        metadata: entry.metadata
      })
    }

    return {
      version: '1.0.0',
      timestamp: new Date(),
      entries,
      metadata: {
        totalEntries: entries.length,
        totalSize: this.getCurrentSize(),
        config: {
          ttl: this.config.ttl,
          maxSize: this.config.maxSize,
          strategy: this.config.strategy,
          compressionEnabled: this.config.compressionEnabled
        }
      }
    }
  }

  async import(exported: CacheExport): Promise<void> {
    await this.clear()

    for (const serializedEntry of exported.entries) {
      const entry: CacheEntry = {
        key: serializedEntry.key,
        value: serializedEntry.metadata.compressed 
          ? serializedEntry.value 
          : JSON.parse(serializedEntry.value),
        timestamp: new Date(serializedEntry.timestamp),
        ttl: serializedEntry.ttl,
        accessCount: serializedEntry.accessCount,
        size: serializedEntry.size,
        metadata: serializedEntry.metadata
      }

      this.cache.set(entry.key, entry)
      this.accessTimes.set(entry.key, entry.timestamp.getTime())
    }
  }
}

// ============================================================================
// Cache Strategy Implementations
// ============================================================================

interface CacheStrategy {
  onAccess?(key: string, entry: CacheEntry): void
  onSet?(key: string, entry: CacheEntry): void
  onDelete?(key: string, entry: CacheEntry): void
  onEvict?(key: string, entry: CacheEntry): void
  onClear?(): void
  selectEvictionCandidates(
    entries: Array<[string, CacheEntry]>,
    requiredSize: number,
    maxSize: number
  ): Array<[string, CacheEntry]>
}

class LRUStrategy implements CacheStrategy {
  private accessOrder: string[] = []

  onAccess(key: string, entry: CacheEntry): void {
    this.moveToEnd(key)
  }

  onSet(key: string, entry: CacheEntry): void {
    this.accessOrder.push(key)
  }

  onDelete(key: string, entry: CacheEntry): void {
    const index = this.accessOrder.indexOf(key)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
  }

  onEvict(key: string, entry: CacheEntry): void {
    this.onDelete(key, entry)
  }

  onClear(): void {
    this.accessOrder = []
  }

  selectEvictionCandidates(
    entries: Array<[string, CacheEntry]>,
    requiredSize: number,
    maxSize: number
  ): Array<[string, CacheEntry]> {
    // Sort by access order (oldest first)
    const sorted = entries.sort((a, b) => {
      const aIndex = this.accessOrder.indexOf(a[0])
      const bIndex = this.accessOrder.indexOf(b[0])
      return aIndex - bIndex
    })

    const candidates: Array<[string, CacheEntry]> = []
    let freedSpace = 0

    for (const entry of sorted) {
      candidates.push(entry)
      freedSpace += entry[1].size
      
      if (freedSpace >= requiredSize) {
        break
      }
    }

    return candidates
  }

  private moveToEnd(key: string): void {
    const index = this.accessOrder.indexOf(key)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
    this.accessOrder.push(key)
  }
}

class LFUStrategy implements CacheStrategy {
  private frequencies: Map<string, number> = new Map()

  onAccess(key: string, entry: CacheEntry): void {
    this.frequencies.set(key, (this.frequencies.get(key) || 0) + 1)
  }

  onSet(key: string, entry: CacheEntry): void {
    this.frequencies.set(key, 1)
  }

  onDelete(key: string, entry: CacheEntry): void {
    this.frequencies.delete(key)
  }

  onEvict(key: string, entry: CacheEntry): void {
    this.onDelete(key, entry)
  }

  onClear(): void {
    this.frequencies.clear()
  }

  selectEvictionCandidates(
    entries: Array<[string, CacheEntry]>,
    requiredSize: number,
    maxSize: number
  ): Array<[string, CacheEntry]> {
    // Sort by frequency (lowest first)
    const sorted = entries.sort((a, b) => {
      const aFreq = this.frequencies.get(a[0]) || 0
      const bFreq = this.frequencies.get(b[0]) || 0
      return aFreq - bFreq
    })

    const candidates: Array<[string, CacheEntry]> = []
    let freedSpace = 0

    for (const entry of sorted) {
      candidates.push(entry)
      freedSpace += entry[1].size
      
      if (freedSpace >= requiredSize) {
        break
      }
    }

    return candidates
  }
}

class FIFOStrategy implements CacheStrategy {
  private insertionOrder: string[] = []

  onSet(key: string, entry: CacheEntry): void {
    this.insertionOrder.push(key)
  }

  onDelete(key: string, entry: CacheEntry): void {
    const index = this.insertionOrder.indexOf(key)
    if (index > -1) {
      this.insertionOrder.splice(index, 1)
    }
  }

  onEvict(key: string, entry: CacheEntry): void {
    this.onDelete(key, entry)
  }

  onClear(): void {
    this.insertionOrder = []
  }

  selectEvictionCandidates(
    entries: Array<[string, CacheEntry]>,
    requiredSize: number,
    maxSize: number
  ): Array<[string, CacheEntry]> {
    // Sort by insertion order (oldest first)
    const sorted = entries.sort((a, b) => {
      const aIndex = this.insertionOrder.indexOf(a[0])
      const bIndex = this.insertionOrder.indexOf(b[0])
      return aIndex - bIndex
    })

    const candidates: Array<[string, CacheEntry]> = []
    let freedSpace = 0

    for (const entry of sorted) {
      candidates.push(entry)
      freedSpace += entry[1].size
      
      if (freedSpace >= requiredSize) {
        break
      }
    }

    return candidates
  }
}

class TTLStrategy implements CacheStrategy {
  onEvict(key: string, entry: CacheEntry): void {
    // TTL strategy evicts based on expiration time
  }

  selectEvictionCandidates(
    entries: Array<[string, CacheEntry]>,
    requiredSize: number,
    maxSize: number
  ): Array<[string, CacheEntry]> {
    // Sort by expiration time (soonest to expire first)
    const sorted = entries.sort((a, b) => {
      const aExpire = a[1].timestamp.getTime() + (a[1].ttl || 0) * 1000
      const bExpire = b[1].timestamp.getTime() + (b[1].ttl || 0) * 1000
      return aExpire - bExpire
    })

    const candidates: Array<[string, CacheEntry]> = []
    let freedSpace = 0

    for (const entry of sorted) {
      candidates.push(entry)
      freedSpace += entry[1].size
      
      if (freedSpace >= requiredSize) {
        break
      }
    }

    return candidates
  }
}

class AdaptiveStrategy implements CacheStrategy {
  private performanceWindow = 300 // 5 minutes
  private accessPatterns: Map<string, Array<{ timestamp: number; hit: boolean }>> = new Map()

  onAccess(key: string, entry: CacheEntry): void {
    if (!this.accessPatterns.has(key)) {
      this.accessPatterns.set(key, [])
    }
    this.accessPatterns.get(key)!.push({ timestamp: Date.now(), hit: true })
  }

  onSet(key: string, entry: CacheEntry): void {
    this.accessPatterns.set(key, [{ timestamp: Date.now(), hit: false }])
  }

  onDelete(key: string, entry: CacheEntry): void {
    this.accessPatterns.delete(key)
  }

  onEvict(key: string, entry: CacheEntry): void {
    this.onDelete(key, entry)
  }

  onClear(): void {
    this.accessPatterns.clear()
  }

  selectEvictionCandidates(
    entries: Array<[string, CacheEntry]>,
    requiredSize: number,
    maxSize: number
  ): Array<[string, CacheEntry]> {
    // Calculate adaptive scores based on recent access patterns
    const scored = entries.map(([key, entry]) => {
      const pattern = this.accessPatterns.get(key) || []
      const recentAccesses = pattern.filter(a => 
        Date.now() - a.timestamp < this.performanceWindow * 1000
      )
      
      const hitRate = recentAccesses.length > 0
        ? recentAccesses.filter(a => a.hit).length / recentAccesses.length
        : 0
      
      const accessFrequency = recentAccesses.length / this.performanceWindow
      const timeSinceLastAccess = recentAccesses.length > 0
        ? (Date.now() - recentAccesses[recentAccesses.length - 1].timestamp) / 1000
        : Infinity
      
      // Adaptive score: higher is better (less likely to evict)
      const score = hitRate * 0.4 + Math.min(accessFrequency / 10, 1) * 0.3 + 
                   Math.exp(-timeSinceLastAccess / 300) * 0.3
      
      return [key, entry, score] as const
    })

    // Sort by score (lowest first)
    scored.sort((a, b) => a[2] - b[2])

    const candidates: Array<[string, CacheEntry]> = []
    let freedSpace = 0

    for (const [key, entry] of scored) {
      candidates.push([key, entry])
      freedSpace += entry.size
      
      if (freedSpace >= requiredSize) {
        break
      }
    }

    return candidates
  }
}
```
