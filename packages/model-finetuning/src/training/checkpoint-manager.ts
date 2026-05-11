import type { CheckpointingConfig, CheckpointInfo } from '../types'
import type { CheckpointMetadata } from './types'

// ============================================================================
// Checkpoint Manager
// ============================================================================

export class CheckpointManager {
  private config: CheckpointingConfig
  private checkpointDir: string

  constructor(config: CheckpointingConfig) {
    this.config = config
    this.checkpointDir = './checkpoints'
  }

  async save(
    checkpointId: string,
    modelState: any,
    metadata: CheckpointMetadata
  ): Promise<string> {
    const checkpointPath = `${this.checkpointDir}/${checkpointId}`

    try {
      // Create checkpoint directory
      await this.createDirectory(checkpointPath)

      // Save model state
      await this.saveModelState(checkpointPath, modelState)

      // Save metadata
      await this.saveMetadata(checkpointPath, metadata)

      // Save configuration
      await this.saveConfig(checkpointPath)

      // Cleanup old checkpoints if needed
      await this.cleanupOldCheckpoints()

      return checkpointPath
    } catch (error) {
      throw new Error(`Failed to save checkpoint ${checkpointId}: ${error.message}`)
    }
  }

  async load(checkpointId: string): Promise<{
    modelState: any
    metadata: CheckpointMetadata
    config: any
  }> {
    const checkpointPath = `${this.checkpointDir}/${checkpointId}`

    try {
      // Check if checkpoint exists
      if (!(await this.checkpointExists(checkpointPath))) {
        throw new Error(`Checkpoint ${checkpointId} not found`)
      }

      // Load model state
      const modelState = await this.loadModelState(checkpointPath)

      // Load metadata
      const metadata = await this.loadMetadata(checkpointPath)

      // Load configuration
      const config = await this.loadConfig(checkpointPath)

      return { modelState, metadata, config }
    } catch (error) {
      throw new Error(`Failed to load checkpoint ${checkpointId}: ${error.message}`)
    }
  }

  async listCheckpoints(): Promise<CheckpointInfo[]> {
    try {
      const checkpointIds = await this.listCheckpointIds()
      const checkpoints: CheckpointInfo[] = []

      for (const id of checkpointIds) {
        const metadata = await this.loadMetadata(`${this.checkpointDir}/${id}`)
        checkpoints.push({
          id,
          step: metadata.step,
          epoch: metadata.epoch,
          metricValue: metadata.metricValue,
          path: `${this.checkpointDir}/${id}`,
          size: await this.getCheckpointSize(`${this.checkpointDir}/${id}`),
          createdAt: metadata.timestamp,
          isBest: metadata.isBest
        })
      }

      // Sort by creation time (newest first)
      checkpoints.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

      return checkpoints
    } catch (error) {
      throw new Error(`Failed to list checkpoints: ${error.message}`)
    }
  }

  async deleteCheckpoint(checkpointId: string): Promise<void> {
    const checkpointPath = `${this.checkpointDir}/${checkpointId}`

    try {
      if (!(await this.checkpointExists(checkpointPath))) {
        throw new Error(`Checkpoint ${checkpointId} not found`)
      }

      await this.removeDirectory(checkpointPath)
    } catch (error) {
      throw new Error(`Failed to delete checkpoint ${checkpointId}: ${error.message}`)
    }
  }

  async getBestCheckpoint(): Promise<CheckpointInfo | null> {
    const checkpoints = await this.listCheckpoints()
    return checkpoints.find(cp => cp.isBest) || null
  }

  async getLatestCheckpoint(): Promise<CheckpointInfo | null> {
    const checkpoints = await this.listCheckpoints()
    return checkpoints[0] || null
  }

  async restoreFromBest(): Promise<any> {
    const bestCheckpoint = await this.getBestCheckpoint()
    if (!bestCheckpoint) {
      throw new Error('No best checkpoint found')
    }

    const { modelState } = await this.load(bestCheckpoint.id)
    return modelState
  }

  async restoreFromLatest(): Promise<any> {
    const latestCheckpoint = await this.getLatestCheckpoint()
    if (!latestCheckpoint) {
      throw new Error('No checkpoints found')
    }

    const { modelState, metadata } = await this.load(latestCheckpoint.id)
    
    // In a real implementation, you would also restore:
    // - Current epoch and step
    // - Optimizer state
    // - Scheduler state
    // - Random seeds
    
    return {
      modelState,
      epoch: metadata.epoch,
      step: metadata.step
    }
  }

