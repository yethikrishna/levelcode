import { nanoid } from 'nanoid'
import type { 
  OptimizationConfig, 
  SearchSpaceDefinition, 
  ObjectiveConfig, 
  PruningConfig 
} from '../types'
import type {
  HyperparameterResult,
  OptimizationTrial,
  TrialHistory,
  SearchStrategy,
  ObjectiveFunction,
  OptimizationState,
  BayesianConfig,
  GeneticAlgorithmConfig,
  SimulatedAnnealingConfig,
  ParallelConfig,
  MultiObjectiveConfig,
  ConstraintDefinition,
  WarmStartConfig,
  EarlyStoppingConfig,
  OptimizationResult,
  OptimizationReport
} from './types'

// ============================================================================ 
// Hyperparameter Optimizer
// ============================================================================

export class HyperparameterOptimizer {
  private config: OptimizationConfig
  private searchSpace: SearchSpaceDefinition
  private objectives: ObjectiveFunction[] = []
  private constraints: ConstraintDefinition[] = []
  private searchStrategy: SearchStrategy | null = null
  private state: OptimizationState
  private parallelConfig: ParallelConfig
  private earlyStoppingConfig: EarlyStoppingConfig
  private warmStartConfig: WarmStartConfig
  private pruningConfig: PruningConfig
  private bayesianConfig?: BayesianConfig
  private geneticConfig?: GeneticAlgorithmConfig
  private saConfig?: SimulatedAnnealingConfig
  private multiObjectiveConfig?: MultiObjectiveConfig

  constructor(config: OptimizationConfig, searchSpace: SearchSpace) {
    this.config = config
    this.searchSpace = searchSpace
    this.state = {
      currentIteration: 0,
      bestScore: config.objective.direction === 'max' ? -Infinity : Infinity,
      bestParams: {},
      trials: [],
      startTime: new Date(),
      elapsedTime: 0,
      shouldStop: false
    }
    this.parallelConfig = {
      enabled: true,
      maxWorkers: config.parallelTrials,
      resourcePerWorker: {},
    }
    this.earlyStoppingConfig = config.optimization.earlyStopping
    this.warmStartConfig = {
      enabled: false,
      method: 'random',
      warmupSteps: 10
    }
    this.pruningConfig = config.optimization.pruning

    // Initialize search strategy based on method
    this.initializeSearchStrategy()
  }

  async optimize(
    objectiveFunctions: ObjectiveFunction[],
    constraints?: ConstraintDefinition[],
    warmStartPoints?: Array<Record<string, any>>
  ): Promise<OptimizationResult> {
    // Set objectives and constraints
    this.objectives = objectiveFunctions
    this.constraints = constraints || []

    // Apply warm start if provided
    if (warmStartPoints && this.warmStartConfig.enabled) {
      await this.applyWarmStart(warmStartPoints)
    }

    // Start optimization
    const startTime = Date.now()
    
    try {
      switch (this.config.optimization.method) {
        case 'grid_search':
          await this.gridSearch()
          break
        case 'random_search':
          await this.randomSearch()
          break
        case 'bayesian':
          await this.bayesianOptimization()
          break
        case 'optuna':
          await this.optunaOptimization()
          break
        case 'hyperopt':
          await this.hyperoptOptimization()
          break
        case 'genetic':
          await this.geneticAlgorithm()
          break
        case 'simulated_annealing':
          await this.simulatedAnnealing()
          break
        default:
          throw new Error(`Unsupported optimization method: ${this.config.optimization.method}`)
      }

      // Generate final report
      return this.generateReport(Date.now() - startTime)
    } catch (error) {
      throw new Error(`Optimization failed: ${error.message}`)
    }
  }

  // Optimization methods
  private async gridSearch(): Promise<void> {
    const paramGrid = this.generateParameterGrid()
    
    for (const params of paramGrid) {
      const trial = await this.evaluateParameters(params)
      this.state.trials.push(trial)
      
      if (this.isBetterScore(trial.score, this.state.bestScore)) {
        this.updateBestResult(trial)
      }

      this.state.currentIteration++
      this.state.elapsedTime = Date.now() - this.state.startTime.getTime()
      this.state.shouldStop = this.shouldStopEarly()
      
      if (this.state.shouldStop) {
        break
      }
    }
  }

  private async randomSearch(): Promise<void> {
    for (let i = 0; i < this.config.maxTrials; i++) {
      const params = await this.suggestRandomParameters()
      const trial = await this.evaluateParameters(params)
      this.state.trials.push(trial)
      
      if (this.isBetterScore(trial.score, this.state.bestScore)) {
        this.updateBestResult(trial)
      }

      this.state.currentIteration++
      this.state.elapsedTime = Date.now() - this.state.startTime.getTime()
      this.state.shouldStop = this.shouldStopEarly()
      
      if (this.state.shouldStop) {
        break
      }
    }
  }

  private async bayesianOptimization(): Promise<void> {
    if (!this.bayesianConfig) {
      throw new Error('Bayesian optimization config not provided')
    }

    const trials: OptimizationTrial[] = []
    
    for (let i = 0; i < this.config.maxTrials; i++) {
      const params = await this.suggestBayesianParameters(trials)
      const trial = await this.evaluateParameters(params)
      trials.push(trial)
      
      if (this.isBetterScore(trial.score, this.state.bestScore)) {
        this.updateBestResult(trial)
      }

      this.state.currentIteration++
      this.state.elapsedTime = this.state.elapsedTime || Date.now() - this.state.startTime.getTime()
      this.state.shouldStop = this.shouldStopEarly()
      
      if (this.state.shouldStop) {
        break
      }
    }
    
    this.state.trials = trials
  }

