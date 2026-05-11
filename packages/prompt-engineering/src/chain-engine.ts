import { nanoid } from 'nanoid'
import {
  PromptChain,
  ChainStep,
  StepConfig,
  TemplateStepConfig,
  ConditionStepConfig,
  LoopStepConfig,
  ParallelStepConfig,
  TransformStepConfig,
  ExecutionContext,
  ExecutionResult,
  ExecutionHistoryEntry,
  ExecutionMetadata,
  ExecutionResultMetadata,
  CostMetrics,
  ChainExecutionError,
  PromptEngineeringError,
} from './types'
import { TemplateEngine } from './template-engine'

// ============================================================================
// Chain Executor
// ============================================================================

export interface ChainExecutorOptions {
  timeout?: number
  maxCost?: number
  enableCache?: boolean
  onStepStart?: (step: ChainStep, context: ExecutionContext) => void
  onStepComplete?: (step: ChainStep, result: unknown, context: ExecutionContext) => void
  onError?: (error: Error, step: ChainStep, context: ExecutionContext) => void
}

export class ChainExecutor {
  private templateEngine: TemplateEngine
  private options: ChainExecutorOptions

  constructor(templateEngine: TemplateEngine, options: ChainExecutorOptions = {}) {
    this.templateEngine = templateEngine
    this.options = {
      timeout: 30000,
      maxCost: 10.0,
      enableCache: true,
      ...options,
    }
  }

