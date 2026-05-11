import {
  OptimizationConfig,
  OptimizationResult,
  OptimizationTrial,
  OptimizationObjective,
  OptimizationConstraint,
  OptimizationStrategy,
  OptimizationBudget,
  OptimizationError,
  PromptTemplate,
  PromptChain,
  ExecutionResult,
} from './types'
import { TemplateEngine } from './template-engine'
import { ChainExecutor } from './chain-engine'

// ============================================================================
// Optimization Strategies
// ============================================================================

export interface OptimizationStrategyImpl {
  type: string
  optimize(
    config: OptimizationConfig,
    evaluate: (params: Record<string, unknown>) => Promise<OptimizationTrial>
  ): Promise<OptimizationResult>
}

export class GridSearchStrategy implements OptimizationStrategyImpl {
  type = 'grid_search'

  async optimize(
    config: OptimizationConfig,
    evaluate: (params: Record<string, unknown>) => Promise<OptimizationTrial>
  ): Promise<OptimizationResult> {
    const { strategy, budget } = config
    const gridConfig = strategy.config as {
      parameters: Record<string, unknown[]>
      maxIterations?: number
    }

    const parameterNames = Object.keys(gridConfig.parameters)
    const parameterValues = Object.values(gridConfig.parameters)
    
    // Generate all combinations
    const combinations = this.generateCombinations(parameterValues)
    const maxIterations = Math.min(
      budget?.maxIterations || Infinity,
      gridConfig.maxIterations || Infinity,
      combinations.length
    )

    const trials: OptimizationTrial[] = []
    let bestScore = -Infinity
    let bestConfig: Record<string, unknown> = {}

    for (let i = 0; i < maxIterations && i < combinations.length; i++) {
      const combination = combinations[i]
      const params: Record<string, unknown> = {}
      
      parameterNames.forEach((name, index) => {
        params[name] = combination[index]
      })

      try {
        const trial = await evaluate(params)
        trials.push(trial)

        // Update best
        const score = this.calculateScore(trial.metrics, config.objectives)
        if (score > bestScore) {
          bestScore = score
          bestConfig = params
        }
      } catch (error) {
        // Skip failed trials
        continue
      }
    }

    return {
      bestConfig,
      bestScore,
      allResults: trials,
      metadata: {
        strategy: this.type,
        totalIterations: trials.length,
        totalCost: trials.reduce((sum, t) => sum + (t.metrics.cost || 0), 0),
        duration: 0, // Would be calculated in real implementation
        convergenceReached: trials.length >= combinations.length,
      },
    }
  }

  private generateCombinations(values: unknown[][]): unknown[][] {
    if (values.length === 0) return [[]]
    if (values.length === 1) return values[0].map(v => [v])

    const [first, ...rest] = values
    const restCombinations = this.generateCombinations(rest)
    
    return first.flatMap(value => 
      restCombinations.map(combination => [value, ...combination])
    )
  }

  private calculateScore(
    metrics: Record<string, number>,
    objectives: OptimizationObjective[]
  ): number {
    return objectives.reduce((score, obj) => {
      const value = metrics[obj.metric] || 0
      const normalizedValue = obj.type === 'minimize' ? -value : value
      return score + normalizedValue * obj.weight
    }, 0)
  }
}

export class RandomSearchStrategy implements OptimizationStrategyImpl {
  type = 'random_search'

  async optimize(
    config: OptimizationConfig,
    evaluate: (params: Record<string, unknown>) => Promise<OptimizationTrial>
  ): Promise<OptimizationResult> {
    const { strategy, budget } = config
    const randomConfig = strategy.config as {
      parameters: Record<string, { min: number; max: number; type?: 'number' | 'choice'; choices?: unknown[] }>
      maxIterations?: number
    }

    const maxIterations = budget?.maxIterations || randomConfig.maxIterations || 100
    const trials: OptimizationTrial[] = []
    let bestScore = -Infinity
    let bestConfig: Record<string, unknown> = {}

    for (let i = 0; i < maxIterations; i++) {
      const params: Record<string, unknown> = {}

      for (const [name, config] of Object.entries(randomConfig.parameters)) {
        if (config.type === 'choice' && config.choices) {
          params[name] = config.choices[Math.floor(Math.random() * config.choices.length)]
        } else {
          const range = config.max - config.min
          params[name] = config.min + Math.random() * range
        }
      }

      try {
        const trial = await evaluate(params)
        trials.push(trial)

        const score = this.calculateScore(trial.metrics, config.objectives)
        if (score > bestScore) {
          bestScore = score
          bestConfig = params
        }
      } catch (error) {
        continue
      }
    }

    return {
      bestConfig,
      bestScore,
      allResults: trials,
      metadata: {
        strategy: this.type,
        totalIterations: trials.length,
        totalCost: trials.reduce((sum, t) => sum + (t.metrics.cost || 0), 0),
        duration: 0,
        convergenceReached: false,
      },
    }
  }

