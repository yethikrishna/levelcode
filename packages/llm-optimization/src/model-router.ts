import type {
  RoutingConfig,
  ModelRouter,
  OptimizationRequest,
} from './types'

/**
 * Model router for selecting optimal models based on request characteristics
 */
export class BasicModelRouter implements ModelRouter {
  private config: RoutingConfig
  private stats = new Map<string, number>()
  private performanceCache = new Map<string, {
    avgLatency: number
    avgQuality: number
    avgCost: number
    lastUpdated: Date
  }>()

  constructor(config: RoutingConfig) {
    this.config = config
  }

  /**
   * Select the best model for a given request
   */
  async select(request: OptimizationRequest): Promise<string> {
    const candidates = this.evaluateRules(request)
    
    if (candidates.length === 0) {
      // Fallback to default model
      const defaultModel = this.config.models[0]?.id
      if (!defaultModel) {
        throw new Error('No models available for routing')
      }
      return defaultModel
    }

    if (candidates.length === 1) {
      const selected = candidates[0].modelId
      this.recordSelection(selected)
      return selected
    }

    // Multiple candidates - select based on weighted score
    const selected = this.selectBestCandidate(candidates, request)
    this.recordSelection(selected)
    return selected
  }

  /**
   * Get routing statistics
   */
  async getStats(): Promise<Record<string, number>> {
    return Object.fromEntries(this.stats)
  }

  /**
   * Update model performance data
   */
  async updatePerformance(modelId: string, metrics: {
    latency: number
    quality: number
    cost: number
  }): Promise<void> {
    const existing = this.performanceCache.get(modelId)
    
    if (existing) {
      // Update with exponential moving average
      const alpha = 0.1 // Smoothing factor
      existing.avgLatency = alpha * metrics.latency + (1 - alpha) * existing.avgLatency
      existing.avgQuality = alpha * metrics.quality + (1 - alpha) * existing.avgQuality
      existing.avgCost = alpha * metrics.cost + (1 - alpha) * existing.avgCost
      existing.lastUpdated = new Date()
    } else {
      // Initialize with new metrics
      this.performanceCache.set(modelId, {
        avgLatency: metrics.latency,
        avgQuality: metrics.quality,
        avgCost: metrics.cost,
        lastUpdated: new Date(),
      })
    }

    // Update model configuration with new performance data
    const modelConfig = this.config.models.find(m => m.id === modelId)
    if (modelConfig) {
      modelConfig.performance.avgLatency = this.performanceCache.get(modelId)!.avgLatency
      modelConfig.performance.avgQuality = this.performanceCache.get(modelId)!.avgQuality
      modelConfig.performance.costPerMillionTokens = this.performanceCache.get(modelId)!.avgCost * 1000000
    }
  }

  /**
   * Evaluate routing rules against a request
   */
  private evaluateRules(request: OptimizationRequest): Array<{
    modelId: string
    score: number
    reasons: string[]
  }> {
    const candidates: Array<{
      modelId: string
      score: number
      reasons: string[]
    }> = []

    for (const rule of this.config.rules) {
      if (this.matchesRule(request, rule.condition)) {
        const modelConfig = this.config.models.find(m => m.id === rule.action.modelId)
        if (!modelConfig) continue

        const score = this.calculateModelScore(modelConfig, request)
        const reasons = this.getMatchingReasons(request, rule.condition)

        candidates.push({
          modelId: rule.action.modelId,
          score: score * rule.action.weight,
          reasons,
        })
      }
    }

    // Sort by score (highest first)
    candidates.sort((a, b) => b.score - a.score)
    return candidates
  }

  /**
   * Check if request matches rule condition
   */
  private matchesRule(request: OptimizationRequest, condition: any): boolean {
    // Check prompt length
    if (condition.promptLength) {
      const promptLength = request.prompt.length
      if (condition.promptLength.min && promptLength < condition.promptLength.min) {
        return false
      }
      if (condition.promptLength.max && promptLength > condition.promptLength.max) {
        return false
      }
    }

    // Check required capabilities
    if (condition.requiredCapabilities) {
      const modelConfig = this.config.models.find(m => 
        condition.requiredCapabilities!.every((cap: string) => 
          m.capabilities[cap as keyof typeof m.capabilities]
        )
      )
      if (!modelConfig) return false
    }

    // Check latency constraint
    if (condition.maxLatency) {
      const modelConfig = this.config.models.find(m => 
        m.performance.avgLatency <= condition.maxLatency
      )
      if (!modelConfig) return false
    }

    // Check cost constraint
    if (condition.maxCost) {
      const modelConfig = this.config.models.find(m => 
        m.performance.costPerMillionTokens <= condition.maxCost
      )
      if (!modelConfig) return false
    }

    // Check quality requirement
    if (condition.minQuality) {
      const modelConfig = this.config.models.find(m => 
        m.performance.avgQuality >= condition.minQuality
      )
      if (!modelConfig) return false
    }

    return true
  }

