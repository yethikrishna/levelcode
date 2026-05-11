import { z } from 'zod'

// ============================================================================
// Core Evaluation Types
// ============================================================================

export interface EvaluationSuite {
  id: string
  name: string
  description?: string
  version: string
  tasks: EvaluationTask[]
  config: EvaluationConfig
  metadata?: SuiteMetadata
  createdAt: Date
  updatedAt: Date
}

export interface EvaluationTask {
  id: string
  name: string
  description?: string
  type: TaskType
  dataset: DatasetReference
  metrics: MetricConfig[]
  evaluators: EvaluatorConfig[]
  config: TaskConfig
  weight?: number
  tags?: string[]
}

export interface EvaluationConfig {
  parallel?: boolean
  maxConcurrency?: number
  timeout?: number
  retries?: number
  outputFormat: OutputFormat
  saveResults?: boolean
  outputPath?: string
  progressCallback?: (progress: EvaluationProgress) => void
}

export interface EvaluationProgress {
  taskId: string
  taskName: string
  completed: number
  total: number
  currentSample?: EvaluationSample
  elapsed: number
  estimatedRemaining?: number
}

export interface EvaluationResult {
  suiteId: string
  suiteName: string
  version: string
  tasks: TaskResult[]
  summary: EvaluationSummary
  metadata: ResultMetadata
  startedAt: Date
  completedAt: Date
  duration: number
}

export interface TaskResult {
  taskId: string
  taskName: string
  samples: SampleResult[]
  metrics: MetricResult[]
  summary: TaskSummary
  errors?: EvaluationError[]
  duration: number
}

export interface SampleResult {
  sampleId: string
  input: unknown
  expectedOutput?: unknown
  actualOutput: unknown
  metrics: Record<string, number>
  metadata?: Record<string, unknown>
  error?: string
  duration: number
}

export interface MetricResult {
  metricName: string
  value: number
  confidenceInterval?: [number, number]
  samples: number
  distribution?: MetricDistribution
  details?: Record<string, unknown>
}

export interface TaskSummary {
  totalSamples: number
  successfulSamples: number
  failedSamples: number
  averageScore: number
  bestScore: number
  worstScore: number
  percentileScores: Record<number, number>
}

export interface EvaluationSummary {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  overallScore: number
  taskScores: Record<string, number>
  ranking: TaskRanking[]
}

export interface TaskRanking {
  taskId: string
  taskName: string
  score: number
  rank: number
  percentile: number
}

// ============================================================================
// Dataset Types
// ============================================================================

export interface DatasetReference {
  id: string
  name: string
  source: DatasetSource
  size: number
  format: DataFormat
  split?: DataSplit
}

export interface DatasetSource {
  type: 'local' | 'url' | 's3' | 'gcs' | 'azure' | 'huggingface'
  path: string
  credentials?: Record<string, string>
  config?: Record<string, unknown>
}

export interface DataSplit {
  train?: number
  validation?: number
  test?: number
  stratify?: string
}

export interface EvaluationSample {
  id: string
  input: unknown
  expectedOutput?: unknown
  metadata?: Record<string, unknown>
  weight?: number
  category?: string
  difficulty?: 'easy' | 'medium' | 'hard'
}

// ============================================================================
// Metric Types
// ============================================================================

export interface MetricConfig {
  name: string
  type: MetricType
  evaluator: string
  weight?: number
  config?: Record<string, unknown>
  threshold?: MetricThreshold
}

export interface MetricThreshold {
  min?: number
  max?: number
  target?: number
  weight?: number
}

export interface MetricDistribution {
  mean: number
  median: number
  std: number
  min: number
  max: number
  quartiles: [number, number, number]
  histogram: HistogramBin[]
}

export interface HistogramBin {
  range: [number, number]
  count: number
  density: number
}

export type MetricType = 
  | 'accuracy'
  | 'precision'
  | 'recall'
  | 'f1'
  | 'bleu'
  | 'rouge'
  | 'meteor'
  | 'bertscore'
  | 'perplexity'
  | 'latency'
  | 'throughput'
  | 'cost'
  | 'custom'
  | 'composite'

export type OutputFormat = 
  | 'json'
  | 'csv'
  | 'html'
  | 'markdown'
  | 'pdf'

// ============================================================================
// Evaluator Types
// ============================================================================

export interface EvaluatorConfig {
  name: string
  type: EvaluatorType
  model: ModelReference
  config?: Record<string, unknown>
  resources?: ResourceConfig
}

export interface ModelReference {
  provider: string
  model: string
  version?: string
  endpoint?: string
  apiKey?: string
}

export interface ResourceConfig {
  maxTokens?: number
  temperature?: number
  topP?: number
  maxRetries?: number
  timeout?: number
}