  private async optunaOptimization(): Promise<void> {
    // In production, use optuna library
    // For now, fallback to random search
    await this.randomSearch()
  }

  private async hyperoptOptimization(): Promise<void> {
    // In production, use hyperopt library
    // For now, fallback to random search
    await this.randomSearch()
  }

  private async geneticAlgorithm(): Promise<void> {
    if (!this.geneticConfig) {
      throw new Error('Genetic algorithm config not provided')
    }

    let population = this.initializePopulation()
    
    for (let generation = 0; generation < this.geneticConfig.generations; generation++) {
      const fitnessScores = population.individuals.map(ind => ind.fitness)
      
      // Selection
      const selected = this.selectIndividuals(population, fitnessScores)
      
      // Crossover
      const offspring = this.crossover(selected)
      
      // Mutation
      const mutated = this.mutate(offspring)
      
      // Evaluation
      for (const individual of mutated) {
        const trial = await this.evaluateParameters(individual.genes)
        this.state.trials.push(trial)
        
        if (this.isBetterScore(trial.score, this.state.bestScore)) {
          this.updateBestResult(trial)
        }
      }
      
      // Create new generation
      population = this.createNewGeneration(mutated)
      
      this.state.currentIteration++
      this.state.elapsedTime = Date.now() - this.state.startTime.getTime()
      this.state.shouldStop = this.shouldStopEarly()
      
      if (this.state.shouldStop) {
        break
      }
    }
  }

  private async simulatedAnnealing(): Promise<void> {
    if (!this.saConfig) {
      throw new Error('Simulated annealing config not provided')
    }

    let currentParams = await this.suggestRandomParameters()
    let currentScore = await this.evaluateParameters(currentParams).score
    
    const temperatureSchedule = this.generateTemperatureSchedule()
    
    for (let step = 0; step < this.saConfig.steps; step++) {
      const temperature = temperatureSchedule[step]
      
      // Generate neighbor parameters
      const neighborParams = this.generateNeighborParameters(currentParams, temperature)
      const neighborScore = await this.evaluateParameters(neighborParams).score
      
      // Accept or reject based on Metropolis criterion
      const acceptProbability = this.calculateAcceptanceProbability(
        neighborScore - currentScore,
        temperature
      )
      
      if (Math.random() < acceptProbability) {
        currentParams = neighborParams
        currentScore = neighborScore
        
        if (this.isBetterScore(currentScore, this.state.bestScore)) {
          this.updateBestResult(await this.evaluateParameters(currentParams))
        }
      }
      
      this.state.currentIteration++
      this.state.elapsedTime = Date.now() - this.state.startTime.getTime()
      this.state.shouldStop = this.shouldStopEarly()
      
      if (this.state.shouldStop) {
        break
      }
    }
  }

  // Parameter suggestion methods
  private async suggestRandomParameters(): Promise<Record<string, any>> {
    const params: Record<string, any> = {}
    
    for (const [name, definition] of Object.entries(this.searchSpace)) {
      switch (definition.type) {
        case 'categorical':
          params[name] = definition.choices ? 
            definition.choices[Math.floor(Math.random() * definition.choices.length)] :
            definition.default
          break
        case 'uniform':
          if (definition.range) {
            const [min, max] = definition.range
            params[name] = Math.random() * (max - min) + min
          } else if (definition.choices) {
            params[name] = definition.choices[Math.floor(Math.random() * definition.choices.length)]
          }
          break
        case 'loguniform':
          if (definition.range) {
            const [min, max] = definition.range
            params[name] = Math.exp(
            Math.random() * Math.log(max - min) + Math.log(min)
          )
          }
          break
        case 'normal':
          if (definition.mean !== undefined && definition.std !== undefined) {
            params[name] = this.sampleNormalDistribution(definition.mean, definition.std)
          }
          break
        case 'log':
          if (definition.base !== undefined) {
            params[name] = Math.pow(10, 
              Math.random() * Math.log10(definition.base)
            )
          }
          break
        case 'int':
          if (definition.min !== undefined && definition.max !== undefined) {
            const [min, max] = definition.range || [0, 100]
            params[name] = Math.floor(Math.random() * (max - min + 1)) + min
          }
          break
        case 'float':
          if (definition.min !== undefined && definition.max !== undefined) {
            params[name] = Math.random() * (definition.max - definition.min) + definition.min)
          }
          break
        case 'boolean':
          params[name] = Math.random() > 0.5
          break
        default:
          params[name] = definition.default
          break
      }
    }
    
