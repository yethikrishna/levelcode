import type {
  ModelResult,
  TaskResult,
  MetricResult,
  StatisticalSummary,
  SignificanceTest,
  EffectSize,
  Correlation,
  TrendAnalysis,
} from './types'

// ============================================================================
// Statistical Analyzer
// ============================================================================

export class StatisticalAnalyzer {
  async analyzeResults(modelResults: ModelResult[]): Promise<StatisticalSummary> {
    const sampleSize = modelResults.reduce((sum, model) => sum + model.taskResults.length, 0)
    const confidenceLevel = 0.95
    const marginOfError = this.calculateMarginOfError(sampleSize, confidenceLevel)
    
    // Perform significance tests
    const significanceTests = await this.performSignificanceTests(modelResults)
    
    // Calculate effect sizes
    const effectSizes = await this.calculateEffectSizes(modelResults, significanceTests)
    
    // Calculate correlations
    const correlations = await this.calculateCorrelations(modelResults)
    
    // Analyze trends
    const trends = await this.analyzeTrends(modelResults)
    
    return {
      sampleSize,
      confidenceLevel,
      marginOfError,
      significanceTests,
      effectSizes,
      correlations,
      trends,
    }
  }

  private calculateMarginOfError(sampleSize: number, confidenceLevel: number): number {
    // Simplified margin of error calculation
    const zScore = this.getZScore(confidenceLevel)
    return (zScore * 0.5) / Math.sqrt(sampleSize)
  }

  private getZScore(confidenceLevel: number): number {
    const zScores: Record<number, number> = {
      0.90: 1.645,
      0.95: 1.96,
      0.99: 2.576,
    }
    return zScores[confidenceLevel] || 1.96
  }

  // ============================================================================
  // Significance Tests
  // ============================================================================

  private async performSignificanceTests(modelResults: ModelResult[]): Promise<SignificanceTest[]> {
    const tests: SignificanceTest[] = []
    
    if (modelResults.length < 2) {
      return tests
    }

    // Get all metric IDs
    const metricIds = this.getCommonMetricIds(modelResults)
    
    for (const metricId of metricIds) {
      // Pairwise comparisons
      for (let i = 0; i < modelResults.length; i++) {
        for (let j = i + 1; j < modelResults.length; j++) {
          const model1 = modelResults[i]
          const model2 = modelResults[j]
          
          const values1 = this.getMetricValues(model1, metricId)
          const values2 = this.getMetricValues(model2, metricId)
          
          if (values1.length > 0 && values2.length > 0) {
            const tTest = this.performTTest(values1, values2)
            const wilcoxon = this.performWilcoxonTest(values1, values2)
            
            tests.push({
              test: 't_test',
              groups: [model1.modelId, model2.modelId],
              statistic: tTest.statistic,
              pValue: tTest.pValue,
              significance: tTest.pValue < 0.05,
              effectSize: tTest.effectSize,
              interpretation: this.interpretTTest(tTest.pValue, tTest.effectSize),
            })
            
            tests.push({
              test: 'wilcoxon',
              groups: [model1.modelId, model2.modelId],
              statistic: wilcoxon.statistic,
              pValue: wilcoxon.pValue,
              significance: wilcoxon.pValue < 0.05,
              effectSize: wilcoxon.effectSize,
              interpretation: this.interpretWilcoxon(wilcoxon.pValue, wilcoxon.effectSize),
            })
          }
        }
      }
    }
    
    return tests
  }

  private getCommonMetricIds(modelResults: ModelResult[]): string[] {
    if (modelResults.length === 0) {
      return []
    }
    
    const metricIds = new Set(modelResults[0].taskResults[0]?.metrics.map(m => m.metricId) || [])
    
    for (const model of modelResults) {
      const modelMetrics = new Set(
        model.taskResults.flatMap(task => task.metrics.map(m => m.metricId))
      )
      
      for (const metricId of metricIds) {
        if (!modelMetrics.has(metricId)) {
          metricIds.delete(metricId)
        }
      }
    }
    
    return Array.from(metricIds)
  }