export type EvaluatorType = 
  | 'model'
  | 'human'
  | 'automated'
  | 'hybrid'
  | 'composite'

// ============================================================================
// Built-in Evaluators
// ============================================================================

export interface TextSimilarityEvaluator {
  type: 'text-similarity'
  method: 'jaccard' | 'cosine' | 'levenshtein' | 'semantic'
  model?: string
  threshold?: number
}

export interface ClassificationEvaluator {
  type: 'classification'
  multiLabel?: boolean
  averageMethod?: 'macro' | 'micro' | 'weighted'
  labels?: string[]
}

export interface GenerationEvaluator {
  type: 'generation'
  metrics: ('bleu' | 'rouge' | 'meteor' | 'bertscore')[]
  language?: string
  nGrams?: number
}

export interface CodeEvaluator {
  type: 'code'
  language: string
  tests?: CodeTest[]
  metrics: ('accuracy' | 'efficiency' | 'style' | 'security')[]
}

export interface CodeTest {
  name: string
  input?: unknown
  expectedOutput?: unknown
  timeout?: number
}

export interface HumanEvaluator {
  type: 'human'
  guidelines?: string
  criteria: EvaluationCriteria[]
  reviewers?: string[]
}

export interface EvaluationCriteria {
  name: string
  description: string
  scale: number
  weight?: number
}

// ============================================================================
// Metadata Types
// ============================================================================

export interface SuiteMetadata {
  author?: string
  tags?: string[]
  category?: string
  difficulty?: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  estimatedTime?: number
  prerequisites?: string[]
  relatedSuites?: string[]
}

export interface ResultMetadata {
  environment: EnvironmentInfo
  gitInfo?: GitInfo
  hardware?: HardwareInfo
  cost?: CostInfo
  notes?: string
}

export interface EnvironmentInfo {
  os: string
  arch: string
  nodeVersion: string
  packageVersions: Record<string, string>
}

export interface GitInfo {
  commit: string
  branch: string
  dirty: boolean
  remote?: string
}

export interface HardwareInfo {
  cpu: string
  memory: number
  gpu?: string[]
  disk?: number
}

export interface CostInfo {
  compute: number
  storage: number
  network: number
  total: number
  currency: string
}

// ============================================================================
// Error Types
// ============================================================================

export class EvaluationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'EvaluationError'
  }
}

export class DatasetError extends EvaluationError {
  constructor(message: string, public readonly datasetId: string) {
    super(message, 'DATASET_ERROR', { datasetId })
  }
}

export class MetricError extends EvaluationError {
  constructor(message: string, public readonly metricName: string) {
    super(message, 'METRIC_ERROR', { metricName })
  }
}

export class EvaluatorError extends EvaluationError {
  constructor(message: string, public readonly evaluatorName: string, public readonly cause?: Error) {
    super(message, 'EVALUATOR_ERROR', { evaluatorName })
  }
}

export class TimeoutError extends EvaluationError {
  constructor(timeout: number, public readonly taskId: string) {
    super(`Evaluation timed out after ${timeout}ms`, 'TIMEOUT_ERROR', { timeout, taskId })
  }
}

// ============================================================================
// Schema Definitions
// ============================================================================