    return params
  }

  private async suggestBayesianParameters(history: OptimizationTrial[]): Promise<Record<string, any>> {
    // In production, use proper Bayesian optimization
    // For now, fallback to random
    return this.suggestRandomParameters()
  }

  private generateNeighborParameters(
    params: Record<string, any>,
    temperature: number
  ): Record<string, any> {
    const neighborParams = { ...params }
    
    for (const [name, definition] of Object.entries(this.searchSpace)) {
      if (definition.range) {
        const [min, max] = definition.range
        const range = max - min
        
        // Add noise based on temperature
        const noise = (Math.random() - 0.5) * 2 * temperature * range * 0.1
        neighborParams[name] = Math.max(min, Math.min(max, params[name] + noise))
      }
    }
    
    return neighborParams
  }

  private generateParameterGrid(): Array<Record<string, any>> {
    const paramNames = Object.keys(this.searchSpace)
    
    // Generate all combinations for grid search
    const grid = []
    const ranges = paramNames.map(name => {
      const definition = this.searchSpace[name]
      
      if (definition.type === 'categorical') {
        return definition.choices || []
      } else if (definition.range) {
        const [min, max] = definition.range
        
        if (definition.type === 'int' || definition.type === 'float') {
          const step = definition.step || 1
          const values: number[] = []
          
          for (let value = min; value <= max; value += step) {
            values.push(value)
          }
          
          return values
        } else if (definition.type === 'uniform' || definition.type === 'loguniform') {
          const numPoints = 10
          const values: number[] = []
          
          for (let i = 0; i < numPoints; i++) {
            const value = min + (i / (numPoints - 1)) * (max - min)
            values.push(value)
          }
          
          return values
        }
      }
    })
    
    const cartesianProduct = this.cartesianProduct(ranges)
    return cartesianProduct.map(combination => {
      const params: Record<string, any> = {}
      
      paramNames.forEach((name, index) => {
        params[name] = combination[index]
      })
      
      return params
    })
  }

  private cartesianProduct<T>(arrays: T[][]): T[][] {
    return arrays.reduce((acc, curr) => 
      acc.flatMap(a => curr.map(b => [...a, b]))
    , [[]])
  }

  // Population methods for genetic algorithm
  private initializePopulation(): {
    const individuals: any[] = []
    
    for (let i = 0; i < this.geneticConfig.populationSize; i++) {
      const genes = await this.suggestRandomParameters()
      const fitness = await this.evaluateParameters(genes).score
      
      individuals.push({
        genes,
        fitness,
        generation: 0,
        parentIds: []
      })
    }
    
    return {
      individuals,
      generation: 0,
      bestFitness: Math.max(...individuals.map(i => i.fitness)),
      averageFitness: individuals.reduce((sum, i) => sum + i.fitness, 0) / individuals.length,
      diversity: this.calculateDiversity(individuals)
    }
  }

  private selectIndividuals(population: any[], fitnessScores: number[]): any[] {
    const selectionMethod = this.geneticConfig.selectionMethod
    const elitismRate = this.geneticConfig.elitism
    const tournamentSize = this.geneticConfig.tournamentSize || 2
    
    const selected: any[] = []
    
    if (selectionMethod === 'tournament') {
      for (let i = 0; i < population.length; i++) {
        const tournament = this.selectTournament(population, fitnessScores, tournamentSize)
        selected.push(tournament)
      }
    } else if (selectionMethod === 'roulette') {
      const fitnessSum = fitnessScores.reduce((a, b) => a + b, 0)
      const probabilities = fitnessScores.map(score => score / fitnessSum)
      
      for (let i = 0; i < population.length; i++) {
        if (Math.random() < probabilities[i]) {
          selected.push(population[i])
        }
      }
    } else if (selectionMethod === 'rank') {
      const sortedIndices = fitnessScores
        .map((score, index) => ({ score, index }))
        .sort((a, b) => b.score - a.score)
        .map(({ index }) => index)
      
      for (let i = 0; i < elitismRate * population.length; i++) {
        selected.push(population[sortedIndices[i]])
      }
    } else {
      // Random selection
      for (let i = 0; i < population.length; i++) {
        selected.push(population[i])
      }
    }
    
    return selected
  }

  private crossover(parents: any[]): Promise<any[]> {
    const offspring: any[] = []
    
    for (let i = 0; i < parents.length - 1; i += 2) {
      const parent1 = parents[i]
      const parent2 = parents[i + 1]
      
      const child1 = { ...parent1.genes }
      const child2 = { ...parent2.genes }
      
      const crossoverMethod = this.geneticConfig.crossoverMethod
      
      if (crossoverMethod === 'single_point') {
        const crossoverPoint = Math.floor(Math.random() * Object.keys(parent1.genes).length)
        const keys = Object.keys(parent1.genes)
        
        for (const key of keys) {
          if (Math.random() < 0.5) {
            child1[key] = parent2[key]
            child2[key] = parent1[key]
          }
        }
      } else if (crossoverMethod === 'two_point') {
        const keys = Object.keys(parent1.genes)
        const crossoverPoint1 = Math.floor(Math.random() * (keys.length - 1) + 1))
        const crossoverPoint2 = Math.floor(Math.random() * (keys.length - 1) + 1))
        
        for (let j = 0; j < keys.length; j++) {
          if (j < crossoverPoint1 || j > crossoverPoint2) {
            child1[keys[j]] = parent2[keys[j]]
          } else {
            child1[keys[j]] = parent1[keys[j]]
          }
        }
      } else if (crossoverMethod === 'uniform' || crossoverMethod === 'arithmetic') {
        const keys = Object.keys(parent1.genes)
        const crossoverPoint1 = Math.floor(Math.random() * (keys.length - 1) + 1))
        const crossoverPoint2 = Math.floor(Math.random() * (keys.length - 1) + 1))
        
        for (let j = 0; j < keys.length; j++) {
          if (j < crossoverPoint1 || j > crossoverPoint2) {
            child1[keys[j]] = parent2[keys[j]]
          } else {
            child1[keys[j]] = parent1[keys[j]]
          }
        }
      }
      
      offspring.push(child1, child2)
    }
    
    return offspring
  }

  private mutate(individuals: any[]): Promise<any[]> {
    const mutated: any[] = []
    
    for (const individual of individuals) {
      const mutatedGenes = { ...individual.genes }
      
      const mutationMethod = this.geneticConfig.mutationMethod
      
      for (const [geneName, geneValue] of Object.entries(mutatedGenes)) {
        const definition = this.searchSpace[geneName]
        
        if (definition.type === 'boolean') {
          mutatedGenes[geneName] = !geneValue
        } else if (definition.range) {
          const [min, max] = definition.range
          const current = geneValue
          
          if (definition.type === 'int' || definition.type === 'float') {
            const step = definition.step || 1
            const mutationRange = Math.max(1, Math.floor((max - min) * 0.1))
            const minMutation = Math.max(min, current - mutationRange)
            const maxMutation = Math.min(max, current + mutationRange)
            
            mutatedGenes[geneName] = Math.floor(Math.random() * (maxMutation - minMutation + 1) + minMutation)
          } else if (definition.type === 'float') {
            const step = definition.step || 0.01
            const mutationRange = Math.max(0.1, (max - min) * 0.1)
            const minMutation = Math.max(min, current - mutationRange)
            const maxMutation = Math.min(max, current + mutationRange)
            
            mutatedGenes[geneName] = Math.random() * (maxMutation - minMutation) + minMutation
          }
        }
      }
      
      mutated.push({
        ...mutatedGenes,
        fitness: await this.evaluateParameters(mutatedGenes).score,
        generation: individual.generation + 1,
        parentIds: [individual.id || 'unknown']
      })
    }
    
    return mutated
  }

  private createNewGeneration(mutated: any[]): any {
    const individuals = [...mutated]
    
    // Keep best individuals (elitism)
    const sortedIndividuals = individuals.sort((a, b) => b.fitness - a.fitness).slice(0, this.geneticConfig.elitism)
    const elites = sortedIndividuals.slice(0, this.geneticConfig.elitism)
    
    // Fill remaining spots with new random individuals
    while (individuals.length < this.geneticConfig.populationSize) {
      const genes = await this.suggestRandomParameters()
      const fitness = await this.evaluateParameters(genes).score
      
      individuals.push({
        genes,
        fitness,
        generation: individuals[0].generation + 1,
        parentIds: []
      })
    }
    
    return {
      individuals,
      generation: individuals[0].generation + 1,
      bestFitness: Math.max(...individuals.map(i => i.fitness)),
      averageFitness: individuals.reduce((sum, i) => sum + i.fitness, 0) / individuals.length,
      diversity: this.calculateDiversity(individuals)
    }
  }

  private calculateDiversity(individuals: any[]): number {
    if (individuals.length < 2) return 1
    
    let totalDiversity = 0
    let pairCount = 0
    
    for (let i = 0; i < individuals.length - 1; i++) {
      for (let j = i + 1; j < individuals.length; j++) {
        const diversity = this.calculateIndividualDiversity(individuals[i], individuals[j])
        totalDiversity += diversity
        pairCount++
      }
    }
    
    return totalDiversity / pairCount
  }

  private calculateIndividualDividualDiversity(individual1: any, individual2: any): number {
    const genes1 = Object.values(individual1.genes)
    const genes2 = Object.values(individual2.genes)
    
    if (genes1.length !== genes2.length) {
      return 0
    }
    
    let similarity = 0
    for (let i = 0; i < genes1.length; i++) {
      if (i < genes2.length) {
        similarity += genes1[i] === genes2[i] ? 1 : 0
      }
    }
    
    return similarity / genes1.length
  }

  // Utility methods
  private async evaluateParameters(params: Record<string, any>): Promise<OptimizationTrial> {
    const trialId = nanoid()
    const startTime = Date.now()
    
    try {
      // Evaluate all objectives
      const metrics: Record<string, number> = {}
      
      for (const objective of this.objectives) {
        const score = await objective.evaluate(params, {
          iteration: this.state.currentIteration,
          trialId,
          metadata: {}
        })
        metrics[objective.name] = score
      }
      
      // Combine multiple objectives if needed
      let finalScore = metrics[this.config.optimization.objective.metric]
      
      if (this.multiObjectiveConfig) {
        finalScore = this.combineObjectives(metrics)
      }
      
      const endTime = Date.now()
      
      return {
        id: trialId,
        params,
        metrics,
        score: finalScore,
        iteration: this.state.currentIteration,
        startTime,
        endTime,
        status: 'completed',
        pruned: false,
      }
    } catch (error) {
      const endTime = Date.now()
      
      return {
        id: trialId,
        params,
        metrics: {},
        score: this.config.objective.direction === 'max' ? -Infinity : Infinity,
        iteration: this.state.currentIteration,
        startTime,
        endTime,
        status: 'failed',
        pruned: false,
        reason: error.message
      }
    }
  }

  private combineObjectives(metrics: Record<string, number>): number {
    const { objectives, weights } = this.multiObjectiveConfig || { objectives: [], weights: [] }
    
    let combinedScore = 0
    let totalWeight = 0
    
    for (let i = 0; i < objectives.length; i++) {
      const objective = objectives.find(obj => obj.name === objectives[i].name)
      if (objective && weights[i] !== undefined) {
        combinedScore += weights[i] * metrics[objective.name]
        totalWeight += weights[i]
      }
    }
    
    return totalWeight > 0 ? combinedScore / totalWeight : 0
  }

  private isBetterScore(currentScore: number, bestScore: number): boolean {
    return this.config.optimization.objective.direction === 'max' 
      ? currentScore > bestScore 
      : currentScore < bestScore
  }

  private updateBestResult(trial: OptimizationTrial): void {
    this.state.bestScore = trial.score
    this.state.bestParams = trial.params
  }

  private shouldStopEarly(): boolean {
    if (!this.earlyStoppingConfig.enabled) {
      return false
    }

    if (this.state.currentIteration < this.config.optimization.minTrials) {
      return false
    }

    // Check patience
    if (this.earlyStoppingConfig.patience > 0) {
      const noImprovementCount = this.state.trials
        .slice(-this.earlyStoppingConfig.patience)
        .filter(trial => !trial.pruned)
        .length

      if (noImprovementCount >= this.earlyStoppingConfig.patience) {
        return true
      }
    }

    // Check minimum delta
    if (this.earlyStoppingConfig.minDelta > 0) {
      const recentScores = this.state.trials
        .slice(-5)
        .filter(trial => !trial.pruned)
        .map(trial => trial.score)

      if (recentScores.length >= 2) {
        const improvement = Math.abs(
          recentScores[recentScores.length - 1] - recentScores[recentScores.length - 2]
        ) / Math.abs(recentScores[recentScores.length - 2])

        if (improvement < this.earlyStoppingConfig.minDelta) {
          return true
        }
      }
    }

    return false
  }

  private generateTemperatureSchedule(): Array<{ step: number; temperature: number }> {
    const schedule: { type: this.saConfig.temperatureSchedule }
    const steps = this.saConfig.steps
    const initial = this.saConfig.initialTemperature
    const final = this.saConfig.finalTemperature
    const coolingRate = this.saConfig.coolingRate

    const schedule: Array<{ step: number; temperature: number }>
    let currentTemp = initial
    
    for (let step = 0; step < steps; step++) {
      schedule.push({ step, currentTemp })
      
      if (schedule.type === 'exponential') {
        currentTemp = final + (initial - final) * Math.pow(coolingRate, step / (steps - 1))
      } else if (schedule.type === 'linear') {
        currentTemp = initial + (final - initial) * (step / (steps - 1))
      } else if (schedule.type === 'logarithmic') {
        currentTemp = initial * Math.pow(coolingRate, step / (steps - 1))
      }
      
      if (currentTemp < final) {
        currentTemp = final
      }
    }
    
    return schedule
  }

  private calculateAcceptanceProbability(deltaScore: number, temperature: number): number {
    const xi = this.bayesianConfig?.xi || 0.01
    const kappa = this.bayesianConfig?.kappa || 2.5
    const exploreExploitRatio = this.config.optimization.objective.exploreExploitRatio || 0.1
    
    const acceptanceProbability = Math.exp(-xi * deltaScore / temperature) / kappa)
    return Math.min(1, acceptanceProbability)
  }

  // Report generation
  private generateReport(totalTime: number): OptimizationResult {
    const bestTrial = this.state.trials.reduce((best, trial) => 
      best.score > best.score ? trial : best
    )
    
    const convergenceIteration = this.findConvergenceIteration()
    const recommendations = this.generateRecommendations()

    return {
      bestParams: this.state.bestParams,
      bestScore: bestTrial.score,
      totalTrials: this.state.trials.length,
      totalTime,
      convergenceIteration,
      trialHistory: this.state.trials,
      recommendations,
      visualizations: this.generateVisualizations(),
      report: this.generateReport()
    }
  }

  private findConvergenceIteration(): number {
    if (this.state.trials.length === 0) return 0
    
    let bestIteration = 0
    let bestScore = this.state.trials[0].score
    
    for (let i = 1; i < this.state.trials.length; i++) {
      if (this.state.trials[i].score > bestScore) {
        bestScore = this.state.trials[i].score
        bestIteration = i
      }
    }
    
    return bestIteration
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = []
    const summary = this.getOptimizationSummary()
    
    if (summary.efficiency < 0.5) {
      recommendations.push('Consider increasing parallel workers or improving resource utilization')
    }

    if (summary.earlyStopping && summary.earlyStopping.patienceRemaining < 2) {
      recommendations.push('Consider adjusting early stopping patience or minimum delta')
    }

    if (summary.trends.memory === 'increasing') {
      recommendations.push('Monitor for memory leaks or consider gradient checkpointing')
    }

    if (summary.trends.cpu === 'increasing' && summary.trends.memory === 'increasing') {
      recommendations.push('System may be overheating - consider throttling or cooling')
    }

    if (this.state.trials.length > 100) {
      recommendations.push('Consider reducing total trials if convergence is fast')
    }

    return recommendations
  }

  private getOptimizationSummary(): {
    const history = this.state.trials
    
    if (history.length === 0) {
      return {}
    }

    const bestScore = Math.max(...history.map(t => t.score))
    const worstScore = Math.min(...history.map(t => t.score))
    const avgScore = history.reduce((sum, t) => sum + t.score, 0) / history.length

    const earlyStoppingRatio = history.filter(t => t.pruned).length / history.length
    const convergenceScore = this.calculateConvergenceScore()

    return {
      bestScore,
      worstScore,
      avgScore,
      totalTrials: history.length,
      earlyStoppingRatio,
      convergenceScore,
    }
  }

  private calculateConvergenceScore(): number {
    if (this.state.trials.length < 10) {
      return 1.0
    }

    const recentScores = this.state.trials.slice(-10).map(t => t.score)
    const olderScores = this.state.trials.slice(-20, -10).map(t => t.score)
    
    const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length
    const olderAvg = olderScores.reduce((a, b) => a + b, 0) / olderScores.length
    
    const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100
    
    return Math.max(0, 1 - Math.abs(changePercent) / 100))
  }

  private generateVisualizations(): Array<{
    name: string
    data: any
    type: 'parameter_importance' | 'convergence_plot' | 'parallel_coordinates'
  }> {
    const visualizations: any[] = []

    // Parameter importance chart
    const paramImportance: this.calculateParameterImportance()
    if (Object.keys(paramImportance).length > 0) {
      visualizations.push({
        name: 'parameter_importance',
        data: paramImportance,
        type: 'parameter_importance'
      })
    }

    // Convergence plot
    const convergenceData = this.state.trials.map((trial, index) => ({
      x: trial.iteration,
      y: trial.score
    }))

    if (convergenceData.length > 1) {
      visualizations.push({
        name: 'convergence_plot',
        data: convergenceData,
        type: 'convergence_plot'
      })
    }

    // Parallel coordinates (for multi-objective optimization)
    if (this.multiObjectiveConfig && this.state.trials.length > 0) {
      const paretoData = this.calculateParetoFrontier()
      if (paretoData.length > 0) {
        visualizations.push({
          name: 'parallel_coordinates',
          data: paretoData,
          type: 'parallel_coordinates'
        })
      }
    }

    return visualizations
  }

  private calculateParameterImportance(): Record<string, number> {
    const importance: Record<string, number> = {}
    const allParams = this.state.trials.map(t => t.params)
    const paramNames = new Set(allParams.flatMap(p => Object.keys(p)))

    for (const paramName of paramNames) {
      const values = allParams
        .filter(p => paramName in p)
        .map(p => p[paramName])
      
      const avgValue = values.reduce((a, b) => a + b, 0) / values.length
      importance[paramName] = avgValue
    }

    return importance
  }

  private calculateParetoFrontier(): Array<{
    x: number
    y: number
  }>> {
    // Simple Pareto front approximation
    const paretoFront: Array<{ x: number; y: number; z: number }>
    const scores = this.state.trials.map((trial, index) => trial.score)
    
    // Sort by score descending
    const sortedTrials = scores
      .map((score, index) => ({ score, index }))
      .sort((a, b) => b.score - a)
      .map(({ index }) => index)
    
    const paretoFront = []
    const numPareto = Math.min(sortedTrials.length, 10)
    
    for (let i = 0; i < numPareto; i++) {
      const trial = this.state.trials[sortedTrials[i].index]
      paretoFront.push({
        x: trial.iteration,
        y: trial.score,
        z: trial.iteration
      })
    }

    return paretoFront
  }
}

