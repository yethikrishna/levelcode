I'll create a comprehensive type definition system for an LLM evaluation framework that builds upon your existing structure while adding missing components and improving organization.

```typescript
import { z } from 'zod'

// ============================================================================
// Core Evaluation Types
// ============================================================================

export interface EvaluationConfig {
  id: string
  name: string
  description?: string
  version: string
  tags?: string[]
  benchmarkSuites: string[]
  metrics: MetricConfig[]
  models: ModelConfig[]
  dataset: DatasetConfig
  evaluationMode: 'single' | 'comparative' | 'batch' | 'continual'
  execution: ExecutionConfig
  output: OutputConfig
  notifications: NotificationConfig[]
  metadata: Record<string, any>
}

export interface ExecutionConfig {
  parallelization: {
    enabled: boolean
    maxConcurrency: number
    chunkSize: number
    strategy: 'task' | 'model' | 'dataset'
  }
  timeout: {
    perTask: number // milliseconds
    total: number // milliseconds
  }
  retryPolicy: {
    maxRetries: number
    backoffMs: number
    backoffStrategy: 'linear' | 'exponential'
    retryableErrors: string[]
  }
  resources: {
    maxMemory?: number // MB
    maxCpu?: number // percentage
    gpu?: boolean
  }
  checkpointing: {
    enabled: boolean
    interval: number // seconds
    saveIntermediate: boolean
  }
}

export interface OutputConfig {
  formats: Array<'json' | 'html' | 'csv' | 'pdf' | 'markdown'>
  destination: {
    type: 'local' | 's3' | 'gcs' | 'azure' | 'database'
    path?: string
    bucket?: string
    connection?: Record<string, any>
  }
  compression: {
    enabled: boolean
    format: 'gzip' | 'zip' | 'lz4'
  }
  retention: {
    days: number
    archiveAfter?: number
  }
}

export interface NotificationConfig {
  type: 'email' | 'webhook' | 'slack' | 'teams'
  enabled: boolean
  triggers: Array<'start' | 'progress' | 'complete' | 'error'>
  recipients: string[]
  template?: string
}

export interface ModelConfig {
  id: string
  name: string
  provider: string
  model: string
  version?: string
  apiKey?: string
  baseUrl?: string
  parameters: ModelParameters
  rateLimit?: {
    requestsPerMinute: number
    tokensPerMinute: number
  }
  auth?: {
    type: 'bearer' | 'basic' | 'api_key' | 'oauth'
    credentials: Record<string, any>
  }
  metadata?: Record<string, any>
}

export interface ModelParameters {
  maxTokens?: number
  temperature?: number
  topP?: number
  topK?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stopSequences?: string[]
  seed?: number
  responseFormat?: 'text' | 'json_object' | 'json_schema'
  tools?: Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: Record<string, any>
    }
  }>
  toolChoice?: 'none' | 'auto' | 'required'
}

export interface MetricConfig {
  id: string
  name: string
  type: MetricType
  category: MetricCategory
  weight: number
  threshold?: {
    min?: number
    max?: number
    target?: number
  }
  aggregation: 'mean' | 'median' | 'weighted_mean' | 'max' | 'min'
  description: string
  params?: Record<string, any>
  calculator?: string // path to custom calculator function
}

export type MetricType = 
  | 'accuracy'
  | 'precision'
  | 'recall'
  | 'f1'
  | 'auc_roc'
  | 'bleu'
  | 'rouge'
  | 'meteor'
  | 'bert_score'
  | 'perplexity'
  | 'latency'
  | 'throughput'
  | 'cost'
  | 'token_efficiency'
  | 'toxicity'
  | 'bias'
  | 'faithfulness'
  | 'relevance'
  | 'coherence'
  | 'custom'

export type MetricCategory = 
  | 'performance'
  | 'quality'
  | 'safety'
  | 'efficiency'
  | 'fairness'
  | 'custom'

export interface DatasetConfig {
  name: string
  source: DatasetSource
  preprocessing?: DatasetPreprocessing
  sampling?: DatasetSampling
  split?: DatasetSplit
  version?: string
  checksum?: string
  metadata: Record<string, any>
}

export interface DatasetSource {
  type: 'file' | 'url' | 'database' | 'api' | 'huggingface' | 'inline'
  location?: string
  format: 'json' | 'jsonl' | 'csv' | 'tsv' | 'parquet' | 'xml'
  compression?: 'gzip' | 'zip' | 'bz2'
  credentials?: Record<string, any>
  data?: any // for inline datasets
}

export interface DatasetPreprocessing {
  filters: Array<{
    field: string
    operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains'
    value: any
  }>
  transformations: Array<{
    type: 'map' | 'filter' | 'rename' | 'split' | 'join' | 'custom'
    params: Record<string, any>
  }>
  validation: {
    required: string[]
    schema?: Record<string, any>
  }
}

export interface DatasetSampling {
  strategy: 'random' | 'stratified' | 'systematic' | 'cluster'
  size: number
  seed?: number
  strata?: string[] // for stratified sampling
}

export interface DatasetSplit {
  type: 'fixed' | 'proportional' | 'custom'
  train?: number | Array<number>
  validation?: number | Array<number>
  test?: number | Array<number>
  indices?: {
    train: number[]
    validation: number[]
    test: number[]
  }
}

// ============================================================================
// Benchmark Types
// ============================================================================

export interface BenchmarkSuite {
  id: string
  name: string
  description: string
  version: string
  category: BenchmarkCategory
  tasks: BenchmarkTask[]
  setup?: BenchmarkLifecycle
  teardown?: BenchmarkLifecycle
  requirements: BenchmarkRequirements
  metadata: Record<string, any>
  tags: string[]
}

export type BenchmarkCategory = 
  | 'reasoning'
  | 'language_understanding'
  | 'knowledge'
  | 'coding'
  | 'mathematics'
  | 'safety'
  | 'multimodal'
  | 'custom'

export interface BenchmarkTask {
  id: string
  name: string
  description: string
  type: TaskType
  difficulty?: 'easy' | 'medium' | 'hard'
  input: BenchmarkInput
  expectedOutput?: ExpectedOutput
  evaluationCriteria: EvaluationCriterion[]
  scoring?: ScoringConfig
  metadata: Record<string, any>
}

export type TaskType = 
  | 'question_answering'
  | 'text_generation'
  | 'classification'
  | 'summarization'
  | 'translation'
  | 'code_generation'
  | 'reasoning'
  | 'mathematical'
  | 'creative_writing'
  | 'dialogue'
  | 'extraction'
  | 'ranking'
  | 'multimodal'

export interface BenchmarkInput {
  prompt: string
  context?: string | Array<any>
  examples?: FewShotExample[]
  constraints?: InputConstraint[]
  variables?: Record<string, any>
  metadata?: Record<string, any>
}

export interface FewShotExample {
  input: string
  output: string
  rationale?: string
  weight?: number
}

export interface InputConstraint {
  type: 'length' | 'format' | 'content' | 'style'
  rule: string
  description: string
}

export interface ExpectedOutput {
  type: 'exact' | 'contains' | 'regex' | 'json_schema' | 'function' | 'custom'
  value: any
  tolerance?: number
  caseSensitive?: boolean
  validator?: string // path to custom validator
}

export interface EvaluationCriterion {
  name: string
  description: string
  weight: number
  metric: string
  evaluator?: string // path to custom evaluator
}

export interface ScoringConfig {
  method: 'binary' | 'partial' | 'gradient' | 'custom'
  granularity: number
  bonusPoints?: Array<{
    condition: string
    points: number
  }>
  penalties?: Array<{
    condition: string
    points: number
  }>
}

export interface BenchmarkLifecycle {
  script?: string // path to setup/teardown script
  commands?: string[]
  dependencies?: Array<{
    name: string
    version: string
  }>
  environment?: Record<string, string>
}

export interface BenchmarkRequirements {
  minModelSize?: number // parameters
  maxContextLength?: number
  modalities: Array<'text' | 'image' | 'audio' | 'video'>
  languages: string[]
  compute: {
    minMemory?: number // MB
    minCpu?: number
    gpuRequired?: boolean
  }
}

// ============================================================================
// Built-in Benchmark Configurations
// ============================================================================

export interface MMLUConfig {
  subjects: Array<string>
  numExamples?: number
  fewShotExamples?: number
  difficulty?: 'all' | 'easy' | 'medium' | 'hard'
}

export interface HellaSwagConfig {
  split: 'train' | 'val' | 'test'
  numExamples?: number
  contextWindow?: number
}

export interface HumanEvalConfig {
  problems?: number
  temperature?: number
  maxTokens?: number
  languages?: Array<string>
}

export interface TruthfulQAConfig {
  categories?: Array<string>
  split?: 'validation' | 'test'
  generationMethod?: 'few_shot' | 'zero_shot'
}

export interface BigBenchConfig {
  tasks: Array<string>
  numExamples?: number
  fewShotExamples?: number
  shots?: number
}

export interface GSM8KConfig {
  split: 'train' | 'test'
  grade?: 'elementary' | 'middle' | 'high'
  calculator?: boolean
}

export interface ARCConfig {
  dataset: 'ARC-Easy' | 'ARC-Challenge'
  split: 'train' | 'test' | 'validation'
  fewShot?: number
}

// ============================================================================
// Evaluation Execution Types
// ============================================================================

export interface EvaluationResult {
  id: string
  configId: string
  timestamp: Date
  status: EvaluationStatus
  progress: EvaluationProgress
  environment: ExecutionEnvironment
  modelResults: ModelResult[]
  summary: EvaluationSummary
  artifacts: EvaluationArtifact[]
  logs: EvaluationLog[]
  metadata: Record<string, any>
  error?: EvaluationError
}

export type EvaluationStatus = 
  | 'pending'
  | 'initializing'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout'

export interface EvaluationProgress {
  total: number
  completed: number
  failed: number
  skipped: number
  currentPhase: string
  currentTask?: string
  estimatedTimeRemaining?: number
  milestones: Array<{
    name: string
    completed: boolean
    timestamp?: Date
  }>
}

export interface ExecutionEnvironment {
  runtime: 'node' | 'python' | 'docker'
  version: string
  resources: {
    cpu: {
      model: string
      cores: number
      utilization: number
    }
    memory: {
      total: number
      used: number
      peak: number
    }
    gpu?: Array<{
      model: string
      memory: number
      utilization: number
    }>
  }
  dependencies: Array<{
    name: string
    version: string
  }>
}

export interface ModelResult {
  modelId: string
  modelName: string
  status: EvaluationStatus
  taskResults: TaskResult[]
  aggregatedMetrics: AggregatedMetrics
  performanceMetrics: PerformanceMetrics
  cost: ModelCost
  timing: ModelTiming
  error?: EvaluationError
  metadata: Record<string, any>
}

export interface TaskResult {
  taskId: string
  taskName: string
  benchmarkId: string
  input: BenchmarkInput
  output: ModelOutput
  expectedOutput?: ExpectedOutput
  metrics: MetricResult[]
  performance: TaskPerformance
  cost: TaskCost
  timestamp: Date
  attempt: number
  error?: EvaluationError
  metadata: Record<string, any>
}

export interface ModelOutput {
  content: string
  tokens: TokenUsage
  finishReason: FinishReason
  toolCalls?: ToolCall[]
  logProbs?: Array<number>
  metadata?: Record<string, any>
}

export interface TokenUsage {
  prompt: number
  completion: number
  total: number
  cached?: number
}

export type FinishReason = 
  | 'stop'
  | 'length'
  | 'content_filter'
  | 'tool_calls'
  | 'error'
  | 'timeout'

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
  result?: any
}

export interface MetricResult {
  metricId: string
  metricName: string
  value: number
  score: number // normalized 0-1
  confidence?: ConfidenceInterval
  distribution?: MetricDistribution
  details?: Record<string, any>
  error?: EvaluationError
  metadata: Record<string, any>
}

export interface ConfidenceInterval {
  lower: number
  upper: number
  level: number // e.g., 0.95 for 95% CI
}

export interface MetricDistribution {
  samples: number[]
  mean: number
  median: number
  std: number
  variance: number
  skewness: number
  kurtosis: number
  percentiles: Record<number, number>
}

export interface AggregatedMetrics {
  [metricId: string]: {
    value: number
    score: number
    confidence?: ConfidenceInterval
    distribution?: MetricDistribution
    trend?: TrendDirection
    ranking: number
  }
}

export type TrendDirection = 'up' | 'down' | 'stable'

export interface PerformanceMetrics {
  latency: LatencyMetrics
  throughput: ThroughputMetrics
  efficiency: EfficiencyMetrics
  reliability: ReliabilityMetrics
}

export interface LatencyMetrics {
  mean: number
  median: number
  p95: number
  p99: number
  min: number
  max: number
  std: number
}

export interface ThroughputMetrics {
  requestsPerSecond: number
  tokensPerSecond: number
  tasksPerMinute: number
}

export interface EfficiencyMetrics {
  tokensPerDollar: number
  tasksPerDollar: number
  costPerToken: number
  costPerTask: number
}

export interface ReliabilityMetrics {
  successRate: number
  errorRate: number
  timeoutRate: number
  retryRate: number
}

export interface ModelCost {
  total: number
  breakdown: CostBreakdown
  currency: string
  pricing: PricingInfo
}

export interface CostBreakdown {
  input: number
  output: number
  caching?: number
  compute?: number
  storage?: number
  network?: number
}

export interface PricingInfo {
  provider: string
  model: string
  inputPerToken: number
  outputPerToken: number
  currency: string
  timestamp: Date
}

export interface ModelTiming {
  total: number
  average: number
  breakdown: TimingBreakdown
}

export interface TimingBreakdown {
  preprocessing: number
  inference: number
  postprocessing: number
  network: number
  queue: number
}

export interface TaskPerformance {
  latency: number
  queueTime: number
  computeTime: number
  networkTime: number
  memoryUsage: number
}

export interface TaskCost {
  input: number
  output: number
  total: number
  currency: string
}

export interface EvaluationSummary {
  overview: SummaryOverview
  rankings: ModelRanking[]
  insights: Insight[]
  recommendations: Recommendation[]
  statistics: EvaluationStatistics
}

export interface SummaryOverview {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  skippedTasks: number
  totalCost: number
  totalTime: number
  averageLatency: number
  bestModel?: ModelSummary
  worstModel?: ModelSummary
}

export interface ModelSummary {
  modelId: string
  modelName: string
  score: number
  rank: number
  metrics: Record<string, number>
}

export interface ModelRanking {
  rank: number
  modelId: string
  modelName: string
  overallScore: number
  metrics: Record<string, number>
  scores: Record<string, number>
  strengths: string[]
  weaknesses: string[]
  confidence: number
}

export interface Insight {
  type: InsightType
  title: string
  description: string
  evidence: Evidence[]
  impact: ImpactLevel
  confidence: number
}

export type InsightType = 
  | 'performance'
  | 'cost'
  | 'quality'
  | 'bias'
  | 'safety'
  | 'efficiency'
  | 'anomaly'

export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical'

export interface Evidence {
  metric: string
  value: number
  context: string
  comparison?: {
    baseline: number
    improvement: number
  }
}

export interface Recommendation {
  id: string
  type: RecommendationType
  priority: Priority
  title: string
  description: string
  rationale: string
  actionItems: ActionItem[]
  expectedImpact: ExpectedImpact
  evidence: Evidence[]
  applicableModels: string[]
  effort: EffortLevel
}

export type RecommendationType = 
  | 'model_selection'
  | 'parameter_tuning'
  | 'data_improvement'
  | 'evaluation_refinement'
  | 'cost_optimization'
  | 'safety_improvement'
  | 'bias_mitigation'

export type Priority = 'low' | 'medium' | 'high' | 'critical'

export interface ActionItem {
  description: string
  type: 'configuration' | 'code' | 'data' | 'process'
  effort: EffortLevel
  dependencies?: string[]
}

export type EffortLevel = 'trivial' | 'low' | 'medium' | 'high' | 'extensive'

export interface ExpectedImpact {
  metrics: Record<string, number>
  confidence: number
  timeframe: string
}

export interface EvaluationStatistics {
  confidenceLevel: number
  marginOfError: number
  sampleSize: number
  populationSize?: number
  tests: StatisticalTest[]
}

export interface StatisticalTest {
  name: string
  type: TestType
  groups: string[]
  result: TestResult
  interpretation: string
}

export type TestType = 
  | 't_test'
  | 'wilcoxon'
  | 'mann_whitney'
  | 'chi_square'
  | 'anova'
  | 'kruskal_wallis'
  | 'friedman'

export interface TestResult {
  statistic: number
  pValue: number
  criticalValue?: number
  significant: boolean
  effectSize?: number
  confidence?: ConfidenceInterval
}

export interface EvaluationArtifact {
  id: string
  name: string
  type: ArtifactType
  path: string
  size: number
  checksum: string
  metadata: Record<string, any>
  createdAt: Date
}

export type ArtifactType = 
  | 'report'
  | 'chart'
  | 'data'
  | 'log'
  | 'model_output'
  | 'checkpoint'
  | 'configuration'

export interface EvaluationLog {
  timestamp: Date
  level: LogLevel
  component: string
  message: string
  details?: Record<string, any>
  stack?: string
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface EvaluationError {
  code: string
  message: string
  details?: Record<string, any>
  stack?: string
  timestamp: Date
  component: string
  recoverable: boolean
}

// ============================================================================
// Statistical Analysis Types
// ============================================================================

export interface StatisticalSummary {
  sampleSize: number
  confidenceLevel: number
  marginOfError: number
  power: number
  significanceTests: SignificanceTest[]
  effectSizes: EffectSize[]
  correlations: Correlation[]
  trends: TrendAnalysis[]
  distributions: DistributionAnalysis[]
  outliers: OutlierAnalysis[]
}

export interface SignificanceTest {
  test: StatisticalTestType
  hypothesis: Hypothesis
  groups: string[]
  assumptions: Assumption[]
  result: TestResult
  interpretation: string
  recommendations: string[]
}

export type StatisticalTestType = 
  | 'parametric'
  | 'non_parametric'
  | 'bayesian'
  | 'robust'

export interface Hypothesis {
  null: string
  alternative: string
  direction: 'two_sided' | 'less' | 'greater'
}

export interface Assumption {
  name: string
  satisfied: boolean
  test?: string
  pValue?: number
  details?: string
}

export interface EffectSize {
  type: EffectSizeType
  groups: string[]
  value: number
  magnitude: Magnitude
  interpretation: string
  confidence?: ConfidenceInterval
}

export type EffectSizeType = 
  | 'cohens_d'
  | 'glass_delta'
  | 'hedges_g'
  | 'eta_squared'
  | 'omega_squared'
  | 'phi'
  | 'cramer_v'
  | 'r'

export type Magnitude = 'negligible' | 'small' | 'medium' | 'large' | 'very_large'

export interface Correlation {
  variables: [string, string]
  coefficient: number
  type: CorrelationType
  pValue: number
  significance: boolean
  strength: CorrelationStrength
  interpretation: string
  confidence?: ConfidenceInterval
}

export type CorrelationType = 'pearson' | 'spearman' | 'kendall' | 'point_biserial'

export type CorrelationStrength = 
  | 'negligible'
  | 'weak'
  | 'moderate'
  | 'strong'
  | 'very_strong'

export interface TrendAnalysis {
  variable: string
  method: TrendMethod
  trend: TrendDirection
  slope: number
  intercept: number
  rSquared: number
  pValue: number
  significance: boolean
  seasonal?: SeasonalPattern
  changePoints?: ChangePoint[]
  forecast?: Forecast
  interpretation: string
}

export type TrendMethod = 'linear' | 'polynomial' | 'exponential' | 'loess' | 'arima'

export interface SeasonalPattern {
  period: number
  strength: number
  pattern: number[]
}

export interface ChangePoint {
  timestamp: Date
  value: number
  confidence: number
  type: 'increase' | 'decrease' | 'variance'
}

export interface Forecast {
  horizon: number
  predictions: Array<{
    timestamp: Date
    value: number
    confidence: ConfidenceInterval
  }>
  method: string
  accuracy: number
}

export interface DistributionAnalysis {
  variable: string
  type: DistributionType
  parameters: DistributionParameters
  goodnessOfFit: GoodnessOfFit
  samples: number[]
  statistics: DistributionStatistics
  visualization?: string
}

export type DistributionType = 
  | 'normal'
  | 'lognormal'
  | 'exponential'
  | 'poisson'
  | 'binomial'
  | 'uniform'
  | 'beta'
  | 'gamma'
  | 'weibull'
  | 'custom'

export interface DistributionParameters {
  [key: string]: number
}

export interface GoodnessOfFit {
  test: string
  statistic: number
  pValue: number
  criticalValue?: number
  rejected: boolean
}

export interface DistributionStatistics {
  mean: number
  median: number
  mode: number
  variance: number
  skewness: number
  kurtosis: number
  entropy?: number
}

export interface OutlierAnalysis {
  variable: string
  method: OutlierMethod
  outliers: Outlier[]
  summary: OutlierSummary
  impact: OutlierImpact
}

export type OutlierMethod = 
  | 'iqr'
  | 'z_score'
  | 'modified_z_score'
  | 'isolation_forest'
  | 'local_outlier_factor'
  | 'dbscan'

export interface Outlier {
  index: number
  value: number
  score: number
  reason: string
  context?: Record<string, any>
}

export interface OutlierSummary {
  count: number
  percentage: number
  minScore: number
  maxScore: number
  averageScore: number
}

export interface OutlierImpact {
  meanDifference: number
  medianDifference: number
  varianceInflation: number
  correlationChanges: Record<string, number>
}

// ============================================================================
// Reporting Types
// ============================================================================

export interface EvaluationReport {
  id: string
  name: string
  description?: string
  version: string
  generatedAt: Date
  config: EvaluationConfig
  result: EvaluationResult
  statisticalSummary: StatisticalSummary
  comparisons: ComparisonResult[]
  visualizations: Visualization[]
  recommendations: Recommendation[]
  appendices: Appendix[]
  metadata: ReportMetadata
}

export interface ComparisonResult {
  id: string
  type: ComparisonType
  baseline: string // model ID
  contenders: string[] // model IDs
  winner?: string | 'tie' | 'inconclusive'
  confidence: number
  methodology: ComparisonMethodology
  metrics: MetricComparison[]
  summary: ComparisonSummary
  details: ComparisonDetails
}

export type ComparisonType = 
  | 'head_to_head'
  | 'multi_model'
  | 'baseline_vs_all'
  | 'pairwise'
  | 'ranking'

export interface ComparisonMethodology {
  approach: string
  statisticalTest: string
  significanceLevel: number
  correctionMethod?: 'bonferroni' | 'holm' | 'benjamini_hochberg'
  assumptions: string[]
  limitations: string[]
}

export interface MetricComparison {
  metricId: string
  metricName: string
  results: Record<string, MetricComparisonResult>
  statisticalTest?: TestResult
  effectSize?: EffectSize
  ranking: string[]
  interpretation: string
}

export interface MetricComparisonResult {
  value: number
  rank: number
  score: number
  difference?: number
  improvement?: number
  significance?: boolean
}

export interface ComparisonSummary {
  overallWinner?: string
  keyFindings: string[]
  significantDifferences: string[]
  tradeoffs: Tradeoff[]
  recommendations: string[]
}

export interface Tradeoff {
  metrics: [string, string]
  description: string
  implications: string[]
}

export interface ComparisonDetails {
  rawData?: string // path to data
  charts?: string[] // paths to charts
  tables?: string[] // paths to tables
  notes?: string[]
}

export interface Visualization {
  id: string
  type: VisualizationType
  title: string
  description: string
  data: VisualizationData
  config: VisualizationConfig
  interactive: boolean
  exportFormats: string[]
}

export type VisualizationType = 
  | 'line_chart'
  | 'bar_chart'
  | 'scatter_plot'
  | 'heatmap'
  | 'box_plot'
  | 'violin_plot'
  | 'histogram'
  | 'radar_chart'
  | 'parallel_coordinates'
  | 'sankey'
  | 'tree_map'
  | 'network_graph'
  | 'table'
  | 'custom'

export interface VisualizationData {
  source: 'inline' | 'file' | 'url'
  format: 'json' | 'csv' | 'parquet'
  data: any
  schema?: Record<string, any>
}

export interface VisualizationConfig {
  library: string
  version: string
  options: Record<string, any>
  theme?: string
  dimensions?: {
    width: number
    height: number
  }
}

export interface Appendix {
  id: string
  title: string
  type: AppendixType
  content: AppendixContent
  order: number
}

export type AppendixType = 
  | 'methodology'
  | 'data_details'
  | 'full_results'
  | 'statistical_tests'
  | 'code'
  | 'configuration'
  | 'glossary'
  | 'references'

export interface AppendixContent {
  format: 'markdown' | 'html' | 'pdf' | 'text'
  content: string
  attachments?: AppendixAttachment[]
}

export interface AppendixAttachment {
  name: string
  type: string
  path: string
  size: number
}

export interface ReportMetadata {
  authors: string[]
  reviewers?: string[]
  tags: string[]
  license?: string
  doi?: string
  citations?: Citation[]
  relatedReports?: string[]
  versionHistory: VersionEntry[]
}

export interface Citation {
  id: string
  authors: string[]
  title: string
  venue?: string
  year: number
  doi?: string
  url?: string
}

export interface VersionEntry {
  version: string
  date: Date
  changes: string[]
  author: string
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheConfig {
  enabled: boolean
  backend: CacheBackend
  eviction: EvictionPolicy
  ttl: TTLPolicy
  maxSize: SizePolicy
  compression: CompressionPolicy
  invalidation: InvalidationPolicy
  monitoring: CacheMonitoring
}

export interface CacheBackend {
  type: 'memory' | 'redis' | 'memcached' | 'disk' | 'database'
  connection?: Record<string, any>
  options: Record<string, any>
}

export interface EvictionPolicy {
  strategy: EvictionStrategy
  maxSize: number // bytes
  maxEntries?: number
  sampling?: number // percentage for approximate LRU
}

export type EvictionStrategy = 
  | 'lru'
  | 'lfu'
  | 'fifo'
  | 'random'
  | 'ttl'
  | 'adaptive'
  | 'custom'

export interface TTLPolicy {
  default: number // seconds
  perKey?: Record<string, number>
  strategy: 'fixed' | 'sliding' | 'extended_on_access'
  jitter?: number // percentage
}

export interface SizePolicy {
  maxMemory: number // bytes
  maxDisk?: number // bytes
  entryLimit?: number
  compressionThreshold: number // bytes
}

export interface CompressionPolicy {
  enabled: boolean
  algorithm: 'gzip' | 'lz4' | 'snappy' | 'brotli' | 'custom'
  level: number
  threshold: number // bytes
}

export interface InvalidationPolicy {
  strategy: InvalidationStrategy
  schedule?: InvalidationSchedule
  triggers?: InvalidationTrigger[]
  semantic?: SemanticInvalidation
}

export type InvalidationStrategy = 
  | 'manual'
  | 'ttl'
  | 'size'
  | 'semantic'
  | 'hybrid'

export interface InvalidationSchedule {
  cron: string
  timezone: string
}

export interface InvalidationTrigger {
  event: string
  condition: string
  action: 'invalidate' | 'refresh' | 'archive'
}

export interface SemanticInvalidation {
  enabled: boolean
  similarity: SimilarityConfig
  model: string // embedding model
  threshold: number
}

export interface SimilarityConfig {
  method: 'cosine' | 'euclidean' | 'manhattan' | 'jaccard'
  normalized: boolean
}

export interface CacheMonitoring {
  metrics: CacheMetrics
  logging: CacheLogging
  alerts: CacheAlert[]
}

export interface CacheMetrics {
  collectionInterval: number // seconds
  retention: number // days
  granularity: 'second' | 'minute' | 'hour'
}

export interface CacheLogging {
  level: LogLevel
  format: 'json' | 'text'
  includeKeys: boolean
  sampling: number // percentage
}

export interface CacheAlert {
  metric: string
  threshold: number
  operator: 'gt' | 'lt' | 'eq'
  severity: 'info' | 'warning' | 'error' | 'critical'
  channels: string[]
}

export interface CacheEntry {
  key: string
  value: any
  size: number
  accessCount: number
  lastAccessed: Date
  createdAt: Date
  ttl?: number
  expiresAt?: Date
  metadata: CacheEntryMetadata
  semanticHash?: string
}

export interface CacheEntryMetadata {
  source: string
  model?: string
  prompt?: string
  parameters?: Record<string, any>
  cost?: number
  latency?: number
  version?: string
}

export interface CacheStats {
  hits: number
  misses: number
  hitRate: number
  evictions: number
  size: number
  maxSize: number
  entries: number
  averageAccessTime: number
  memoryUsage: number
  diskUsage?: number
  compressionRatio?: number
  topKeys: Array<{
    key: string
    hits: number
    size: number
  }>
}

// ============================================================================
// Pipeline and Workflow Types
// ============================================================================

export interface EvaluationPipeline {
  id: string
  name: string
  description: string
  version: string
  stages: PipelineStage[]
  triggers: PipelineTrigger[]
  schedule?: PipelineSchedule
  resources: PipelineResources
  environment: PipelineEnvironment
  notifications: PipelineNotification[]
  metadata: Record<string, any>
}

export interface PipelineStage {
  id: string
  name: string
  type: StageType
  config: StageConfig
  dependencies: string[] // stage IDs
  condition?: string // conditional execution
  retry: StageRetry
  timeout: number
  resources?: StageResources
}

export type StageType = 
  | 'data_preparation'
  | 'model_setup'
  | 'evaluation'
  | 'analysis'
  | 'reporting'
  | 'notification'
  | 'custom'

export interface StageConfig {
  script?: string
  image?: string
  command?: string[]
  parameters?: Record<string, any>
  artifacts?: StageArtifact[]
}

export interface StageArtifact {
  name: string
  path: string
  type: 'input' | 'output'
  required: boolean
}

export interface StageRetry {
  maxAttempts: number
  backoff: BackoffConfig
  retryableErrors: string[]
}

export interface BackoffConfig {
  strategy: 'linear' | 'exponential' | 'fixed'
  initial: number
  maximum: number
  multiplier?: number
  jitter?: boolean
}

export interface StageResources {
  cpu?: number
  memory?: number
  gpu?: number
  disk?: number
}

export interface PipelineTrigger {
  type: TriggerType
  config: TriggerConfig
}

export type TriggerType = 'webhook' | 'schedule' | 'event' | 'manual'

export interface TriggerConfig {
  webhook?: {
    url: string
    method: string
    headers?: Record<string, string>
    secret?: string
  }
  schedule?: {
    cron: string
    timezone: string
  }
  event?: {
    source: string
    type: string
    filters?: Record<string, any>
  }
}

export interface PipelineSchedule {
  enabled: boolean
  cron: string
  timezone: string
  maxRuns?: number
}

export interface PipelineResources {
  default: StageResources
  limits: {
    cpu: number
    memory: number
    gpu: number
  }
}

export interface PipelineEnvironment {
  variables: Record<string, string>
  secrets: Record<string, string>
  files: Array<{
    path: string
    content?: string
    source?: string
  }>
}

export interface PipelineNotification {
  events: Array<'started' | 'completed' | 'failed' | 'paused' | 'resumed'>
  channels: NotificationChannel[]
  template?: string
}

export interface NotificationChannel {
  type: 'email' | 'slack' | 'teams' | 'webhook' | 'sns' | 'pubsub'
  config: Record<string, any>
}

// ============================================================================
// Template and Preset Types
// ============================================================================

export interface EvaluationTemplate {
  id: string
  name: string
  description: string
  category: TemplateCategory
  version: string
  author: string
  config: EvaluationConfig
  parameters: TemplateParameter[]
  documentation: TemplateDocumentation
  requirements: TemplateRequirements
  tags: string[]
  downloads: number
  rating?: number
  createdAt: Date
  updatedAt: Date
}

export type TemplateCategory = 
  | 'model_comparison'
  | 'safety_evaluation'
  | 'performance_testing'
  | 'cost_analysis'
  | 'bias_detection'
  | 'custom'

export interface TemplateParameter {
  name: string
  type: ParameterType
  description: string
  required: boolean
  defaultValue?: any
  options?: any[]
  validation?: ParameterValidation
  group?: string
}

export type ParameterType = 
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'select'
  | 'multiselect'
  | 'file'
  | 'directory'

export interface ParameterValidation {
  min?: number
  max?: number
  pattern?: string
  minLength?: number
  maxLength?: number
  custom?: string // validation function
}

export interface TemplateDocumentation {
  readme: string
  examples: TemplateExample[]
  faq: TemplateFAQ[]
  changelog: TemplateChangelogEntry[]
}

export interface TemplateExample {
  name: string
  description: string
  config: Record<string, any>
  expectedOutcome?: string
}

export interface TemplateFAQ {
  question: string
  answer: string
  category?: string
}

export interface TemplateChangelogEntry {
  version: string
  date: Date
  changes: string[]
  breaking?: boolean
}

export interface TemplateRequirements {
  minFrameworkVersion: string
  dependencies: Array<{
    name: string
    version: string
    optional?: boolean
  }>
  resources: {
    minMemory?: number
    minCpu?: number
    gpuRequired?: boolean
  }
  permissions: string[]
}

export interface EvaluationPreset {
  id: string
  name: string
  description: string
  category: PresetCategory
  config: Partial<EvaluationConfig>
  overrides?: ConfigOverride[]
  metadata: Record<string, any>
}

export type PresetCategory = 
  | 'quick_start'
  | 'comprehensive'
  | 'production'
  | 'research'
  | 'development'

export interface ConfigOverride {
  path: string // dot notation path
  value: any
  condition?: string
}

// ============================================================================
// Error Classes
// ============================================================================

export class EvaluationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any,
    public recoverable: boolean = false
  ) {
    super(message)
    this.name = 'EvaluationError'
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      recoverable: this.recoverable,
      stack: this.stack
    }
  }
}

export class ModelError extends Error {
  constructor(
    message: string,
    public modelId: string,
    public details?: any
  ) {
    super(message)
    this.name = 'ModelError'
  }
}

export class MetricError extends Error {
  constructor(
    message: string,
    public metricId: string,
    public details?: any
  ) {
    super(message)
    this.name = 'MetricError'
  }
}

export class BenchmarkError extends Error {
  constructor(
    message: string,
    public benchmarkId: string,
    public details?: any
  ) {
    super(message)
    this.name = 'BenchmarkError'
  }
}

export class CacheError extends Error {
  constructor(
    message: string,
    public operation: string,
    public key?: string,
    public details?: any
  ) {
    super(message)
    this.name = 'CacheError'
  }
}

export class PipelineError extends Error {
  constructor(
    message: string,
    public pipelineId: string,
    public stageId?: string,
    public details?: any
  ) {
    super(message)
    this.name = 'PipelineError'
  }
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const ModelParametersSchema = z.object({
  maxTokens: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().min(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  stopSequences: z.array(z.string()).optional(),
  seed: z.number().optional(),
  responseFormat: z.enum(['text', 'json_object', 'json_schema']).optional(),
  tools: z.array(z.object({
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
      description: z.string(),
      parameters: z.record(z.any())
    })
  })).optional(),
  toolChoice: z.enum(['none', 'auto', 'required']).optional()
})

export const ModelConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  model: z.string(),
  version: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  parameters: ModelParametersSchema,
  rateLimit: z.object({
    requestsPerMinute: z.number(),
    tokensPerMinute: z.number()
  }).optional(),
  auth: z.object({
    type: z.enum(['bearer', 'basic', 'api_key', 'oauth']),
    credentials: z.record(z.any())
  }).optional(),
  metadata: z.record(z.any()).optional()
})

export const MetricConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum([
    'accuracy', 'precision', 'recall', 'f1', 'auc_roc',
    'bleu', 'rouge', 'meteor', 'bert_score', 'perplexity',
    'latency', 'throughput', 'cost', 'token_efficiency',
    'toxicity', 'bias', 'faithfulness', 'relevance', 'coherence', 'custom'
  ]),
  category: z.enum(['performance', 'quality', 'safety', 'efficiency', 'fairness', 'custom']),
  weight: z.number().min(0).max(1),
  threshold: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    target: z.number().optional()
  }).optional(),
  aggregation: z.enum(['mean', 'median', 'weighted_mean', 'max', 'min']),
  description: z.string(),
  params: z.record(z.any()).optional(),
  calculator: z.string().optional()
})

export const DatasetSourceSchema = z.object({
  type: z.enum(['file', 'url', 'database', 'api', 'huggingface', 'inline']),
  location: z.string().optional(),
  format: z.enum(['json', 'jsonl', 'csv', 'tsv', 'parquet', 'xml']),
  compression: z.enum(['gzip', 'zip', 'bz2']).optional(),
  credentials: z.record(z.any()).optional(),
  data: z.any().optional()
})

export const DatasetConfigSchema = z.object({
  name: z.string(),
  source: DatasetSourceSchema,
  preprocessing: z.object({
    filters: z.array(z.object({
      field: z.string(),
      operator: z.enum(['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'in', 'contains']),
      value: z.any()
    })),
    transformations: z.array(z.object({
      type: z.enum(['map', 'filter', 'rename', 'split', 'join', 'custom']),
      params: z.record(z.any())
    })),
    validation: z.object({
      required: z.array(z.string()),
      schema: z.record(z.any()).optional()
    })
  }).optional(),
  sampling: z.object({
    strategy: z.enum(['random', 'stratified', 'systematic', 'cluster']),
    size: z.number(),
    seed: z.number().optional(),
    strata: z.array(z.string()).optional()
  }).optional(),
  split: z.object({
    type: z.enum(['fixed', 'proportional', 'custom']),
    train: z.union([z.number(), z.array(z.number())]).optional(),
    validation: z.union([z.number(), z.array(z.number())]).optional(),
    test: z.union([z.number(), z.array(z.number())]).optional(),
    indices: z.object({
      train: z.array(z.number()),
      validation: z.array(z.number()),
      test: z.array(z.number())
    }).optional()
  }).optional(),
  version: z.string().optional(),
  checksum: z.string().optional(),
  metadata: z.record(z.any())
})

export const ExecutionConfigSchema = z.object({
  parallelization: z.object({
    enabled: z.boolean(),
    maxConcurrency: z.number().min(1),
    chunkSize: z.number().min(1),
    strategy: z.enum(['task', 'model', 'dataset'])
  }),
  timeout: z.object({
    perTask: z.number().min(1000),
    total: z.number().min(1000)
  }),
  retryPolicy: z.object({
    maxRetries: z.number().min(0),
    backoffMs: z.number().min(100),
    backoffStrategy: z.enum(['linear', 'exponential']),
    retryableErrors: z.array(z.string())
  }),
  resources: z.object({
    maxMemory: z.number().optional(),
    maxCpu: z.number().optional(),
    gpu: z.boolean().optional()
  }),
  checkpointing: z.object({
    enabled: z.boolean(),
    interval: z.number().min(1),
    saveIntermediate: z.boolean()
  })
})

export const EvaluationConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string(),
  tags: z.array(z.string()).optional(),
  benchmarkSuites: z.array(z.string()),
  metrics: z.array(MetricConfigSchema),
  models: z.array(ModelConfigSchema),
  dataset: DatasetConfigSchema,
  evaluationMode: z.enum(['single', 'comparative', 'batch', 'continual']),
  execution: ExecutionConfigSchema,
  output: z.object({
    formats: z.array(z.enum(['json', 'html', 'csv', 'pdf', 'markdown'])),
    destination: z.object({
      type: z.enum(['local', 's3', 'gcs', 'azure', 'database']),
      path: z.string().optional(),
      bucket: z.string().optional(),
      connection: z.record(z.any()).optional()
    }),
    compression: z.object({
      enabled: z.boolean(),
      format: z.enum(['gzip', 'zip', 'lz4'])
    }),
    retention: z.object({
      days: z.number(),
      archiveAfter: z.number().optional()
    })
  }),
  notifications: z.array(z.object({
    type: z.enum(['email', 'webhook', 'slack', 'teams']),
    enabled: z.boolean(),
    triggers: z.array(z.enum(['start', 'progress', 'complete', 'error'])),
    recipients: z.array(z.string()),
    template: z.string().optional()
  })),
  metadata: z.record(z.any())
})

export const CacheConfigSchema = z.object({
  enabled: z.boolean(),
  backend: z.object({
    type: z.enum(['memory', 'redis', 'memcached', 'disk', 'database']),
    connection: z.record(z.any()).optional(),
    options: z.record(z.any())
  }),
  eviction: z.object({
    strategy: z.enum(['lru', 'lfu', 'fifo', 'random', 'ttl', 'adaptive', 'custom']),
    maxSize: z.number(),
    maxEntries: z.number().optional(),
    sampling: z.number().optional()
  }),
  ttl: z.object({
    default: z.number(),
    perKey: z.record(z.number()).optional(),
    strategy: z.enum(['fixed', 'sliding', 'extended_on_access']),
    jitter: z.number().optional()
  }),
  maxSize: z.object({
    maxMemory: z.number(),
    maxDisk: z.number().optional(),
    entryLimit: z.number().optional(),
    compressionThreshold: z.number()
  }),
  compression: z.object({
    enabled: z.boolean(),
    algorithm: z.enum(['gzip', 'lz4', 'snappy', 'brotli', 'custom']),
    level: z.number(),
    threshold: z.number()
  }),
  invalidation: z.object({
    strategy: z.enum(['manual', 'ttl', 'size', 'semantic', 'hybrid']),
    schedule: z.object({
      cron: z.string(),
      timezone: z.string()
    }).optional(),
    triggers: z.array(z.object({
      event: z.string(),
      condition: z.string(),
      action: z.enum(['invalidate', 'refresh', 'archive'])
    })).optional(),
    semantic: z.object({
      enabled: z.boolean(),
      similarity: z.object({
        method: z.enum(['cosine', 'euclidean', 'manhattan', 'jaccard']),
        normalized: z.boolean()
      }),
      model: z.string(),
      threshold: z.number()
    }).optional()
  }),
  monitoring: z.object({
    metrics: z.object({
      collectionInterval: z.number(),
      retention: z.number(),
      granularity: z.enum(['second', 'minute', 'hour'])
    }),
    logging: z.object({
      level: z.enum(['debug', 'info', 'warn', 'error', 'fatal']),
      format: z.enum(['json', 'text']),
      includeKeys: z.boolean(),
      sampling: z.number()
    }),
    alerts: z.array(z.object({
      metric: z.string(),
      threshold: z.number(),
      operator: z.enum(['gt', 'lt', 'eq']),
      severity: z.enum(['info', 'warning', 'error', 'critical']),
      channels: z.array(z.string())
    }))
  })
})
```