  /**
   * Execute a prompt chain with initial variables
   */
  async execute(
    chain: PromptChain,
    initialVariables: Record<string, unknown> = {}
  ): Promise<ExecutionResult> {
    const startTime = new Date()
    const executionId = nanoid()

    const context: ExecutionContext = {
      variables: { ...initialVariables },
      history: [],
      cache: new Map(),
      metadata: {
        executionId,
        startTime,
        costLimit: this.options.maxCost,
        timeout: this.options.timeout,
      },
    }

    try {
      // Check cost limit
      if (this.options.maxCost && this.getCurrentCost(context) > this.options.maxCost) {
        throw new PromptEngineeringError('Cost limit exceeded', 'COST_LIMIT_EXCEEDED')
      }

      // Execute all steps
      let result: unknown
      for (const step of chain.steps) {
        result = await this.executeStep(step, context)
      }

      const endTime = new Date()
      const duration = endTime.getTime() - startTime.getTime()

      return {
        output: result,
        history: context.history,
        cost: this.calculateTotalCost(context),
        metadata: {
          executionId,
          duration,
          success: true,
          cacheHits: this.countCacheHits(context),
          cacheMisses: this.countCacheMisses(context),
        },
      }
    } catch (error) {
      const endTime = new Date()
      const duration = endTime.getTime() - startTime.getTime()

      return {
        output: null,
        history: context.history,
        cost: this.calculateTotalCost(context),
        metadata: {
          executionId,
          duration,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          cacheHits: this.countCacheHits(context),
          cacheMisses: this.countCacheMisses(context),
        },
      }
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: ChainStep,
    context: ExecutionContext
  ): Promise<unknown> {
    const startTime = new Date()
    this.options.onStepStart?.(step, context)

    try {
      // Check condition if present
      if (step.condition && !this.evaluateCondition(step.condition, context)) {
        return null
      }

      let result: unknown

      switch (step.type) {
        case 'template':
          result = await this.executeTemplateStep(step, context)
          break
        case 'condition':
          result = await this.executeConditionStep(step, context)
          break
        case 'loop':
          result = await this.executeLoopStep(step, context)
          break
        case 'parallel':
          result = await this.executeParallelStep(step, context)
          break
        case 'transform':
          result = await this.executeTransformStep(step, context)
          break
        default:
          throw new ChainExecutionError(step.id, `Unknown step type: ${step.type}`)
      }

      // Store outputs
      if (step.outputs) {
        for (const outputKey of step.outputs) {
          context.variables[outputKey] = result
        }
      }

      // Record execution
      const endTime = new Date()
      const duration = endTime.getTime() - startTime.getTime()

      context.history.push({
        stepId: step.id,
        stepType: step.type,
        input: { variables: { ...context.variables } },
        output: result,
        timestamp: endTime,
        duration,
        cost: this.estimateStepCost(step, result),
      })

      this.options.onStepComplete?.(step, result, context)
      return result
    } catch (error) {
      const endTime = new Date()
      const duration = endTime.getTime() - startTime.getTime()

      context.history.push({
        stepId: step.id,
        stepType: step.type,
        input: { variables: { ...context.variables } },
        output: null,
        timestamp: endTime,
        duration,
        cost: 0,
      })

      const executionError = error instanceof Error ? error : new Error('Unknown error')
      this.options.onError?.(executionError, step, context)
      throw new ChainExecutionError(step.id, executionError.message, executionError)
    }
  }

  /**
   * Execute a template step
   */
  private async executeTemplateStep(
    step: ChainStep,
    context: ExecutionContext
  ): Promise<string> {
    const config = step.config as TemplateStepConfig
    const cacheKey = this.options.enableCache 
      ? `template:${config.templateId}:${JSON.stringify(config.variables)}`
      : null

    // Check cache
    if (cacheKey && context.cache.has(cacheKey)) {
      const cached = context.cache.get(cacheKey)!
      if (cached.timestamp.getTime() + cached.ttl > Date.now()) {
        return cached.value as string
      }
    }

    // Render template
    const result = this.templateEngine.render(config.templateId, {
      ...context.variables,
      ...config.variables,
    })

    // Update output key if specified
    if (config.outputKey) {
      context.variables[config.outputKey] = result
    }

    // Cache result
    if (cacheKey) {
      context.cache.set(cacheKey, {
        value: result,
        timestamp: new Date(),
        ttl: 5 * 60 * 1000, // 5 minutes
      })
    }

    return result
  }

  /**
   * Execute a condition step
   */
  private async executeConditionStep(
    step: ChainStep,
    context: ExecutionContext
  ): Promise<unknown> {
    const config = step.config as ConditionStepConfig
    const conditionMet = this.evaluateCondition(config.condition, context)

    if (conditionMet) {
      return await this.executeStep(config.trueStep, context)
    } else if (config.falseStep) {
      return await this.executeStep(config.falseStep, context)
    }

    return null
  }

  /**
   * Execute a loop step
   */
  private async executeLoopStep(
    step: ChainStep,
    context: ExecutionContext
  ): Promise<unknown[]> {
    const config = step.config as LoopStepConfig
    const items = this.resolveValue(config.over, context)

    if (!Array.isArray(items)) {
      throw new ChainExecutionError(step.id, `Loop over value is not an array: ${config.over}`)
    }

    const results: unknown[] = []
    const maxIterations = config.maxIterations || items.length

    for (let i = 0; i < Math.min(items.length, maxIterations); i++) {
      const item = items[i]
      const loopVariables = {
        ...context.variables,
        [config.as]: item,
        [`${config.as}_index`]: i,
        [`${config.as}_total`]: items.length,
      }

      const loopContext: ExecutionContext = {
        ...context,
        variables: loopVariables,
      }

      const stepResults: unknown[] = []
      for (const loopStep of config.steps) {
        const result = await this.executeStep(loopStep, loopContext)
        stepResults.push(result)
      }

      results.push(stepResults.length === 1 ? stepResults[0] : stepResults)
    }

    return results
  }

  /**
   * Execute a parallel step
   */
  private async executeParallelStep(
    step: ChainStep,
    context: ExecutionContext
  ): Promise<unknown> {
    const config = step.config as ParallelStepConfig

    // Execute all steps in parallel
    const promises = config.steps.map(s => this.executeStep(s, context))
    const results = await Promise.all(promises)

    // Merge results based on strategy
    switch (config.mergeStrategy) {
      case 'concat':
        return results.flat()
      case 'object':
        return results.reduce((acc, result, index) => {
          acc[`step_${index}`] = result
          return acc
        }, {} as Record<string, unknown>)
      case 'custom':
        if (config.mergeConfig?.mergeFunction) {
          // Execute custom merge function
          return this.executeCustomMerge(results, config.mergeConfig, context)
        }
        return results
      default:
        return results
    }
  }

  /**
   * Execute a transform step
   */
  private async executeTransformStep(
    step: ChainStep,
    context: ExecutionContext
  ): Promise<unknown> {
    const config = step.config as TransformStepConfig
    const inputValue = this.resolveValue(config.input, context)

    let result: unknown

    if (typeof config.transform === 'string') {
      // Built-in transform
      result = this.applyBuiltinTransform(config.transform, inputValue)
    } else {
      // Custom transform function
      result = await this.executeCustomTransform(config.transform, inputValue, context)
    }

    // Store in output variable
    context.variables[config.output] = result

    return result
  }

  /**
   * Evaluate a condition expression
   */
  private evaluateCondition(condition: string, context: ExecutionContext): boolean {
    try {
      // Simple condition evaluation (could be enhanced with a proper expression parser)
      const variables = context.variables
      
      // Replace variable references
      let evalExpression = condition.replace(/\b(\w+)\b/g, (match) => {
        if (match in variables) {
          return JSON.stringify(variables[match])
        }
        return match
      })

      // Safe evaluation
      return Function('"use strict"; return (' + evalExpression + ')')()
    } catch (error) {
      throw new ChainExecutionError('condition', `Failed to evaluate condition: ${condition}`)
    }
  }

  /**
   * Resolve a value from variables or literal
   */
  private resolveValue(path: string, context: ExecutionContext): unknown {
    // Check if it's a variable reference
    if (path.startsWith('$')) {
      const varName = path.slice(1)
      return this.getNestedProperty(varName, context.variables)
    }

    // Check if it's in variables
    if (path in context.variables) {
      return context.variables[path]
    }

    // Return as literal
    return path
  }

  /**
   * Get nested property from object
   */
  private getNestedProperty(path: string, obj: unknown): unknown {
    const parts = path.split('.')
    let current: unknown = obj

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part]
      } else {
        return undefined
      }
    }

    return current
  }

  /**
   * Apply built-in transform function
   */
  private applyBuiltinTransform(transform: string, value: unknown): unknown {
    switch (transform) {
      case 'uppercase':
        return typeof value === 'string' ? value.toUpperCase() : value
      case 'lowercase':
        return typeof value === 'string' ? value.toLowerCase() : value
      case 'reverse':
        if (Array.isArray(value)) {
          return value.reverse()
        }
        if (typeof value === 'string') {
          return value.split('').reverse().join('')
        }
        return value
      case 'length':
        if (Array.isArray(value) || typeof value === 'string') {
          return value.length
        }
        return 0
      case 'keys':
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return Object.keys(value)
        }
        return []
      case 'values':
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return Object.values(value)
        }
        return []
      case 'flatten':
        if (Array.isArray(value)) {
          return value.flat()
        }
        return value
      case 'unique':
        if (Array.isArray(value)) {
          return [...new Set(value)]
        }
        return value
      default:
        return value
    }
  }

  /**
   * Execute custom transform function
   */
  private async executeCustomTransform(
    transform: TransformFunction,
    value: unknown,
    context: ExecutionContext
  ): Promise<unknown> {
    if (transform.type === 'javascript' && transform.code) {
      try {
        // Create a safe execution context
        const fn = new Function('value', 'context', transform.code)
        return fn(value, context)
      } catch (error) {
        throw new ChainExecutionError('transform', `Failed to execute custom transform: ${error}`)
      }
    }

    if (transform.type === 'builtin' && transform.function) {
      return this.applyBuiltinTransform(transform.function, value)
    }

    return value
  }

  /**
   * Execute custom merge function
   */
  private async executeCustomMerge(
    results: unknown[],
    mergeConfig: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<unknown> {
    if (mergeConfig.mergeFunction) {
      try {
        const fn = new Function('results', 'context', mergeConfig.mergeFunction as string)
        return fn(results, context)
      } catch (error) {
        throw new ChainExecutionError('parallel', `Failed to execute custom merge: ${error}`)
      }
    }

    return results
  }

  /**
   * Calculate total cost from execution history
   */
  private calculateTotalCost(context: ExecutionContext): CostMetrics {
    let inputTokens = 0
    let outputTokens = 0
    let totalCost = 0

    for (const entry of context.history) {
      if (entry.cost) {
        totalCost += entry.cost
      }
      
      // Estimate tokens (rough approximation)
      if (typeof entry.input === 'string') {
        inputTokens += Math.ceil(entry.input.length / 4)
      }
      if (typeof entry.output === 'string') {
        outputTokens += Math.ceil(entry.output.length / 4)
      }
    }

    return {
      inputTokens,
      outputTokens,
      totalCost,
      currency: 'USD',
    }
  }

  /**
   * Estimate step cost
   */
  private estimateStepCost(step: ChainStep, result: unknown): number {
    // Rough cost estimation based on step type and result size
    let baseCost = 0

    switch (step.type) {
      case 'template':
        baseCost = 0.001 // $0.001 per template render
        break
      case 'condition':
        baseCost = 0.0001
        break
      case 'loop':
        baseCost = 0.0005
        break
      case 'parallel':
        baseCost = 0.002
        break
      case 'transform':
        baseCost = 0.0001
        break
    }

    // Add cost based on result size
    if (typeof result === 'string') {
      baseCost += result.length * 0.000001 // $0.001 per 1M characters
    }

    return baseCost
  }

  /**
   * Get current cost
   */
  private getCurrentCost(context: ExecutionContext): number {
    return context.history.reduce((total, entry) => total + (entry.cost || 0), 0)
  }

  /**
   * Count cache hits
   */
  private countCacheHits(context: ExecutionContext): number {
    return context.history.filter(entry => 
      entry.stepType === 'template' && entry.output !== null
    ).length
  }

  /**
   * Count cache misses
   */
  private countCacheMisses(context: ExecutionContext): number {
    return context.history.filter(entry => 
      entry.stepType === 'template'
    ).length - this.countCacheHits(context)
  }
}