  private calculateScore(
    metrics: Record<string, number>,
    objectives: OptimizationObjective[]
  ): number {
    return objectives.reduce((score, obj) => {
      const value = metrics[obj.metric] || 0
      const normalizedValue = obj.type === 'minimize' ? -value : value
      return score + normalizedValue * obj.weight
    }, 0)
  }
}

export class BayesianStrategy implements OptimizationStrategyImpl {
  type = 'bayesian'

  async optimize(
    config: OptimizationConfig,
    evaluate: (params: Record<string, unknown>) => Promise<OptimizationTrial>
  ): Promise<OptimizationResult> {
    // Simplified Bayesian optimization - in practice would use Gaussian Processes
    const { strategy, budget } = config
    const bayesianConfig = strategy.config as {
      parameters: Record<string, { min: number; max: number }>
      initialSamples?: number
      maxIterations?: number
    }

    const initialSamples = bayesianConfig.initialSamples || 10
    const maxIterations = budget?.maxIterations || bayesianConfig.maxIterations || 50

    const trials: OptimizationTrial[] = []
    let bestScore = -Infinity
    let bestConfig: Record<string, unknown> = {}

    // Initial random sampling
    for (let i = 0; i < initialSamples; i++) {
      const params = this.randomSample(bayesianConfig.parameters)
      
      try {
        const trial = await evaluate(params)
        trials.push(trial)

        const score = this.calculateScore(trial.metrics, config.objectives)
        if (score > bestScore) {
          bestScore = score
          bestConfig = params
        }
      } catch (error) {
        continue
      }
    }

    // Iterative optimization (simplified)
    for (let i = initialSamples; i < maxIterations; i++) {
      // In practice, would use acquisition function and surrogate model
      const params = this.informedSample(bayesianConfig.parameters, trials)
      
      try {
        const trial = await evaluate(params)
        trials.push(trial)

        const score = this.calculateScore(trial.metrics, config.objectives)
        if (score > bestScore) {
          bestScore = score
          bestConfig = params
        }
      } catch (error) {
        continue
      }
    }

    return {
      bestConfig,
      bestScore,
      allResults: trials,
      metadata: {
        strategy: this.type,
        totalIterations: trials.length,
        totalCost: trials.reduce((sum, t) => sum + (t.metrics.cost || 0), 0),
        duration: 0,
        convergenceReached: false,
      },
    }
  }

  private randomSample(parameters: Record<string, { min: number; max: number }>): Record<string, unknown> {
    const params: Record<string, unknown> = {}
    for (const [name, config] of Object.entries(parameters)) {
      const range = config.max - config.min
      params[name] = config.min + Math.random() * range
    }
    return params
  }

  private informedSample(
    parameters: Record<string, { min: number; max: number }>,
    trials: OptimizationTrial[]
  ): Record<string, unknown> {
    // Simplified: sample near best performing trials
    const sortedTrials = trials.sort((a, b) => {
      const scoreA = this.calculateScore(a.metrics, [])
      const scoreB = this.calculateScore(b.metrics, [])
      return scoreB - scoreA
    })

    const bestTrial = sortedTrials[0]
    const params: Record<string, unknown> = {}

    for (const [name, config] of Object.entries(parameters)) {
      const bestValue = bestTrial.config[name] as number
      const noise = (config.max - config.min) * 0.1 // 10% noise
      params[name] = Math.max(
        config.min,
        Math.min(config.max, bestValue + (Math.random() - 0.5) * noise * 2)
      )
    }

    return params
  }

  private calculateScore(metrics: Record<string, number>, objectives: OptimizationObjective[]): number {
    // Simplified scoring
    return (metrics.quality || 0) - (metrics.cost || 0)
  }
}

// ============================================================================
// Optimization Engine
// ============================================================================

