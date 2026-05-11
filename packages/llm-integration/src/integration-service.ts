import { EventEmitter } from 'events'
import type { ProviderDefinition, ProviderEntry } from '@levelcode/common/providers/provider-types'
import type { EvaluationEngine } from '@levelcode/llm-evaluation'
import type { CacheManager } from '@levelcode/llm-cache'
import type {
  IntegratedProviderConfig,
  ProviderRoutingDecision,
  IntegrationMetrics,
  IntegrationEvent,
  ProviderPerformanceMetrics,
  CachePerformanceMetrics
} from './types'
import { ProviderEvaluationService } from './provider-evaluation'
import { ProviderCacheService } from './provider-cache'

// ============================================================================
// Main Integration Service
// ============================================================================

export class LLMIntegrationService extends EventEmitter {
  private evaluationService: ProviderEvaluationService
  private cacheService: ProviderCacheService
  private config: IntegratedProviderConfig
  private providers: Map<string, ProviderEntry> = new Map()
  private providerDefinitions: Map<string, ProviderDefinition> = new Map()
  private metrics: IntegrationMetrics
  private isInitialized = false

  constructor(config: IntegratedProviderConfig) {
    super()
    this.config = config
    
    this.evaluationService = new ProviderEvaluationService(config.evaluation)
    this.cacheService = new ProviderCacheService(config.cache)
    
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgResponseTime: 0,
      totalCost: 0,
      providerUsage: {},
      evaluationRuns: 0,
      lastEvaluation: new Date(),
    }

    this.setupEventListeners()
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  async initialize(
    providers: ProviderEntry[],
    providerDefinitions: ProviderDefinition[]
  ): Promise<void> {
    if (this.isInitialized) {
      return
    }

    // Store providers
    this.providers.clear()
    this.providerDefinitions.clear()
    
    for (const provider of providers) {
      this.providers.set(provider.providerId, provider)
    }
    
    for (const definition of providerDefinitions) {
      this.providerDefinitions.set(definition.id, definition)
    }

    // Initialize evaluation service
    const evaluationConfig = {
      ...this.config.evaluation,
      providers: providerDefinitions,
      providerEntries: providers,
    }
    this.evaluationService.updateConfig(evaluationConfig)

    // Initialize cache service
    await this.cacheService.initialize(providers)

    // Schedule periodic evaluation if optimization is enabled
    if (this.config.optimization.enabled) {
      await this.scheduleOptimizationTasks()
    }

    this.isInitialized = true
    this.emit('initialized', { providers: providers.length })
  }

  private setupEventListeners(): void {
    // Evaluation service events
    this.evaluationService.on('evaluation_completed', (event) => {
      this.emit('evaluation_completed', event)
    })

    this.evaluationService.on('best_provider_selected', (event) => {
      this.emit('best_provider_selected', event)
    })

    // Cache service events
    this.cacheService.on('cache_hit', (event) => {
      this.metrics.cacheHits++
      this.updateProviderUsage(event.providerId)
    })

    this.cacheService.on('cache_miss', (event) => {
      this.metrics.cacheMisses++
      this.updateProviderUsage(event.providerId)
    })

    this.cacheService.on('cache_invalidated', (event) => {
      this.emit('cache_invalidated', event)
    })
  }

  // --------------------------------------------------------------------------
  // Provider Routing
  // --------------------------------------------------------------------------

  async selectProvider(
    task: any,
    preferences?: {
      maxLatency?: number
      maxCost?: number
      minAccuracy?: number
      preferredProvider?: string
    }
  ): Promise<ProviderRoutingDecision> {
    if (!this.isInitialized) {
      throw new Error('Integration service not initialized')
    }

    // Check cache first for similar tasks
    const cacheKey = this.generateTaskCacheKey(task)
    const cachedResult = await this.cacheService.get(
      'routing',
      cacheKey,
      undefined,
      task.type
    )

    if (cachedResult) {
      this.emit('routing_cache_hit', { task, result: cachedResult })
      return cachedResult
    }

    // Get provider performance metrics
    const providerMetrics = this.evaluationService.getAllProviderMetrics()
    
    // Filter providers based on preferences
    let candidates = providerMetrics.filter(metrics => {
      if (preferences?.maxLatency && metrics.latency > preferences.maxLatency) {
        return false
      }
      if (preferences?.maxCost && metrics.cost > preferences.maxCost) {
        return false
      }
      if (preferences?.minAccuracy && metrics.accuracy < preferences.minAccuracy) {
        return false
      }
      return true
    })

    // If preferred provider is specified, prioritize it
    if (preferences?.preferredProvider) {
      const preferred = candidates.find(m => m.providerId === preferences.preferredProvider)
      if (preferred) {
        candidates = [preferred, ...candidates.filter(m => m.providerId !== preferences.preferredProvider)]
      }
    }

    // Score candidates based on multiple factors
    const scoredCandidates = candidates.map(metrics => {
      const score = this.calculateProviderScore(metrics, task, preferences)
      return { metrics, score }
    })

    // Sort by score (highest first)
    scoredCandidates.sort((a, b) => b.score - a.score)

    if (scoredCandidates.length === 0) {
      throw new Error('No suitable provider found for the given task')
    }

    const selected = scoredCandidates[0]
    const decision: ProviderRoutingDecision = {
      providerId: selected.metrics.providerId,
      modelId: selected.metrics.modelId,
      reason: this.getSelectionReason(selected, task),
      confidence: Math.min(selected.score, 1.0),
      alternatives: scoredCandidates.slice(1, 3).map(c => ({
        providerId: c.metrics.providerId,
        modelId: c.metrics.modelId,
        score: c.score,
      })),
    }

    // Cache the routing decision
    await this.cacheService.set(
      'routing',
      cacheKey,
      decision,
      undefined,
      task.type
    )

    this.emit('provider_selected', { decision, task })
    return decision
  }