// ============================================================================
// Chain Builder
// ============================================================================

export class ChainBuilder {
  private chain: Partial<PromptChain> = {
    id: nanoid(),
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date(),
    steps: [],
    variables: {},
  }

  id(id: string): ChainBuilder {
    this.chain.id = id
    return this
  }

  name(name: string): ChainBuilder {
    this.chain.name = name
    return this
  }

  description(description: string): ChainBuilder {
    this.chain.description = description
    return this
  }

  step(step: ChainStep): ChainBuilder {
    this.chain.steps!.push(step)
    return this
  }

  templateStep(
    id: string,
    name: string,
    templateId: string,
    variables: Record<string, unknown> = {},
    outputKey?: string
  ): ChainBuilder {
    this.chain.steps!.push({
      id,
      type: 'template',
      name,
      config: { templateId, variables, outputKey },
    })
    return this
  }

  conditionStep(
    id: string,
    name: string,
    condition: string,
    trueStep: ChainStep,
    falseStep?: ChainStep
  ): ChainBuilder {
    this.chain.steps!.push({
      id,
      type: 'condition',
      name,
      config: { condition, trueStep, falseStep },
    })
    return this
  }

  loopStep(
    id: string,
    name: string,
    over: string,
    as: string,
    steps: ChainStep[],
    maxIterations?: number
  ): ChainBuilder {
    this.chain.steps!.push({
      id,
      type: 'loop',
      name,
      config: { over, as, steps, maxIterations },
    })
    return this
  }

