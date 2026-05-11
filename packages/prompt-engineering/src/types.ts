```typescript
import { z } from 'zod'

// ============================================================================
// Core Value Objects & Types
// ============================================================================

/**
 * Represents a variable definition within a prompt template or composition.
 * This is a more structured and extensible version of a simple placeholder.
 */
export interface VariableDefinition {
  /** The data type of the variable. */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  /** A human-readable description of the variable. */
  description?: string
  /** Whether the variable must be provided during compilation. */
  required: boolean
  /** A default value to use if the variable is not provided. */
  default?: unknown
  /** An array of validation rules to apply to the variable's value. */
  validation?: ValidationRule[]
  /** Example values to guide users or LLMs. */
  examples?: unknown[]
}

/**
 * A single validation rule for a variable.
 * Using a discriminated union for better type safety on the `value` property.
 */
export type ValidationRule =
  | { type: 'min'; value: number; message?: string }
  | { type: 'max'; value: number; message?: string }
  | { type: 'pattern'; value: RegExp; message?: string }
  | { type: 'enum'; value: unknown[]; message?: string }
  | { type: 'custom'; validator: (val: unknown) => boolean; message?: string }

/**
 * A compiled prompt template with all variables resolved into a final string.
 * This is a value object representing the prompt ready to be sent to an LLM.
 */
export interface CompiledPrompt {
  /** The unique ID of the source template. */
  templateId: string
  /** The final, compiled prompt text. */
  text: string
  /** The variable values used for compilation. */
  variables: Record<string, unknown>
  /** The timestamp of compilation. */
  compiledAt: Date
}

/**
 * Metadata associated with a prompt artifact.
 */
export interface PromptArtifactMetadata {
  /** Tags for categorization and search. */
  tags?: string[]
  /** The category the artifact belongs to. */
  category?: string
  /** The author or creator of the artifact. */
  author?: string
  /** Usage statistics. */
  usage?: number
  /** A performance or quality rating. */
  rating?: number
}

// ============================================================================
// Core Prompt Artifact Types
// ============================================================================

/**
 * A reusable prompt template with variables and metadata.
 */
export interface PromptTemplate {
  /** Unique identifier for the template. */
  id: string
  /** Human-readable name. */
  name: string
  /** Description of what the template is for. */
  description?: string
  /** The raw template content with variable placeholders (e.g., `{{userName}}`). */
  template: string
  /** Definitions for variables used in the template. */
  variables: Record<string, VariableDefinition>
  /** Version of the template, following semantic versioning. */
  version: string
  /** Timestamps for creation and last update. */
  createdAt: Date
  updatedAt: Date
  /** Additional metadata. */
  metadata?: PromptArtifactMetadata
}

/**
 * A prompt composition allows building a single prompt from multiple parts.
 * This is distinct from a chain, which involves multiple steps and potentially
 * multiple LLM calls. A composition resolves to one final prompt string.
 */
export interface PromptComposition {
  /** Unique identifier for the composition. */
  id: string
  /** Human-readable name. */
  name: string
  /** Description of the composition's purpose. */
  description?: string
  /** Ordered parts that make up the final prompt. */
  parts: CompositionPart[]
  /** Global variable definitions for the composition. */
  variables: Record<string, VariableDefinition>
  /** Version of the composition. */
  version: string
  /** Timestamps for creation and last update. */
  createdAt: Date
  updatedAt: Date
  /** Additional metadata. */
  metadata?: PromptArtifactMetadata & { complexity: 'simple' | 'medium' | 'complex' }
}

/**
 * A single part within a prompt composition.
 */
export interface CompositionPart {
  /** The order of this part in the final composition. */
  order: number
  /** The type of the part. */
  type: 'text' | 'template' | 'variable' | 'conditional' | 'dynamic'
  /** The content of the part, which varies by type. */
  content: string | ConditionalContent | DynamicContent
  /** An optional condition to determine if this part should be included. */
  condition?: string
}

/** Content for a 'conditional' part. */
export interface ConditionalContent {
  template: string
  elseTemplate?: string
}

/** Configuration for fetching dynamic content. */
export interface DynamicContent {
  /** The source of the dynamic content. */
  source: 'function' | 'api' | 'database' | 'file'
  /** Configuration specific to the source. */
  config: Record<string, unknown>
  /** Optional caching configuration. */
  cache?: {
    ttl: number
    key: string
    strategy: 'memory' | 'disk' | 'redis'
  }
}

// ============================================================================
// Chain Types
// ============================================================================

/**
 * A prompt chain defines a multi-step workflow, potentially with multiple
 * LLM calls, conditional logic, loops, and data transformations.
 */
export interface PromptChain {
  /** Unique identifier for the chain. */
  id: string
  /** Human-readable name. */
  name: string
  /** Description of the chain's workflow. */
  description?: string
  /** The sequence of steps in the chain. */
  steps: ChainStep[]
  /** Global variable definitions for the chain. */
  variables: Record<string, VariableDefinition>
  /** Version of the chain. */
  version: string
  /** Timestamps for creation and last update. */
  createdAt: Date
  updatedAt: Date
  /** Additional metadata. */
  metadata?: PromptArtifactMetadata & {
    estimatedCost?: number
    estimatedLatency?: number
  }
}

/**
 * A single step in a prompt chain.
 */
export interface ChainStep {
  /** Unique identifier for the step within the chain. */
  id: string
  /** The type of the step, which determines its configuration and behavior. */
  type: 'template' | 'condition' | 'loop' | 'parallel' | 'transform'
  /** A name for the step. */
  name: string
  /** The configuration for the step, which varies by type. */
  config: StepConfig
  /** Optional keys for variables this step outputs. */
  outputs?: string[]
}

/** Discriminated union for step configurations. */
export type StepConfig =
  | TemplateStepConfig
  | ConditionStepConfig
  | LoopStepConfig
  | ParallelStepConfig
  | TransformStepConfig

/** Config for a step that executes a single prompt template. */
export interface TemplateStepConfig {
  /** The ID of the prompt template to execute. */
  templateId: string
  /** Variables to pass to the template. */
  variables: Record<string, unknown>
  /** The key to store the LLM response under. */
  outputKey: string
}

/** Config for a conditional step (if/else logic). */
export interface ConditionStepConfig {
  /** A JavaScript expression that evaluates to true or false. */
  condition: string
  /** The step to execute if the condition is true. */
  trueStep: ChainStep
  /** The step to execute if the condition is false. */
  falseStep?: ChainStep
}

/** Config for a loop step. */
export interface LoopStepConfig {
  /** The variable name to iterate over (must be an array). */
  over: string
  /** The variable name to use for the current item in the iteration. */
  as: string
  /** The steps to execute in each iteration. */
  steps: ChainStep[]
  /** A safety limit to prevent infinite loops. */
  maxIterations?: number
}

/** Config for executing steps in parallel. */
export interface ParallelStepConfig {
  /** The steps to execute in parallel. */
  steps: ChainStep[]
  /** Strategy for merging the results of parallel steps. */
  mergeStrategy: 'concat' | 'object' | 'custom'
  /** Configuration for the merge strategy, if needed. */
  mergeConfig?: Record<string, unknown>
}

/** Config for transforming data without an LLM call. */
export interface TransformStepConfig {
  /** The key of the input variable to transform. */
  input: string
  /** The transformation to apply. */
  transform: TransformFunction
  /** The key to store the transformed output under. */
  output: string
}

/** A function used for data transformation. */
export type TransformFunction =
  | { type: 'javascript'; code: string }
  | { type: 'builtin'; function: string }

// ============================================================================
// Execution & Result Types
// ============================================================================

/**
 * The context for a single execution of a template, chain, or composition.
 */
export interface ExecutionContext {
  /** The current state of all variables in the execution. */
  variables: Record<string, unknown>
  /** A log of all completed steps. */
  history: ExecutionHistoryEntry[]
  /** An in-memory cache for results. */
  cache: Map<string, CachedResult>
  /** Metadata for the execution run. */
  metadata: ExecutionMetadata
}

/** A single entry in the execution history log. */
export interface ExecutionHistoryEntry {
  /** The ID of the step that was executed. */
  stepId: string
  /** The type of step that was executed. */
  stepType: string
  /** The input data provided to the step. */
  input: unknown
  /** The output data produced by the step. */
  output: unknown
  /** The timestamp when the step started. */
  timestamp: Date
  /** The duration of the step in milliseconds. */
  duration: number
  /** The cost incurred by this step (e.g., from an LLM call). */
  cost?: CostMetrics
}

/** Metadata for an execution run. */
export interface ExecutionMetadata {
  /** Unique ID for this specific execution. */
  executionId: string
  /** The timestamp when the execution started. */
  startTime: Date
  /** Optional ID of the user who initiated the execution. */
  userId?: string
  /** Optional ID for grouping related executions. */
  sessionId?: string
  /** A maximum cost limit for the execution. */
  costLimit?: number
  /** A timeout for the execution in milliseconds. */
  timeout?: number
}

/** A cached result from a previous execution. */
export interface CachedResult {
  /** The cached value. */
  value: unknown
  /** The timestamp when the result was cached. */
  timestamp: Date
  /** The time-to-live for the cache entry in milliseconds. */
  ttl: number
  /** The cost associated with generating the original result. */
  cost?: number
}

/** The final result of an execution. */
export interface ExecutionResult {
  /** The primary output of the execution. */
  output: unknown
  /** The complete history of the execution. */
  history: ExecutionHistoryEntry[]
  /** The total cost metrics for the entire execution. */
  cost: CostMetrics
  /** Metadata about the execution result. */
  metadata: ExecutionResultMetadata
}

/** Detailed cost metrics. */
export interface CostMetrics {
  /** The number of input tokens used. */
  inputTokens: number
  /** The number of output tokens generated. */
  outputTokens: number
  /** The total monetary cost. */
  totalCost: number
  /** The currency of the cost (e.g., 'USD'). */
  currency: string
  /** The LLM provider used (e.g., 'openai', 'anthropic'). */
  provider: string
  /** The model name used (e.g., 'gpt-4-turbo'). */
  model: string
}

/** Metadata summarizing the execution result. */
export interface ExecutionResultMetadata {
  /** The execution ID. */
  executionId: string
  /** The total duration of the execution in milliseconds. */
  duration: number
  /** Whether the execution was successful. */
  success: boolean
  /** An error message if the execution failed. */
  error?: string
  /** The number of cache hits during execution. */
  cacheHits: number
  /** The number of cache misses during execution. */
  cacheMisses: number
}

// ============================================================================
// Experimentation & Optimization Types
// ============================================================================

/**
 * Configuration for an A/B test or experiment comparing prompt artifacts.
 */
export interface PromptExperiment {
  /** Unique identifier for the experiment. */
  id: string
  /** Name of the experiment. */
  name: string
  /** Description of what's being tested. */
  description?: string
  /** The artifacts being tested. The first is the control. */
  artifacts: Array<{
    /** The ID of the artifact (template, chain, or composition). */
    id: string
    /** The type of artifact. */
    type: 'template' | 'chain' | 'composition'
  }>
  /** Test configuration. */
  config: {
    /** Percentage of traffic to allocate to each variant. */
    trafficSplit: number[]
    /** Success criteria for the test. */
    successCriteria: {
      /** The metric to optimize for (e.g., 'quality', 'cost'). */
      metric: string
      /** The desired direction of improvement. */
      direction: 'increase' | 'decrease'
      /** Minimum performance improvement to be considered significant. */
      minImprovement: number
      /** Statistical confidence threshold (e.g., 0.95 for 95%). */
      confidence: number
    }
    /** Conditions for stopping the test. */
    stopConditions: {
      /** Minimum sample size per variant. */
      minSampleSize: number
      /** Maximum duration in hours. */
      maxDuration: number
    }
  }
  /** The current status of the experiment. */
  status: 'draft' | 'running' | 'completed' | 'paused' | 'cancelled'
  /** Results of the experiment, populated upon completion. */
  results?: {
    /** Performance metrics for each artifact. */
    metrics: Array<{
      artifactId: string
      sampleSize: number
      avgScore: number
      avgLatency: number
      avgCost: number
      confidence: number
    }>
    /** The ID of the winning artifact. */
    winner?: string
    /** Whether the result is statistically significant. */
    significance: boolean
  }
}

/**
 * Configuration for an automated optimization task.
 */
export interface OptimizationConfig {
  /** The objectives of the optimization (e.g., minimize cost). */
  objectives: OptimizationObjective[]
  /** Constraints on the optimization (e.g., latency must be below X). */
  constraints: OptimizationConstraint[]
  /** The search strategy to use. */
  strategy: OptimizationStrategy
  /** Budget and resource limits for the optimization run. */
  budget?: OptimizationBudget
}

/** An optimization objective. */
export interface OptimizationObjective {
  type: 'minimize' | 'maximize'
  metric: 'cost' | 'latency' | 'quality' | 'tokens'
  weight: number // Used for multi-objective optimization
}

/** An optimization constraint. */
export interface OptimizationConstraint {
  type: 'max' | 'min' | 'equals'
  metric: 'cost' | 'latency' | 'tokens'
  value: number
}

/** The strategy for finding the optimal configuration. */
export interface OptimizationStrategy {
  type: 'grid_search' | 'random_search' | 'bayesian' | 'genetic'
  config: Record<string, unknown>
}

/** Budget limits for the optimization process. */
export interface OptimizationBudget {
  maxCost?: number
  maxIterations?: number
  maxTime?: number // in minutes
}

/** The result of an optimization run. */
export interface OptimizationResult {
  /** The best configuration found. */
  bestConfig: Record<string, unknown>
  /** The score of the best configuration. */
  bestScore: number
  /** All trials that were run during optimization. */
  allResults: OptimizationTrial[]
  /** Metadata about the optimization run. */
  metadata: OptimizationMetadata
}

/** A single trial in an optimization run. */
export interface OptimizationTrial {
  /** The configuration used in this trial. */
  config: Record<string, unknown>
  /** The score achieved by this configuration. */
  score: number
  /** The metrics recorded for this trial. */
  metrics: Record<string, number>
  /** The iteration number of this trial. */
  iteration: number
}

/** Metadata summarizing the optimization process. */
export interface OptimizationMetadata {
  strategy: string
  totalIterations: number
  totalCost: number
  duration: number
  convergenceReached: boolean
}

// ============================================================================
// Registry & Error Types
// ============================================================================

/**
 * A registry for storing and managing prompt artifacts.
 */
export interface PromptSystemRegistry {
  // --- Template Methods ---
  getTemplate(id: string): Promise<PromptTemplate | null>
  saveTemplate(template: PromptTemplate): Promise<void>
  listTemplates(filters?: {
    tags?: string[]
    author?: string
    limit?: number
    offset?: number
  }): Promise<PromptTemplate[]>
  deleteTemplate(id: string): Promise<void>
  searchTemplates(query: string): Promise<PromptTemplate[]>

  // --- Chain Methods ---
  getChain(id: string): Promise<PromptChain | null>
  saveChain(chain: PromptChain): Promise<void>
  listChains(filters?: {
    tags?: string[]
    author?: string
    limit?: number
    offset?: number
  }): Promise<PromptChain[]>
  deleteChain(id: string): Promise<void>
  searchChains(query: string): Promise<PromptChain[]>

  // --- Composition Methods ---
  getComposition(id: string): Promise<PromptComposition | null>
  saveComposition(comp: PromptComposition): Promise<void>
  listCompositions(filters?: {
    tags?: string[]
    author?: string
    limit?: number
    offset?: number
  }): Promise<PromptComposition[]>
  deleteComposition(id: string): Promise<void>
  searchCompositions(query: string): Promise<PromptComposition[]>
}

// ============================================================================
// Error Handling
// ============================================================================

/** Base class for all custom errors in the system. */
export class PromptEngineeringError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'PromptEngineeringError'
  }
}

/** Error thrown when a requested artifact is not found. */
export class ArtifactNotFoundError extends PromptEngineeringError {
  constructor(id: string, type: 'template' | 'chain' | 'composition') {
    super(`${type} not found: ${id}`, 'ARTIFACT_NOT_FOUND', { id, type })
  }
}

/** Error thrown when a variable fails validation. */
export class VariableValidationError extends PromptEngineeringError {
  constructor(
    variableName: string,
    value: unknown,
    rule: ValidationRule
  ) {
    super(
      `Variable validation failed for "${variableName}": ${rule.message || 'Invalid value'}`,
      'VARIABLE_VALIDATION_ERROR',
      { variableName, value, rule }
    )
  }
}

/** Error thrown during chain execution. */
export class ChainExecutionError extends PromptEngineeringError {
  constructor(
    stepId: string,
    message: string,
    public readonly cause?: Error
  ) {
    super(
      `Chain execution failed at step "${stepId}": ${message}`,
      'CHAIN_EXECUTION_ERROR',
      { stepId }
    )
  }
}

/** Error thrown during an optimization run. */
export class OptimizationError extends PromptEngineeringError {
  constructor(message: string, public readonly cause?: Error) {
    super(message, 'OPTIMIZATION_ERROR')
  }
}

// ============================================================================
// Zod Schema Definitions (for runtime validation)
// ============================================================================

const ValidationRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('min'), value: z.number(), message: z.string().optional() }),
  z.object({ type: z.literal('max'), value: z.number(), message: z.string().optional() }),
  z.object({ type: z.literal('pattern'), value: z.instanceof(RegExp), message: z.string().optional() }),
  z.object({ type: z.literal('enum'), value: z.array(z.unknown()), message: z.string().optional() }),
  z.object({ 
    type: z.literal('custom'), 
    validator: z.function().args(z.unknown()).returns(z.boolean()),
    message: z.string().optional() 
  }),
])

export const VariableDefinitionSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  description: z.string().optional(),
  required: z.boolean(),
  default: z.unknown().optional(),
  validation: z.array(ValidationRuleSchema).optional(),
  examples: z.array(z.unknown()).optional(),
})

const TransformFunctionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('javascript'), code: z.string() }),
  z.object({ type: z.literal('builtin'), function: z.string() }),
])

const StepConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('template'), templateId: z.string(), variables: z.record(z.unknown()), outputKey: z.string() }),
  z.object({ type: z.literal('condition'), condition: z.string(), trueStep: z.any(), falseStep: z.any().optional() }), // Recursive schemas are complex, using z.any() for brevity
  z.object({ type: z.literal('loop'), over: z.string(), as: z.string(), steps: z.array(z.any()), maxIterations: z.number().optional() }),
  z.object({ type: z.literal('parallel'), steps: z.array(z.any()), mergeStrategy: z.enum(['concat', 'object', 'custom']), mergeConfig: z.record(z.unknown()).optional() }),
  z.object({ type: z.literal('transform'), input: z.string(), transform: TransformFunctionSchema, output: z.string() }),
])

export const PromptTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  template: z.string(),
  variables: z.record(VariableDefinitionSchema),
  version: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  metadata: z.object({
    tags: z.array(z.string()).optional(),
    category: z.string().optional(),
    author: z.string().optional(),
    usage: z.number().optional(),
    rating: z.number().optional(),
  }).optional(),
})
```
