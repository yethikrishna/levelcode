import { nanoid } from 'nanoid'
import type { DatasetConfig } from '../types'
import type { DataSample, ProcessedDataset } from './types'

// ============================================================================
// Dataset Loader
// ============================================================================

export class DatasetLoader {
  private config: DatasetConfig

  constructor(config: DatasetConfig) {
    this.config = config
  }

  async load(): Promise<DataSample[]> {
    try {
      let rawData: any[] = []

      if (this.config.path) {
        rawData = await this.loadFromFile(this.config.path, this.config.format)
      } else if (this.config.url) {
        rawData = await this.loadFromUrl(this.config.url, this.config.format)
      } else {
        throw new Error('Either path or url must be provided in dataset config')
      }

      return this.parseSamples(rawData)
    } catch (error) {
      throw new Error(`Failed to load dataset: ${error.message}`)
    }
  }

  private async loadFromFile(path: string, format: string): Promise<any[]> {
    const fs = await import('fs/promises')
    const pathModule = await import('path')
    
    const fullPath = pathModule.resolve(path)
    const content = await fs.readFile(fullPath, 'utf-8')

    switch (format) {
      case 'jsonl':
        return content.split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
      case 'json':
        return JSON.parse(content)
      case 'csv':
        return this.parseCSV(content)
      case 'parquet':
        return this.parseParquet(content)
      default:
        throw new Error(`Unsupported format: ${format}`)
    }
  }

  private async loadFromUrl(url: string, format: string): Promise<any[]> {
    const fetch = await import('node-fetch')
    const response = await fetch.default(url)
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const content = await response.text()

    switch (format) {
      case 'jsonl':
        return content.split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
      case 'json':
        return JSON.parse(content)
      case 'csv':
        return this.parseCSV(content)
      default:
        throw new Error(`Unsupported format for URL: ${format}`)
    }
  }

  private parseSamples(rawData: any[]): DataSample[] {
    return rawData.map((item, index) => {
      // Handle different dataset formats
      if (typeof item === 'string') {
        // Simple instruction-response format
        return {
          id: nanoid(),
          input: item,
          output: '',
          metadata: { sourceIndex: index }
        }
      }

      // Handle structured formats
      const commonFields = ['instruction', 'input', 'output', 'response', 'prompt', 'completion', 'question', 'answer']
      const itemKeys = Object.keys(item).map(k => k.toLowerCase())
      
      let input = ''
      let output = ''
      
      // Try to map common field names
      if (item.instruction || item.prompt || item.question) {
        input = item.instruction || item.prompt || item.question
        if (item.input && item.input !== input) {
          input += '\n' + item.input
        }
        output = item.output || item.response || item.completion || item.answer || ''
      } else if (item.input && item.output) {
        input = item.input
        output = item.output
      } else if (item.prompt && item.completion) {
        input = item.prompt
        output = item.completion
      } else {
        // Fallback: use first fields as input/output
        const keys = Object.keys(item)
        input = item[keys[0]] || ''
        output = item[keys[1]] || ''
      }

      return {
        id: item.id || nanoid(),
        input: String(input),
        output: String(output),
        metadata: {
          ...item,
          sourceIndex: index,
          originalFields: Object.keys(item)
        }
      }
    })
  }

  private parseCSV(content: string): any[] {
    const lines = content.split('\n').filter(line => line.trim())
    if (lines.length < 2) {
      throw new Error('CSV must have at least a header and one data row')
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const data = []

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i])
      const row: any = {}
      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })
      data.push(row)
    }

    return data
  }

  private parseCSVLine(line: string): string[] {
    const result = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    
    result.push(current.trim())
    return result
  }

  private async parseParquet(content: string): Promise<any[]> {
    // Note: In a real implementation, you'd use a parquet library like 'parquetjs'
    // For now, throw an error to indicate this needs proper implementation
    throw new Error('Parquet format not yet implemented. Please convert to JSON or CSV.')
  }

  // Utility method to validate dataset structure
  validateStructure(samples: DataSample[]): { valid: boolean; issues: string[] } {
    const issues: string[] = []
    
    if (samples.length === 0) {
      issues.push('Dataset is empty')
      return { valid: false, issues }
    }

    // Check for missing fields
    samples.forEach((sample, index) => {
      if (!sample.input || sample.input.trim() === '') {
        issues.push(`Sample ${index}: Missing or empty input`)
      }
      if (!sample.output || sample.output.trim() === '') {
        issues.push(`Sample ${index}: Missing or empty output`)
      }
    })

    // Check for duplicates
    const inputs = new Set()
    samples.forEach((sample, index) => {
      if (inputs.has(sample.input)) {
        issues.push(`Sample ${index}: Duplicate input found`)
      }
      inputs.add(sample.input)
    })

    return { valid: issues.length === 0, issues }
  }

  // Utility method to get dataset info
  getInfo(samples: DataSample[]): {
    totalSamples: number
    avgInputLength: number
    avgOutputLength: number
    maxInputLength: number
    maxOutputLength: number
    minInputLength: number
    minOutputLength: number
  } {
    if (samples.length === 0) {
      return {
        totalSamples: 0,
        avgInputLength: 0,
        avgOutputLength: 0,
        maxInputLength: 0,
        maxOutputLength: 0,
        minInputLength: 0,
        minOutputLength: 0
      }
    }

    const inputLengths = samples.map(s => s.input.length)
    const outputLengths = samples.map(s => s.output.length)

    return {
      totalSamples: samples.length,
      avgInputLength: inputLengths.reduce((a, b) => a + b, 0) / inputLengths.length,
      avgOutputLength: outputLengths.reduce((a, b) => a + b, 0) / outputLengths.length,
      maxInputLength: Math.max(...inputLengths),
      maxOutputLength: Math.max(...outputLengths),
      minInputLength: Math.min(...inputLengths),
      minOutputLength: Math.min(...outputLengths)
    }
  }
}