  parallelStep(
    id: string,
    name: string,
    steps: ChainStep[],
    mergeStrategy: 'concat' | 'object' | 'custom' = 'concat',
    mergeConfig?: Record<string, unknown>
  ): ChainBuilder {
    this.chain.steps!.push({
      id,
      type: 'parallel',
      name,
      config: { steps, mergeStrategy, mergeConfig },
    })
    return this
  }

  transformStep(
    id: string,
    name: string,
    input: string,
    transform: string | TransformFunction,
    output: string
  ): ChainBuilder {
    this.chain.steps!.push({
      id,
      type: 'transform',
      name,
      config: { input, transform, output },
    })
    return this
  }

  variables(vars: Record<string, any>): ChainBuilder {
    this.chain.variables = { ...this.chain.variables, ...vars }
    return this
  }

  build(): PromptChain {
    if (!this.chain.id) {
      throw new PromptEngineeringError('Chain ID is required', 'MISSING_ID')
    }
    if (!this.chain.name) {
      throw new PromptEngineeringError('Chain name is required', 'MISSING_NAME')
    }
    if (!this.chain.steps || this.chain.steps.length === 0) {
      throw new PromptEngineeringError('Chain must have at least one step', 'MISSING_STEPS')
    }

    return this.chain as PromptChain
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function createChain(id: string, name: string): ChainBuilder {
  return new ChainBuilder().id(id).name(name)
}

export function createTemplateStep(
  id: string,
  name: string,
  templateId: string,
  variables: Record<string, unknown> = {}
): ChainStep {
  return {
    id,
    type: 'template',
    name,
    config: { templateId, variables },
  }
}

export function createConditionStep(
  id: string,
  name: string,
  condition: string,
  trueStep: ChainStep,
  falseStep?: ChainStep
): ChainStep {
  return {
    id,
    type: 'condition',
    name,
    config: { condition, trueStep, falseStep },
  }
}

export function createLoopStep(
  id: string,
  name: string,
  over: string,
  as: string,
  steps: ChainStep[],
  maxIterations?: number
): ChainStep {
  return {
    id,
    type: 'loop',
    name,
    config: { over, as, steps, maxIterations },
  }
}

export function createParallelStep(
  id: string,
  name: string,
  steps: ChainStep[],
  mergeStrategy: 'concat' | 'object' | 'custom' = 'concat'
): ChainStep {
  return {
    id,
    type: 'parallel',
    name,
    config: { steps, mergeStrategy },
  }
}

export function createTransformStep(
  id: string,
  name: string,
  input: string,
  transform: string | TransformFunction,
  output: string
): ChainStep {
  return {
    id,
    type: 'transform',
    name,
    config: { input, transform, output },
  }
}