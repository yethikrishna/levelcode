import { nanoid } from 'nanoid'
import type { FineTuningConfig, TrainingJob, JobStatus, JobProgress } from '../types'
import type { TrainingState, BatchData, TrainingStepResult } from './types'
import { Trainer } from './trainer'
import { CheckpointManager } from './checkpoint-manager'
import { MetricsLogger } from './metrics-logger'
import { EarlyStoppingManager } from './early-stopping'
import { ResourceMonitor } from './resource-monitor'

// ============================================================================
// Training Pipeline
// ============================================================================

export class TrainingPipeline {
  private config: FineTuningConfig
  private job: TrainingJob
  private trainer: Trainer
  private checkpointManager: CheckpointManager
  private metricsLogger: MetricsLogger
  private earlyStoppingManager: EarlyStoppingManager
  private resourceMonitor: ResourceMonitor
  private state: TrainingState
  private isRunning: boolean = false
  private shouldStop: boolean = false

  constructor(config: FineTuningConfig) {
    this.config = config
    this.state = {
      epoch: 0,
      step: 0,
      totalSteps: 0,
      bestMetric: config.training.earlyStopping.mode === 'max' ? -Infinity : Infinity,
      bestCheckpoint: '',
      shouldStop: false
    }

    // Initialize components
    this.trainer = new Trainer(config)
    this.checkpointManager = new CheckpointManager(config.training.checkpointing)
    this.metricsLogger = new MetricsLogger(config.training.logging)
    this.earlyStoppingManager = new EarlyStoppingManager(config.training.earlyStopping)
    this.resourceMonitor = new ResourceMonitor()

    // Initialize job
    this.job = {
      id: nanoid(),
      config,
      status: { phase: 'pending' },
      createdAt: new Date(),
      progress: {
        currentStep: 0,
        totalSteps: 0,
        currentEpoch: 0,
        totalEpochs: config.training.hyperparameters.numEpochs,
        percentage: 0
      },
      metrics: {
        trainLoss: [],
        validationLoss: [],
        learningRates: [],
        evaluationScores: {},
        resourceUsage: {
          cpu: [],
          memory: [],
          disk: [],
          networkIn: [],
          networkOut: []
        },
        timestamps: []
      },
      checkpoints: [],
      artifacts: [],
      logs: [],
      errors: []
    }
  }

