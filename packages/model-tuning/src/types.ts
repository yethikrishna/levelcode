import { z } from 'zod'

/**
 * A training dataset entry for fine-tuning
 */
export interface DatasetEntry {
  /** Unique identifier for the entry */
  id: string
  /** Input prompt or context */
  input: string
  /** Expected output or response */
  output: string
  /** Optional metadata about the entry */
  metadata?: {
    source?: string
    quality?: number
    tags?: string[]
    createdAt?: Date
  }
}

/**
 * A dataset for fine-tuning models
 */
export interface Dataset {
  /** Unique identifier for the dataset */
  id: string
  /** Human-readable name */
  name: string
  /** Description of the dataset */
  description?: string
  /** Dataset entries */
  entries: DatasetEntry[]
  /** Dataset version */
  version: string
  /** Statistics about the dataset */
  stats: {
    totalEntries: number
    avgInputLength: number
    avgOutputLength: number
    totalTokens: number
  }
  /** Metadata */
  metadata: {
    createdBy?: string
    createdAt: Date
    updatedAt: Date
    tags: string[]
  }
}

/**
 * Fine-tuning job configuration
 */
export interface FineTuningJob {
  /** Unique identifier for the job */
  id: string
  /** Name of the job */
  name: string
  /** Description of what this job is training */
  description?: string
  /** Base model to fine-tune */
  baseModel: string
  /** Dataset to use for training */
  dataset: Dataset
  /** Training configuration */
  config: {
    /** Number of training epochs */
    epochs: number
    /** Batch size */
    batchSize: number
    /** Learning rate */
    learningRate: number
    /** Validation split ratio */
    validationSplit: number
    /** Early stopping patience */
    earlyStoppingPatience?: number
    /** Hyperparameters */
    hyperparameters?: Record<string, unknown>
  }
  /** Job status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  /** Training progress */
  progress?: {
    currentEpoch: number
    totalEpochs: number
    currentStep: number
    totalSteps: number
    trainLoss: number
    validationLoss: number
    estimatedTimeRemaining?: number
  }
  /** Results after completion */
  results?: {
    /** Final training loss */
    finalTrainLoss: number
    /** Final validation loss */
    finalValidationLoss: number
    /** Training duration in seconds */
    duration: number
    /** Model checkpoint path */
    checkpointPath: string
    /** Evaluation metrics */
    metrics: Record<string, number>
  }
  /** Error information if failed */
  error?: string
  /** Metadata */
  metadata: {
    createdBy?: string
    createdAt: Date
    updatedAt: Date
    startedAt?: Date
    completedAt?: Date
  }
}

/**
 * A fine-tuned model
 */
export interface FineTunedModel {
  /** Unique identifier for the model */
  id: string
  /** Human-readable name */
  name: string
  /** Description of the model */
  description?: string
  /** Base model used for fine-tuning */
  baseModel: string
  /** Fine-tuning job that created this model */
  jobId: string
  /** Model version */
  version: string
  /** Model endpoint URL for inference */
  endpoint?: string
  /** Model status */
  status: 'training' | 'ready' | 'deployed' | 'failed' | 'archived'
  /** Performance metrics */
  performance?: {
    /** Average quality score */
    avgQuality: number
    /** Average latency in ms */
    avgLatency: number
    /** Cost per 1M tokens */
    costPerMillionTokens: number
    /** Throughput requests per second */
    throughput: number
  }
  /** Metadata */
  metadata: {
    createdBy?: string
    createdAt: Date
    updatedAt: Date
    deployedAt?: Date
    tags: string[]
  }
}

/**
 * Model registry for managing fine-tuned models
 */
export interface ModelRegistry {
  /** Register a new model */
  register(model: FineTunedModel): Promise<void>
  /** Get a model by ID */
  get(id: string): Promise<FineTunedModel | null>
  /** List models with filters */
  list(filters?: {
    baseModel?: string
    status?: FineTunedModel['status']
    createdBy?: string
    tags?: string[]
  }): Promise<FineTunedModel[]>
  /** Update model status */
  updateStatus(id: string, status: FineTunedModel['status']): Promise<void>
  /** Delete a model */
  delete(id: string): Promise<void>
  /** Get deployment endpoint for a model */
  getEndpoint(id: string): Promise<string | null>
}

/**
 * Dataset manager for handling training data
 */
export interface DatasetManager {
  /** Create a new dataset */
  create(dataset: Omit<Dataset, 'id' | 'version' | 'stats' | 'metadata'>): Promise<Dataset>
  /** Get a dataset by ID */
  get(id: string): Promise<Dataset | null>
  /** List datasets */
  list(filters?: {
    tags?: string[]
    createdBy?: string
  }): Promise<Dataset[]>
  /** Update a dataset */
  update(id: string, updates: Partial<Dataset>): Promise<Dataset>
  /** Delete a dataset */
  delete(id: string): Promise<void>
  /** Add entries to a dataset */
  addEntries(datasetId: string, entries: DatasetEntry[]): Promise<void>
  /** Remove entries from a dataset */
  removeEntries(datasetId: string, entryIds: string[]): Promise<void>
  /** Validate dataset quality */
  validate(datasetId: string): Promise<{
    valid: boolean
    issues: string[]
    score: number
  }>
}

/**
 * Training pipeline for orchestrating fine-tuning jobs
 */
export interface TrainingPipeline {
  /** Submit a new fine-tuning job */
  submit(job: Omit<FineTuningJob, 'id' | 'status' | 'metadata'>): Promise<FineTuningJob>
  /** Get job status */
  getStatus(jobId: string): Promise<FineTuningJob | null>
  /** Cancel a running job */
  cancel(jobId: string): Promise<void>
  /** List jobs */
  list(filters?: {
    status?: FineTuningJob['status']
    baseModel?: string
    createdBy?: string
  }): Promise<FineTuningJob[]>
  /** Get job logs */
  getLogs(jobId: string): Promise<string[]>
}

/**
 * Deployment manager for model deployment
 */
export interface DeploymentManager {
  /** Deploy a model to an endpoint */
  deploy(modelId: string, config?: {
    scale?: number
    region?: string
    environment?: 'staging' | 'production'
  }): Promise<string>
  /** Undeploy a model */
  undeploy(modelId: string): Promise<void>
  /** Get deployment status */
  getStatus(modelId: string): Promise<{
    deployed: boolean
    endpoint?: string
    scale?: number
    region?: string
  }>
  /** Scale a deployed model */
  scale(modelId: string, scale: number): Promise<void>
}