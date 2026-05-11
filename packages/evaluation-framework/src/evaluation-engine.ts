import { nanoid } from 'nanoid'
import chalk from 'chalk'
import ora from 'ora'
import { table } from 'table'
import {
  EvaluationSuite,
  EvaluationTask,
  EvaluationResult,
  TaskResult,
  SampleResult,
  EvaluationProgress,
  EvaluationError,
  DatasetError,
  MetricError,
  EvaluatorError,
  TimeoutError,
  TaskType,
  OutputFormat,
} from './types'
import { DatasetLoader } from './dataset-loader'
import { MetricRegistry } from './metric-registry'
import { EvaluatorRegistry } from './evaluator-registry'
import { OutputFormatter } from './output-formatter'

// ============================================================================
// Evaluation Engine
// ============================================================================

export interface EvaluationEngineOptions {
  parallel?: boolean
  maxConcurrency?: number
  timeout?: number
  retries?: number
  progressCallback?: (progress: EvaluationProgress) => void
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug'
}

export class EvaluationEngine {
  private datasetLoader: DatasetLoader
  private metricRegistry: MetricRegistry
  private evaluatorRegistry: EvaluatorRegistry
  private outputFormatter: OutputFormatter
  private options: EvaluationEngineOptions

  constructor(options: EvaluationEngineOptions = {}) {
    this.options = {
      parallel: true,
      maxConcurrency: 4,
      timeout: 30000,
      retries: 3,
      logLevel: 'info',
      ...options,
    }

    this.datasetLoader = new DatasetLoader()
    this.metricRegistry = new MetricRegistry()
    this.evaluatorRegistry = new EvaluatorRegistry()
    this.outputFormatter = new OutputFormatter()

    this.registerBuiltInMetrics()
    this.registerBuiltInEvaluators()
  }

  /**
   * Run an evaluation suite
   */
  async runSuite(suite: EvaluationSuite): Promise<EvaluationResult> {
    const startTime = new Date()
    const spinner = ora(`Running evaluation suite: ${suite.name}`).start()

    try {
      this.log(`Starting evaluation suite: ${suite.name} (${suite.tasks.length} tasks)`, 'info')

      const taskResults: TaskResult[] = []
      let completedTasks = 0
      let failedTasks = 0

      // Process tasks
      if (suite.config.parallel && this.options.parallel) {
        // Run tasks in parallel
        const taskPromises = suite.tasks.map(task => this.runTask(task, suite))
        const results = await Promise.allSettled(taskPromises)

        for (const result of results) {
          if (result.status === 'fulfilled') {
            taskResults.push(result.value)
            completedTasks++
          } else {
            failedTasks++
            this.log(`Task failed: ${result.reason}`, 'error')
          }
        }
      } else {
        // Run tasks sequentially
        for (const task of suite.tasks) {
          try {
            const result = await this.runTask(task, suite)
            taskResults.push(result)
            completedTasks++
          } catch (error) {
            failedTasks++
            this.log(`Task failed: ${error}`, 'error')
          }
        }
      }

      // Calculate overall summary
      const summary = this.calculateSuiteSummary(taskResults)
      
      const endTime = new Date()
      const duration = endTime.getTime() - startTime.getTime()

      const result: EvaluationResult = {
        suiteId: suite.id,
        suiteName: suite.name,
        version: suite.version,
        tasks: taskResults,
        summary,
        metadata: {
          environment: this.getEnvironmentInfo(),
          gitInfo: await this.getGitInfo(),
          hardware: await this.getHardwareInfo(),
          cost: this.calculateTotalCost(taskResults),
        },
        startedAt: startTime,
        completedAt: endTime,
        duration,
      }

      spinner.succeed(`Evaluation completed: ${completedTasks}/${suite.tasks.length} tasks successful`)

      // Save results if configured
      if (suite.config.saveResults && suite.config.outputPath) {
        await this.saveResults(result, suite.config.outputPath, suite.config.outputFormat)
      }

      // Display results
      this.displayResults(result)

      return result
    } catch (error) {
      spinner.fail(`Evaluation failed: ${error}`)
      throw new EvaluationError('Suite execution failed', 'SUITE_ERROR', { cause: error })
    }
  }