  async start(): Promise<TrainingJob> {
    if (this.isRunning) {
      throw new Error('Training is already running')
    }

    try {
      this.isRunning = true
      this.job.status.phase = 'running'
      this.job.startedAt = new Date()

      // Log start
      this.addLog('INFO', 'Starting training pipeline')

      // Setup trainer
      await this.trainer.setup()

      // Calculate total steps
      const datasetSize = await this.trainer.getDatasetSize()
      const batchSize = this.config.training.hyperparameters.batchSize
      const numEpochs = this.config.training.hyperparameters.numEpochs
      this.state.totalSteps = Math.ceil(datasetSize / batchSize) * numEpochs
      this.job.progress.totalSteps = this.state.totalSteps

      // Load checkpoint if exists
      await this.loadCheckpoint()

      // Start training
      await this.runTraining()

      // Finalize
      await this.finalizeTraining()

      this.job.status.phase = 'completed'
      this.job.completedAt = new Date()
      this.addLog('INFO', 'Training completed successfully')

    } catch (error) {
      this.handleTrainingError(error)
    } finally {
      this.isRunning = false
    }

    return this.job
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    this.shouldStop = true
    this.state.shouldStop = true
    this.addLog('INFO', 'Training stop requested')

    // Wait for graceful shutdown
    while (this.isRunning) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  private async runTraining(): Promise<void> {
    const numEpochs = this.config.training.hyperparameters.numEpochs

    for (let epoch = this.state.epoch; epoch < numEpochs; epoch++) {
      if (this.state.shouldStop) {
        break
      }

      this.state.epoch = epoch
      this.job.progress.currentEpoch = epoch
      this.addLog('INFO', `Starting epoch ${epoch + 1}/${numEpochs}`)

      // Training epoch
      await this.runTrainingEpoch()

      // Validation
      if (this.config.evaluation.frequency === 'epoch') {
        await this.runValidation()
      }

      // Check early stopping
      if (this.earlyStoppingManager.shouldStop(this.state)) {
        this.addLog('INFO', 'Early stopping triggered')
        break
      }

      // Checkpointing
      if (this.shouldCheckpoint(epoch)) {
        await this.saveCheckpoint(epoch)
      }

      // Update progress
      this.updateProgress()
    }
  }

  private async runTrainingEpoch(): Promise<void> {
    const dataset = await this.trainer.getTrainingDataLoader()
    let epochLoss = 0
    let numBatches = 0

    for await (const batch of dataset) {
      if (this.state.shouldStop) {
        break
      }

      // Training step
      const stepResult = await this.trainer.trainStep(batch)
      this.state.step++

      // Update metrics
      epochLoss += stepResult.loss
      numBatches++

      // Log metrics
      this.job.metrics.trainLoss.push(stepResult.loss)
      this.job.metrics.learningRates.push(stepResult.learningRate)
      this.job.metrics.timestamps.push(new Date())

      // Log resource usage
      const resourceUsage = await this.resourceMonitor.getCurrentUsage()
      this.updateResourceMetrics(resourceUsage)

      // Log step
      if (this.state.step % this.config.training.logging.logEvery === 0) {
        this.addLog('DEBUG', 
          `Step ${this.state.step}/${this.state.totalSteps} - ` +
          `Loss: ${stepResult.loss.toFixed(6)} - ` +
          `LR: ${stepResult.learningRate.toFixed(2e-6)} - ` +
          `Throughput: ${stepResult.throughput.toFixed(2)} samples/s`
        )
      }

      // Validation at step intervals
      if (this.config.evaluation.frequency === 'steps' && 
          this.state.step % this.config.evaluation.interval === 0) {
        await this.runValidation()
      }
    }

    const avgLoss = epochLoss / numBatches
    this.addLog('INFO', `Epoch ${this.state.epoch + 1} completed - Average loss: ${avgLoss.toFixed(6)}`)
  }

  private async runValidation(): Promise<void> {
    this.addLog('DEBUG', 'Running validation')

    const validationData = await this.trainer.getValidationDataLoader()
    let totalLoss = 0
    let numBatches = 0
    const predictions: any[] = []
    const references: any[] = []

    // Set model to evaluation mode
    await this.trainer.setEvalMode()

    for await (const batch of validationData) {
      const result = await this.trainer.validationStep(batch)
      totalLoss += result.loss
      numBatches++

      if (result.predictions) {
        predictions.push(...result.predictions)
        references.push(...result.references || [])
      }
    }

    // Set model back to training mode
    await this.trainer.setTrainMode()

    const avgLoss = totalLoss / numBatches
    this.job.metrics.validationLoss.push(avgLoss)

    // Calculate evaluation metrics
    const evalScores = await this.calculateEvaluationMetrics(predictions, references)
    
    // Update metrics
    Object.keys(evalScores).forEach(metric => {
      if (!this.job.metrics.evaluationScores[metric]) {
        this.job.metrics.evaluationScores[metric] = []
      }
      this.job.metrics.evaluationScores[metric].push(evalScores[metric])
    })

    // Update best metric
    const primaryMetric = this.config.training.checkpointing.metricForBestModel
    const currentMetric = evalScores[primaryMetric] || avgLoss
    const isBetter = this.isBetterMetric(currentMetric, this.state.bestMetric)
    
    if (isBetter) {
      this.state.bestMetric = currentMetric
      this.addLog('INFO', `New best ${primaryMetric}: ${currentMetric.toFixed(6)}`)
    }

    // Log validation results
    const metricsStr = Object.entries(evalScores)
      .map(([k, v]) => `${k}: ${v.toFixed(4)}`)
      .join(', ')
    this.addLog('INFO', `Validation - Loss: ${avgLoss.toFixed(6)}, ${metricsStr}`)
  }

  private async calculateEvaluationMetrics(predictions: any[], references: any[]): Promise<Record<string, number>> {
    const metrics: Record<string, number> = {}

    // Calculate configured metrics
    for (const metricConfig of this.config.evaluation.metrics) {
      switch (metricConfig.type) {
        case 'accuracy':
          metrics.accuracy = this.calculateAccuracy(predictions, references)
          break
        case 'f1':
          metrics.f1 = this.calculateF1(predictions, references)
          break
        case 'bleu':
          metrics.bleu = this.calculateBLEU(predictions, references)
          break
        case 'rouge':
          metrics.rouge = this.calculateROUGE(predictions, references)
          break
        case 'perplexity':
          metrics.perplexity = this.calculatePerplexity(predictions)
          break
        case 'custom':
          // Use custom evaluator if provided
          const customEvaluator = this.config.evaluation.customEvaluators?.find(e => e.name === metricConfig.name)
          if (customEvaluator) {
            const customScores = customEvaluator.evaluator(predictions, references)
            Object.assign(metrics, customScores)
          }
          break
      }
    }

    return metrics
  }

  private calculateAccuracy(predictions: any[], references: any[]): number {
    if (predictions.length === 0) return 0
    
    let correct = 0
    for (let i = 0; i < predictions.length; i++) {
      if (predictions[i] === references[i]) {
        correct++
      }
    }
    
    return correct / predictions.length
  }

  private calculateF1(predictions: any[], references: any[]): number {
    // Simplified F1 calculation
    const precision = this.calculateAccuracy(predictions, references)
    const recall = this.calculateAccuracy(references, predictions)
    
    if (precision + recall === 0) return 0
    return 2 * (precision * recall) / (precision + recall)
  }

  private calculateBLEU(predictions: any[], references: any[]): number {
    // Simplified BLEU calculation
    // In production, use proper BLEU implementation
    let totalScore = 0
    
    for (let i = 0; i < predictions.length; i++) {
      const predWords = predictions[i].toString().split(/\s+/)
      const refWords = references[i].toString().split(/\s+/)
      
      const intersection = predWords.filter(word => refWords.includes(word))
      const precision = intersection.length / predWords.length
      totalScore += precision
    }
    
    return predictions.length > 0 ? totalScore / predictions.length : 0
  }

  private calculateROUGE(predictions: any[], references: any[]): number {
    // Simplified ROUGE calculation
    // In production, use proper ROUGE implementation
    let totalScore = 0
    
    for (let i = 0; i < predictions.length; i++) {
      const predWords = new Set(predictions[i].toString().split(/\s+/))
      const refWords = new Set(references[i].toString().split(/\s+/))
      
      const intersection = new Set([...predWords].filter(x => refWords.has(x)))
      const recall = intersection.size / refWords.size
      totalScore += recall
    }
    
    return predictions.length > 0 ? totalScore / predictions.length : 0
  }

  private calculatePerplexity(predictions: any[]): number {
    // Simplified perplexity calculation
    // In production, calculate from model logits
    if (predictions.length === 0) return Infinity
    
    const avgLogProb = predictions.reduce((sum, p) => sum + Math.log(p + 1e-10), 0) / predictions.length
    return Math.exp(-avgLogProb)
  }

  private shouldCheckpoint(epoch: number): boolean {
    const strategy = this.config.training.checkpointing.strategy
    const interval = this.config.training.checkpointing.interval

    switch (strategy) {
      case 'epoch':
        return (epoch + 1) % interval === 0
      case 'steps':
        return this.state.step % interval === 0
      case 'best':
        return this.state.bestMetric !== (this.config.training.checkpointing.greaterIsBetter ? -Infinity : Infinity)
      default:
        return false
    }
  }

  private async saveCheckpoint(epoch: number): Promise<void> {
    const checkpointId = nanoid()
    const checkpointPath = await this.checkpointManager.save(
      checkpointId,
      await this.trainer.getModelState(),
      {
        epoch,
        step: this.state.step,
        loss: this.job.metrics.trainLoss[this.job.metrics.trainLoss.length - 1],
        metricValue: this.state.bestMetric,
        configHash: await this.calculateConfigHash(),
        modelHash: await this.calculateModelHash(),
        timestamp: new Date(),
        isBest: this.state.bestCheckpoint === checkpointId
      }
    )

    this.job.checkpoints.push({
      id: checkpointId,
      step: this.state.step,
      epoch,
      metricValue: this.state.bestMetric,
      path: checkpointPath,
      size: await this.getCheckpointSize(checkpointPath),
      createdAt: new Date(),
      isBest: this.state.bestCheckpoint === checkpointId
    })

    this.addLog('DEBUG', `Checkpoint saved: ${checkpointId}`)
  }

  private async loadCheckpoint(): Promise<void> {
    // Implementation for loading checkpoint
    // In production, find latest checkpoint and restore state
  }

  private async finalizeTraining(): Promise<void> {
    // Save final checkpoint
    await this.saveCheckpoint(this.state.epoch)

    // Save model artifacts
    const modelPath = await this.trainer.saveModel()
    this.job.artifacts.push({
      name: 'final_model',
      type: 'model',
      path: modelPath,
      size: await this.getArtifactSize(modelPath),
      checksum: await this.calculateChecksum(modelPath),
      createdAt: new Date()
    })

    // Save training logs
    const logsPath = await this.metricsLogger.saveLogs()
    this.job.artifacts.push({
      name: 'training_logs',
      type: 'log',
      path: logsPath,
      size: await this.getArtifactSize(logsPath),
      checksum: await this.calculateChecksum(logsPath),
      createdAt: new Date()
    })

    // Save configuration
    const configPath = await this.saveConfiguration()
    this.job.artifacts.push({
      name: 'config',
      type: 'config',
      path: configPath,
      size: await this.getArtifactSize(configPath),
      checksum: await this.calculateChecksum(configPath),
      createdAt: new Date()
    })
  }

  private handleTrainingError(error: any): void {
    this.job.status.phase = 'failed'
    this.job.status.message = error.message
    this.job.status.errorCode = error.code || 'TRAINING_ERROR'
    this.job.completedAt = new Date()
    
    this.job.errors.push({
      timestamp: new Date(),
      type: error.constructor.name,
      message: error.message,
      stack: error.stack,
      phase: `epoch_${this.state.epoch}_step_${this.state.step}`,
      recoverable: false
    })

    this.addLog('ERROR', `Training failed: ${error.message}`)
  }

  private updateProgress(): void {
    this.job.progress.currentStep = this.state.step
    this.job.progress.percentage = (this.state.step / this.state.totalSteps) * 100
    
    // Estimate ETA
    if (this.job.metrics.timestamps.length > 0) {
      const startTime = this.job.startedAt!
      const elapsed = Date.now() - startTime.getTime()
      const avgStepTime = elapsed / this.state.step
      const remainingSteps = this.state.totalSteps - this.state.step
      this.job.progress.eta = remainingSteps * avgStepTime
    }
  }

  private updateResourceMetrics(usage: any): void {
    this.job.metrics.resourceUsage.cpu.push(usage.cpuUsage)
    this.job.metrics.resourceUsage.memory.push(usage.memoryUsage)
    if (usage.gpuMemoryUsage) {
      this.job.metrics.resourceUsage.gpu = this.job.metrics.resourceUsage.gpu || [[]]
      this.job.metrics.resourceUsage.gpu.push(usage.gpuMemoryUsage)
    }
  }

  private isBetterMetric(current: number, best: number): boolean {
    return this.config.training.checkpointing.greaterIsBetter ? current > best : current < best
  }

  private addLog(level: string, message: string): void {
    this.job.logs.push({
      timestamp: new Date(),
      level,
      message,
      source: 'TrainingPipeline'
    })
  }

  // Utility methods
  private async calculateConfigHash(): Promise<string> {
    // Calculate hash of configuration
    return Buffer.from(JSON.stringify(this.config)).toString('base64').slice(0, 16)
  }

  private async calculateModelHash(): Promise<string> {
    // Calculate hash of model parameters
    return 'model_hash_placeholder'
  }

  private async getCheckpointSize(path: string): Promise<number> {
    // Get checkpoint size in bytes
    return 0
  }

  private async getArtifactSize(path: string): Promise<number> {
    // Get artifact size in bytes
    return 0
  }

  private async calculateChecksum(path: string): Promise<string> {
    // Calculate file checksum
    return 'checksum_placeholder'
  }

  private async saveConfiguration(): Promise<string> {
    // Save configuration to file
    return 'config_path_placeholder'
  }

  // Getters
  getJob(): TrainingJob {
    return this.job
  }

  getState(): TrainingState {
    return this.state
  }

  isTrainingRunning(): boolean {
    return this.isRunning
  }
}