  private calculateProviderScore(
    metrics: ProviderPerformanceMetrics,
    task: any,
    preferences?: any
  ): number {
    let score = 0
    let totalWeight = 0

    // Accuracy weight (40%)
    score += metrics.accuracy * 0.4
    totalWeight += 0.4

    // Latency weight (30%) - lower latency is better
    const latencyScore = Math.max(0, 1 - metrics.latency / 5000) // Normalize against 5s
    score += latencyScore * 0.3
    totalWeight += 0.3

    // Cost weight (20%) - lower cost is better
    const costScore = Math.max(0, 1 - metrics.cost / 0.01) // Normalize against $0.01
    score += costScore * 0.2
    totalWeight += 0.2

    // Reliability weight (10%)
    score += metrics.reliability * 0.1
    totalWeight += 0.1

    // Adjust for task-specific requirements
    if (task.type === 'code_generation') {
      // Prioritize accuracy for code generation
      score += metrics.accuracy * 0.1
      totalWeight += 0.1
    } else if (task.type === 'chat') {
      // Prioritize low latency for chat
      score += latencyScore * 0.1
      totalWeight += 0.1
    }

    return score / totalWeight
  }

  private getSelectionReason(selected: any, task: any): string {
    const reasons = []

    if (selected.metrics.accuracy > 0.9) {
      reasons.push('high accuracy')
    }
    if (selected.metrics.latency < 1000) {
      reasons.push('low latency')
    }
    if (selected.metrics.cost < 0.005) {
      reasons.push('cost effective')
    }
    if (selected.metrics.reliability > 0.95) {
      reasons.push('high reliability')
    }

    if (reasons.length === 0) {
      reasons.push('best overall performance')
    }

    return `Selected for: ${reasons.join(', ')}`
  }

  private generateTaskCacheKey(task: any): string {
    // Generate a cache key based on task characteristics
    const keyParts = [
      task.type || 'unknown',
      task.complexity || 'medium',
      task.domain || 'general',
    ]
    return keyParts.join(':')
  }

  // --------------------------------------------------------------------------
  // Request Processing
  // --------------------------------------------------------------------------

  async processRequest(
    task: any,
    preferences?: any
  ): Promise<{
    result: any
    provider: ProviderRoutingDecision
    cached: boolean
    metrics: any
  }> {
    const startTime = Date.now()
    this.metrics.totalRequests++

    try {
      // Select best provider
      const provider = await this.selectProvider(task, preferences)

      // Check cache for the actual response
      const taskKey = this.generateTaskCacheKey(task)
      const cachedResponse = await this.cacheService.get(
        provider.providerId,
        taskKey,
        provider.modelId,
        task.type
      )

      let result: any
      let cached = false

      if (cachedResponse) {
        result = cachedResponse
        cached = true
      } else {
        // Process the request (mock implementation)
        result = await this.mockProcessRequest(task, provider)
        
        // Cache the response
        await this.cacheService.set(
          provider.providerId,
          taskKey,
          result,
          provider.modelId,
          task.type,
          {
            latency: Date.now() - startTime,
            cost: this.estimateCost(task, provider),
            taskType: task.type,
          }
        )
      }

      // Update metrics
      const responseTime = Date.now() - startTime
      this.updateMetrics(responseTime, this.estimateCost(task, provider))

      return {
        result,
        provider,
        cached,
        metrics: {
          responseTime,
          cost: this.estimateCost(task, provider),
          cached,
        },
      }
    } catch (error) {
      this.emit('request_error', { task, error })
      throw error
    }
  }