// ============================================================================
// Additional utility classes
// ============================================================================

export class GridSearchStrategy implements SearchStrategy {
  name = 'grid_search'
  description = 'Exhaustive grid search over parameter space'
  isCompatible(searchSpace: SearchSpaceDefinition): boolean {
    return true
  }

  async suggestParameters(searchSpace: SearchSpace): Promise<Record<string, any>> {
    const grid = this.generateGrid(searchSpace)
    return grid[0] // Return first combination
  }

  async getNextParameters(
    searchSpace: SearchSpace,
    history: TrialHistory
  ): Promise<Record<string, any>> {
    // Grid search doesn't adapt based on history
    return this.suggestParameters(searchSpace)
  }

  shouldPrune(trial: OptimizationTrial, history: TrialHistory): boolean {
    // Grid search typically doesn't prune
    return false
  }

  private generateGrid(searchSpace: SearchSpace): Array<Record<string, any>> {
    const paramNames = Object.keys(searchSpace)
    const ranges = paramNames.map(name => {
      const definition = searchSpace[name]
      
      if (definition.type === 'int' || definition.type === 'float') {
        if (definition.range) {
          const [min, max] = definition.range
          const step = definition.step || 1
          const values: number[] = []
          
          for (let value = min; value <= max; value += step) {
            values.push(value)
          }
          
          return values
        }
      } else if (definition.choices) {
        return definition.choices
      }
    })

    const cartesianProduct = this.cartesianProduct(ranges)
    return cartesianProduct
  }

