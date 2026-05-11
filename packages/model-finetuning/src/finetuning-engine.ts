import { nanoid } from 'nanoid'
import {
  FineTuningJob,
  DatasetConfig,
  TrainingConfig,
  JobStatus,
  FineTuningProvider,
  JobMetrics,
  JobArtifacts,
  FineTuningError,
  TrainingError,
  ProviderError,
  OpenAIFineTuningConfig,
  HuggingFaceConfig,
  CustomProviderConfig,
} from './types'
import { DatasetManager } from './dataset-manager'
import { TrainingPipeline } from './training-pipeline'
import { OpenAIProvider } from './providers/openai-provider'
import { HuggingFaceProvider } from './providers/huggingface-provider'
import { CustomProvider } from './providers/custom-provider'
import { Monitor } from './monitoring/monitor'

// ============================================================================
// Fine-Tuning Engine
// ============================================================================

export interface FineTuningEngineOptions {
  defaultProvider?: FineTuningProvider
  storagePath?: string
  monitoring?: boolean
  callbacks?: {
    onJobStart?: (job: FineTuningJob) => void
    onJobProgress?: (job: FineTuningJob, metrics: JobMetrics) => void
    onJobComplete?: (job: FineTuningJob, artifacts: JobArtifacts) => void
    onJobError?: (job: FineTuningJob, error: Error) => void
  }
}

export class FineTuningEngine {
  private datasetManager: DatasetManager
  private trainingPipeline: TrainingPipeline
  private monitor?: Monitor
  private providers = new Map<FineTuningProvider, any>()
  private jobs = new Map<string, FineTuningJob>()
  private options: FineTuningEngineOptions

  constructor(options: FineTuningEngineOptions = {}) {
    this.options = {
      defaultProvider: 'openai',
      storagePath: './finetuning-data',
      monitoring: true,
      ...options,
    }

    this.datasetManager = new DatasetManager({
      storagePath: this.options.storagePath,
    })

    this.trainingPipeline = new TrainingPipeline({
      storagePath: this.options.storagePath,
    })

    if (this.options.monitoring) {
      this.monitor = new Monitor({
        storagePath: this.options.storagePath,
      })
    }

    this.initializeProviders()
  }

  /**
   * Create a new fine-tuning job
   */
  async createJob(params: {
    name: string
    description?: string
    baseModel: string
    provider?: FineTuningProvider
    dataset: DatasetConfig
    trainingConfig: TrainingConfig
  }): Promise<FineTuningJob> {
    const job: FineTuningJob = {
      id: nanoid(),
      name: params.name,
      description: params.description,
      baseModel: params.baseModel,
      provider: params.provider || this.options.defaultProvider!,
      dataset: params.dataset,
      trainingConfig: params.trainingConfig,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Validate job configuration
    await this.validateJob(job)

    // Store job
    this.jobs.set(job.id, job)

    // Start monitoring if enabled
    if (this.monitor) {
      await this.monitor.startMonitoring(job)
    }

    return job
  }

  /**
   * Start a fine-tuning job
   */
  async startJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new FineTuningError('Job not found', 'JOB_NOT_FOUND', { jobId })
    }

    if (job.status !== 'pending' && job.status !== 'paused') {
      throw new FineTuningError(
        `Job cannot be started in status: ${job.status}`,
        'INVALID_JOB_STATUS',
        { jobId, status: job.status }
      )
    }

    job.status = 'preparing'
    job.startedAt = new Date()
    job.updatedAt = new Date()

    this.options.callbacks?.onJobStart?.(job)

