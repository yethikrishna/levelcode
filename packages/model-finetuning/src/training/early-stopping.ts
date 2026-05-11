import type { EarlyStoppingConfig } from '../types'
import type { TrainingState } from './types'

// ============================================================================
// Early Stopping Manager
// ============================================================================

export class EarlyStoppingManager {
  private config: EarlyStoppingConfig
  private bestScore: number
  private patienceCounter: number
  private scoresHistory: number[] = []
  private noImprovementCount: number = 0

  constructor(config: EarlyStoppingConfig) {
    this.config = config
    this.bestScore = config.mode === 'max' ? -Infinity : Infinity
    this.patienceCounter = 0
  }

  shouldStop(state: TrainingState): boolean {
    if (!this.config.enabled) {
      return false
    }

    const currentScore = this.extractScore(state)
    this.scoresHistory.push(currentScore)

    // Check if current score is better than best
    const isBetter = this.isBetterScore(currentScore, this.bestScore)
    
    if (isBetter) {
      this.bestScore = currentScore
      this.noImprovementCount = 0
      this.patienceCounter = 0
      return false
    }

    // Increment patience counter
    this.noImprovementCount++
    this.patienceCounter++

    // Check if patience exceeded
    if (this.noImprovementCount >= this.config.patience) {
      return true
    }

    // Check minimum delta improvement
    if (this.config.minDelta > 0) {
      const improvement = Math.abs(currentScore - this.bestScore)
      if (improvement < this.config.minDelta && this.noImprovementCount >= this.config.patience) {
        return true
      }
    }

    return false
  }

  getBestScore(): number {
    return this.bestScore
  }

  getPatienceRemaining(): number {
    return Math.max(0, this.config.patience - this.noImprovementCount)
  }

  getScoresHistory(): number[] {
    return [...this.scoresHistory]
  }

  reset(): void {
    this.bestScore = this.config.mode === 'max' ? -Infinity : Infinity
    this.patienceCounter = 0
    this.scoresHistory = []
    this.noImprovementCount = 0
  }

  updateConfig(config: Partial<EarlyStoppingConfig>): void {
    this.config = { ...this.config, ...config }
    if (config.metric) {
      // Reset when metric changes
      this.reset()
    }
  }

  // Advanced early stopping strategies
  shouldStopAdvanced(state: TrainingState, additionalMetrics?: Record<string, number>): {
    shouldStop: boolean
    reason: string
    confidence: number
  } {
    if (!this.config.enabled) {
      return { shouldStop: false, reason: 'Early stopping disabled', confidence: 1.0 }
    }

    const currentScore = this.extractScore(state)
    const confidence = this.calculateStopConfidence(state, currentScore)

    // Basic patience check
    if (this.noImprovementCount >= this.config.patience) {
      return {
        shouldStop: true,
        reason: `Patience exceeded (${this.noImprovementCount}/${this.config.patience})`,
        confidence
      }
    }

    // Minimum delta check
    if (this.config.minDelta > 0) {
      const improvement = Math.abs(currentScore - this.bestScore)
      if (improvement < this.config.minDelta && this.noImprovementCount >= this.config.patience) {
        return {
          shouldStop: true,
          reason: `Minimum improvement not met (${improvement.toFixed(6)} < ${this.config.minDelta})`,
          confidence: confidence * 0.8
        }
      }
    }

    // Trend-based stopping
    const trendAnalysis = this.analyzeTrend()
    if (trendAnalysis.shouldStop) {
      return {
        shouldStop: true,
        reason: `Negative trend detected (${trendAnalysis.slope.toFixed(6)})`,
        confidence: confidence * trendAnalysis.confidence
      }
    }

    // Metric divergence check
    if (additionalMetrics) {
      const divergenceCheck = this.checkMetricDivergence(additionalMetrics)
      if (divergenceCheck.shouldStop) {
        return {
          shouldStop: true,
          reason: `Metric divergence detected: ${divergenceCheck.details}`,
          confidence: confidence * 0.7
        }
      }
    }

    // Overfitting detection
    const overfittingCheck = this.detectOverfitting()
    if (overfittingCheck.shouldStop) {
      return {
        shouldStop: true,
        reason: `Overfitting detected (train/val gap: ${overfittingCheck.gap.toFixed(4)})`,
        confidence: confidence * 0.9
      }
    }

    return { shouldStop: false, reason: 'No stopping criteria met', confidence }
  }

  private extractScore(state: TrainingState): number {
    // Extract the relevant metric from the training state
    // In a real implementation, this would access the actual metrics
    return state.bestMetric
  }

  private isBetterScore(current: number, best: number): boolean {
    return this.config.mode === 'max' ? current > best : current < best
  }

  private calculateStopConfidence(state: TrainingState, currentScore: number): number {
    // Calculate confidence based on various factors
    let confidence = 0.5

    // More confident with more history
    if (this.scoresHistory.length > 10) {
      confidence += 0.2
    }

    // More confident if the gap is large
    const gap = Math.abs(currentScore - this.bestScore)
    const avgScore = this.scoresHistory.reduce((a, b) => a + b, 0) / this.scoresHistory.length
    const relativeGap = gap / Math.abs(avgScore)
    
    if (relativeGap > 0.1) {
      confidence += 0.2
    }

    // More confident if patience is nearly exceeded
    const patienceRatio = this.noImprovementCount / this.config.patience
    if (patienceRatio > 0.8) {
      confidence += 0.1
    }

    return Math.min(1.0, confidence)
  }