  /**
   * Calculate model score based on performance and preferences
   */
  private calculateModelScore(
    modelConfig: RoutingConfig['models'][0],
    request: OptimizationRequest
  ): number {
    let score = 100

    // Adjust for latency preference
    if (request.preferences.maxLatency) {
      const latencyDiff = modelConfig.performance.avgLatency - request.preferences.maxLatency
      if (latencyDiff > 0) {
        score -= Math.min(50, latencyDiff / 10) // Penalize excess latency
      }
    }

    // Adjust for cost preference
    if (request.preferences.maxCost) {
      const costPerRequest = (modelConfig.performance.costPerMillionTokens / 1000000) * 
        (request.prompt.length / 4) // Rough token estimation
      const costDiff = costPerRequest - request.preferences.maxCost
      if (costDiff > 0) {
        score -= Math.min(50, costDiff * 1000) // Penalize excess cost
      }
    }

    // Adjust for quality preference
    if (request.preferences.minQuality) {
      const qualityDiff = request.preferences.minQuality - modelConfig.performance.avgQuality
      if (qualityDiff > 0) {
        score -= Math.min(50, qualityDiff) // Penalize insufficient quality
      }
    }

    // Bonus for preferred model
    if (request.preferences.preferredModel === modelConfig.id) {
      score += 20
    }

    // Bonus for higher quality models (if no specific quality requirement)
    if (!request.preferences.minQuality) {
      score += modelConfig.performance.avgQuality * 0.2
    }

    return Math.max(0, score)
  }

  /**
   * Get reasons for rule matching
   */
  private getMatchingReasons(request: OptimizationRequest, condition: any): string[] {
    const reasons: string[] = []

    if (condition.promptLength) {
      if (condition.promptLength.min && request.prompt.length >= condition.promptLength.min) {
        reasons.push(`Prompt length >= ${condition.promptLength.min}`)
      }
      if (condition.promptLength.max && request.prompt.length <= condition.promptLength.max) {
        reasons.push(`Prompt length <= ${condition.promptLength.max}`)
      }
    }

    if (condition.requiredCapabilities) {
      reasons.push(`Supports required capabilities: ${condition.requiredCapabilities.join(', ')}`)
    }

    if (condition.maxLatency) {
      reasons.push(`Latency <= ${condition.maxLatency}ms`)
    }

    if (condition.maxCost) {
      reasons.push(`Cost <= $${condition.maxCost}`)
    }

    if (condition.minQuality) {
      reasons.push(`Quality >= ${condition.minQuality}`)
    }

    return reasons
  }

  /**
   * Select best candidate from multiple options
   */
  private selectBestCandidate(
    candidates: Array<{
      modelId: string
      score: number
      reasons: string[]
    }>,
    request: OptimizationRequest
  ): string {
    // If scores are close (< 5 points difference), consider other factors
    const topScore = candidates[0].score
    const closeCandidates = candidates.filter(c => topScore - c.score < 5)

    if (closeCandidates.length > 1) {
      // Apply tie-breaking rules
      
      // 1. Prefer models with better recent performance
      const bestPerformer = closeCandidates.reduce((best, current) => {
        const bestPerf = this.performanceCache.get(best.modelId)
        const currentPerf = this.performanceCache.get(current.modelId)
        
        if (!bestPerf) return current
        if (!currentPerf) return best
        
        // Combine quality and latency for tie-breaking
        const bestScore = bestPerf.avgQuality - (bestPerf.avgLatency / 100)
        const currentScore = currentPerf.avgQuality - (currentPerf.avgLatency / 100)
        
        return currentScore > bestScore ? current : best
      })

      return bestPerformer.modelId
    }

    return candidates[0].modelId
  }

  /**
   * Record model selection for statistics
   */
  private recordSelection(modelId: string): void {
    const current = this.stats.get(modelId) || 0
    this.stats.set(modelId, current + 1)
  }

  /**
   * Add a new routing rule
   */
  addRule(rule: RoutingConfig['rules'][0]): void {
    this.config.rules.push(rule)
  }

  /**
   * Remove a routing rule by name
   */
  removeRule(name: string): boolean {
    const index = this.config.rules.findIndex(r => r.name === name)
    if (index >= 0) {
      this.config.rules.splice(index, 1)
      return true
    }
    return false
  }

  /**
   * Add or update a model
   */
  upsertModel(model: RoutingConfig['models'][0]): void {
    const index = this.config.models.findIndex(m => m.id === model.id)
    if (index >= 0) {
      this.config.models[index] = model
    } else {
      this.config.models.push(model)
    }
  }

  /**
   * Get model information
   */
  getModel(modelId: string): RoutingConfig['models'][0] | undefined {
    return this.config.models.find(m => m.id === modelId)
  }

  /**
   * Get all models
   */
  getAllModels(): RoutingConfig['models'] {
    return [...this.config.models]
  }

  /**
   * Get all rules
   */
  getAllRules(): RoutingConfig['rules'] {
    return [...this.config.rules]
  }

  /**
   * Estimate request cost for a model
   */
  estimateCost(modelId: string, promptTokens: number): number {
    const model = this.getModel(modelId)
    if (!model) return 0

    return (promptTokens / 1000000) * model.performance.costPerMillionTokens
  }

  /**
   * Estimate request latency for a model
   */
  estimateLatency(modelId: string, promptTokens: number): number {
    const model = this.getModel(modelId)
    if (!model) return 0

    // Base latency + additional time based on prompt length
    const baseLatency = model.performance.avgLatency
    const additionalLatency = (promptTokens / 1000) * 50 // 50ms per 1000 tokens
    return baseLatency + additionalLatency
  }

  /**
   * Clear all statistics
   */
  clearStats(): void {
    this.stats.clear()
  }
}