  private cartesianProduct<T>(arrays: T[][]): T[][] {
    return arrays.reduce((acc, curr) => 
      acc.flatMap(a => curr.map(b => [...a, b])
    )
  }
}

export class RandomSearchStrategy implements SearchStrategy {
  name = 'random_search'
  description = 'Random parameter sampling'
  isCompatible(searchSpace: SearchSpaceDefinition): boolean {
    return true
  }

  async suggestParameters(searchSpace: SearchSpace): Promise<Record<string, any>> {
    const params = await this.suggestRandomParameters()
    return params
  }

  async getNextParameters(
    searchSpace: SearchSpace,
    history: TrialHistory
  ): Promise<Record<string, any>> {
    // Random search doesn't adapt based on history
    return this.suggestParameters(searchSpace)
  }

  shouldPrune(trial: OptimizationTrial, history: TrialHistory): boolean {
    // Random search typically doesn't prune
    return false
  }

  private async suggestRandomParameters(): Promise<Record<string, any>> {
    const params: Record<string, any> = {}
    
    for (const [name, definition] of Object.entries(this.searchSpace)) {
      params[name] = this.sampleParameter(definition)
    }
    
    return params
  }

  private sampleParameter(definition: any): any {
    switch (definition.type) {
      case 'categorical':
        return definition.choices ? 
          definition.choices[Math.floor(Math.random() * definition.choices.length)] :
          definition.default
      case 'uniform':
        if (definition.range) {
          const [min, max] = definition.range
          return Math.random() * (max - min) + min)
        }
      case 'loguniform':
        if (definition.range) {
          const [min, max] = definition.range
          return Math.exp(
            Math.random() * Math.log10(max - min) + Math.log(min)
          )
        }
      case 'normal':
        if (definition.mean !== undefined && definition.std !== undefined) {
          const normal = this.sampleNormalDistribution(definition.mean, definition.std)
          return normal
        }
      case 'log':
        if (definition.base !== undefined) {
          return Math.pow(10,
            Math.random() * Math.log10(definition.base)
          )
        }
      default:
        return definition.default
    }
  }

