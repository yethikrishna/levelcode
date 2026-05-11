import type { LoggingConfig } from '../types'
import type { ResourceMonitor } from './types'

// ============================================================================
// Metrics Logger
// ============================================================================

export class MetricsLogger {
  private config: LoggingConfig
  private metrics: Map<string, any[]> = new Map()
  private logBuffer: string[] = []
  private startTime: Date = new Date()

  constructor(config: LoggingConfig) {
    this.config = config
  }

  logMetric(name: string, value: number, step?: number, epoch?: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }

    const metricEntry = {
      value,
      timestamp: new Date(),
      step: step || 0,
      epoch: epoch || 0
    }

    this.metrics.get(name)!.push(metricEntry)

    // Log to console if enabled
    if (this.config.logToConsole) {
      this.logToConsole(name, metricEntry)
    }

    // Log to file if enabled
    if (this.config.logToFile) {
      this.logToFile(name, metricEntry)
    }

    // Log to Weights & Biases if enabled
    if (this.config.logToWandb) {
      this.logToWandb(name, metricEntry)
    }

    // Log to TensorBoard if enabled
    if (this.config.logToTensorboard) {
      this.logToTensorboard(name, metricEntry)
    }
  }

  logResourceUsage(usage: ResourceMonitor): void {
    this.logMetric('cpu_usage', usage.cpuUsage)
    this.logMetric('memory_usage', usage.memoryUsage)
    
    if (usage.gpuMemoryUsage) {
      usage.gpuMemoryUsage.forEach((gpuMem, index) => {
        this.logMetric(`gpu_memory_${index}`, gpuMem)
      })
    }

    if (usage.networkIO) {
      this.logMetric('network_in', usage.networkIO.bytesIn)
      this.logMetric('network_out', usage.networkIO.bytesOut)
    }
  }

  logHyperparams(hyperparams: Record<string, any>): void {
    // Log hyperparameters at the start of training
    if (this.config.logToWandb) {
      this.logHyperparamsToWandb(hyperparams)
    }

    if (this.config.logToFile) {
      this.logHyperparamsToFile(hyperparams)
    }
  }

  logSystemInfo(info: Record<string, any>): void {
    // Log system information
    if (this.config.logToWandb) {
      this.logSystemInfoToWandb(info)
    }

    if (this.config.logToFile) {
      this.logSystemInfoToFile(info)
    }
  }

  logMessage(level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR', message: string, metadata?: any): void {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] [${level}] ${message}`

    if (this.shouldLog(level)) {
      console.log(logEntry)
    }

    if (this.config.logToFile) {
      this.logBuffer.push(logEntry)
      if (metadata) {
        this.logBuffer.push(`  Metadata: ${JSON.stringify(metadata)}`)
      }
    }
  }

  getMetricHistory(name: string): any[] {
    return this.metrics.get(name) || []
  }

  getLatestMetric(name: string): number | null {
    const history = this.metrics.get(name)
    return history && history.length > 0 ? history[history.length - 1].value : null
  }

  getMetricAverage(name: string, lastN?: number): number | null {
    const history = this.metrics.get(name)
    if (!history || history.length === 0) {
      return null
    }

    const relevantHistory = lastN ? history.slice(-lastN) : history
    const sum = relevantHistory.reduce((acc, entry) => acc + entry.value, 0)
    return sum / relevantHistory.length
  }

  getAllMetrics(): Record<string, any[]> {
    const result: Record<string, any[]> = {}
    for (const [name, values] of this.metrics.entries()) {
      result[name] = values
    }
    return result
  }

  async saveLogs(): Promise<string> {
    if (!this.config.logToFile) {
      throw new Error('File logging not enabled')
    }

    const fs = await import('fs/promises')
    const pathModule = await import('path')

    const logsDir = './logs'
    await fs.mkdir(logsDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const logFileName = this.config.experimentName 
      ? `${this.config.experimentName}_${timestamp}.log`
      : `training_${timestamp}.log`
    
    const logPath = pathModule.join(logsDir, logFileName)

    // Write log buffer to file
    const logContent = this.logBuffer.join('\n')
    await fs.writeFile(logPath, logContent, 'utf-8')

    // Save metrics as JSON
    const metricsPath = pathModule.join(logsDir, logFileName.replace('.log', '_metrics.json'))
    const metricsContent = JSON.stringify(this.getAllMetrics(), null, 2)
    await fs.writeFile(metricsPath, metricsContent, 'utf-8')

    return logPath
  }

  createReport(): {
    summary: Record<string, any>
    charts: Array<{
      name: string
      data: any[]
      type: 'line' | 'scatter'
    }>
  } {
    const report: any = {
      summary: {},
      charts: []
    }

    // Calculate summary statistics
    for (const [name, values] of this.metrics.entries()) {
      if (values.length > 0) {
        const numericValues = values.map(v => v.value)
        report.summary[name] = {
          latest: numericValues[numericValues.length - 1],
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          mean: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
          count: numericValues.length
        }

        // Create chart data
        report.charts.push({
          name,
          data: values.map(v => ({
            x: v.step,
            y: v.value,
            timestamp: v.timestamp
          })),
          type: 'line'
        })
      }
    }

    return report
  }

  // Private methods
  private shouldLog(level: string): boolean {
    const levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR']
    const configLevel = levels.indexOf(this.config.level)
    const messageLevel = levels.indexOf(level)
    return messageLevel >= configLevel
  }

  private logToConsole(name: string, entry: any): void {
    const message = `${name}: ${entry.value.toFixed(6)} (step: ${entry.step}, epoch: ${entry.epoch})`
    console.log(`[${new Date().toISOString()}] ${message}`)
  }

  private async logToFile(name: string, entry: any): Promise<void> {
    const logLine = `[${entry.timestamp.toISOString()}] METRIC ${name}: ${entry.value} (step: ${entry.step}, epoch: ${entry.epoch})`
    this.logBuffer.push(logLine)
  }

  private logToWandb(name: string, entry: any): void {
    // In production, use wandb library
    // wandb.log({ [name]: entry.value, step: entry.step, epoch: entry.epoch })
  }

  private logToTensorboard(name: string, entry: any): void {
    // In production, use tensorboard logger
    // writer.add_scalar(name, entry.value, entry.step)
  }

  private logHyperparamsToWandb(hyperparams: Record<string, any>): void {
    // wandb.config.update(hyperparams)
  }

  private async logHyperparamsToFile(hyperparams: Record<string, any>): Promise<void> {
    const hyperparamsLine = `[${new Date().toISOString()}] HYPERPARAMS ${JSON.stringify(hyperparams)}`
    this.logBuffer.push(hyperparamsLine)
  }

  private logSystemInfoToWandb(info: Record<string, any>): void {
    // wandb.config.update(info)
  }

  private async logSystemInfoToFile(info: Record<string, any>): Promise<void> {
    const infoLine = `[${new Date().toISOString()}] SYSTEM_INFO ${JSON.stringify(info)}`
    this.logBuffer.push(infoLine)
  }

  // Advanced logging features
  logLearningRateSchedule(schedule: Array<{ step: number; lr: number }>): void {
    this.logMetric('learning_rate_schedule', schedule[schedule.length - 1].lr, schedule[schedule.length - 1].step)
    
    // Log the entire schedule as a custom metric
    if (this.config.logToWandb) {
      // wandb.log({ 'learning_rate_schedule_curve': schedule })
    }
  }

  logModelStatistics(stats: {
    totalParameters: number
    trainableParameters: number
    modelSizeMB: number
    flops?: number
  }): void {
    this.logMetric('total_parameters', stats.totalParameters)
    this.logMetric('trainable_parameters', stats.trainableParameters)
    this.logMetric('model_size_mb', stats.modelSizeMB)
    
    if (stats.flops) {
      this.logMetric('model_flops', stats.flops)
    }
  }

  logGradientStatistics(stats: {
    gradNorm: number
    gradMax: number
    gradMean: number
    gradStd: number
  }): void {
    this.logMetric('gradient_norm', stats.gradNorm)
    this.logMetric('gradient_max', stats.gradMax)
    this.logMetric('gradient_mean', stats.gradMean)
    this.logMetric('gradient_std', stats.gradStd)
  }

  logBatchStatistics(stats: {
    batchSize: number
    sequenceLength: {
      mean: number
      max: number
      min: number
    }
    loss: number
    throughput: number
  }): void {
    this.logMetric('batch_size', stats.batchSize)
    this.logMetric('sequence_length_mean', stats.sequenceLength.mean)
    this.logMetric('sequence_length_max', stats.sequenceLength.max)
    this.logMetric('sequence_length_min', stats.sequenceLength.min)
    this.logMetric('batch_throughput', stats.throughput)
  }

  logCustomMetric(name: string, value: any, metadata?: any): void {
    // Handle different types of custom metrics
    if (typeof value === 'number') {
      this.logMetric(name, value)
    } else if (typeof value === 'string') {
      this.logMessage('INFO', `CUSTOM_METRIC ${name}: ${value}`, metadata)
    } else if (typeof value === 'object') {
      this.logMessage('INFO', `CUSTOM_METRIC ${name}: ${JSON.stringify(value)}`, metadata)
    }
  }

  // Performance monitoring
  startTimer(name: string): () => void {
    const startTime = Date.now()
    return () => {
      const duration = Date.now() - startTime
      this.logMetric(`${name}_duration_ms`, duration)
    }
  }

  measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const endTimer = this.startTimer(name)
    return fn().finally(() => {
      endTimer()
    })
  }

  // Memory and GPU monitoring
  logMemoryBreakdown(breakdown: {
    model: number
    optimizer: number
    gradients: number
    activations: number
    other: number
  }): void {
    this.logMetric('memory_model_mb', breakdown.model)
    this.logMetric('memory_optimizer_mb', breakdown.optimizer)
    this.logMetric('memory_gradients_mb', breakdown.gradients)
    this.logMetric('memory_activations_mb', breakdown.activations)
    this.logMetric('memory_other_mb', breakdown.other)
    
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
    this.logMetric('memory_total_mb', total)
  }

  // Export and analysis
  exportMetrics(format: 'json' | 'csv' | 'tsv'): string {
    const allMetrics = this.getAllMetrics()
    
    switch (format) {
      case 'json':
        return JSON.stringify(allMetrics, null, 2)
      
      case 'csv':
        return this.metricsToCSV(allMetrics)
      
      case 'tsv':
        return this.metricsToCSV(allMetrics, '\t')
      
      default:
        throw new Error(`Unsupported format: ${format}`)
    }
  }

  private metricsToCSV(metrics: Record<string, any[]>, delimiter: string = ','): string {
    const lines: string[] = []
    
    // Header
    lines.push(['metric', 'value', 'timestamp', 'step', 'epoch'].join(delimiter))
    
    // Data rows
    for (const [metricName, entries] of Object.entries(metrics)) {
      for (const entry of entries) {
        lines.push([
          metricName,
          entry.value.toString(),
          entry.timestamp.toISOString(),
          entry.step.toString(),
          entry.epoch.toString()
        ].join(delimiter))
      }
    }
    
    return lines.join('\n')
  }

  analyzeMetrics(): {
    trends: Record<string, 'improving' | 'degrading' | 'stable'>
    anomalies: Array<{
      metric: string
      timestamp: Date
      value: number
      severity: 'low' | 'medium' | 'high'
    }>
  } {
    const trends: Record<string, 'improving' | 'degrading' | 'stable'> = {}
    const anomalies: any[] = []

    // Analyze each metric
    for (const [name, values] of this.metrics.entries()) {
      if (values.length < 10) continue // Not enough data

      const numericValues = values.map(v => v.value)
      
      // Simple trend analysis
      const recentValues = numericValues.slice(-10)
      const olderValues = numericValues.slice(-20, -10)
      
      const recentAvg = recentValues.reduce((a, b) => a + b, 0) / recentValues.length
      const olderAvg = olderValues.reduce((a, b) => a + b, 0) / olderValues.length
      
      const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100
      
      if (Math.abs(changePercent) < 5) {
        trends[name] = 'stable'
      } else if (name.includes('loss') || name.includes('error')) {
        trends[name] = changePercent < 0 ? 'improving' : 'degrading'
      } else {
        trends[name] = changePercent > 0 ? 'improving' : 'degrading'
      }

      // Simple anomaly detection
      const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length
      const std = Math.sqrt(numericValues.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / numericValues.length)
      
      for (const entry of values.slice(-5)) {
        const zScore = Math.abs((entry.value - mean) / std)
        if (zScore > 2) {
          anomalies.push({
            metric: name,
            timestamp: entry.timestamp,
            value: entry.value,
            severity: zScore > 3 ? 'high' : 'medium'
          })
        }
      }
    }

    return { trends, anomalies }
  }
}