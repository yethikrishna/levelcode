import type { DatasetConfig, ValidationConfig } from '../types'
import type { DataSample, ValidationError } from './types'

// ============================================================================
// Data Validator
// ============================================================================

export class DataValidator {
  private config: ValidationConfig

  constructor(config: ValidationConfig) {
    this.config = config
  }

  validate(samples: DataSample[]): ValidationError[] {
    const errors: ValidationError[] = []

    // Validate required fields
    errors.push(...this.validateRequiredFields(samples))

    // Validate schema if provided
    if (this.config.schema) {
      errors.push(...this.validateSchema(samples))
    }

    // Validate custom validators
    errors.push(...this.validateCustomRules(samples))

    // Validate data quality
    errors.push(...this.validateDataQuality(samples))

    return errors
  }

  private validateRequiredFields(samples: DataSample[]): ValidationError[] {
    const errors: ValidationError[] = []

    samples.forEach((sample, index) => {
      this.config.requiredFields.forEach(field => {
        if (!(field in sample) || sample[field as keyof DataSample] === undefined) {
          errors.push({
            sampleId: sample.id,
            field,
            message: `Required field '${field}' is missing`,
            severity: 'error',
            fixable: false
          })
        }
      })
    })

    return errors
  }

  private validateSchema(samples: DataSample[]): ValidationError[] {
    const errors: ValidationError[] = []

    samples.forEach(sample => {
      const result = this.config.schema!.safeParse(sample)
      if (!result.success) {
        result.error.issues.forEach(issue => {
          const path = issue.path.join('.')
          errors.push({
            sampleId: sample.id,
            field: path,
            message: `Schema validation error: ${issue.message}`,
            severity: 'error',
            fixable: false
          })
        })
      }
    })

    return errors
  }

  private validateCustomRules(samples: DataSample[]): ValidationError[] {
    const errors: ValidationError[] = []

    samples.forEach(sample => {
      this.config.customValidators.forEach(rule => {
        try {
          if (!rule.validator(sample)) {
            errors.push({
              sampleId: sample.id,
              field: 'custom',
              message: rule.message,
              severity: 'error',
              fixable: false
            })
          }
        } catch (error) {
          errors.push({
            sampleId: sample.id,
            field: 'custom',
            message: `Validator error: ${error.message}`,
            severity: 'error',
            fixable: false
          })
        }
      })
    })

    return errors
  }

  private validateDataQuality(samples: DataSample[]): ValidationError[] {
    const errors: ValidationError[] = []

    samples.forEach(sample => {
      // Check for empty or whitespace-only content
      if (!sample.input || sample.input.trim().length === 0) {
        errors.push({
          sampleId: sample.id,
          field: 'input',
          message: 'Input is empty or contains only whitespace',
          severity: 'error',
          fixable: false
        })
      }

      if (!sample.output || sample.output.trim().length === 0) {
        errors.push({
          sampleId: sample.id,
          field: 'output',
          message: 'Output is empty or contains only whitespace',
          severity: 'error',
          fixable: false
        })
      }

      // Check for extremely long content
      if (sample.input.length > 10000) {
        errors.push({
          sampleId: sample.id,
          field: 'input',
          message: 'Input is extremely long (>10,000 characters)',
          severity: 'warning',
          fixable: false
        })
      }

      if (sample.output.length > 10000) {
        errors.push({
          sampleId: sample.id,
          field: 'output',
          message: 'Output is extremely long (>10,000 characters)',
          severity: 'warning',
          fixable: false
        })
      }

      // Check for potential data leakage (same input and output)
      if (sample.input.trim().toLowerCase() === sample.output.trim().toLowerCase()) {
        errors.push({
          sampleId: sample.id,
          field: 'output',
          message: 'Input and output are identical (possible data leakage)',
          severity: 'warning',
          fixable: false
        })
      }

      // Check for repetitive content
      if (this.isRepetitive(sample.input)) {
        errors.push({
          sampleId: sample.id,
          field: 'input',
          message: 'Input contains repetitive content',
          severity: 'warning',
          fixable: false
        })
      }

      if (this.isRepetitive(sample.output)) {
        errors.push({
          sampleId: sample.id,
          field: 'output',
          message: 'Output contains repetitive content',
          severity: 'warning',
          fixable: false
        })
      }
    })

    return errors
  }

  private isRepetitive(text: string): boolean {
    const words = text.toLowerCase().split(/\s+/)
    if (words.length < 10) return false

    // Check for repeated n-grams
    const nGrams = new Map<string, number>()
    const n = 3

    for (let i = 0; i <= words.length - n; i++) {
      const nGram = words.slice(i, i + n).join(' ')
      nGrams.set(nGram, (nGrams.get(nGram) || 0) + 1)
    }

    // If any n-gram appears more than 20% of the time, it's repetitive
    const maxCount = Math.max(...nGrams.values())
    const totalNGrams = words.length - n + 1
    
    return maxCount / totalNGrams > 0.2
  }

  // Method to fix minor issues if possible
  fixIssues(samples: DataSample[], errors: ValidationError[]): DataSample[] {
    if (this.config.errorHandling !== 'fix') {
      return samples
    }

    const fixableErrors = errors.filter(e => e.fixable)
    const fixedSamples = [...samples]

    fixableErrors.forEach(error => {
      const sampleIndex = fixedSamples.findIndex(s => s.id === error.sampleId)
      if (sampleIndex === -1) return

      const sample = fixedSamples[sampleIndex]

      // Apply fixes based on error type
      switch (error.field) {
        case 'input':
          if (error.message.includes('whitespace')) {
            sample.input = sample.input.trim()
          }
          break
        case 'output':
          if (error.message.includes('whitespace')) {
            sample.output = sample.output.trim()
          }
          break
      }
    })

    return fixedSamples
  }

  // Method to filter out invalid samples
  filterValidSamples(samples: DataSample[], errors: ValidationError[]): {
    valid: DataSample[]
    invalid: DataSample[]
    invalidIds: string[]
  } {
    const errorSampleIds = new Set(
      errors
        .filter(e => e.severity === 'error')
        .map(e => e.sampleId)
    )

    const valid: DataSample[] = []
    const invalid: DataSample[] = []

    samples.forEach(sample => {
      if (errorSampleIds.has(sample.id)) {
        invalid.push(sample)
      } else {
        valid.push(sample)
      }
    })

    return {
      valid,
      invalid,
      invalidIds: Array.from(errorSampleIds)
    }
  }
}