  /**
   * Run a single evaluation task
   */
  private async runTask(task: EvaluationTask, suite: EvaluationSuite): Promise<TaskResult> {
    const startTime = Date.now()
    this.log(`Running task: ${task.name}`, 'info')

    try {
      // Load dataset
      const dataset = await this.datasetLoader.loadDataset(task.dataset)
      this.log(`Loaded dataset: ${dataset.samples.length} samples`, 'debug')

      // Initialize metrics
      const metricInstances = task.metrics.map(config => 
        this.metricRegistry.createMetric(config)
      )

      // Initialize evaluators
      const evaluatorInstances = task.evaluators.map(config => 
        this.evaluatorRegistry.createEvaluator(config)
      )

      // Process samples
      const sampleResults: SampleResult[] = []
      let completedSamples = 0
      let failedSamples = 0

      for (let i = 0; i < dataset.samples.length; i++) {
        const sample = dataset.samples[i]
        
        try {
          const result = await this.evaluateSample(
            sample,
            metricInstances,
            evaluatorInstances,
            task
          )
          sampleResults.push(result)
          completedSamples++

          // Report progress
          if (suite.config.progressCallback) {
            suite.config.progressCallback({
              taskId: task.id,
              taskName: task.name,
              completed: i + 1,
              total: dataset.samples.length,
              currentSample: sample,
              elapsed: Date.now() - startTime,
              estimatedRemaining: this.estimateRemaining(i + 1, dataset.samples.length, Date.now() - startTime),
            })
          }
        } catch (error) {
          failedSamples++
          sampleResults.push({
            sampleId: sample.id,
            input: sample.input,
            expectedOutput: sample.expectedOutput,
            actualOutput: null,
            metrics: {},
            error: error instanceof Error ? error.message : 'Unknown error',
            duration: 0,
          })
        }
      }

      // Calculate task metrics
      const taskMetrics = this.calculateTaskMetrics(sampleResults, task.metrics)

      // Calculate task summary
      const summary = this.calculateTaskSummary(sampleResults)

      const duration = Date.now() - startTime

      return {
        taskId: task.id,
        taskName: task.name,
        samples: sampleResults,
        metrics: taskMetrics,
        summary,
        duration,
      }
    } catch (error) {
      throw new EvaluationError(`Task execution failed: ${task.name}`, 'TASK_ERROR', { 
        taskId: task.id, 
        cause: error 
      })
    }
  }