  // Private methods
  private async createDirectory(path: string): Promise<void> {
    const fs = await import('fs/promises')
    await fs.mkdir(path, { recursive: true })
  }

  private async checkpointExists(path: string): Promise<boolean> {
    const fs = await import('fs/promises')
    try {
      const stats = await fs.stat(path)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  private async saveModelState(checkpointPath: string, modelState: any): Promise<void> {
    const fs = await import('fs/promises')
    const pathModule = await import('path')

    // Save model weights
    const weightsPath = pathModule.join(checkpointPath, 'model.safetensors')
    const weightsBuffer = this.serializeModelState(modelState)
    await fs.writeFile(weightsPath, weightsBuffer)

    // Save optimizer state if present
    if (modelState.optimizer_state_dict) {
      const optimizerPath = pathModule.join(checkpointPath, 'optimizer.pt')
      const optimizerBuffer = Buffer.from(JSON.stringify(modelState.optimizer_state_dict))
      await fs.writeFile(optimizerPath, optimizerBuffer)
    }

    // Save scheduler state if present
    if (modelState.scheduler_state_dict) {
      const schedulerPath = pathModule.join(checkpointPath, 'scheduler.pt')
      const schedulerBuffer = Buffer.from(JSON.stringify(modelState.scheduler_state_dict))
      await fs.writeFile(schedulerPath, schedulerBuffer)
    }
  }

  private async loadModelState(checkpointPath: string): Promise<any> {
    const fs = await import('fs/promises')
    const pathModule = await import('path')

    // Load model weights
    const weightsPath = pathModule.join(checkpointPath, 'model.safetensors')
    const weightsBuffer = await fs.readFile(weightsPath)
    const weights = this.deserializeModelState(weightsBuffer)

    // Load optimizer state if exists
    const optimizerPath = pathModule.join(checkpointPath, 'optimizer.pt')
    let optimizerState: any = null
    try {
      const optimizerBuffer = await fs.readFile(optimizerPath)
      optimizerState = JSON.parse(optimizerBuffer.toString())
    } catch {
      // Optimizer state not found
    }

    // Load scheduler state if exists
    const schedulerPath = pathModule.join(checkpointPath, 'scheduler.pt')
    let schedulerState: any = null
    try {
      const schedulerBuffer = await fs.readFile(schedulerPath)
      schedulerState = JSON.parse(schedulerBuffer.toString())
    } catch {
      // Scheduler state not found
    }

    return {
      model_state_dict: weights,
      optimizer_state_dict: optimizerState,
      scheduler_state_dict: schedulerState
    }
  }

  private serializeModelState(state: any): Buffer {
    // In production, use proper serialization (e.g., torch.save, safetensors)
    return Buffer.from(JSON.stringify(state))
  }

  private deserializeModelState(buffer: Buffer): any {
    // In production, use proper deserialization
    return JSON.parse(buffer.toString())
  }

  private async saveMetadata(checkpointPath: string, metadata: CheckpointMetadata): Promise<void> {
    const fs = await import('fs/promises')
    const pathModule = await import('path')

    const metadataPath = pathModule.join(checkpointPath, 'metadata.json')
    const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2))
    await fs.writeFile(metadataPath, metadataBuffer)
  }

  private async loadMetadata(checkpointPath: string): Promise<CheckpointMetadata> {
    const fs = await import('fs/promises')
    const pathModule = await import('path')

    const metadataPath = pathModule.join(checkpointPath, 'metadata.json')
    const metadataBuffer = await fs.readFile(metadataPath)
    const metadata = JSON.parse(metadataBuffer.toString())

    // Convert timestamp string back to Date
    metadata.timestamp = new Date(metadata.timestamp)

    return metadata
  }

  private async saveConfig(checkpointPath: string): Promise<void> {
    const fs = await import('fs/promises')
    const pathModule = await import('path')

    const configPath = pathModule.join(checkpointPath, 'training_config.json')
    const configBuffer = Buffer.from(JSON.stringify(this.config, null, 2))
    await fs.writeFile(configPath, configBuffer)
  }