export interface OptimizationEngineOptions {
  strategies?: OptimizationStrategyImpl[]
  defaultStrategy?: string
}

export class OptimizationEngine {
  private strategies = new Map<string, OptimizationStrategyImpl>()
  private defaultStrategy: string

  constructor(options: OptimizationEngineOptions = {}) {
    // Register default strategies
    this.registerStrategy(new GridSearchStrategy())
    this.registerStrategy(new RandomSearchStrategy())
    this.registerStrategy(new BayesianStrategy())

    // Register custom strategies
    if (options.strategies) {
      for (const strategy of options.strategies) {
        this.registerStrategy(strategy)
      }
    }

    this.defaultStrategy = options.defaultStrategy || 'random_search'
  }

  /**
   * Optimize a prompt template
   */
  async optimizeTemplate(
    template: PromptTemplate,
    config: OptimizationConfig,
    testFunction: (template: PromptTemplate, params: Record<string, unknown>) => Promise<ExecutionResult>
  ): Promise<OptimizationResult> {
    const strategy = this.strategies.get(config.strategy.type) || 
                   this.strategies.get(this.defaultStrategy)!

    // Create evaluation function
    const evaluate = async (params: Record<string, unknown>): Promise<OptimizationTrial> => {
      try {
        // Apply optimization parameters to template
        const modifiedTemplate = this.applyTemplateOptimizations(template, params)
        
        // Run test
        const result = await testFunction(modifiedTemplate, params)
        
        // Extract metrics
        const metrics = this.extractMetrics(result, params)
        
        // Check constraints
        if (!this.checkConstraints(metrics, config.constraints)) {
          throw new OptimizationError('Constraint violation')
        }

        return {
          config: params,
          score: this.calculateScore(metrics, config.objectives),
          metrics,
          iteration: 0, // Would be tracked properly
        }
      } catch (error) {
        throw new OptimizationError(`Evaluation failed: ${error}`, error as Error)
      }
    }

    return strategy.optimize(config, evaluate)
  }

  /**
   * Optimize a prompt chain
   */
  async optimizeChain(
    chain: PromptChain,
    config: OptimizationConfig,
    testFunction: (chain: PromptChain, params: Record<string, unknown>) => Promise<ExecutionResult>
  ): Promise<OptimizationResult> {
    const strategy = this.strategies.get(config.strategy.type) || 
                   this.strategies.get(this.defaultStrategy)!

    const evaluate = async (params: Record<string, unknown>): Promise<OptimizationTrial> => {
      try {
        const modifiedChain = this.applyChainOptimizations(chain, params)
        const result = await testFunction(modifiedChain, params)
        const metrics = this.extractMetrics(result, params)

        if (!this.checkConstraints(metrics, config.constraints)) {
          throw new OptimizationError('Constraint violation')
        }

        return {
          config: params,
          score: this.calculateScore(metrics, config.objectives),
          metrics,
          iteration: 0,
        }
      } catch (error) {
        throw new OptimizationError(`Evaluation failed: ${error}`, error as Error)
      }
    }

    return strategy.optimize(config, evaluate)
  }

  /**
   * Register a custom optimization strategy
   */
  registerStrategy(strategy: OptimizationStrategyImpl): void {
    this.strategies.set(strategy.type, strategy)
  }

  /**
   * Apply optimization parameters to a template
   */
  private applyTemplateOptimizations(
    template: PromptTemplate,
    params: Record<string, unknown>
  ): PromptTemplate {
    const modified = { ...template }

    // Example optimizations
    if (params.temperature !== undefined) {
      // Would affect model temperature
    }
    if (params.maxTokens !== undefined) {
      // Would affect max tokens
    }
    if (params.systemPrompt !== undefined) {
      // Would modify system prompt
    }
    if (params.removeWords !== undefined) {
      // Remove words from template
      const wordsToRemove = params.removeWords as string[]
      modified.template = this.removeWords(template.template, wordsToRemove)
    }
    if (params.addInstructions !== undefined) {
      // Add instructions to template
      const instructions = params.addInstructions as string
      modified.template = `${instructions}\n\n${template.template}`
    }

    return modified
  }