export const EvaluationSuiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string(),
  tasks: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    type: z.enum(['classification', 'generation', 'qa', 'summarization', 'translation', 'code', 'custom']),
    dataset: z.object({
      id: z.string(),
      name: z.string(),
      source: z.object({
        type: z.enum(['local', 'url', 's3', 'gcs', 'azure', 'huggingface']),
        path: z.string(),
        credentials: z.record(z.string()).optional(),
        config: z.record(z.unknown()).optional(),
      }),
      size: z.number(),
      format: z.enum(['json', 'jsonl', 'csv', 'tsv', 'parquet', 'custom']),
      split: z.object({
        train: z.number().optional(),
        validation: z.number().optional(),
        test: z.number().optional(),
        stratify: z.string().optional(),
      }).optional(),
    }),
    metrics: z.array(z.object({
      name: z.string(),
      type: z.enum(['accuracy', 'precision', 'recall', 'f1', 'bleu', 'rouge', 'meteor', 'bertscore', 'perplexity', 'latency', 'throughput', 'cost', 'custom', 'composite']),
      evaluator: z.string(),
      weight: z.number().optional(),
      config: z.record(z.unknown()).optional(),
      threshold: z.object({
        min: z.number().optional(),
        max: z.number().optional(),
        target: z.number().optional(),
        weight: z.number().optional(),
      }).optional(),
    })),
    evaluators: z.array(z.object({
      name: z.string(),
      type: z.enum(['model', 'human', 'automated', 'hybrid', 'composite']),
      model: z.object({
        provider: z.string(),
        model: z.string(),
        version: z.string().optional(),
        endpoint: z.string().optional(),
        apiKey: z.string().optional(),
      }),
      config: z.record(z.unknown()).optional(),
      resources: z.object({
        maxTokens: z.number().optional(),
        temperature: z.number().optional(),
        topP: z.number().optional(),
        maxRetries: z.number().optional(),
        timeout: z.number().optional(),
      }).optional(),
    })),
    config: z.object({
      samples: z.number().optional(),
      randomSeed: z.number().optional(),
      shuffle: z.boolean().optional(),
      parallel: z.boolean().optional(),
      timeout: z.number().optional(),
      retries: z.number().optional(),
    }),
    weight: z.number().optional(),
    tags: z.array(z.string()).optional(),
  })),
  config: z.object({
    parallel: z.boolean().optional(),
    maxConcurrency: z.number().optional(),
    timeout: z.number().optional(),
    retries: z.number().optional(),
    outputFormat: z.enum(['json', 'csv', 'html', 'markdown', 'pdf']),
    saveResults: z.boolean().optional(),
    outputPath: z.string().optional(),
    progressCallback: z.function().optional(),
  }),
  metadata: z.object({
    author: z.string().optional(),
    tags: z.array(z.string()).optional(),
    category: z.string().optional(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
    estimatedTime: z.number().optional(),
    prerequisites: z.array(z.string()).optional(),
    relatedSuites: z.array(z.string()).optional(),
  }).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const EvaluationResultSchema = z.object({
  suiteId: z.string(),
  suiteName: z.string(),
  version: z.string(),
  tasks: z.array(z.object({
    taskId: z.string(),
    taskName: z.string(),
    samples: z.array(z.object({
      sampleId: z.string(),
      input: z.unknown(),
      expectedOutput: z.unknown().optional(),
      actualOutput: z.unknown(),
      metrics: z.record(z.number()),
      metadata: z.record(z.unknown()).optional(),
      error: z.string().optional(),
      duration: z.number(),
    })),
    metrics: z.array(z.object({
      metricName: z.string(),
      value: z.number(),
      confidenceInterval: z.tuple([z.number(), z.number()]).optional(),
      samples: z.number(),
      distribution: z.object({
        mean: z.number(),
        median: z.number(),
        std: z.number(),
        min: z.number(),
        max: z.number(),
        quartiles: z.tuple([z.number(), z.number(), z.number()]),
        histogram: z.array(z.object({
          range: z.tuple([z.number(), z.number()]),
          count: z.number(),
          density: z.number(),
        })),
      }).optional(),
      details: z.record(z.unknown()).optional(),
    })),
    summary: z.object({
      totalSamples: z.number(),
      successfulSamples: z.number(),
      failedSamples: z.number(),
      averageScore: z.number(),
      bestScore: z.number(),
      worstScore: z.number(),
      percentileScores: z.record(z.number()),
    }),
    errors: z.array(z.object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.unknown()).optional(),
      sampleId: z.string().optional(),
      timestamp: z.date(),
    })).optional(),
    duration: z.number(),
  })),
  summary: z.object({
    totalTasks: z.number(),
    completedTasks: z.number(),
    failedTasks: z.number(),
    overallScore: z.number(),
    taskScores: z.record(z.number()),
    ranking: z.array(z.object({
      taskId: z.string(),
      taskName: z.string(),
      score: z.number(),
      rank: z.number(),
      percentile: z.number(),
    })),
  }),
  metadata: z.object({
    environment: z.object({
      os: z.string(),
      arch: z.string(),
      nodeVersion: z.string(),
      packageVersions: z.record(z.string()),
    }),
    gitInfo: z.object({
      commit: z.string(),
      branch: z.string(),
      dirty: z.boolean(),
      remote: z.string().optional(),
    }).optional(),
    hardware: z.object({
      cpu: z.string(),
      memory: z.number(),
      gpu: z.array(z.string()).optional(),
      disk: z.number().optional(),
    }).optional(),
    cost: z.object({
      compute: z.number(),
      storage: z.number(),
      network: z.number(),
      total: z.number(),
      currency: z.string(),
    }).optional(),
    notes: z.string().optional(),
  }),
  startedAt: z.date(),
  completedAt: z.date(),
  duration: z.number(),
})

export type TaskType = 
  | 'classification'
  | 'generation'
  | 'qa'
  | 'summarization'
  | 'translation'
  | 'code'
  | 'custom'

export type DataFormat = 
  | 'json'
  | 'jsonl'
  | 'csv'
  | 'tsv'
  | 'parquet'
  | 'custom'