    try {
      // Prepare dataset
      await this.datasetManager.prepareDataset(job.dataset)

      // Get provider
      const provider = this.providers.get(job.provider)
      if (!provider) {
        throw new ProviderError(
          `Provider not configured: ${job.provider}`,
          job.provider
        )
      }

      // Update status
      job.status = 'running'
      job.updatedAt = new Date()

      // Start training
      const result = await this.executeTraining(job, provider)

      // Complete job
      job.status = 'completed'
      job.completedAt = new Date()
      job.updatedAt = new Date()
      job.artifacts = result.artifacts
      job.metrics = result.metrics

      this.options.callbacks?.onJobComplete?.(job, result.artifacts)

      // Stop monitoring
      if (this.monitor) {
        await this.monitor.stopMonitoring(jobId)
      }
    } catch (error) {
      job.status = 'failed'
      job.updatedAt = new Date()
      job.completedAt = new Date()

      const trainingError = error instanceof Error ? error : new Error('Unknown error')
      this.options.callbacks?.onJobError?.(job, trainingError)

      // Stop monitoring
      if (this.monitor) {
        await this.monitor.stopMonitoring(jobId)
      }

      throw new TrainingError(
        `Training failed for job ${jobId}: ${trainingError.message}`,
        jobId,
        trainingError
      )
    }
  }

  /**
   * Pause a running job
   */
  async pauseJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new FineTuningError('Job not found', 'JOB_NOT_FOUND', { jobId })
    }

    if (job.status !== 'running') {
      throw new FineTuningError(
        `Job cannot be paused in status: ${job.status}`,
        'INVALID_JOB_STATUS',
        { jobId, status: job.status }
      )
    }

    job.status = 'paused'
    job.updatedAt = new Date()

    // Provider-specific pause logic
    const provider = this.providers.get(job.provider)
    if (provider && 'pause' in provider) {
      await provider.pause(jobId)
    }
  }

  /**
   * Resume a paused job
   */
  async resumeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new FineTuningError('Job not found', 'JOB_NOT_FOUND', { jobId })
    }

    if (job.status !== 'paused') {
      throw new FineTuningError(
        `Job cannot be resumed in status: ${job.status}`,
        'INVALID_JOB_STATUS',
        { jobId, status: job.status }
      )
    }

    job.status = 'running'
    job.updatedAt = new Date()

    // Provider-specific resume logic
    const provider = this.providers.get(job.provider)
    if (provider && 'resume' in provider) {
      await provider.resume(jobId)
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new FineTuningError('Job not found', 'JOB_NOT_FOUND', { jobId })
    }

    if (job.status === 'completed' || job.status === 'failed') {
      throw new FineTuningError(
        `Job cannot be cancelled in status: ${job.status}`,
        'INVALID_JOB_STATUS',
        { jobId, status: job.status }
      )
    }

    job.status = 'cancelled'
    job.updatedAt = new Date()
    job.completedAt = new Date()

    // Provider-specific cancel logic
    const provider = this.providers.get(job.provider)
    if (provider && 'cancel' in provider) {
      await provider.cancel(jobId)
    }

    // Stop monitoring
    if (this.monitor) {
      await this.monitor.stopMonitoring(jobId)
    }
  }

  /**
   * Get job details
   */
  getJob(jobId: string): FineTuningJob | undefined {
    return this.jobs.get(jobId)
  }

  /**
   * List all jobs
   */
  listJobs(status?: JobStatus): FineTuningJob[] {
    const jobs = Array.from(this.jobs.values())
    if (status) {
      return jobs.filter(job => job.status === status)
    }
    return jobs
  }

  /**
   * Delete a job
   */
  async deleteJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new FineTuningError('Job not found', 'JOB_NOT_FOUND', { jobId })
    }

    if (job.status === 'running') {
      throw new FineTuningError(
        'Cannot delete a running job',
        'JOB_RUNNING',
        { jobId }
      )
    }

    // Clean up artifacts
    if (job.artifacts) {
      await this.cleanupArtifacts(job.artifacts)
    }

    // Remove from storage
    this.jobs.delete(jobId)

    // Stop monitoring if still active
    if (this.monitor) {
      await this.monitor.stopMonitoring(jobId)
    }
  }

  /**
   * Get job metrics
   */
  async getJobMetrics(jobId: string): Promise<JobMetrics | undefined> {
    const job = this.jobs.get(jobId)
    if (!job) {
      return undefined
    }

    if (job.metrics) {
      return job.metrics
    }

    // Get real-time metrics from monitor
    if (this.monitor && job.status === 'running') {
      return await this.monitor.getMetrics(jobId)
    }

    return undefined
  }

  /**
   * Download job artifacts
   */
  async downloadArtifacts(jobId: string, outputPath: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new FineTuningError('Job not found', 'JOB_NOT_FOUND', { jobId })
    }

    if (!job.artifacts) {
      throw new FineTuningError(
        'No artifacts available for this job',
        'NO_ARTIFACTS',
        { jobId }
      )
    }

    const fs = await import('fs/promises')
    const path = await import('path')

    // Create output directory
    await fs.mkdir(outputPath, { recursive: true })

    // Download model files
    for (const file of job.artifacts.modelFiles) {
      if (file.url) {
        const response = await fetch(file.url)
        const buffer = Buffer.from(await response.arrayBuffer())
        await fs.writeFile(path.join(outputPath, file.name), buffer)
      } else if (file.path) {
        await fs.copyFile(file.path, path.join(outputPath, file.name))
      }
    }

    // Save logs if available
    if (job.artifacts.logs) {
      await fs.writeFile(
        path.join(outputPath, 'training.log'),
        job.artifacts.logs
      )
    }
  }

  /**
   * Evaluate a fine-tuned model
   */
  async evaluateModel(
    jobId: string,
    evaluationDataset: DatasetConfig,
    metrics: string[] = ['accuracy', 'loss', 'perplexity']
  ): Promise<Record<string, number>> {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new FineTuningError('Job not found', 'JOB_NOT_FOUND', { jobId })
    }

    if (job.status !== 'completed') {
      throw new FineTuningError(
        'Job must be completed before evaluation',
        'JOB_NOT_COMPLETED',
        { jobId, status: job.status }
      )
    }

    if (!job.artifacts) {
      throw new FineTuningError(
        'No artifacts available for evaluation',
        'NO_ARTIFACTS',
        { jobId }
      )
    }

    // Get the model file
    const modelFile = job.artifacts.modelFiles.find(f => f.type === 'model')
    if (!modelFile) {
      throw new FineTuningError(
        'No model file found in artifacts',
        'NO_MODEL_FILE',
        { jobId }
      )
    }

    // Load evaluation dataset
    const dataset = await this.datasetManager.loadDataset(evaluationDataset)

    // Run evaluation
    const provider = this.providers.get(job.provider)
    if (!provider || !('evaluate' in provider)) {
      throw new ProviderError(
        `Provider ${job.provider} does not support evaluation`,
        job.provider
      )
    }

    return await provider.evaluate(modelFile, dataset, metrics)
  }

  /**
   * Deploy a fine-tuned model
   */
  async deployModel(
    jobId: string,
    deploymentConfig: {
      endpoint?: string
      scaling?: 'fixed' | 'auto'
      instances?: number
      environment?: Record<string, string>
    }
  ): Promise<string> {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new FineTuningError('Job not found', 'JOB_NOT_FOUND', { jobId })
    }

    if (job.status !== 'completed') {
      throw new FineTuningError(
        'Job must be completed before deployment',
        'JOB_NOT_COMPLETED',
        { jobId, status: job.status }
      )
    }

    const provider = this.providers.get(job.provider)
    if (!provider || !('deploy' in provider)) {
      throw new ProviderError(
        `Provider ${job.provider} does not support deployment`,
        job.provider
      )
    }

    return await provider.deploy(jobId, deploymentConfig)
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private initializeProviders(): void {
    // Initialize OpenAI provider
    this.providers.set('openai', new OpenAIProvider())

    // Initialize Hugging Face provider
    this.providers.set('huggingface', new HuggingFaceProvider())

    // Initialize custom provider
    this.providers.set('custom', new CustomProvider())
  }

  private async validateJob(job: FineTuningJob): Promise<void> {
    // Validate base model
    if (!job.baseModel) {
      throw new FineTuningError('Base model is required', 'MISSING_BASE_MODEL')
    }

    // Validate dataset
    await this.datasetManager.validateDataset(job.dataset)

    // Validate training config
    this.validateTrainingConfig(job.trainingConfig)

    // Validate provider compatibility
    const provider = this.providers.get(job.provider)
    if (!provider) {
      throw new ProviderError(
        `Provider not supported: ${job.provider}`,
        job.provider
      )
    }

    if ('validateModel' in provider) {
      await provider.validateModel(job.baseModel)
    }
  }

  private validateTrainingConfig(config: TrainingConfig): void {
    if (!config.method) {
      throw new FineTuningError('Training method is required', 'MISSING_METHOD')
    }

    if (config.epochs && config.epochs <= 0) {
      throw new FineTuningError('Epochs must be positive', 'INVALID_EPOCHS')
    }

    if (config.batchSize && config.batchSize <= 0) {
      throw new FineTuningError('Batch size must be positive', 'INVALID_BATCH_SIZE')
    }

    if (config.learningRate && config.learningRate <= 0) {
      throw new FineTuningError('Learning rate must be positive', 'INVALID_LEARNING_RATE')
    }
  }

  private async executeTraining(
    job: FineTuningJob,
    provider: any
  ): Promise<{ artifacts: JobArtifacts; metrics: JobMetrics }> {
    // Create provider-specific config
    let providerConfig: any

    switch (job.provider) {
      case 'openai':
        providerConfig = {
          model: job.baseModel,
          training_file: await this.datasetManager.uploadToOpenAI(job.dataset),
          hyperparameters: {
            n_epochs: job.trainingConfig.epochs,
            batch_size: job.trainingConfig.batchSize,
            learning_rate_multiplier: job.trainingConfig.learningRate,
            ...job.trainingConfig.hyperparameters,
          },
          suffix: job.name.toLowerCase().replace(/\s+/g, '-'),
        } as OpenAIFineTuningConfig
        break

      case 'huggingface':
        providerConfig = {
          model: job.baseModel,
          dataset: job.dataset.id,
          hub_model_id: `${job.baseModel}-finetuned-${job.id}`,
          training_args: {
            num_train_epochs: job.trainingConfig.epochs,
            per_device_train_batch_size: job.trainingConfig.batchSize,
            learning_rate: job.trainingConfig.learningRate,
            ...job.trainingConfig.hyperparameters,
          },
          peft_config: job.trainingConfig.method === 'lora' ? {
            r: 16,
            lora_alpha: 32,
            target_modules: ['q_proj', 'v_proj'],
            lora_dropout: 0.05,
          } : undefined,
        } as HuggingFaceConfig
        break

      case 'custom':
        providerConfig = {
          endpoint: 'http://localhost:8080/train',
          model: job.baseModel,
          dataset_path: job.dataset.source.path,
          output_path: `${this.options.storagePath}/models/${job.id}`,
          training_config: job.trainingConfig,
        } as CustomProviderConfig
        break

      default:
        throw new ProviderError(
          `Unsupported provider: ${job.provider}`,
          job.provider
        )
    }

    // Start training
    const result = await provider.startTraining(job.id, providerConfig)

    // Monitor progress
    if (this.monitor) {
      await this.monitor.trackProgress(job.id, (metrics) => {
        job.metrics = metrics
        this.options.callbacks?.onJobProgress?.(job, metrics)
      })
    }

    return result
  }

  private async cleanupArtifacts(artifacts: JobArtifacts): Promise<void> {
    const fs = await import('fs/promises')

    // Delete model files
    for (const file of artifacts.modelFiles) {
      if (file.path) {
        try {
          await fs.unlink(file.path)
        } catch {
          // Ignore errors
        }
      }
    }

    // Delete checkpoints
    if (artifacts.checkpoints) {
      for (const checkpoint of artifacts.checkpoints) {
        if (checkpoint.modelFile.path) {
          try {
            await fs.unlink(checkpoint.modelFile.path)
          } catch {
            // Ignore errors
          }
        }
      }
    }
  }

  /**
   * Close the engine and cleanup resources
   */
  async close(): Promise<void> {
    // Stop all monitoring
    if (this.monitor) {
      await this.monitor.close()
    }

    // Close all providers
    for (const provider of this.providers.values()) {
      if ('close' in provider) {
        await provider.close()
      }
    }

    // Clear jobs
    this.jobs.clear()
  }
}