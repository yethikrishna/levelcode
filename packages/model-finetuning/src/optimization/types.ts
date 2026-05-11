import type { OptimizationConfig, SearchSpace, SearchRange, SearchChoice, ObjectiveConfig } from '../types'

// ============================================================================
// Optimization Types
// ============================================================================

export interface HyperparameterResult {
  params: Record<string, any>
  score: number
  trialId: string
  iteration: number
  duration: number
  metadata?: Record<string, any>
}

export interface OptimizationTrial {
  id: string
  params: Record<string, any>
  metrics: Record<string, number>
  score: number
  iteration: number
  startTime: Date
  endTime?: Date
  status: 'pending' | 'running' | 'completed' | 'failed' | 'pruned'
  pruned?: boolean
  reason?: string
}

export interface TrialHistory {
  trials: OptimizationTrial[]
  bestTrial: OptimizationTrial | null
  bestScore: number
  currentIteration: number
  totalTrials: number
  completedTrials: number
  prunedTrials: number
}

export interface SearchStrategy {
  name: string
  description: string
  isCompatible(searchSpace: SearchSpace): boolean
  suggestParameters(searchSpace: SearchSpace): Promise<Record<string, any>>
  getNextParameters(searchSpace: SearchSpace, history: TrialHistory): Promise<Record<string, any>>
  shouldPrune(trial: OptimizationTrial, history: TrialHistory): boolean
}

export interface ObjectiveFunction {
  name: string
  description: string
  evaluate(params: Record<string, any>, metadata?: any): Promise<number>
  direction: 'minimize' | 'maximize'
  isHigherBetter(a: number, b: number): boolean
}

export interface PruningConfig {
  enabled: boolean
  algorithm: 'median' | 'asha' | 'hyperband'
  minResource?: number
  maxResource?: number
  reductionFactor?: number
  warmupSteps?: number
}

export interface ParallelConfig {
  enabled: boolean
  maxWorkers?: number
  timeout?: number
  resourcePerWorker?: Record<string, any>
}

export interface OptimizationState {
  currentIteration: number
  bestScore: number
  bestParams: Record<string, any>
  trials: OptimizationTrial[]
  startTime: Date
  elapsedTime: number
  shouldStop: boolean
  reason?: string
}

// ============================================================================
// Search Space Types
// ============================================================================

export type ParameterType = 
  | 'categorical'
  | 'uniform'
  | 'loguniform'
  | 'normal'
  | 'int'
  | 'float'
  | 'boolean'

export interface ParameterDefinition {
  name: string
  type: ParameterType
  range?: [any, any] | SearchChoice
  choices?: any[]
  default?: any
  log?: boolean
  base?: number
  step?: number
  min?: number
  max?: number
}

export type SearchSpaceDefinition = Record<string, ParameterDefinition>

// ============================================================================
// Advanced Optimization Features
// ============================================================================

export interface MultiObjectiveConfig {
  objectives: Array<{
    name: string
    weight: number
    direction: 'minimize' | 'maximize'
  }>
  }
  
  aggregationMethod: 'weighted_sum' | 'pareto' | 'hypervolume' | 'ehvi'
}

export interface ConstraintDefinition {
  name: string
  type: 'equality' | 'inequality' | 'custom'
  constraint: (params: Record<string, any>) => boolean
  description: string
}

export interface WarmStartConfig {
  enabled: boolean
  method: 'random' | 'previous_best' | 'transfer_learning'
  warmupSteps: number
  initialPoints?: Array<Record<string, any>>
}

export interface EarlyStoppingConfig {
  enabled: boolean
  strategy: 'simple' | 'intermediate' | 'successive_halving'
  patience?: number
  minDelta?: number
  metric?: string
  mode?: 'min' | 'max'
}

// ============================================================================
// Result Types
// ============================================================================

