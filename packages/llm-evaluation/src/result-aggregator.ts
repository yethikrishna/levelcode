import type {
  ModelResult,
  TaskResult,
  MetricResult,
  AggregatedMetrics,
  ModelRanking,
  EvaluationSummary,
} from './types'

// ============================================================================
// Result Aggregator
// ============================================================================

export class ResultAggregator {
  constructor(private metrics: any[]) {
    // Initialize with metric configurations
  }

  async aggregateMetrics(taskResults: TaskResult[]): Promise<AggregatedMetrics> {
    const aggregated: AggregatedMetrics = {}
    
    // Group metrics by ID across all tasks
    const metricGroups = new Map<string, number[]>()
    
    for (const task of taskResults) {
      for (const metric of task.metrics) {
        if (!metricGroups.has(metric.metricId)) {
          metricGroups.set(metric.metricId, [])
        }
        
        if (!metric.error) {
          metricGroups.get(metric.metricId)!.push(metric.value)
        }
      }
    }
    
    // Calculate statistics for each metric
    for (const [metricId, values] of metricGroups) {
      if (values.length > 0) {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1)
        const std = Math.sqrt(variance)
        
        const sorted = [...values].sort((a, b) => a - b)
        
        aggregated[metricId] = {
          value: mean,
          score: this.normalizeScore(mean, metricId),
          confidence: this.calculateConfidence(std, values.length),
          distribution: {
            mean,
            median: sorted[Math.floor(sorted.length / 2)],
n            std,
            min: sorted[0],
n            max: sorted[sorted.length - 1],
n            p25: sorted[Math.floor(sorted.length * 0.25)],
n            p75: sorted[Math.floor(sorted.length * 0.75)],
n            p95: sorted[Math.floor(sorted.length * 0.95)],
n          },
n        }
      }
    }
    
