import { z } from 'zod'

/**
 * Evaluation task definition
 */
export interface EvaluationTask {
  /** Unique identifier for the task */
  id: string
  /** Task name */
  name: string
  /** Task description */
  description?: string
  /** The prompt to evaluate */
  prompt: string
  /** Expected output or criteria */
  expectedOutput?: string
  /** Evaluation criteria */
  criteria: EvaluationCriteria[]
  /** Task metadata */
  metadata: {
    tags: string[]
    difficulty: 'easy' | 'medium' | 'hard'
    category: string
    createdAt: Date
    updatedAt: Date
  }
}

/**
 * Evaluation criteria definition
 */
export interface EvaluationCriteria {
  /** Name of the criterion */
  name: string
  /** Description of what's being measured */
  description: string
  /** Type of evaluation */
  type: 'quantitative' | 'qualitative' | 'boolean'
  /** Weight in overall score (0-1) */
  weight: number
  /** Scoring function or rubric */
  scorer?: 'llm-judge' | 'exact-match' | 'similarity' | 'custom'
  /** Expected value or range */
  expectedValue?: {
    min?: number
    max?: number
    exact?: string | number
  }
}

/**
 * Evaluation result for a single task
 */
export interface EvaluationResult {
  /** Task ID */
  taskId: string
  /** Model or system being evaluated */
  modelId: string
  /** The actual output produced */
  output: string
  /** Scores for each criterion */
  scores: Array<{
    criterion: string
    score: number
    confidence?: number
    reasoning?: string
  }>
  /** Overall score (0-100) */
  overallScore: number
  /** Performance metrics */
  metrics: {
    latency: number
    tokenCount: {
      input: number
      output: number
      total: number
    }
    cost: number
    timestamp: Date
  }
  /** Additional metadata */
  metadata?: {
    error?: string
    warnings?: string[]
    trace?: string
  }
}

/**
 * Benchmark configuration
 */
export interface Benchmark {
  /** Unique identifier */
  id: string
  /** Benchmark name */
  name: string
  /** Description */
  description?: string
  /** Tasks in this benchmark */
  tasks: EvaluationTask[]
  /** Models to evaluate */
  models: string[]
  /** Configuration */
  config: {
    /** Parallel execution */
    parallel: boolean
    /** Max concurrent evaluations */
    maxConcurrency: number
    /** Timeout per task (ms) */
    timeout: number
    /** Retry attempts */
    retries: number
  }
  /** Benchmark status */
  status: 'draft' | 'running' | 'completed' | 'failed'
  /** Results */
  results?: EvaluationResult[]
  /** Aggregated metrics */
  aggregates?: {
    byModel: Record<string, {
      avgScore: number
      avgLatency: number
      avgCost: number
      totalTasks: number
      completedTasks: number
      failedTasks: number
    }>
    byTask: Record<string, {
      avgScore: number
      bestModel: string
      worstModel: string
    }>
  }
  /** Metadata */
  metadata: {
    createdBy?: string
    createdAt: Date
    startedAt?: Date
    completedAt?: Date
    duration?: number
  }
}

/**
 * LLM judge configuration
 */
export interface LLMJudge {
  /** Judge ID */
  id: string
  /** Model to use for judging */
  model: string
  /** Judge prompt template */
  promptTemplate: string
  /** Evaluation criteria */
  criteria: EvaluationCriteria[]
  /** Judge configuration */
  config: {
    temperature: number
    maxTokens: number
    consistency: number // Number of times to repeat evaluation
  }
  /** Performance metrics */
  performance?: {
    avgLatency: number
    avgCost: number
    reliability: number
  }
}

/**
 * Metrics collector interface
 */
export interface MetricsCollector {
  /** Collect metrics for an evaluation */
  collect(result: EvaluationResult): Promise<void>
  /** Get aggregated metrics */
  getAggregates(filters?: {
    modelId?: string
    taskId?: string
    timeRange?: {
      start: Date
      end: Date
    }
  }): Promise<{
    avgScore: number
    avgLatency: number
    avgCost: number
    totalEvaluations: number
    scoreDistribution: Record<string, number>
  }>
  /** Get time series data */
  getTimeSeries(metric: 'score' | 'latency' | 'cost', filters?: {
    modelId?: string
    granularity: 'hour' | 'day' | 'week'
  }): Promise<Array<{
    timestamp: Date
    value: number
  }>>
}

/**
 * Benchmark runner interface
 */
export interface BenchmarkRunner {
  /** Run a single benchmark */
  run(benchmark: Benchmark): Promise<Benchmark>
  /** Run a single task */
  runTask(task: EvaluationTask, modelId: string): Promise<EvaluationResult>
  /** Cancel a running benchmark */
  cancel(benchmarkId: string): Promise<void>
  /** Get benchmark status */
  getStatus(benchmarkId: string): Promise<Benchmark | null>
}

/**
 * Evaluation dashboard data
 */
export interface DashboardData {
  /** Summary statistics */
  summary: {
    totalBenchmarks: number
    totalEvaluations: number
    avgScore: number
    topPerformingModel: string
  }
  /** Recent benchmarks */
  recentBenchmarks: Benchmark[]
  /** Model performance comparison */
  modelComparison: Array<{
    modelId: string
    avgScore: number
    avgLatency: number
    avgCost: number
    trend: 'up' | 'down' | 'stable'
  }>
  /** Task difficulty distribution */
  difficultyDistribution: Record<string, number>
}