  private sampleNormalDistribution(mean: number, std: number): number {
    const u1 = Math.random()
    const u2 = Math.random()
    const normal = mean + std * Math.sqrt(-2 * Math.log(u1) * Math.log(u2))
    return normal
  }
}

export class BayesianStrategy implements SearchStrategy {
  name = 'bayesian'
  description = 'Bayesian optimization with Gaussian Process'
  isCompatible(searchSpace: SearchSpaceDefinition): boolean {
    return true
  }

  async suggestParameters(searchSpace: SearchSpace): Promise<Record<string, any>> {
    // In production, use proper Bayesian optimization
    // For now, fallback to random search
    return this.suggestRandomParameters()
  }

  async getNextParameters(
    searchSpace: SearchSpace,
    history: TrialHistory
  ): Promise<Record<string, any>> {
    // In production, use proper Bayesian optimization
    return this.suggestRandomParameters()
  }

  shouldPrune(trial: OptimizationTrial, history: TrialHistory): boolean {
    // In production, use Bayesian optimization with pruning
    return false
  }
}

export class GeneticStrategy implements SearchStrategy {
  name = 'genetic'
  description = 'Genetic algorithm for global optimization'
  isCompatible(searchSpace: SearchSpaceDefinition): boolean {
    return true
  }

  async suggestParameters(searchSpace: SearchSpace): Promise<Record<string, any>> {
    // In production, use genetic algorithm
    // For now, fallback to random search
    return this.suggestRandomParameters()
  }