export interface OptimizationResult {
  bestParams: Record<string, any>
  bestScore: number
  totalTrials: number
  totalTime: number
  convergenceIteration: number
  trialHistory: TrialHistory
  recommendations: string[]
  visualizations: Array<{
    name: string
    data: any
    type: 'parameter_importance' | 'convergence_plot' | 'parallel_coordinates'
  }>
}

export interface OptimizationReport {
  summary: {
    bestScore: number
    totalTrials: number
    convergenceIteration: number
    totalTime: number
    efficiency: number
    resourceUtilization: number
  }
  details: {
    method: string
    searchSpace: SearchSpaceDefinition
    objective: ObjectiveFunction
    constraints: ConstraintDefinition[]
    trials: OptimizationTrial[]
    bestParameters: Record<string, any>
    analysis: {
      parameterImportance: Record<string, number>
      parameterCorrelations: Record<string, number>
      convergenceMetrics: {
        earlyStopping: boolean
        convergenceRate: number
        efficiency: number
      }
    }
  }
  visualizations: Array<{
    name: string
    data: any
    type: 'parameter_importance' | 'convergence_plot' | 'parallel_coordinates'
  }>
}

// ============================================================================
// Bayesian Optimization Types
// ============================================================================

export interface BayesianConfig {
  acquisitionFunction: 'EI' | 'UCB' | 'PI' | 'TS' | 'GP_UCB' | 'Random'
  acquisitionParameters: Record<string, any>
  kernel: 'RBF' | 'Matern52' | 'Matern32' | 'Hammingard'
  lengthScale?: number
  lengthScaleBounds?: [number, number]
  noiseVariance?: number
  alpha?: number
}

export interface GaussianProcessConfig {
  kernel: string
  kernelParameters: Record<string, any>
  meanFunction?: 'constant' | 'linear' | 'quadratic'
  covarianceFunction?: Record<string, any>
}

export interface AcquisitionFunctionConfig {
  name: string
  description: string
  parameters: Record<string, any>
  exploreExploit: number
  xi?: number
  kappa?: number
}

// ============================================================================
// Genetic Algorithm Types
// ============================================================================

export interface GeneticAlgorithmConfig {
  populationSize: number
  generations: number
  crossoverRate: number
  mutationRate: number
  elitism: number
  selectionMethod: 'tournament' | 'roulette' | 'rank' | 'stochastic'
  tournamentSize?: number
  crossoverMethod: 'single_point' | 'two_point' | 'uniform' | 'arithmetic'
  mutationMethod: 'gaussian' | 'uniform' | 'bit_flip' | 'swap'
}

export interface Individual {
  genes: Record<string, any>
  fitness: number
  generation: number
  parentIds: string[]
}

export interface Population {
  individuals: Individual[]
  generation: number
  bestFitness: number
  averageFitness: number
  diversity: number
}

// ============================================================================
// Simulated Annealing Types
// ============================================================================

export interface SimulatedAnnealingConfig {
  temperatureSchedule: 'exponential' | 'linear' | 'logarithmic' | 'adaptive'
  initialTemperature: number
  finalTemperature: number
  coolingRate: number
  steps: number
  restarts?: number
  adaptive?: boolean
}

export interface TemperatureSchedule {
  type: 'exponential' | 'linear' | 'logarithmic' | 'adaptive'
  initial: number
  final: number
  steps: number
  coolingRate: number
  schedule?: Array<{ step: number; temperature: number }>
}

// ============================================================================
// Utility Types
// ============================================================================

export interface OptimizationMetrics {
  convergenceScore: number
  efficiency: number
  resourceEfficiency: number
  explorationRate: number
  exploitationRate: number
  diversityScore: number
  stabilityScore: number
}

export interface OptimizationAlert {
  type: 'warning' | 'error' | 'info'
  message: string
  timestamp: Date
  trialId?: string
  severity: 'low' | 'medium' | 'high'
  suggestions: string[]
}

export interface OptimizationCheckpoint {
  iteration: number
  bestScore: number
  bestParams: Record<string, any>
  randomState: any
  timestamp: Date
  metadata: Record<string, any>
}