  /**
   * Evaluate a single sample
   */
  private async evaluateSample(
    sample: any,
    metrics: any[],
    evaluators: any[],
    task: EvaluationTask
  ): Promise<SampleResult> {
    const startTime = Date.now()

    // Get actual output from evaluators
    let actualOutput: unknown
    for (const evaluator of evaluators) {
      try {
        actualOutput = await evaluator.evaluate(sample.input, task)
        break
      } catch (error) {
        this.log(`Evaluator ${evaluator.name} failed: ${error}`, 'warn')
      }
    }

    if (actualOutput === undefined) {
      throw new EvaluatorError('All evaluators failed', 'EVALUATORS_FAILED')
    }

    // Calculate metrics
    const metricResults: Record<string, number> = {}
    for (const metric of metrics) {
      try {
        const value = await metric.calculate(
          sample.input,
          sample.expectedOutput,
          actualOutput
        )
        metricResults[metric.name] = value
      } catch (error) {
        this.log(`Metric ${metric.name} failed: ${error}`, 'warn')
      }
    }

    return {
      sampleId: sample.id,
      input: sample.input,
      expectedOutput: sample.expectedOutput,
      actualOutput,
      metrics: metricResults,
      metadata: sample.metadata,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Calculate metrics for a task
   */
  private calculateTaskMetrics(
    sampleResults: SampleResult[],
    metricConfigs: any[]
  ): any[] {
    const metrics: any[] = []

    for (const config of metricConfigs) {
      const values = sampleResults
        .map(r => r.metrics[config.name])
        .filter(v => v !== undefined)

      if (values.length === 0) continue

      const result = {
        metricName: config.name,
        value: this.average(values),
        samples: values.length,
        distribution: this.calculateDistribution(values),
      }

      metrics.push(result)
    }

    return metrics
  }

  /**
   * Calculate task summary
   */
  private calculateTaskSummary(sampleResults: SampleResult[]): any {
    const successful = sampleResults.filter(r => !r.error)
    const scores = successful.map(r => this.average(Object.values(r.metrics)))

    return {
      totalSamples: sampleResults.length,
      successfulSamples: successful.length,
      failedSamples: sampleResults.length - successful.length,
      averageScore: scores.length > 0 ? this.average(scores) : 0,
      bestScore: scores.length > 0 ? Math.max(...scores) : 0,
      worstScore: scores.length > 0 ? Math.min(...scores) : 0,
      percentileScores: this.calculatePercentiles(scores),
    }
  }

  /**
   * Calculate suite summary
   */
  private calculateSuiteSummary(taskResults: TaskResult[]): any {
    const totalTasks = taskResults.length
    const completedTasks = taskResults.filter(t => t.samples.length > 0).length
    const failedTasks = totalTasks - completedTasks

    const taskScores = taskResults.reduce((acc, task) => {
      acc[task.taskId] = task.summary.averageScore
      return acc
    }, {} as Record<string, number>)

    const overallScore = Object.values(taskScores).length > 0 
      ? this.average(Object.values(taskScores))
      : 0

    // Create ranking
    const ranking = Object.entries(taskScores)
      .map(([taskId, score]) => ({
        taskId,
        taskName: taskResults.find(t => t.taskId === taskId)?.taskName || taskId,
        score,
        rank: 0,
        percentile: 0,
      }))
      .sort((a, b) => b.score - a.score)
      .map((item, index) => ({
        ...item,
        rank: index + 1,
        percentile: ((totalTasks - index) / totalTasks) * 100,
      }))

    return {
      totalTasks,
      completedTasks,
      failedTasks,
      overallScore,
      taskScores,
      ranking,
    }
  }

  /**
   * Save results to file
   */
  private async saveResults(
    result: EvaluationResult,
    outputPath: string,
    format: OutputFormat = 'json'
  ): Promise<void> {
    try {
      const output = this.outputFormatter.format(result, format)
      const fs = await import('fs/promises')
      await fs.writeFile(outputPath, output)
      this.log(`Results saved to: ${outputPath}`, 'info')
    } catch (error) {
      this.log(`Failed to save results: ${error}`, 'error')
    }
  }

  /**
   * Display results in console
   */
  private displayResults(result: EvaluationResult): void {
    console.log('\n' + chalk.bold.blue('Evaluation Results'))
    console.log(chalk.gray('='.repeat(50)))

    // Summary table
    const summaryData = [
      ['Metric', 'Value'],
      ['Overall Score', result.summary.overallScore.toFixed(3)],
      ['Completed Tasks', `${result.summary.completedTasks}/${result.summary.totalTasks}`],
      ['Duration', `${(result.duration / 1000).toFixed(2)}s`],
      ['Total Samples', result.tasks.reduce((sum, t) => sum + t.samples.length, 0)],
    ]

    console.log('\n' + chalk.bold('Summary'))
    console.log(table(summaryData))

    // Task ranking
    if (result.summary.ranking.length > 0) {
      const rankingData = [
        ['Rank', 'Task', 'Score', 'Percentile'],
        ...result.summary.ranking.map(r => [
          r.rank.toString(),
          r.taskName,
          r.score.toFixed(3),
          `${r.percentile.toFixed(1)}%`,
        ]),
      ]

      console.log('\n' + chalk.bold('Task Ranking'))
      console.log(table(rankingData))
    }
  }

  /**
   * Register built-in metrics
   */
  private registerBuiltInMetrics(): void {
    // Accuracy metric
    this.metricRegistry.register('accuracy', {
      calculate: async (input: unknown, expected: unknown, actual: unknown) => {
        if (expected === actual) return 1
        return 0
      },
    })

    // Text similarity metrics
    this.metricRegistry.register('jaccard', {
      calculate: async (input: unknown, expected: unknown, actual: unknown) => {
        if (typeof expected !== 'string' || typeof actual !== 'string') return 0
        const setA = new Set(expected.toLowerCase().split(' '))
        const setB = new Set(actual.toLowerCase().split(' '))
        const intersection = new Set([...setA].filter(x => setB.has(x)))
        return intersection.size / new Set([...setA, ...setB]).size
      },
    })

    // Latency metric (already calculated per sample)
    this.metricRegistry.register('latency', {
      calculate: async () => 0, // Will be overridden per sample
    })
  }

  /**
   * Register built-in evaluators
   */
  private registerBuiltInEvaluators(): void {
    // Mock evaluator for demonstration
    this.evaluatorRegistry.register('mock', {
      evaluate: async (input: unknown, task: EvaluationTask) => {
        // Simple mock: return the input or a generated response
        if (typeof input === 'string') {
          return `Mock response for: ${input}`
        }
        return input
      },
    })
  }

  /**
   * Utility methods
   */
  private average(values: number[]): number {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
  }

  private calculateDistribution(values: number[]): any {
    const sorted = [...values].sort((a, b) => a - b)
    const n = sorted.length
    const q1Index = Math.floor(n * 0.25)
    const q2Index = Math.floor(n * 0.5)
    const q3Index = Math.floor(n * 0.75)

    return {
      mean: this.average(values),
      median: sorted[q2Index],
      std: Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - this.average(values), 2), 0) / n),
      min: sorted[0],
      max: sorted[n - 1],
      quartiles: [sorted[q1Index], sorted[q2Index], sorted[q3Index]],
    }
  }

  private calculatePercentiles(values: number[]): Record<number, number> {
    const sorted = [...values].sort((a, b) => a - b)
    const n = sorted.length

    return {
      25: sorted[Math.floor(n * 0.25)] || 0,
      50: sorted[Math.floor(n * 0.5)] || 0,
      75: sorted[Math.floor(n * 0.75)] || 0,
      90: sorted[Math.floor(n * 0.9)] || 0,
      95: sorted[Math.floor(n * 0.95)] || 0,
      99: sorted[Math.floor(n * 0.99)] || 0,
    }
  }

  private estimateRemaining(completed: number, total: number, elapsed: number): number {
    if (completed === 0) return 0
    const rate = completed / elapsed
    const remaining = total - completed
    return remaining / rate
  }

  private async getEnvironmentInfo(): Promise<any> {
    const os = await import('os')
    return {
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      nodeVersion: process.version,
      packageVersions: {}, // Would be populated from package.json
    }
  }

  private async getGitInfo(): Promise<any | undefined> {
    try {
      // Would use simple-git or similar
      return undefined
    } catch {
      return undefined
    }
  }

  private async getHardwareInfo(): Promise<any> {
    const os = await import('os')
    return {
      cpu: os.cpus()[0]?.model || 'Unknown',
      memory: os.totalmem(),
      gpu: [], // Would use GPU detection library
    }
  }

  private calculateTotalCost(taskResults: TaskResult[]): any {
    // Simplified cost calculation
    const totalCost = taskResults.reduce((sum, task) => {
      // Would calculate based on actual usage
      return sum + (task.duration * 0.0001) // $0.0001 per ms
    }, 0)

    return {
      compute: totalCost,
      storage: 0,
      network: 0,
      total: totalCost,
      currency: 'USD',
    }
  }

  private log(message: string, level: string): void {
    const levels = ['silent', 'error', 'warn', 'info', 'debug']
    const currentLevel = levels.indexOf(this.options.logLevel || 'info')
    const messageLevel = levels.indexOf(level)

    if (messageLevel <= currentLevel) {
      const timestamp = new Date().toISOString()
      const coloredMessage = {
        error: chalk.red,
        warn: chalk.yellow,
        info: chalk.blue,
        debug: chalk.gray,
      }[level] || chalk.white

      console.log(`${chalk.gray(timestamp)} ${coloredMessage(`[${level.toUpperCase()}]`)} ${message}`)
    }
  }
}