  async getNextParameters(
    searchSpace: SearchSpace,
    history: TrialHistory
  ): Promise<Record<string, any>> {
    // In production, use genetic algorithm
    return this.suggestRandomParameters()
  }

  shouldPrune(trial: OptimizationTrial, history: TrialHistory): boolean {
    // In production, use genetic algorithm with pruning
    return false
  }
}

export class SimulatedAnnealingStrategy implements SearchStrategy {
  name = 'simulated_annealing'
  description = 'Simulated annealing for global optimization'
  isCompatible(searchSpace: SearchSpaceDefinition): boolean {
    return true
  }

  async suggestParameters(searchSpace: SearchSpace): Promise<Record<string, any>> {
    // In production, use simulated annealing
    return this.suggestRandomParameters()
  }

  async getNextParameters(
    searchSpace: SearchSpace,
    history: TrialHistory
  : Promise<Record<string, any>> {
    // In production, use simulated annealing
    return this.suggestRandomParameters()
  }

  shouldPrune(trial: OptimizationTrial, history: TrialHistory): boolean {
    // In production, use simulated annealing
    return false
  }
}

// ============================================================================ 
// Advanced Optimization Features
// ============================================================================

export class MultiObjectiveOptimizer {
  private config: MultiObjectiveConfig
  private objectives: ObjectiveFunction[] = []
  private constraints: ConstraintDefinition[] = []

  constructor(config: MultiObjectiveConfig) {
    this.config = config
    this.objectives = []
    this.constraints = []
  }

  addObjective(objective: ObjectiveFunction): void {
    this.objectives.push(objective)
  }

  addConstraint(constraint: ConstraintDefinition): void {
    this.constraints.push(constraint)
  }

