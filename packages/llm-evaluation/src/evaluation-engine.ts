<code>
import { nanoid } from 'nanoid'
import { EventEmitter } from 'events'
import type {
  EvaluationConfig,
  EvaluationResult,
  ModelResult,
  TaskResult,
  ModelOutput,
  EvaluationProgress,
  ModelConfig,
  BenchmarkTask,
  EvaluationError,
  ModelError,
  MetricError,
  EvaluationStatus,
  HookContext,
  CacheConfig,
} from './types'
import { MetricsCollector } from './metrics-collector'
import { BenchmarkLoader } from './benchmark-loader'
import { ModelExecutor } from './model-executor'
import { ResultAggregator } from './result-aggregator'
import { CacheManager } from './cache-manager'
import { Logger } from './logger'
import { Validator } from './validator'

// ============================================================================
// Evaluation Engine Options
// ============================================================================

export interface EvaluationEngineOptions {
  /** Callback for individual task results */
  onDataPoint?: (result: TaskResult) => void | Promise<void>
  /** Callback for progress updates */
  onProgress?: (progress: EvaluationProgress) => void | Promise<void>
  /** Callback for errors */
  onError?: (error: Error, context?: HookContext) => void | Promise<void>
  /** Callback for evaluation lifecycle events */
  onLifecycleEvent?: (event: string, context?: HookContext) => void | Promise<void>
  /** Custom hooks for extending functionality */
  hooks?: {
    beforeTask?: (task: BenchmarkTask, model: ModelConfig) => Promise<void>
    afterTask?: (result: TaskResult) => Promise<void>
    beforeModel?: (model: ModelConfig) => Promise<void>
    afterModel?: (result: ModelResult) => Promise<void>
    onError?: (error: Error, context: HookContext) => Promise<boolean> // Return true to continue
  }
  /** Retry configuration */
  retry?: {
    maxAttempts: number
    baseDelay: number
    maxDelay: number
    backoffMultiplier: number
  }
  /** Logger instance */
  logger?: Logger
}

// ============================================================================
// Evaluation Engine
// ============================================================================

export class EvaluationEngine extends EventEmitter {
  private metricsCollector: MetricsCollector
  private benchmarkLoader: BenchmarkLoader
  private modelExecutor: ModelExecutor
  private resultAggregator: ResultAggregator
  private cacheManager: CacheManager
  private validator: Validator
  private logger: Logger
  private isRunning = false
  private shouldStop = false
  private currentEvaluationId?: string
  private taskQueue: Array<{
    model: ModelConfig
    task: BenchmarkTask
    attempt: number
  }> = []

  constructor(
    private config: EvaluationConfig,
    private options: EvaluationEngineOptions = {}
  ) {
    super()
    
    this.logger = options.logger || new Logger({ level: 'info' })
    this.validator = new Validator()
    this.metricsCollector = new MetricsCollector(config.metrics, this.logger)
    this.benchmarkLoader = new BenchmarkLoader(this.logger)
    this.modelExecutor = new ModelExecutor(config, this.logger)
    this.resultAggregator = new ResultAggregator(config.metrics, this.logger)
    this.cacheManager = new CacheManager(config.cacheResults || {} as CacheConfig, this.logger)
  }

  // --------------------------------------------------------------------------
  // Main Evaluation Execution
  // --------------------------------------------------------------------------

  async runEvaluation(): Promise<EvaluationResult> {
    if (this.isRunning) {
      throw new EvaluationError('Evaluation is already running', 'EVALUATION_IN_PROGRESS')
    }

    await this.validateConfig()
    
    this.isRunning = true
    this.shouldStop = false
    this.currentEvaluationId = nanoid()
    const startTime = Date.now()
    
    this.logger.info(`Starting evaluation ${this.currentEvaluationId}`)
    await this.emitLifecycleEvent('evaluation:started', { evaluationId: this.currentEvaluationId })

    const result: EvaluationResult = {
      id: this.currentEvaluationId,
      configId: this.config.id,
      timestamp: new Date(),
      status: 'running',
      progress: {
        total: 0,
        completed: 0,
        failed: 0,
        currentTask: undefined,
        currentModel: undefined,
      },
      modelResults: [],
      summary: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        totalCost: 0,
        totalTime: 0,
        averageLatency: 0,
        rankings: [],
        insights: [],
      },
      metadata: {
        startTime,
        config: this.config,
        version: process.env.npm_package_version || '1.0.0',
      },
    }

