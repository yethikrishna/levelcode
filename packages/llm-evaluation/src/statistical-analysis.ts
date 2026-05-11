import type {
  StatisticalSummary,
  ComparisonResult,
  TrendAnalysis,
  EvaluationResult,
  ModelReport,
  MetricResult
} from './types'

// ============================================================================
// Statistical Analyzer
// ============================================================================

export class StatisticalAnalyzer {
  // --------------------------------------------------------------------------
  // Summary Statistics
  // --------------------------------------------------------------------------

  generateSummary(results: EvaluationResult[]): StatisticalSummary[] {
    if (results.length === 0) {
      return []
    }

    // Group metrics by ID
    const metricsByType = new Map<string, number[]>()
    
    for (const result of results) {
      if (result.error) continue // Skip failed results
      
      for (const metric of result.metrics) {
        if (!metricsByType.has(metric.metricId)) {
          metricsByType.set(metric.metricId, [])
        }
        metricsByType.get(metric.metricId)!.push(metric.value)
      }
    }

    // Generate summary for each metric
    const summaries: StatisticalSummary[] = []
    
    for (const [metricId, values] of metricsByType) {
      if (values.length === 0) continue
      
      const sorted = [...values].sort((a, b) => a - b)
      const mean = this.calculateMean(values)
      const median = this.calculateMedian(sorted)
      const stdDev = this.calculateStandardDeviation(values, mean)
      const q25 = this.calculatePercentile(sorted, 25)
      const q75 = this.calculatePercentile(sorted, 75)
      const confidenceInterval = this.calculateConfidenceInterval(values, mean)
      
      summaries.push({
        metricId,
        count: values.length,
        mean,
        median,
        stdDev,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        q25,
        q75,
        confidenceInterval
      })
    }
    
    return summaries
  }

  // --------------------------------------------------------------------------
  // Model Comparisons
  // --------------------------------------------------------------------------

  compareModels(modelReports: ModelReport[]): ComparisonResult[] {
    const comparisons: ComparisonResult[] = []
    
    // Compare each pair of models
    for (let i = 0; i < modelReports.length; i++) {
      for (let j = i + 1; j < modelReports.length; j++) {
        const modelA = modelReports[i]
        const modelB = modelReports[j]
        
        // Compare each metric
        for (const metricA of modelA.summary) {
          const metricB = modelB.summary.find(m => m.metricId === metricA.metricId)
          if (!metricB) continue
          
          const comparison = this.compareMetricValues(
            modelA.modelId,
            modelB.modelId,
            metricA,
            metricB
          )
          
          comparisons.push(comparison)
        }
      }
    }
    
    return comparisons
  }

  private compareMetricValues(
    modelAId: string,
    modelBId: string,
    metricA: StatisticalSummary,
    metricB: StatisticalSummary
  ): ComparisonResult {
    const difference = metricA.mean - metricB.mean
    
    // Perform t-test for significance
    const tStat = this.calculateTStatistic(metricA, metricB)
    const degreesOfFreedom = metricA.count + metricB.count - 2
    const pValue = this.calculatePValue(tStat, degreesOfFreedom)
    
    // Calculate effect size (Cohen's d)
    const pooledStdDev = Math.sqrt(
      ((metricA.count - 1) * metricA.stdDev * metricA.stdDev + 
       (metricB.count - 1) * metricB.stdDev * metricB.stdDev) /
      (metricA.count + metricB.count - 2)
    )
    const effectSize = pooledStdDev > 0 ? difference / pooledStdDev : 0
    
    // Determine winner
    const significance = 0.05 // Standard significance level
    const isSignificant = pValue < significance
    let winner: 'A' | 'B' | 'tie' = 'tie'
    
    if (isSignificant) {
      winner = difference > 0 ? 'A' : 'B'
    }
    
    return {
      modelA: modelAId,
      modelB: modelBId,
      metricId: metricA.metricId,
      difference,
      significance: isSignificant ? 1 - pValue : 0,
      pValue,
      effectSize,
      winner
    }
  }

  // --------------------------------------------------------------------------
  // Trend Analysis
  // --------------------------------------------------------------------------

  async analyzeTrends(modelReports: ModelReport[]): Promise<TrendAnalysis[]> {
    // In a real implementation, this would load historical data
    // For now, we'll generate mock trend data
    const trends: TrendAnalysis[] = []
    
    for (const report of modelReports) {
      for (const metric of report.summary) {
        // Generate mock time series data
        const timePoints = this.generateMockTimeSeries(metric)
        const trend = this.calculateTrend(timePoints)
        
        trends.push({
          metricId: metric.metricId,
          modelId: report.modelId,
          timePoints,
          trend: trend.direction,
          slope: trend.slope,
          rSquared: trend.rSquared
        })
      }
    }
    
    return trends
  }