  async optimize(
    searchSpace: SearchSpaceDefinition,
    constraints?: ConstraintDefinition[],
    warmStartPoints?: Array<Record<string, any>>
  ): Promise<OptimizationResult> {
    // Convert multi-objective to single objective using weights
    const primaryObjective = this.objectives[0]
    const weightedObjectives = this.objectives.map((obj, index) => ({
      ...obj,
      weight: this.config.objectives[index].weight
    }))

    // Create a single objective function for optimization
    const combinedObjective: ObjectiveFunction = {
      name: 'combined_objective',
      description: `Weighted combination of ${this.objectives.map(o => o.name)} with weights ${this.config.objectives.map(o => o.weight)}`,
      evaluate: async (params: Record<string, any>) => {
        let totalScore = 0
        let totalWeight = 0
        
        for (const [index, objective] of this.objectives.entries()) {
          const score = await objective.evaluate(params, {
            iteration: 0,
            trialId: nanoid(),
            metadata: {}
          })
          totalWeight += objectives[index].weight
          totalScore += objectives[index].weight * score
        }
        
        return totalWeight > 0 ? totalScore / totalWeight : 0
      },
      direction: primaryObjective.direction,
      isHigherBetter: (a: number, b: number) => primaryObjective.isHigherBetter(a, b)
    }

    // Optimize using the combined objective
    return this.optimizeWithObjective(searchSpace, constraints, warmStartPoints)
  }

  private async optimizeWithObjective(
    searchSpace: SearchSpaceDefinition,
    constraints?: ConstraintDefinition[],
    warmStartPoints?: Array<Record<string, any>>
  ): Promise<OptimizationResult> {
    // Create a temporary optimizer with the combined objective
    const tempConfig = {
      ...this.config,
      optimization: {
        ...this.config.optimization,
        method: 'bayesian'
      }
    }

    const tempOptimizer = new HyperparameterOptimizer(tempConfig, searchSpace)
    return tempOptimizer.optimize([combinedObjective], constraints, warmStartPoints)
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function createSearchStrategy(
  method: string,
  searchSpace: SearchSpaceDefinition
): SearchStrategy {
  switch (method) {
    case 'grid_search':
      return new GridSearchStrategy(searchSpace)
    case 'random_search':
      return new RandomSearchStrategy(searchSpace)
    case 'bayesian':
      return new BayesianStrategy(searchSpace)
    case 'optuna':
      return new OptunaStrategy(searchSpace)
    case 'hyperopt':
      return new HyperoptStrategy(searchSpace)
    case 'genetic':
      return new GeneticStrategy(searchSpace)
    case 'simulated_annealing':
      return new SimulatedAnnealingStrategy(searchSpace)
    default:
      throw new RandomSearchStrategy(searchSpace)
  }
}

export function createObjectiveFunction(
  name: string,
  description: string,
  direction: 'minimize' | 'max',
  evaluate: (params: Record<string, any>, metadata?: any) => Promise<number>,
  isHigherBetter?: (a: number, b: number) => boolean = (a > b) === direction === 'max'
): boolean
): ObjectiveFunction {
  return {
    name,
    description,
    direction,
    evaluate,
    isHigherBetter
  }
}

export function createConstraintDefinition(
  name: string,
  description: string,
  type: 'equality' | 'inequality' | 'custom',
  constraint: (params: Record<string, any>) => boolean,
  description?: string
): ConstraintDefinition {
  return {
    name,
    type,
    constraint,
    description,
    isSatisfied: (params: Record<string, any>) => constraint(params)
  }
}

export function createPruningConfig(
  config?: Partial<PruningConfig>
): PruningConfig {
  return {
    enabled: config?.enabled ?? false,
    algorithm: config?.algorithm || 'median',
    minResource: config?.minResource ?? 1,
    maxResource: config?.maxResource ?? 100,
    reductionFactor: config?.reductionFactor || 2,
    warmupSteps: config?.warmupSteps || 5,
  }
}

export function createBayesianConfig(
  config?: Partial<BayesianConfig>
): BayesianConfig {
  return {
    acquisitionFunction: config?.acquisitionFunction || 'EI',
    acquisitionParameters: config?.acquisitionParameters || {},
    kernel: config?.kernel || 'RBF',
    lengthScale: config?.lengthScale || 1.0,
    lengthScaleBounds: config?.lengthScaleBounds || [0.1, 10],
    noiseVariance: config?.noiseVariance || 0.1,
    alpha: config?.alpha || 2.5,
  }
}

export function createGeneticConfig(
  config?: Partial<GeneticAlgorithmConfig>
): GeneticAlgorithmConfig {
  return {
    populationSize: config?.populationSize || 50,
    generations: config?.generations || 100,
    crossoverRate: config?.crossoverRate || 0.8,
    mutationRate: config?.mutationRate || 0.1,
    elitism: config?.elitism || 0.1,
    selectionMethod: config?.selectionMethod || 'tournament',
    tournamentSize: config?.tournamentSize || 2,
    crossoverMethod: config?.crossoverMethod || 'uniform',
    mutationMethod: config?.mutationMethod || 'gaussian',
  }
}

export function createSimulatedAnnealingConfig(
  config?: Partial<SimulatedAnnealingConfig>
): SimulatedAnnealingConfig {
  return {
    temperatureSchedule: config?.temperatureSchedule || 'exponential',
    initialTemperature: config?.initialTemperature || 100.0,
    finalTemperature: config?.finalTemperature || 0.01,
    coolingRate: config?.coolingRate || 0.95,
    steps: config?.steps || 100,
    restarts: config?.restarts || 0,
    adaptive: config?.adaptive || false,
  }
}

export function createMultiObjectiveConfig(
  config?: Partial<MultiObjectiveConfig>
): MultiObjectiveConfig {
  return {
    objectives: config?.objectives || [],
    weights: config?.weights || [],
    aggregationMethod: config?.aggregationMethod || 'weighted_sum',
  }
}