    try {
      // Load benchmark tasks
      const tasks = await this.loadBenchmarkTasks()
      
      // Initialize progress tracking
      const totalTasks = tasks.length * this.config.models.length
      result.progress.total = totalTasks
      result.summary.totalTasks = totalTasks
      
      this.logger.info(`Loaded ${tasks.length} benchmark tasks for ${this.config.models.length} models`)

      // Check cache first
      if (this.config.cacheResults?.enabled) {
        await this.loadCachedResults(tasks, result)
      }

      // Prepare task queue
      this.prepareTaskQueue(tasks, result)

      // Execute tasks based on parallelization config
      if (this.config.parallelization?.enabled) {
        await this.executeParallel(result)
      } else {
        await this.executeSequential(result)
      }

      // Generate final summary and insights
      await this.generateFinalSummary(result)
      
      result.status = 'completed'
      this.logger.info(`Evaluation ${this.currentEvaluationId} completed successfully`)
      
      // Cache results if enabled
      if (this.config.cacheResults?.enabled) {
        await this.cacheManager.saveResults(this.currentEvaluationId, result)
      }

      await this.emitLifecycleEvent('evaluation:completed', { evaluationId: this.currentEvaluationId, result })
      
      return result

    } catch (error) {
      result.status = 'failed'
      result.error = error instanceof Error ? error.message : String(error)
      
      this.logger.error(`Evaluation ${this.currentEvaluationId} failed:`, error)
      await this.options.onError?.(error as Error, { 
        evaluationId: this.currentEvaluationId,
        phase: 'evaluation' 
      })
      await this.emitLifecycleEvent('evaluation:failed', { 
        evaluationId: this.currentEvaluationId, 
        error 
      })
      
      throw error
    } finally {
      this.isRunning = false
      this.taskQueue = []
      
      if (result.metadata) {
        result.metadata.endTime = Date.now()
        result.metadata.duration = Date.now() - startTime
      }
    }
  }

  // --------------------------------------------------------------------------
  // Task Execution Methods
  // --------------------------------------------------------------------------

  private async executeSequential(result: EvaluationResult): Promise<void> {
    for (const model of this.config.models) {
      if (this.shouldStop) break
      
      await this.evaluateModel(model, result)
    }
  }

  private async executeParallel(result: EvaluationResult): Promise<void> {
    const maxConcurrency = this.config.parallelization?.maxConcurrency || 1
    const workers: Promise<void>[] = []
    
    for (let i = 0; i < maxConcurrency && i < this.config.models.length; i++) {
      workers.push(this.workerLoop(result))
    }
    
    await Promise.all(workers)
  }

  private async workerLoop(result: EvaluationResult): Promise<void> {
    while (this.taskQueue.length > 0 && !this.shouldStop) {
      const item = this.taskQueue.shift()
      if (!item) break
      
      await this.executeTaskWithRetry(item.model, item.task, item.attempt, result)
    }
  }

  private async executeTaskWithRetry(
    model: ModelConfig,
    task: BenchmarkTask,
    attempt: number,
    result: EvaluationResult
  ): Promise<void> {
    const maxAttempts = this.options.retry?.maxAttempts || 3
    
    try {
      await this.evaluateTask(model, task, result)
    } catch (error) {
      const shouldRetry = attempt < maxAttempts && !this.shouldStop
      
      if (shouldRetry) {
        const delay = this.calculateRetryDelay(attempt)
        this.logger.warn(`Task ${task.id} failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`)
        
        await new Promise(resolve => setTimeout(resolve, delay))
        
        // Re-queue for retry
        this.taskQueue.push({ model, task, attempt: attempt + 1 })
      } else {
        // Mark as failed
        result.progress.failed++
        await this.handleTaskError(error as Error, model, task, result)
      }
    }
  }

  // --------------------------------------------------------------------------
  // Core Evaluation Methods
  // --------------------------------------------------------------------------

  private async evaluateModel(
    model: ModelConfig,
    result: EvaluationResult
  ): Promise<void> {
    const modelResult: ModelResult = {
      modelId: model.id,
      modelName: model.name,
      status: 'running',
      taskResults: [],
      aggregatedMetrics: {},
      totalCost: 0,
      totalTime: 0,
    }

    result.modelResults.push(modelResult)
    result.progress.currentModel = model.name
    
    this.logger.info(`Starting evaluation for model: ${model.name}`)
    await this.emitLifecycleEvent('model:started', { modelId: model.id, modelName: model.name })
    
    try {
      await this.options.hooks?.beforeModel?.(model)
      
      // Find all tasks for this model
      const modelTasks = this.taskQueue.filter(item => item.model.id === model.id)
      
      for (const item of modelTasks) {
        if (this.shouldStop) break
        await this.executeTaskWithRetry(item.model, item.task, item.attempt, result)
      }
      
      // Calculate aggregated metrics
      modelResult.aggregatedMetrics = 
        await this.resultAggregator.aggregateMetrics(modelResult.taskResults)
      
      modelResult.status = 'completed'
      
      await this.options.hooks?.afterModel?.(modelResult)
      await this.emitLifecycleEvent('model:completed', { modelId: model.id, result: modelResult })
      
    } catch (error) {
      modelResult.status = 'failed'
      modelResult.error = error instanceof Error ? error.message : String(error)
      
      const modelError = new ModelError(
        `Model evaluation failed: ${model.name}`,
        model.id,
        error
      )
      
      await this.handleModelError(modelError, model, result)
    }
  }

  private async evaluateTask(
    model: ModelConfig,
    task: BenchmarkTask,
    result: EvaluationResult
  ): Promise<void> {
    const startTime = Date.now()
    result.progress.currentTask = task.name
    
    await this.options.hooks?.beforeTask?.(task, model)
    
    try {
      // Execute model
      const modelOutput = await this.modelExecutor.execute(model, task.input)
      const latency = Date.now() - startTime
      
      // Calculate metrics
      const metrics = await this.metricsCollector.calculateMetrics(
        modelOutput,
        task.expectedOutput,
        task.evaluationCriteria
      )
      
      // Calculate cost
      const cost = this.calculateCost(model, modelOutput)
      
      const taskResult: TaskResult = {
        taskId: task.id,
        taskName: task.name,
        input: task.input,
        output: modelOutput,
        expectedOutput: task.expectedOutput,
        metrics,
        latency,
        cost,
        timestamp: new Date(),
      }
      
      // Update model result
      const modelResult = result.modelResults.find(r => r.modelId === model.id)
      if (modelResult) {
        modelResult.taskResults.push(taskResult)
        modelResult.totalCost += cost
        modelResult.totalTime += latency
      }
      
      result.progress.completed++
      
      // Emit callbacks
      await this.options.onDataPoint?.(taskResult)
      await this.options.onProgress?.(result.progress)
      await this.options.hooks?.afterTask?.(taskResult)
      
    } catch (error) {
      const latency = Date.now() - startTime
      
      const errorTask: TaskResult = {
        taskId: task.id,
        taskName: task.name,
        input: task.input,
        output: {
          text: '',
          tokens: { prompt: 0, completion: 0, total: 0 },
          finishReason: 'error',
        },
        expectedOutput: task.expectedOutput,
        metrics: [],
        latency,
        cost: 0,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
      }
      
      // Update model result
      const modelResult = result.modelResults.find(r => r.modelId === model.id)
      if (modelResult) {
        modelResult.taskResults.push(errorTask)
      }
      
      throw error
    }
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  private async validateConfig(): Promise<void> {
    try {
      await this.validator.validateEvaluationConfig(this.config)
    } catch (error) {
      throw new EvaluationError(
        `Invalid configuration: ${error instanceof Error ? error.message : String(error)}`,
        'INVALID_CONFIG'
      )
    }
  }

  private async loadBenchmarkTasks(): Promise<BenchmarkTask[]> {
    const allTasks: BenchmarkTask[] = []
    
    for (const suiteId of this.config.benchmarkSuites) {
      try {
        const suite = await this.benchmarkLoader.loadSuite(suiteId)
        allTasks.push(...suite.tasks)
      } catch (error) {
        this.logger.error(`Failed to load benchmark suite ${suiteId}:`, error)
        throw new EvaluationError(
          `Failed to load benchmark suite: ${suiteId}`,
          'BENCHMARK_LOAD_ERROR',
          { suiteId }
        )
      }
    }
    
    return allTasks
  }

  private async loadCachedResults(
    tasks: BenchmarkTask[],
    result: EvaluationResult
  ): Promise<void> {
    for (const model of this.config.models) {
      try {
        const cached = await this.cacheManager.getResults(model.id, tasks)
        if (cached) {
          result.modelResults.push(cached)
          result.progress.completed += cached.taskResults.length
          result.summary.completedTasks = result.progress.completed
          
          this.logger.info(`Loaded ${cached.taskResults.length} cached results for model ${model.name}`)
        }
      } catch (error) {
        this.logger.warn(`Failed to load cached results for model ${model.name}:`, error)
      }
    }
  }

  private prepareTaskQueue(tasks: BenchmarkTask[], result: EvaluationResult): void {
    // Filter out already completed tasks from cache
    const completedTaskIds = new Set(
      result.modelResults.flatMap(mr => mr.taskResults.map(tr => tr.taskId))
    )
    
    for (const model of this.config.models) {
      for (const task of tasks) {
        if (!completedTaskIds.has(`${model.id}-${task.id}`)) {
          this.taskQueue.push({
            model,
            task,
            attempt: 1,
          })
        }
      }
    }
  }

  private async generateFinalSummary(result: EvaluationResult): Promise<void> {
    result.summary = await this.resultAggregator.generateSummary(result.modelResults)
    
    // Generate additional insights
    result.summary.insights = await this.generateInsights(result)
    
    // Generate rankings
    result.summary.rankings = this.generateRankings(result.modelResults)
  }

  private async generateInsights(result: EvaluationResult): Promise<string[]> {
    const insights: string[] = []
    
    // Performance insights
    const avgLatency = result.summary.averageLatency
    if (avgLatency > 5000) {
      insights.push('High average latency detected (>5s). Consider optimizing model or infrastructure.')
    }
    
    // Cost insights
    const avgCostPerTask = result.summary.totalCost / result.summary.totalTasks
    if (avgCostPerTask > 0.1) {
      insights.push('High cost per task detected. Consider using smaller models or caching.')
    }
    
    // Success rate insights
    const successRate = (result.summary.completedTasks / result.summary.totalTasks) * 100
    if (successRate < 90) {
      insights.push(`Low success rate (${successRate.toFixed(1)}%). Review error logs for common issues.`)
    }
    
    return insights
  }

  private generateRankings(modelResults: ModelResult[]): Array<{
    modelId: string
    modelName: string
    rank: number
    score: number
  }> {
    // Calculate overall scores for each model
    const scores = modelResults.map(mr => ({
      modelId: mr.modelId,
      modelName: mr.modelName,
      score: this.calculateOverallScore(mr),
    }))
    
    // Sort by score (descending)
    scores.sort((a, b) => b.score - a.score)
    
    // Assign ranks
    return scores.map((s, index) => ({
      ...s,
      rank: index + 1,
    }))
  }

  private calculateOverallScore(modelResult: ModelResult): number {
    // Weighted scoring based on metrics
    let totalScore = 0
    let totalWeight = 0
    
    for (const [metricId, value] of Object.entries(modelResult.aggregatedMetrics)) {
      const metricConfig = this.config.metrics.find(m => m.id === metricId)
      if (metricConfig) {
        const weight = metricConfig.weight || 1
        totalScore += value * weight
        totalWeight += weight
      }
    }
    
    return totalWeight > 0 ? totalScore / totalWeight : 0
  }

  private calculateCost(model: ModelConfig, output: ModelOutput): number {
    // Implementation would depend on provider-specific pricing
    const pricing = model.pricing
    if (!pricing) return 0
    
    return (
      (output.tokens.prompt / 1000) * pricing.promptPer1K +
      (output.tokens.completion / 1000) * pricing.completionPer1K
    )
  }

  private calculateRetryDelay(attempt: number): number {
    const config = this.options.retry
    if (!config) return 1000
    
    const delay = Math.min(
      config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
      config.maxDelay
    )
    
    // Add jitter to prevent thundering herd
    return delay + Math.random() * 1000
  }

  private async handleTaskError(
    error: Error,
    model: ModelConfig,
    task: BenchmarkTask,
    result: EvaluationResult
  ): Promise<void> {
    this.logger.error(`Task failed: ${task.id} for model ${model.name}`, error)
    
    const shouldContinue = await this.options.hooks?.onError?.(error, {
      modelId: model.id,
      taskId: task.id,
      phase: 'task',
    })
    
    if (shouldContinue === false) {
      this.shouldStop = true
      throw error
    }
    
    await this.options.onError?.(error, { 
      modelId: model.id, 
      taskId: task.id,
      phase: 'task'
    })
  }

  private async handleModelError(
    error: ModelError,
    model: ModelConfig,
    result: EvaluationResult
  ): Promise<void> {
    this.logger.error(`Model evaluation failed: ${model.name}`, error)
    
    const shouldContinue = await this.options.hooks?.onError?.(error, {
      modelId: model.id,
      phase: 'model',
    })
    
    if (shouldContinue === false) {
      this.shouldStop = true
      throw error
    }
    
    await this.options.onError?.(error, { 
      modelId: model.id,
      phase: 'model'
    })
  }

  private async emitLifecycleEvent(event: string, context?: any): Promise<void> {
    this.emit(event, context)
    await this.options.onLifecycleEvent?.(event, context)
  }

  // --------------------------------------------------------------------------
  // Public API Methods
  // --------------------------------------------------------------------------

  async cancelEvaluation(): Promise<void> {
    if (!this.isRunning) {
      return
    }
    
    this.logger.info('Cancelling evaluation...')
    this.shouldStop = true
    
    await this.modelExecutor.cancel()
    
    await this.emitLifecycleEvent('evaluation:cancelled', { 
      evaluationId: this.currentEvaluationId 
    })
  }

  async getProgress(): Promise<EvaluationProgress> {
    // Return current progress snapshot
    return {
      total: 0,
      completed: 0,
      failed: 0,
      currentTask: undefined,
      currentModel: undefined,
    }
  }

  isEvaluationRunning(): boolean {
    return this.isRunning
  }

  getCurrentEvaluationId(): string | undefined {
    return this.currentEvaluationId
  }
}

// ============================================================================
// Evaluation Engine Factory
// ============================================================================

export class EvaluationEngineFactory {
  static create(config: EvaluationConfig, options?: EvaluationEngineOptions): EvaluationEngine {
    // Basic validation
    if (!config.models || config.models.length === 0) {
      throw new EvaluationError('At least one model must be specified', 'NO_MODELS')
    }
    
    if (!config.metrics || config.metrics.length === 0) {
      throw new EvaluationError('At least one metric must be specified', 'NO_METRICS')
    }
    
    if (!config.benchmarkSuites || config.benchmarkSuites.length === 0) {
      throw new EvaluationError('At least one benchmark suite must be specified', 'NO_BENCHMARKS')
    }

    return new EvaluationEngine(config, options)
  }
}
</code>