    return aggregated
  }

  async generateSummary(modelResults: ModelResult[]): Promise<EvaluationSummary> {
    const totalTasks = modelResults.reduce((sum, model) => sum + model.taskResults.length, 0)
    const completedTasks = modelResults.reduce(
      (sum, model) => sum + model.taskResults.filter(t => !t.error).length,
      0
    )
    const failedTasks = modelResults.reduce(
      (sum, model) => sum + model.taskResults.filter(t => t.error).length,
      0
    )
    
    const totalCost = modelResults.reduce((sum, model) => sum + model.totalCost, 0)
    const totalTime = modelResults.reduce((sum, model) => sum + model.totalTime, 0)
    const averageLatency = totalTime / totalTasks
    
    // Find best model
    const bestModel = this.findBestModel(modelResults)
    const rankings = await this.generateRankings(modelResults)
    
    // Generate insights
    const insights = this.generateInsights(modelResults, rankings)
    
    return {
      totalTasks,
      completedTasks,
      failedTasks,
      totalCost,
      totalTime,
      averageLatency,
      bestModel,
      rankings,
      insights,
    }
  }

  private findBestModel(modelResults: ModelResult[]): ModelResult | undefined {
    if (modelResults.length === 0) {
      return undefined
    }
    
    return modelResults.reduce((best, current) => {
      const bestScore = best.aggregatedMetrics['accuracy']?.score || 0
      const currentScore = current.aggregatedMetrics['accuracy']?.score || 0
      
      return currentScore > bestScore ? current : best
    })
  }

  async generateRankings(modelResults: ModelResult[]): Promise<ModelRanking[]> {
    const rankings: ModelRanking[] = []
    
    // Calculate overall scores for each model
    const modelScores = modelResults.map(model => {
      const scores = Object.values(model.aggregatedMetrics).map(m => m.score || 0)
      const weights = this.metrics.map(m => m.weight).filter(w => w !== undefined)
      
      // Weighted average score
      let overallScore = 0
      let totalWeight = 0
      
      for (let i = 0; i < scores.length; i++) {
        const weight = weights[i] || 1
        overallScore += scores[i] * weight
        totalWeight += weight
      }
      
      return {
        score: totalWeight > 0 ? overallScore / totalWeight : 0,
        modelId: model.modelId,
        modelName: model.modelName,
        metrics: Object.fromEntries(
          Object.entries(model.aggregatedMetrics).map(([id, value]) => [id, value.score])
        ),
        strengths: this.identifyStrengths(model),
        weaknesses: this.identifyWeaknesses(model),
      }
    })
    
    // Sort by score descending
    rankings.sort((a, b) => b.score - a.score)
    
    // Assign ranks
    rankings.forEach((ranking, index) => {
      ranking.rank = index + 1
    })
    
    return rankings
  }

  private identifyStrengths(model: ModelResult): string[] {
    const strengths: string[] = []
    const metrics = model.aggregatedMetrics
    
    // Identify high-performing metrics
    for (const [metricId, value] of Object.entries(metrics)) {
      if (value.score >= 0.8) {
        const metricConfig = this.metrics.find(m => m.id === metricId)
        strengths.push(`${metricConfig?.name || metricId} (${(value * 100).toFixed(1)}%)`))
      }
    }
    
    // Model-specific strengths
    if (model.totalTime < 2000) {
      strengths.push('Fast response time')
    }
    
    if (model.totalCost < 0.01) {
      strengths.push('Cost effective')
    }
    
    return strengths
  }

  private identifyWeaknesses(model: ModelResult): string[] {
    const weaknesses: string[] = []
    const metrics = model.aggregatedMetrics
    
    // Identify low-performing metrics
    for (const [metricId, value] of Object.entries(metrics)) {
      if (value.score < 0.5) {
        const metricConfig = this.metrics.find(m => m.id === metricId)
        weaknesses.push(`${metricConfig?.name || metricId} (${(value * 100).toFixed(1)}%)`))
      }
    }
    
    // Model-specific weaknesses
    if (model.totalTime > 10000) {
      weaknesses.push('Slow response time')
    }
    
    if (model.totalCost > 1.0) {
      weaknesses.push('High cost')
    }
    
    return weaknesses
  }

  private normalizeScore(value: number, metricId: string): number {
    // Normalize metric value to 0-1 scale based on metric type
    const metricConfig = this.metrics.find(m => m.id === metricId)
    
    if (!metricConfig) {
      return Math.min(1, Math.max(0, value))
    }
    
    switch (metricConfig.type) {
      case 'accuracy':
      case 'precision':
      case 'recall':
      case 'f1':
      case 'bleu':
      case 'rouge':
        return Math.max(0, Math.min(1, value / 100))
      
      case 'perplexity':
      case 'latency':
      case 'cost':
        // Lower is better, invert normalization
        const threshold = metricConfig.threshold || 100
        return Math.max(0, 1 - value / threshold))
      
      default:
        return Math.min(1, Math.max(0, value))
    }
  }

  private calculateConfidence(std: number, n: number): number {
    // Calculate confidence interval for standard error
    // For n > 30, approximate with normal distribution
    const z = 1.96 // 95% confidence
    return z * (std / Math.sqrt(n))
  }

  private async generateInsights(
    modelResults: ModelResult[],
    rankings: ModelRanking[]
  ): string[] {
    const insights: string[] = []
    
    // Performance gap analysis
    if (rankings.length > 1) {
      const best = rankings[0]
      const worst = rankings[rankings.length - 1]
      const gap = best.score - worst.score
      
      if (gap > 0.3) {
        insights.push(
          `Significant performance gap of ${(gap * 100).toFixed(1)}% between ${best.modelName} and ${worst.modelName}`
        )
      } else if (gap > 0.1) {
        insights.push(
          `Moderate performance difference between ${best.modelName} and ${worst.modelName}`
        )
      }
    }
    
    // Cost efficiency analysis
    const avgCost = modelResults.reduce((sum, model) => sum + model.totalCost, 0) / modelResults.length
    if (avgCost > 0.1) {
      insights.push(`High average cost per evaluation: $${avgCost.toFixed(4)}`)
    }
    
    // Latency analysis
    const avgLatency = modelResults.reduce((sum, model) => sum + model.totalTime, 0) / modelResults.length / modelResults.reduce((sum, model) => sum + model.taskResults.length, 0))
    if (avgLatency > 3000) {
      insights.push(`High average latency: ${(avgLatency / 1000).toFixed(2)}s`)
    }
    
    // Reliability check
    const failedRate = modelResults.reduce((sum, model) => sum + model.taskResults.filter(t => t.error).length, 0) / modelResults.reduce((sum, model) => sum + model.taskResults.length, 0)
    if (failedRate > 0.1) {
      insights.push(`High failure rate: ${(failedRate * 100).toFixed(1)}%`)
    }
    
    return insights
  }
}