  private generateMockTimeSeries(metric: StatisticalSummary): Array<{
    timestamp: Date
    value: number
  }> {
    const timePoints: Array<{ timestamp: Date; value: number }> = []
    const now = new Date()
    const numPoints = 30 // 30 days of data
    
    for (let i = numPoints - 1; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      
      // Generate values with some noise around the mean
      const noise = (Math.random() - 0.5) * metric.stdDev * 0.5
      const trend = i * 0.001 // Slight upward trend
      const value = Math.max(0, metric.mean + noise + trend)
      
      timePoints.push({ timestamp, value })
    }
    
    return timePoints
  }

  private calculateTrend(
    timePoints: Array<{ timestamp: Date; value: number }>
  ): {
    direction: 'improving' | 'degrading' | 'stable'
    slope: number
    rSquared: number
  } {
    if (timePoints.length < 2) {
      return { direction: 'stable', slope: 0, rSquared: 0 }
    }
    
    // Simple linear regression
    const n = timePoints.length
    const x = timePoints.map((_, i) => i) // Use index as x
    const y = timePoints.map(p => p.value)
    
    const sumX = x.reduce((sum, val) => sum + val, 0)
    const sumY = y.reduce((sum, val) => sum + val, 0)
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0)
    const sumXX = x.reduce((sum, val) => sum + val * val, 0)
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    
    // Calculate R-squared
    const meanY = sumY / n
    const ssTotal = y.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0)
    const ssResidual = y.reduce((sum, val, i) => {
      const predicted = intercept + slope * x[i]
      return sum + Math.pow(val - predicted, 2)
    }, 0)
    
    const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0
    
    // Determine trend direction
    let direction: 'improving' | 'degrading' | 'stable' = 'stable'
    
    if (Math.abs(slope) > 0.001) {
      direction = slope > 0 ? 'improving' : 'degrading'
    }
    
    return { direction, slope, rSquared }
  }

  // --------------------------------------------------------------------------
  // Statistical Helper Functions
  // --------------------------------------------------------------------------

  private calculateMean(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0) / values.length
  }

  private calculateMedian(sortedValues: number[]): number {
    const n = sortedValues.length
    
    if (n % 2 === 0) {
      return (sortedValues[n / 2 - 1] + sortedValues[n / 2]) / 2
    } else {
      return sortedValues[Math.floor(n / 2)]
    }
  }

  private calculateStandardDeviation(values: number[], mean: number): number {
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    return Math.sqrt(variance)
  }

  private calculatePercentile(sortedValues: number[], percentile: number): number {
    const index = (percentile / 100) * (sortedValues.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    
    if (lower === upper) {
      return sortedValues[lower]
    }
    
    const weight = index - lower
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight
  }

  private calculateConfidenceInterval(
    values: number[],
    mean: number,
    confidence: number = 0.95
  ): [number, number] {
    const n = values.length
    const stdDev = this.calculateStandardDeviation(values, mean)
    
    // For large samples, use z-score (1.96 for 95% confidence)
    // For small samples, use t-distribution
    const zScore = n > 30 ? 1.96 : this.calculateTCritical(n - 1, confidence)
    
    const margin = zScore * (stdDev / Math.sqrt(n))
    
    return [mean - margin, mean + margin]
  }

  private calculateTCritical(degreesOfFreedom: number, confidence: number): number {
    // Simplified t-critical values lookup
    // In production, use a proper t-distribution library
    const tTable: Record<number, number> = {
      1: 12.706,
      2: 4.303,
      3: 3.182,
      4: 2.776,
      5: 2.571,
      10: 2.228,
      20: 2.086,
      30: 2.042,
      50: 2.009,
      100: 1.984,
      Infinity: 1.96
    }
    
    // Find closest degrees of freedom
    const dfKeys = Object.keys(tTable).map(Number).sort((a, b) => a - b)
    
    for (const df of dfKeys) {
      if (degreesOfFreedom <= df) {
        return tTable[df]
      }
    }
    
    return tTable[Infinity]
  }

  private calculateTStatistic(
    metricA: StatisticalSummary,
    metricB: StatisticalSummary
  ): number {
    const diff = metricA.mean - metricB.mean
    
    const pooledVariance =
      ((metricA.count - 1) * metricA.stdDev * metricA.stdDev +
       (metricB.count - 1) * metricB.stdDev * metricB.stdDev) /
      (metricA.count + metricB.count - 2)
    
    const standardError = Math.sqrt(
      pooledVariance * (1 / metricA.count + 1 / metricB.count)
    )
    
    return standardError > 0 ? diff / standardError : 0
  }

  private calculatePValue(tStatistic: number, degreesOfFreedom: number): number {
    // Simplified p-value calculation
    // In production, use a proper statistical library
    
    const absT = Math.abs(tStatistic)
    
    // For large degrees of freedom, approximate with normal distribution
    if (degreesOfFreedom > 30) {
      // Two-tailed test
      return 2 * (1 - this.normalCDF(absT))
    }
    
    // For small samples, this is a rough approximation
    // Real implementation would use t-distribution CDF
    return Math.max(0.001, Math.min(0.999, 2 * (1 - this.normalCDF(absT))))
  }

  private normalCDF(x: number): number {
    // Approximation of normal CDF
    const a1 = 0.254829592
    const a2 = -0.284496736
    const a3 = 1.421413741
    const a4 = -1.453152027
    const a5 = 1.061405429
    const p = 0.3275911
    
    const sign = x < 0 ? -1 : 1
    x = Math.abs(x) / Math.sqrt(2)
    
    const t = 1 / (1 + p * x)
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
    
    return 0.5 * (1 + sign * y)
  }

  // --------------------------------------------------------------------------
  // Advanced Analysis
  // --------------------------------------------------------------------------

  detectOutliers(values: number[]): {
    outliers: number[]
    indices: number[]
    method: 'iqr' | 'zscore'
  } {
    const sorted = [...values].sort((a, b) => a - b)
    const q1 = this.calculatePercentile(sorted, 25)
    const q3 = this.calculatePercentile(sorted, 75)
    const iqr = q3 - q1
    
    const lowerBound = q1 - 1.5 * iqr
    const upperBound = q3 + 1.5 * iqr
    
    const outliers: number[] = []
    const indices: number[] = []
    
    values.forEach((value, index) => {
      if (value < lowerBound || value > upperBound) {
        outliers.push(value)
        indices.push(index)
      }
    })
    
    return { outliers, indices, method: 'iqr' }
  }

  calculateCorrelation(x: number[], y: number[]): {
    correlation: number
    pValue: number
  } {
    if (x.length !== y.length || x.length < 2) {
      return { correlation: 0, pValue: 1 }
    }
    
    const n = x.length
    const meanX = this.calculateMean(x)
    const meanY = this.calculateMean(y)
    
    let numerator = 0
    let sumSqX = 0
    let sumSqY = 0
    
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX
      const dy = y[i] - meanY
      numerator += dx * dy
      sumSqX += dx * dx
      sumSqY += dy * dy
    }
    
    const denominator = Math.sqrt(sumSqX * sumSqY)
    const correlation = denominator > 0 ? numerator / denominator : 0
    
    // Calculate p-value for correlation
    const tStat = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation))
    const pValue = this.calculatePValue(tStat, n - 2)
    
    return { correlation, pValue }
  }

  performAnova(
    groups: Array<{ name: string; values: number[] }>
  ): {
    fStatistic: number
    pValue: number
    groupMeans: Array<{ name: string; mean: number; stdDev: number }>
  } {
    if (groups.length < 2) {
      return { fStatistic: 0, pValue: 1, groupMeans: [] }
    }
    
    // Calculate group statistics
    const groupStats = groups.map(group => ({
      name: group.name,
      mean: this.calculateMean(group.values),
      stdDev: this.calculateStandardDeviation(group.values, this.calculateMean(group.values)),
      count: group.values.length
    }))
    
    // Calculate overall mean
    const allValues = groups.flatMap(g => g.values)
    const overallMean = this.calculateMean(allValues)
    
    // Calculate between-group and within-group variance
    let ssBetween = 0
    let ssWithin = 0
    
    for (const stat of groupStats) {
      ssBetween += stat.count * Math.pow(stat.mean - overallMean, 2)
      
      for (const value of groups.find(g => g.name === stat.name)!.values) {
        ssWithin += Math.pow(value - stat.mean, 2)
      }
    }
    
    const dfBetween = groups.length - 1
    const dfWithin = allValues.length - groups.length
    
    const msBetween = ssBetween / dfBetween
    const msWithin = ssWithin / dfWithin
    
    const fStatistic = msWithin > 0 ? msBetween / msWithin : 0
    const pValue = 1 - this.fCDF(fStatistic, dfBetween, dfWithin)
    
    return {
      fStatistic,
      pValue,
      groupMeans: groupStats.map(stat => ({
        name: stat.name,
        mean: stat.mean,
        stdDev: stat.stdDev
      }))
    }
  }

  private fCDF(x: number, df1: number, df2: number): number {
    // Simplified F-distribution CDF approximation
    // In production, use a proper statistical library
    return Math.min(0.999, Math.max(0.001, x / (x + df2 / df1)))
  }
}