  private getMetricValues(model: ModelResult, metricId: string): number[] {
    return model.taskResults
      .flatMap(task => task.metrics)
      .filter(metric => metric.metricId === metricId && !metric.error)
      .map(metric => metric.value)
  }

  private performTTest(values1: number[], values2: number[]): {
    statistic: number
    pValue: number
    effectSize: number
  } {
    const mean1 = this.mean(values1)
    const mean2 = this.mean(values2)
    const var1 = this.variance(values1)
    const var2 = this.variance(values2)
    const n1 = values1.length
    const n2 = values2.length
    
    // Pooled standard error
    const pooledVariance = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2)
    const standardError = Math.sqrt(pooledVariance * (1/n1 + 1/n2))
    
    // t-statistic
    const tStatistic = (mean1 - mean2) / standardError
    
    // Degrees of freedom
    const df = n1 + n2 - 2
    
    // p-value (two-tailed)
    const pValue = this.tDistributionCDF(Math.abs(tStatistic), df)
    
    // Cohen's d effect size
    const pooledStd = Math.sqrt(pooledVariance)
    const effectSize = Math.abs(mean1 - mean2) / pooledStd
    
    return {
      statistic: tStatistic,
      pValue: 2 * (1 - pValue),
      effectSize,
    }
  }

  private performWilcoxonTest(values1: number[], values2: number[]): {
    statistic: number
    pValue: number
    effectSize: number
  } {
    // Simplified Wilcoxon rank-sum test
    const allValues = [...values1, ...values2]
    const ranks = this.getRanks(allValues)
    
    const rankSum1 = values1.reduce((sum, _, i) => sum + ranks[i], 0)
    const rankSum2 = values2.reduce((sum, _, i) => sum + ranks[values1.length + i], 0)
    
    const n1 = values1.length
    const n2 = values2.length
    const expectedRankSum = n1 * (n1 + n2 + 1) / 2
    
    const statistic = Math.min(rankSum1, rankSum2)
    
    // Simplified p-value calculation
    const zScore = (statistic - expectedRankSum) / Math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)))
    
    // Effect size (r)
    const effectSize = Math.abs(zScore) / Math.sqrt(n1 + n2)
    
    return {
      statistic,
      pValue,
      effectSize,
    }
  }

  private getRanks(values: number[]): number[] {
    const indexed = values.map((value, index) => ({ value, index }))
    indexed.sort((a, b) => a.value - b.value)
    
    const ranks = new Array(values.length)
    let i = 0
    
    while (i < indexed.length) {
      let j = i
      while (j < indexed.length && indexed[j].value === indexed[i].value) {
        j++
      }
      
      // Handle ties by assigning average rank
      const averageRank = (i + j - 1) / 2 + 1
      for (let k = i; k < j; k++) {
        ranks[indexed[k].index] = averageRank
      }
      
      i = j
    }
    
    return ranks
  }

  private interpretTTest(pValue: number, effectSize: number): string {
    const significance = pValue < 0.05 ? 'significant' : 'not significant'
    const magnitude = this.interpretEffectSize(effectSize)
    
    return `Difference is ${significance} (p=${pValue.toFixed(3)}) with ${magnitude} effect size (d=${effectSize.toFixed(2)})`
  }

  private interpretWilcoxon(pValue: number, effectSize: number): string {
    const significance = pValue < 0.05 ? 'significant' : 'not significant'
    const magnitude = this.interpretEffectSize(effectSize)
    
    return `Difference is ${significance} (p=${pValue.toFixed(3)}) with ${magnitude} effect size (r=${effectSize.toFixed(2)})`
  }

  // ============================================================================
  // Effect Sizes
  // ============================================================================

  private async calculateEffectSizes(
    modelResults: ModelResult[],
    significanceTests: SignificanceTest[]
  ): Promise<EffectSize[]> {
    const effectSizes: EffectSize[] = []
    
    for (const test of significanceTests) {
      if (test.effectSize !== undefined) {
        let type: EffectSize['type']
        
        switch (test.test) {
          case 't_test':
            type = 'cohens_d'
            break
          case 'wilcoxon':
            type = 'glass_delta'
            break
          default:
            continue
        }
        
        effectSizes.push({
          type,
          groups: test.groups,
          value: test.effectSize,
          magnitude: this.interpretEffectSize(test.effectSize),
          interpretation: `${type} = ${test.effectSize.toFixed(2)} (${this.interpretEffectSize(test.effectSize)} effect)`,
        })
      }
    }
    
    return effectSizes
  }

  private interpretEffectSize(effectSize: number): EffectSize['magnitude'] {
    const abs = Math.abs(effectSize)
    
    if (abs < 0.2) return 'negligible'
    if (abs < 0.5) return 'small'
    if (abs < 0.8) return 'medium'
    return 'large'
  }

  // ============================================================================
  // Correlations
  // ============================================================================

  private async calculateCorrelations(modelResults: ModelResult[]): Promise<Correlation[]> {
    const correlations: Correlation[] = []
    const metricIds = this.getCommonMetricIds(modelResults)
    
    // Calculate correlations between metrics
    for (let i = 0; i < metricIds.length; i++) {
      for (let j = i + 1; j < metricIds.length; j++) {
        const metric1Id = metricIds[i]
        const metric2Id = metricIds[j]
        
        const values1: number[] = []
        const values2: number[] = []
        
        for (const model of modelResults) {
          for (const task of model.taskResults) {
            const metric1 = task.metrics.find(m => m.metricId === metric1Id)
            const metric2 = task.metrics.find(m => m.metricId === metric2Id)
            
            if (metric1 && metric2 && !metric1.error && !metric2.error) {
              values1.push(metric1.value)
              values2.push(metric2.value)
            }
          }
        }
        
        if (values1.length > 1) {
          const correlation = this.pearsonCorrelation(values1, values2)
          const pValue = this.correlationSignificanceTest(correlation, values1.length)
          
          correlations.push({
            variables: [metric1Id, metric2Id],
            coefficient: correlation,
            pValue,
            significance: pValue < 0.05,
            strength: this.interpretCorrelationStrength(Math.abs(correlation)),
            interpretation: this.interpretCorrelation(correlation, pValue),
          })
        }
      }
    }
    
    return correlations
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length
    const sumX = x.reduce((sum, val) => sum + val, 0)
    const sumY = y.reduce((sum, val) => sum + val, 0)
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0)
    const sumX2 = x.reduce((sum, val) => sum + val * val, 0)
    const sumY2 = y.reduce((sum, val) => sum + val * val, 0)
    
    const numerator = n * sumXY - sumX * sumY
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
    
    return denominator === 0 ? 0 : numerator / denominator
  }

  private correlationSignificanceTest(correlation: number, n: number): number {
    const t = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation))
    return 2 * (1 - this.tDistributionCDF(Math.abs(t), n - 2))
  }

  private interpretCorrelationStrength(correlation: number): Correlation['strength'] {
    if (correlation < 0.1) return 'negligible'
    if (correlation < 0.3) return 'weak'
    if (correlation < 0.5) return 'moderate'
    if (correlation < 0.7) return 'strong'
    return 'very_strong'
  }

  private interpretCorrelation(correlation: number, pValue: number): string {
    const direction = correlation > 0 ? 'positive' : 'negative'
    const strength = this.interpretCorrelationStrength(Math.abs(correlation))
    const significance = pValue < 0.05 ? 'significant' : 'not significant'
    
    return `${strength} ${direction} correlation (r=${correlation.toFixed(2)}, p=${pValue.toFixed(3)}) - ${significance}`
  }

  // ============================================================================
  // Trend Analysis
  // ============================================================================

  private async analyzeTrends(modelResults: ModelResult[]): Promise<TrendAnalysis[]> {
    const trends: TrendAnalysis[] = []
    const metricIds = this.getCommonMetricIds(modelResults)
    
    for (const metricId of metricIds) {
      // Analyze performance over time (task order)
      for (const model of modelResults) {
        const values = model.taskResults
          .filter(task => {
            const metric = task.metrics.find(m => m.metricId === metricId)
            return metric && !metric.error
          })
          .map((task, index) => ({
            x: index,
            y: task.metrics.find(m => m.metricId === metricId)!.value,
          }))
        
        if (values.length > 2) {
          const trend = this.linearRegression(values)
          const rSquared = this.calculateRSquared(values, trend)
          const significance = this.trendSignificanceTest(trend.slope, values.length)
          
          trends.push({
            variable: `${model.modelId}_${metricId}`,
            trend: this.classifyTrend(trend.slope, rSquared),
            slope: trend.slope,
            rSquared,
            significance,
            interpretation: this.interpretTrend(trend.slope, rSquared, significance),
          })
        }
      }
    }
    
    return trends
  }

  private linearRegression(points: { x: number; y: number }[]): {
    slope: number
    intercept: number
  } {
    const n = points.length
    const sumX = points.reduce((sum, p) => sum + p.x, 0)
    const sumY = points.reduce((sum, p) => sum + p.y, 0)
    const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0)
    const sumX2 = points.reduce((sum, p) => sum + p.x * p.x, 0)
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    
    return { slope, intercept }
  }

  private calculateRSquared(
    points: { x: number; y: number }[],
    regression: { slope: number; intercept: number }
  ): number {
    const yMean = points.reduce((sum, p) => sum + p.y, 0) / points.length
    
    const totalSS = points.reduce((sum, p) => sum + Math.pow(p.y - yMean, 2), 0)
    const residualSS = points.reduce(
      (sum, p) => sum + Math.pow(p.y - (regression.slope * p.x + regression.intercept), 2),
      0
    )
    
    return totalSS === 0 ? 0 : 1 - residualSS / totalSS
  }

  private trendSignificanceTest(slope: number, n: number): boolean {
    // Simplified significance test for trend
    // In practice, would calculate standard error of slope
    return Math.abs(slope) > 0.01
  }

  private classifyTrend(slope: number, rSquared: number): TrendAnalysis['trend'] {
    if (rSquared < 0.1) return 'stable'
    if (Math.abs(slope) < 0.01) return 'stable'
    if (slope > 0) return 'increasing'
    if (slope < -0.01) return 'decreasing'
    return 'volatile'
  }

  private interpretTrend(slope: number, rSquared: number, significance: boolean): string {
    const trend = this.classifyTrend(slope, rSquared)
    const strength = rSquared > 0.5 ? 'strong' : rSquared > 0.2 ? 'moderate' : 'weak'
    const sig = significance ? 'significant' : 'not significant'
    
    return `${strength} ${trend} trend (slope=${slope.toFixed(4)}, R²=${rSquared.toFixed(2)}) - ${sig}`
  }

  // ============================================================================
  // Statistical Utilities
  // ============================================================================

  private mean(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0) / values.length
  }

  private variance(values: number[]): number {
    const meanValue = this.mean(values)
    return values.reduce((sum, val) => sum + Math.pow(val - meanValue, 2), 0) / (values.length - 1)
  }

  private standardDeviation(values: number[]): number {
    return Math.sqrt(this.variance(values))
  }

  private normalCDF(x: number): number {
    // Approximation of normal CDF
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)))
  }

  private tDistributionCDF(t: number, df: number): number {
    // Simplified t-distribution CDF approximation
    // For large df, approximates normal distribution
    if (df > 30) {
      return this.normalCDF(t)
    }
    
    // For smaller df, would need more precise calculation
    return this.normalCDF(t)
  }

  private erf(x: number): number {
    // Approximation of error function
    const a1 = 0.254829592
    const a2 = -0.284496736
    const a3 = 1.421413741
    const a4 = -1.453152027
    const a5 = 1.061405429
    const p = 0.3275911
    
    const sign = x >= 0 ? 1 : -1
    x = Math.abs(x)
    
    const t = 1.0 / (1.0 + p * x)
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
    
    return sign * y
  }
}