  private async mockProcessRequest(task: any, provider: ProviderRoutingDecision): Promise<any> {
    // Mock request processing
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500))
    
    return {
      response: `Mock response from ${provider.providerId}:${provider.modelId} for task ${task.type}`,
      provider: provider.providerId,
      model: provider.modelId,
      timestamp: new Date(),
    }
  }

  private estimateCost(task: any, provider: ProviderRoutingDecision): number {
    // Mock cost estimation
    const baseCost = 0.001
    const complexityMultiplier = task.complexity === 'high' ? 2 : task.complexity === 'low' ? 0.5 : 1
    const providerMultiplier = provider.providerId === 'openrouter' ? 0.8 : 1
    
    return baseCost * complexityMultiplier * providerMultiplier
  }

  private updateMetrics(responseTime: number, cost: number): void {
    // Update average response time
    this.metrics.avgResponseTime = 
      (this.metrics.avgResponseTime * (this.metrics.totalRequests - 1) + responseTime) / 
      this.metrics.totalRequests

    // Update total cost
    this.metrics.totalCost += cost
  }

  private updateProviderUsage(providerId: string): void {
    this.metrics.providerUsage[providerId] = (this.metrics.providerUsage[providerId] || 0) + 1
  }

  // --------------------------------------------------------------------------
  // Optimization and Maintenance
  // --------------------------------------------------------------------------

  private async scheduleOptimizationTasks(): Promise<void> {
    // Schedule periodic evaluation
    if (this.config.optimization.reevaluationInterval > 0) {
      setInterval(async () => {
        if (!this.evaluationService.isEvaluationRunning()) {
          await this.evaluationService.runEvaluation()
        }
      }, this.config.optimization.reevaluationInterval * 60 * 60 * 1000)
    }

    // Schedule cache optimization
    setInterval(async () => {
      await this.cacheService.optimizeCaches()
    }, 60 * 60 * 1000) // Every hour

    // Schedule cache warmup if enabled
    if (this.config.optimization.cacheWarmup) {
      await this.warmupCommonCaches()
    }
  }

  private async warmupCommonCaches(): Promise<void> {
    const commonQueries = [
      'What is the capital of France?',
      'Explain machine learning',
      'Write a hello world function',
    ]

    for (const providerId of this.cacheService.getProviderIds()) {
      await this.cacheService.warmupCache(providerId, commonQueries)
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  async runEvaluation(): Promise<any> {
    return await this.evaluationService.runEvaluation()
  }

  getMetrics(): IntegrationMetrics {
    return { ...this.metrics }
  }

  getProviderRanking(): ProviderPerformanceMetrics[] {
    return this.evaluationService.getProviderRanking()
  }

  getCacheStats(): Map<string, any> | null {
    return this.cacheService.getStats()
  }

  getCachePerformanceMetrics(): CachePerformanceMetrics[] {
    return this.cacheService.getAllPerformanceMetrics()
  }

  async invalidateCache(
    providerId?: string,
    pattern?: string
  ): Promise<number> {
    return await this.cacheService.invalidate(providerId, pattern)
  }

  async clearCaches(providerId?: string): Promise<void> {
    await this.cacheService.clear(providerId)
  }

  updateConfig(config: Partial<IntegratedProviderConfig>): void {
    this.config = { ...this.config, ...config }
    
    if (config.evaluation) {
      this.evaluationService.updateConfig({ ...this.config.evaluation, ...config.evaluation })
    }
    
    if (config.cache) {
      this.cacheService.updateConfig({ ...this.config.cache, ...config.cache })
    }
  }

  isInitialized(): boolean {
    return this.isInitialized
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys()).filter(id => {
      const provider = this.providers.get(id)
      return provider?.enabled || false
    })
  }

  getProviderInfo(providerId: string): { entry: ProviderEntry; definition: ProviderDefinition } | null {
    const entry = this.providers.get(providerId)
    const definition = this.providerDefinitions.get(providerId)
    
    if (entry && definition) {
      return { entry, definition }
    }
    
    return null
  }

  // --------------------------------------------------------------------------
  // Export/Import
  // --------------------------------------------------------------------------

  exportState(): string {
    const state = {
      metrics: this.metrics,
      evaluationMetrics: this.evaluationService.exportMetrics(),
      cacheStats: Array.from(this.getCacheStats()?.entries() || []),
      config: this.config,
      exportedAt: new Date(),
    }
    
    return JSON.stringify(state, null, 2)
  }

  importState(data: string): void {
    try {
      const parsed = JSON.parse(data)
      
      this.metrics = parsed.metrics
      this.evaluationService.importMetrics(parsed.evaluationMetrics)
      
      this.emit('state_imported', { timestamp: parsed.exportedAt })
    } catch (error) {
      throw new Error(`Failed to import state: ${error}`)
    }
  }
}