  /**
   * Apply optimization parameters to a chain
   */
  private applyChainOptimizations(
    chain: PromptChain,
    params: Record<string, unknown>
  ): PromptChain {
    const modified = { ...chain }

    // Example optimizations
    if (params.stepOrder !== undefined) {
      // Reorder steps
      const newOrder = params.stepOrder as number[]
      modified.steps = newOrder.map(i => chain.steps[i])
    }
    if (params.parallelizeSteps !== undefined) {
      // Convert sequential steps to parallel
      const stepIndices = params.parallelizeSteps as number[]
      // Implementation would create parallel step
    }

    return modified
  }

  /**
   * Extract metrics from execution result
   */
  private extractMetrics(
    result: ExecutionResult,
    params: Record<string, unknown>
  ): Record<string, number> {
    return {
      cost: result.cost.totalCost,
      latency: result.metadata.duration,
      tokens: result.cost.inputTokens + result.cost.outputTokens,
      quality: this.calculateQuality(result),
      success: result.metadata.success ? 1 : 0,
    }
  }

  /**
   * Calculate quality score (simplified)
   */
  private calculateQuality(result: ExecutionResult): number {
    // In practice, would use evaluation metrics
    if (!result.metadata.success) return 0
    if (typeof result.output === 'string') {
      // Simple heuristics
      const length = result.output.length
      const hasStructure = result.output.includes('\n') || result.output.includes('.')
      return Math.min(1, length / 1000) * (hasStructure ? 1.2 : 1)
    }
    return 0.5
  }

  /**
   * Check if metrics satisfy constraints
   */
  private checkConstraints(
    metrics: Record<string, number>,
    constraints: OptimizationConstraint[]
  ): boolean {
    for (const constraint of constraints) {
      const value = metrics[constraint.metric]
      if (value === undefined) continue

      switch (constraint.type) {
        case 'max':
          if (value > constraint.value) return false
          break
        case 'min':
          if (value < constraint.value) return false
          break
        case 'equals':
          if (Math.abs(value - constraint.value) > 0.001) return false
          break
      }
    }
    return true
  }

  /**
   * Calculate composite score from objectives
   */
  private calculateScore(
    metrics: Record<string, number>,
    objectives: OptimizationObjective[]
  ): number {
    return objectives.reduce((score, obj) => {
      const value = metrics[obj.metric] || 0
      const normalizedValue = obj.type === 'minimize' ? -value : value
      return score + normalizedValue * obj.weight
    }, 0)
  }

  /**
   * Remove words from text (simplified)
   */
  private removeWords(text: string, words: string[]): string {
    let result = text
    for (const word of words) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi')
      result = result.replace(regex, '')
    }
    return result.replace(/\s+/g, ' ').trim()
  }
}

// ============================================================================
// Optimization Builder
// ============================================================================

export class OptimizationBuilder {
  private config: Partial<OptimizationConfig> = {
    objectives: [],
    constraints: [],
    strategy: { type: 'random_search', config: {} },
  }

  objective(
    type: 'minimize' | 'maximize',
    metric: 'cost' | 'latency' | 'quality' | 'tokens',
    weight: number
  ): OptimizationBuilder {
    this.config.objectives!.push({ type, metric, weight })
    return this
  }

  constraint(
    type: 'max' | 'min' | 'equals',
    metric: 'cost' | 'latency' | 'tokens',
    value: number
  ): OptimizationBuilder {
    this.config.constraints!.push({ type, metric, value })
    return this
  }

  strategy(
    type: 'grid_search' | 'random_search' | 'bayesian' | 'genetic',
    config: Record<string, unknown>
  ): OptimizationBuilder {
    this.config.strategy = { type, config }
    return this
  }

  budget(budget: OptimizationBudget): OptimizationBuilder {
    this.config.budget = budget
    return this
  }

  build(): OptimizationConfig {
    if (!this.config.objectives || this.config.objectives.length === 0) {
      throw new OptimizationError('At least one objective is required')
    }
    if (!this.config.strategy) {
      throw new OptimizationError('Strategy is required')
    }

    return this.config as OptimizationConfig
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function createOptimization(): OptimizationBuilder {
  return new OptimizationBuilder()
}

export function createGridSearch(parameters: Record<string, unknown[]>): OptimizationStrategy {
  return { type: 'grid_search', config: { parameters } }
}

export function createRandomSearch(parameters: Record<string, { min: number; max: number }>): OptimizationStrategy {
  return { type: 'random_search', config: { parameters } }
}

export function createBayesianOptimization(parameters: Record<string, { min: number; max: number }>): OptimizationStrategy {
  return { type: 'bayesian', config: { parameters } }
}