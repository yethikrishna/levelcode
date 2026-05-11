import type { DatasetConfig, PreprocessingConfig, DatasetStatistics } from '../types'

export interface DataSample {
  id: string
  input: string
  output: string
  metadata?: Record<string, any>
  quality?: number
  length?: {
    input: number
    output: number
    tokens?: {
      input: number
      output: number
    }
  }
}

export interface ProcessedDataset {
  samples: DataSample[]
  splits: {
    train: DataSample[]
    validation: DataSample[]
    test: DataSample[]
  }
  statistics: DatasetStatistics
  tokenizer: string
  config: DatasetConfig
}

export interface ValidationError {
  sampleId: string
  field: string
  message: string
  severity: 'error' | 'warning'
  fixable: boolean
}

export interface ProcessingResult {
  totalSamples: number
  processedSamples: number
  skippedSamples: number
  errors: ValidationError[]
  warnings: ValidationError[]
  statistics: DatasetStatistics
}