  private async loadConfig(checkpointPath: string): Promise<any> {
    const fs = await import('fs/promises')
    const pathModule = await import('path')

    const configPath = pathModule.join(checkpointPath, 'training_config.json')
    const configBuffer = await fs.readFile(configPath)
    return JSON.parse(configBuffer.toString())
  }

  private async listCheckpointIds(): Promise<string[]> {
    const fs = await import('fs/promises')
    const pathModule = await import('path')

    try {
      const entries = await fs.readdir(this.checkpointDir, { withFileTypes: true })
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
    } catch {
      // Directory doesn't exist or is empty
      return []
    }
  }

  private async getCheckpointSize(checkpointPath: string): Promise<number> {
    const fs = await import('fs/promises')
    
    let totalSize = 0
    
    async function calculateSize(dirPath: string): Promise<void> {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = `${dirPath}/${entry.name}`
        
        if (entry.isDirectory()) {
          await calculateSize(fullPath)
        } else {
          const stats = await fs.stat(fullPath)
          totalSize += stats.size
        }
      }
    }
    
    await calculateSize(checkpointPath)
    return totalSize
  }

  private async removeDirectory(path: string): Promise<void> {
    const fs = await import('fs/promises')
    
    async function removeRecursive(dirPath: string): Promise<void> {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = `${dirPath}/${entry.name}`
        
        if (entry.isDirectory()) {
          await removeRecursive(fullPath)
          await fs.rmdir(fullPath)
        } else {
          await fs.unlink(fullPath)
        }
      }
      
      await fs.rmdir(dirPath)
    }
    
    await removeRecursive(path)
  }

  private async cleanupOldCheckpoints(): Promise<void> {
    if (this.config.saveTotalLimit <= 0) {
      return
    }

    const checkpoints = await this.listCheckpoints()
    
    if (checkpoints.length <= this.config.saveTotalLimit) {
      return
    }

    // Keep only the most recent checkpoints
    const checkpointsToKeep = checkpoints.slice(0, this.config.saveTotalLimit)
    const checkpointsToDelete = checkpoints.slice(this.config.saveTotalLimit)

    // Always keep the best checkpoint
    const bestCheckpoint = await this.getBestCheckpoint()
    if (bestCheckpoint && !checkpointsToKeep.includes(bestCheckpoint)) {
      checkpointsToDelete.push(bestCheckpoint)
    }

    // Delete old checkpoints
    for (const checkpoint of checkpointsToDelete) {
      try {
        await this.deleteCheckpoint(checkpoint.id)
      } catch (error) {
        console.warn(`Failed to delete checkpoint ${checkpoint.id}: ${error.message}`)
      }
    }
  }

  // Validation methods
  async validateCheckpoint(checkpointId: string): Promise<{
    isValid: boolean
    issues: string[]
  }> {
    const issues: string[] = []

    try {
      const checkpointPath = `${this.checkpointDir}/${checkpointId}`

      // Check if checkpoint directory exists
      if (!(await this.checkpointExists(checkpointPath))) {
        issues.push('Checkpoint directory does not exist')
        return { isValid: false, issues }
      }

      // Check required files
      const requiredFiles = ['model.safetensors', 'metadata.json']
      for (const file of requiredFiles) {
        const fs = await import('fs/promises')
        const pathModule = await import('path')
        const filePath = pathModule.join(checkpointPath, file)

        try {
          await fs.access(filePath)
        } catch {
          issues.push(`Required file missing: ${file}`)
        }
      }

      // Validate metadata
      try {
        const metadata = await this.loadMetadata(checkpointPath)
        
        if (!metadata.epoch && metadata.epoch !== 0) {
          issues.push('Missing epoch in metadata')
        }
        if (!metadata.step && metadata.step !== 0) {
          issues.push('Missing step in metadata')
        }
        if (!metadata.timestamp) {
          issues.push('Missing timestamp in metadata')
        }
      } catch (error) {
        issues.push(`Invalid metadata: ${error.message}`)
      }

      return {
        isValid: issues.length === 0,
        issues
      }
    } catch (error) {
      issues.push(`Validation failed: ${error.message}`)
      return { isValid: false, issues }
    }
  }
}