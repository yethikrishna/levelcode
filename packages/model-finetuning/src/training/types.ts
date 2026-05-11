import type { TrainingConfig, TrainingJob, TrainingMetrics } from '../types'

export interface TrainingState {
  epoch: number
  step: number
  totalSteps: number
  bestMetric: number
  bestCheckpoint: string
  shouldStop: boolean
  reason?: string
}

export interface BatchData {
  inputs: any[]
  outputs: any[]
  attentionMasks?: any[]
  labels?: any[]
  metadata?: any[]
}

export interface TrainingStepResult {
  loss: number
  learningRate: number
  stepTime: number
  throughput: number
  memoryUsage: number
  gpuUtilization?: number
}

export interface CheckpointMetadata {
  epoch: number
  step: number
  loss: number
  metricValue: number
  configHash: string
  modelHash: string
  timestamp: Date
  isBest: boolean
}

export interface DistributedConfig {
  rank: number
  worldSize: number
  localRank: number
  masterAddr: string
  masterPort: number
  backend: string
}

export interface ResourceMonitor {
  cpuUsage: number
  memoryUsage: number
  gpuMemoryUsage?: number[]
  diskUsage: number
  networkIO?: {
    bytesIn: number
    bytesOut: number
  }
  timestamp: Date
}