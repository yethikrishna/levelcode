import { randomUUID } from 'crypto'

import type {
  CacheEntry,
  CacheConfig,
  LLMCache,
} from './types'

/**
 * In-memory implementation of LLMCache with TTL and LRU eviction
 */
export class InMemoryLLMCache implements LLMCache {
  private cache = new Map<string, CacheEntry>()
  private accessOrder = new Map<string, number>()
  private accessCounter = 0
  private cleanupTimer?: NodeJS.Timeout

  constructor(private config: CacheConfig) {
    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, config.cleanupInterval * 1000)
  }

  /**
   * Get entry from cache
   */
  async get(key: string): Promise<CacheEntry | null> {
    const entry = this.cache.get(key)
    
    if (!entry) {
      return null
    }

    // Check if expired
    if (Date.now() - entry.metadata.createdAt.getTime() > entry.metadata.ttl * 1000) {
      this.cache.delete(key)
      this.accessOrder.delete(key)
      return null
    }

    // Update access tracking
    entry.metadata.lastAccessed = new Date()
    entry.metadata.accessCount++
    this.accessOrder.set(key, ++this.accessCounter)

    return entry
  }

  /**
   * Set entry in cache
   */
  async set(key: string, response: CacheEntry['response'], ttl?: number): Promise<void> {
    // Evict if over capacity
    if (this.cache.size >= this.config.maxEntries && !this.cache.has(key)) {
      this.evictLRU()
    }

    const entry: CacheEntry = {
      key,
      response,
      metadata: {
        createdAt: new Date(),
        lastAccessed: new Date(),
        accessCount: 1,
        ttl: ttl || this.config.defaultTtl,
        similarity: 1.0, // Default similarity for exact matches
      },
    }

    this.cache.set(key, entry)
    this.accessOrder.set(key, ++this.accessCounter)
  }

  /**
   * Delete entry from cache
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key)
    this.accessOrder.delete(key)
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    this.cache.clear()
    this.accessOrder.clear()
    this.accessCounter = 0
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    size: number
    hitRate: number
    missRate: number
    evictions: number
  }> {
    // These would be tracked in a real implementation
    return {
      size: this.cache.size,
      hitRate: 0, // Would be calculated from hit/miss counters
      missRate: 0,
      evictions: 0,
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    const expiredKeys: string[] = []

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.metadata.createdAt.getTime() > entry.metadata.ttl * 1000) {
        expiredKeys.push(key)
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key)
      this.accessOrder.delete(key)
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null
    let oldestAccess = Infinity

    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      this.accessOrder.delete(oldestKey)
    }
  }

  /**
   * Generate cache key from request
   */
  static generateKey(params: {
    model: string
    prompt: string
    temperature?: number
    maxTokens?: number
  }): string {
    const keyData = {
      model: params.model,
      prompt: params.prompt,
      temperature: params.temperature || 0.7,
      maxTokens: params.maxTokens,
    }
    
    // Simple hash - in production, use a proper hash function
    return Buffer.from(JSON.stringify(keyData)).toString('base64')
  }

  /**
   * Destroy the cache and cleanup timer
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }
    this.cache.clear()
    this.accessOrder.clear()
  }
}