  private analyzeTrend(): {
    shouldStop: boolean
    slope: number
    confidence: number
  } {
    if (this.scoresHistory.length < 5) {
      return { shouldStop: false, slope: 0, confidence: 0 }
    }

    // Simple linear regression to detect trend
    const n = this.scoresHistory.length
    const x = Array.from({ length: n }, (_, i) => i)
    const y = this.scoresHistory

    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = y.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0)
    const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0)

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    // Calculate R-squared for confidence
    const yMean = sumY / n
    const ssTotal = y.reduce((acc, yi) => acc + Math.pow(yi - yMean, 2), 0)
    const ssResidual = y.reduce((acc, yi, i) => {
      const predicted = intercept + slope * x[i]
      return acc + Math.pow(yi - predicted, 2)
    }, 0)

    const rSquared = 1 - (ssResidual / ssTotal)
    const confidence = Math.abs(rSquared)

    // Determine if trend indicates stopping
    let shouldStop = false
    
    if (this.config.mode === 'max') {
      // For metrics to maximize, negative slope is bad
      shouldStop = slope < -0.01 && confidence > 0.5
    } else {
      // For metrics to minimize, positive slope is bad
      shouldStop = slope > 0.01 && confidence > 0.5
    }

    return { shouldStop, slope, confidence }
  }

  private checkMetricDivergence(additionalMetrics: Record<string, number>): {
    shouldStop: boolean
    details: string
  } {
    // Check if additional metrics are diverging from the primary metric
    const primaryMetric = this.config.metric
    const primaryScore = this.scoresHistory[this.scoresHistory.length - 1]

    for (const [metricName, metricValue] of Object.entries(additionalMetrics)) {
      if (metricName === primaryMetric) continue

      // Simple divergence check: if secondary metric is moving in opposite direction
      const isDiverging = this.isMetricDiverging(metricName, metricValue, primaryScore)
      
      if (isDiverging) {
        return {
          shouldStop: true,
          details: `${metricName} diverging from ${primaryMetric}`
        }
      }
    }

    return { shouldStop: false, details: 'No divergence detected' }
  }

  private isMetricDiverging(metricName: string, metricValue: number, primaryScore: number): boolean {
    // In a real implementation, you would have history of secondary metrics
    // For now, use a simple heuristic
    const divergenceThreshold = 0.1
    
    // Different metrics have different divergence patterns
    if (metricName.includes('loss') || metricName.includes('error')) {
      // Loss metrics should generally correlate (higher primary = higher secondary)
      return Math.abs(metricValue - primaryScore) > divergenceThreshold * Math.abs(primaryScore)
    } else if (metricName.includes('accuracy') || metricName.includes('f1')) {
      // Accuracy metrics should inversely correlate with loss
      return metricValue > (1 - primaryScore) + divergenceThreshold
    }

    return false
  }

  private detectOverfitting(): {
    shouldStop: boolean
    gap: number
  } {
    // In a real implementation, you would compare training and validation metrics
    // For now, return a placeholder
    const trainLoss = this.scoresHistory[this.scoresHistory.length - 1] || 0
    const valLoss = trainLoss * 1.2 // Simulate validation loss being higher
    
    const gap = Math.abs(valLoss - trainLoss)
    const gapThreshold = 0.1
    
    return {
      shouldStop: gap > gapThreshold && this.scoresHistory.length > 10,
      gap
    }
  }

  // Utility methods for monitoring and analysis
  getMetricsSummary(): {
    currentScore: number
    bestScore: number
    improvement: number
    improvementPercent: number
    patienceRemaining: number
    trendSlope: number
    trendConfidence: number
  } {
    const currentScore = this.scoresHistory[this.scoresHistory.length - 1] || 0
    const improvement = currentScore - this.bestScore
    const improvementPercent = this.bestScore !== 0 ? (improvement / Math.abs(this.bestScore)) * 100 : 0
    
    const trendAnalysis = this.analyzeTrend()

    return {
      currentScore,
      bestScore: this.bestScore,
      improvement,
      improvementPercent,
      patienceRemaining: this.getPatienceRemaining(),
      trendSlope: trendAnalysis.slope,
      trendConfidence: trendAnalysis.confidence
    }
  }

  getRecommendations(): string[] {
    const recommendations: string[] = []
    const summary = this.getMetricsSummary()

    if (summary.patienceRemaining <= 2) {
      recommendations.push('Consider stopping training soon - patience nearly exceeded')
    }

    if (summary.trendSlope < -0.01 && summary.trendConfidence > 0.7) {
      recommendations.push('Negative trend detected - monitor closely')
    }

    if (Math.abs(summary.improvementPercent) < 1 && this.scoresHistory.length > 20) {
      recommendations.push('Minimal improvement - consider adjusting hyperparameters')
    }

    if (this.scoresHistory.length > 50) {
      recommendations.push('Long training history - consider reducing patience')
    }

    return recommendations
  }

  // Visualization helpers
  getPlotData(): {
    scores: Array<{ step: number; score: number; best: boolean }>
    patience: Array<{ step: number; remaining: number }>
  } {
    const scores = this.scoresHistory.map((score, index) => ({
      step: index,
      score,
      best: score === this.bestScore
    }))

    const patience = scores.map((_, index) => ({
      step: index,
      remaining: Math.max(0, this.config.patience - Math.max(0, index - this.getBestIndex()))
    }))

    return { scores, patience }
  }

  private getBestIndex(): number {
    let bestIndex = 0
    let bestValue = this.scoresHistory[0]

    this.scoresHistory.forEach((score, index) => {
      if (this.isBetterScore(score, bestValue)) {
        bestValue = score
        bestIndex = index
      }
    })

    return bestIndex
  }
}