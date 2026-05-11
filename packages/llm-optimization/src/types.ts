import { z } from 'zod'

/**
 * Cache entry for storing LLM responses
 */
export interface CacheEntry {
  /** Cache key */
  key: string
  /** Cached response */
  response: {
    content: string
    model: string
    usage: {
      inputTokens: number
      outputTokens: number
      totalTokens: number
    }
    cost: number
    latency: number
  }
  /** Cache metadata */
  metadata: {
    createdAt: Date
    lastAccessed: Date
    accessCount: number
    ttl: number // Time to live in seconds
    similarity: number // For semantic cache entries
  }
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Maximum number of entries */
  maxEntries: number
  /** Default TTL in seconds */
  defaultTtl: number
  /** Cleanup interval in seconds */
  cleanupInterval: number
  /** Semantic similarity threshold */
  similarityThreshold: number
  /** Enable semantic caching */
  enableSemantic: boolean
}

/**
 * Model routing configuration
 */
export interface RoutingConfig {
  /** Available models with their properties */
  models: Array<{
    id: string
    name: string
    provider: string
    capabilities: {
      maxTokens: number
      supportsStreaming: boolean
      supportsFunctionCalling: boolean
      supportsVision: boolean
    }
    performance: {
      avgLatency: number
      avgQuality: number // 0-100
      costPerMillionTokens: number
    }
    limits: {
      maxRequestsPerSecond: number
      maxTokensPerMinute: number
    }
  }>
  /** Routing rules */
  rules: Array<{
    name: string
    condition: {
      promptLength?: {
        min?: number
        max?: number
      }
      requiredCapabilities?: string[]
      maxLatency?: number
      maxCost?: number
      minQuality?: number
    }
    action: {
      modelId: string
      weight: number
    }
  }>
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  /** Global limits */
  global: {
    requestsPerSecond: number
    tokensPerMinute: number
  }
  /** Per-model limits */
  perModel: Record<string, {
    requestsPerSecond: number
    tokensPerMinute: number
    burstAllowance: number
  }>
  /** Per-user limits */
  perUser: {
    requestsPerSecond: number
    tokensPerMinute: number
    costPerHour: number
  }
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  /** Request metrics */
  requests: {
    total: number
    successful: number
    failed: number
    avgLatency: number
    p95Latency: number
    p99Latency: number
  }
  /** Token metrics */
  tokens: {
    totalInput: number
    totalOutput: number
    total: number
    avgPerRequest: number
  }
  /** Cost metrics */
  costs: {
    total: number
    avgPerRequest: number
    perModel: Record<string, number>
  }
  /** Cache metrics */
  cache: {
    hitRate: number
    missRate: number
    size: number
    evictions: number
  }
  /** Model usage metrics */
  modelUsage: Record<string, {
    requests: number
    tokens: number
    cost: number
    avgLatency: number
  }>
}

/**
 * Optimization request
 */
export interface OptimizationRequest {
  /** Request ID */
  id: string
  /** Original prompt */
  prompt: string
  /** User preferences */
  preferences: {
    maxLatency?: number
    maxCost?: number
    minQuality?: number
    preferredModel?: string
    enableCache: boolean
  }
  /** Request metadata */
  metadata: {
    userId?: string
    sessionId?: string
    timestamp: Date
    tags: string[]
  }
}

/**
 * Optimization response
 */
export interface OptimizationResponse {
  /** Request ID */
  requestId: string
  /** Selected model */
  model: string
  /** Optimization decisions */
  decisions: {
    cached: boolean
    routed: boolean
    throttled: boolean
    optimized: boolean
  }
  /** Applied optimizations */
  optimizations: {
    promptOptimizations?: string[]
    modelSwitch?: {
      from: string
      to: string
      reason: string
    }
    cacheHit?: {
      key: string
      similarity: number
    }
    batching?: {
      batchId: string
      position: number
    }
  }
  /** Estimated metrics */
  estimates: {
    latency: number
    cost: number
    quality: number
  }
}

/**
 * Cache interface
 */
export interface LLMCache {
  /** Get entry from cache */
  get(key: string): Promise<CacheEntry | null>
  /** Set entry in cache */
  set(key: string, response: CacheEntry['response'], ttl?: number): Promise<void>
  /** Delete entry from cache */
  delete(key: string): Promise<void>
  /** Clear all entries */
  clear(): Promise<void>
  /** Get cache statistics */
  getStats(): Promise<{
    size: number
    hitRate: number
    missRate: number
    evictions: number
  }>
}

/**
 * Router interface
 */
export interface ModelRouter {
  /** Select best model for request */
  select(request: OptimizationRequest): Promise<string>
  /** Get routing statistics */
  getStats(): Promise<Record<string, number>>
  /** Update model performance */
  updatePerformance(modelId: string, metrics: {
    latency: number
    quality: number
    cost: number
  }): Promise<void>
}

/**
 * Rate limiter interface
 */
export interface RateLimiter {
  /** Check if request is allowed */
  checkLimit(params: {
    userId?: string
    modelId: string
    tokens: number
  }): Promise<{
    allowed: boolean
    retryAfter?: number
    remaining?: number
  }>
  /** Record request usage */
  recordUsage(params: {
    userId?: string
    modelId: string
    tokens: number
    cost: number
  }): Promise<void>
  /** Get limit statistics */
  getStats(): Promise<{
    global: { used: number; remaining: number }
    perModel: Record<string, { used: number; remaining: number }>
    perUser: Record<string, { used: number; remaining: number }>
  }>
}

/**
 * Performance monitor interface
 */
export interface PerformanceMonitor {
  /** Record request metrics */
  recordRequest(metrics: {
    requestId: string
    modelId: string
    latency: number
    tokens: {
      input: number
      output: number
    }
    cost: number
    success: boolean
    cached: boolean
  }): Promise<void>
  /** Get performance metrics */
  getMetrics(timeRange?: {
    start: Date
    end: Date
  }): Promise<PerformanceMetrics>
  /** Get real-time metrics */
  getRealTimeMetrics(): Promise<{
    currentRPS: number
    currentTPM: number
    activeRequests: number
    queueLength: number
  }>
}