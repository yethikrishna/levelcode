import { promises as fs } from 'fs'
import path from 'path'
import { z } from 'zod'

import type {
  Dataset,
  DatasetEntry,
  DatasetManager,
} from './types'

/**
 * In-memory implementation of DatasetManager with file persistence
 */
export class InMemoryDatasetManager implements DatasetManager {
  private datasets = new Map<string, Dataset>()
  private storagePath: string

  constructor(storagePath?: string) {
    this.storagePath = storagePath || path.join(process.cwd(), '.levelcode', 'datasets.json')
  }

  /**
   * Initialize the manager by loading from storage
   */
  async initialize(): Promise<void> {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8')
      const datasets = JSON.parse(data) as Dataset[]
      
      this.datasets.clear()
      for (const dataset of datasets) {
        this.datasets.set(dataset.id, {
          ...dataset,
          metadata: {
            ...dataset.metadata,
            createdAt: new Date(dataset.metadata.createdAt),
            updatedAt: new Date(dataset.metadata.updatedAt),
          },
        })
      }
    } catch (error) {
      console.debug('Dataset manager not found, starting with empty datasets')
    }
  }

  /**
   * Save the datasets to storage
   */
  private async saveToStorage(): Promise<void> {
    try {
      const dir = path.dirname(this.storagePath)
      await fs.mkdir(dir, { recursive: true })
      
      const datasets = Array.from(this.datasets.values())
      await fs.writeFile(this.storagePath, JSON.stringify(datasets, null, 2))
    } catch (error) {
      console.error('Failed to save datasets:', error)
      throw new Error('Failed to save datasets')
    }
  }

  /**
   * Create a new dataset
   */
  async create(params: Omit<Dataset, 'id' | 'version' | 'stats' | 'metadata'> & {
    createdBy?: string
    tags?: string[]
  }): Promise<Dataset> {
    const id = this.generateDatasetId()
    const version = '1.0.0'
    
    // Calculate statistics
    const stats = this.calculateStats(params.entries)
    
    const dataset: Dataset = {
      id,
      name: params.name,
      description: params.description,
      entries: params.entries,
      version,
      stats,
      metadata: {
        createdBy: params.createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: params.tags || [],
      },
    }

    this.datasets.set(id, dataset)
    await this.saveToStorage()
    
    return dataset
  }

  /**
   * Get a dataset by ID
   */
  async get(id: string): Promise<Dataset | null> {
    const dataset = this.datasets.get(id)
    return dataset || null
  }

  /**
   * List datasets with optional filters
   */
  async list(filters?: {
    tags?: string[]
    createdBy?: string
  }): Promise<Dataset[]> {
    let datasets = Array.from(this.datasets.values())

    // Apply filters
    if (filters) {
      if (filters.tags && filters.tags.length > 0) {
        datasets = datasets.filter(dataset =>
          filters.tags!.some(tag => dataset.metadata.tags.includes(tag))
        )
      }

      if (filters.createdBy) {
        datasets = datasets.filter(dataset =>
          dataset.metadata.createdBy === filters.createdBy
        )
      }

      // Sort by updated date (most recent first)
      datasets.sort((a, b) => 
        b.metadata.updatedAt.getTime() - a.metadata.updatedAt.getTime()
      )
    }

    return datasets
  }

  /**
   * Update a dataset
   */
  async update(id: string, updates: Partial<Dataset>): Promise<Dataset> {
    const existing = this.datasets.get(id)
    if (!existing) {
      throw new Error(`Dataset with ID '${id}' not found`)
    }

    const updated: Dataset = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      version: this.incrementVersion(existing.version),
      stats: updates.entries ? this.calculateStats(updates.entries) : existing.stats,
      metadata: {
        ...existing.metadata,
        ...updates.metadata,
        updatedAt: new Date(),
      },
    }

    this.datasets.set(id, updated)
    await this.saveToStorage()
    
    return updated
  }

  /**
   * Delete a dataset
   */
  async delete(id: string): Promise<void> {
    if (!this.datasets.has(id)) {
      throw new Error(`Dataset with ID '${id}' not found`)
    }

    this.datasets.delete(id)
    await this.saveToStorage()
  }

  /**
   * Add entries to a dataset
   */
  async addEntries(datasetId: string, entries: DatasetEntry[]): Promise<void> {
    const dataset = this.datasets.get(datasetId)
    if (!dataset) {
      throw new Error(`Dataset with ID '${datasetId}' not found`)
    }

    // Validate entries
    for (const entry of entries) {
      this.validateEntry(entry)
    }

    dataset.entries.push(...entries)
    dataset.stats = this.calculateStats(dataset.entries)
    dataset.version = this.incrementVersion(dataset.version)
    dataset.metadata.updatedAt = new Date()

    await this.saveToStorage()
  }

  /**
   * Remove entries from a dataset
   */
  async removeEntries(datasetId: string, entryIds: string[]): Promise<void> {
    const dataset = this.datasets.get(datasetId)
    if (!dataset) {
      throw new Error(`Dataset with ID '${datasetId}' not found`)
    }

    dataset.entries = dataset.entries.filter(entry => !entryIds.includes(entry.id))
    dataset.stats = this.calculateStats(dataset.entries)
    dataset.version = this.incrementVersion(dataset.version)
    dataset.metadata.updatedAt = new Date()

    await this.saveToStorage()
  }

  /**
   * Validate dataset quality
   */
  async validate(datasetId: string): Promise<{
    valid: boolean
    issues: string[]
    score: number
  }> {
    const dataset = this.datasets.get(datasetId)
    if (!dataset) {
      throw new Error(`Dataset with ID '${datasetId}' not found`)
    }

    const issues: string[] = []
    let score = 100

    // Check size
    if (dataset.entries.length < 100) {
      issues.push('Dataset is small (< 100 entries)')
      score -= 20
    } else if (dataset.entries.length < 1000) {
      issues.push('Dataset could be larger (< 1000 entries)')
      score -= 10
    }

    // Check for duplicates
    const inputs = new Set<string>()
    const outputs = new Set<string>()
    let duplicates = 0

    for (const entry of dataset.entries) {
      if (inputs.has(entry.input)) {
        duplicates++
      } else {
        inputs.add(entry.input)
      }

      if (outputs.has(entry.output)) {
        duplicates++
      } else {
        outputs.add(entry.output)
      }
    }

    if (duplicates > 0) {
      issues.push(`Found ${duplicates} duplicate inputs or outputs`)
      score -= Math.min(30, duplicates)
    }

    // Check length distribution
    const avgInputLength = dataset.stats.avgInputLength
    const avgOutputLength = dataset.stats.avgOutputLength

    if (avgInputLength < 10) {
      issues.push('Average input length is very short')
      score -= 15
    } else if (avgInputLength > 2000) {
      issues.push('Average input length is very long')
      score -= 10
    }

    if (avgOutputLength < 5) {
      issues.push('Average output length is very short')
      score -= 15
    } else if (avgOutputLength > 1000) {
      issues.push('Average output length is very long')
      score -= 10
    }

    // Check for quality issues
    let lowQualityEntries = 0
    for (const entry of dataset.entries) {
      if (entry.metadata?.quality !== undefined && entry.metadata.quality < 0.7) {
        lowQualityEntries++
      }
    }

    if (lowQualityEntries > dataset.entries.length * 0.1) {
      issues.push(`${lowQualityEntries} entries have low quality scores`)
      score -= 20
    }

    // Check for missing metadata
    let missingMetadata = 0
    for (const entry of dataset.entries) {
      if (!entry.metadata) {
        missingMetadata++
      }
    }

    if (missingMetadata > 0) {
      issues.push(`${missingMetadata} entries are missing metadata`)
      score -= Math.min(10, missingMetadata / dataset.entries.length * 10)
    }

    return {
      valid: issues.length === 0,
      issues,
      score: Math.max(0, score),
    }
  }

  /**
   * Split dataset into train/validation/test sets
   */
  async split(datasetId: string, config: {
    trainRatio?: number
    validationRatio?: number
    testRatio?: number
    shuffle?: boolean
  }): Promise<{
    train: DatasetEntry[]
    validation: DatasetEntry[]
    test: DatasetEntry[]
  }> {
    const dataset = this.datasets.get(datasetId)
    if (!dataset) {
      throw new Error(`Dataset with ID '${datasetId}' not found`)
    }

    const trainRatio = config.trainRatio || 0.8
    const validationRatio = config.validationRatio || 0.1
    const testRatio = config.testRatio || 0.1

    const total = trainRatio + validationRatio + testRatio
    if (Math.abs(total - 1.0) > 0.001) {
      throw new Error('Split ratios must sum to 1.0')
    }

    let entries = [...dataset.entries]
    
    if (config.shuffle !== false) {
      entries = this.shuffleArray(entries)
    }

    const trainCount = Math.floor(dataset.entries.length * trainRatio)
    const validationCount = Math.floor(dataset.entries.length * validationRatio)

    const train = entries.slice(0, trainCount)
    const validation = entries.slice(trainCount, trainCount + validationCount)
    const test = entries.slice(trainCount + validationCount)

    return { train, validation, test }
  }

  /**
   * Export dataset to file
   */
  async export(datasetId: string, format: 'json' | 'jsonl' | 'csv'): Promise<string> {
    const dataset = this.datasets.get(datasetId)
    if (!dataset) {
      throw new Error(`Dataset with ID '${datasetId}' not found`)
    }

    let content: string

    switch (format) {
      case 'json':
        content = JSON.stringify(dataset, null, 2)
        break
        
      case 'jsonl':
        content = dataset.entries
          .map(entry => JSON.stringify(entry))
          .join('\n')
        break
        
      case 'csv':
        const headers = ['id', 'input', 'output', 'source', 'quality', 'createdAt']
        const rows = dataset.entries.map(entry => [
          entry.id,
          `"${entry.input.replace(/"/g, '""')}"`,
          `"${entry.output.replace(/"/g, '""')}"`,
          entry.metadata?.source || '',
          entry.metadata?.quality || '',
          entry.metadata?.createdAt?.toISOString() || '',
        ])
        content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
        break
        
      default:
        throw new Error(`Unsupported export format: ${format}`)
    }

    return content
  }

  /**
   * Import dataset from file
   */
  async import(content: string, format: 'json' | 'jsonl' | 'csv'): Promise<Dataset> {
    let entries: DatasetEntry[]

    switch (format) {
      case 'json':
        const dataset = JSON.parse(content) as Dataset
        entries = dataset.entries
        break
        
      case 'jsonl':
        const jsonlLines = content.trim().split('\n')
        entries = jsonlLines.map((line, index) => {
          try {
            return JSON.parse(line) as DatasetEntry
          } catch (error) {
            throw new Error(`Failed to parse line ${index + 1}: ${error}`)
          }
        })
        break
        
      case 'csv':
        const csvLines = content.trim().split('\n')
        const headers = csvLines[0].split(',')
        
        entries = csvLines.slice(1).map((line, index) => {
          const values = this.parseCSVLine(line)
          const entry: DatasetEntry = {
            id: values[0] || `imported-${index}`,
            input: this.unescapeCSV(values[1]),
            output: this.unescapeCSV(values[2]),
            metadata: {},
          }
          
          if (values[3]) entry.metadata!.source = values[3]
          if (values[4]) entry.metadata!.quality = parseFloat(values[4])
          if (values[5]) entry.metadata!.createdAt = new Date(values[5])
          
          return entry
        })
        break
        
      default:
        throw new Error(`Unsupported import format: ${format}`)
    }

    // Validate entries
    for (const entry of entries) {
      this.validateEntry(entry)
    }

    return this.create({
      name: `Imported Dataset ${new Date().toISOString()}`,
      entries,
      tags: ['imported'],
    })
  }

  /**
   * Validate a dataset entry
   */
  private validateEntry(entry: DatasetEntry): void {
    if (!entry.id) {
      throw new Error('Entry must have an ID')
    }
    
    if (!entry.input || typeof entry.input !== 'string') {
      throw new Error('Entry must have a valid input string')
    }
    
    if (!entry.output || typeof entry.output !== 'string') {
      throw new Error('Entry must have a valid output string')
    }
    
    if (entry.input.length > 10000) {
      throw new Error('Input is too long (> 10,000 characters)')
    }
    
    if (entry.output.length > 5000) {
      throw new Error('Output is too long (> 5,000 characters)')
    }
  }

  /**
   * Calculate dataset statistics
   */
  private calculateStats(entries: DatasetEntry[]): Dataset['stats'] {
    if (entries.length === 0) {
      return {
        totalEntries: 0,
        avgInputLength: 0,
        avgOutputLength: 0,
        totalTokens: 0,
      }
    }

    const totalInputLength = entries.reduce((sum, e) => sum + e.input.length, 0)
    const totalOutputLength = entries.reduce((sum, e) => sum + e.output.length, 0)
    
    // Rough token estimation
    const totalTokens = Math.ceil((totalInputLength + totalOutputLength) / 4)

    return {
      totalEntries: entries.length,
      avgInputLength: Math.round(totalInputLength / entries.length),
      avgOutputLength: Math.round(totalOutputLength / entries.length),
      totalTokens,
    }
  }

  /**
   * Generate a dataset ID
   */
  private generateDatasetId(): string {
    return `dataset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Increment version number
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.')
    const patch = parseInt(parts[2] || '0', 10) + 1
    return `${parts[0]}.${parts[1]}.${patch}`
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  /**
   * Parse a CSV line handling quoted values
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++ // Skip next quote
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
    
    result.push(current)
    return result
  }

  /**
   * Unescape a CSV value
   */
  private unescapeCSV(value: string): string {
    return value.replace(/""/g, '"')
  }
}