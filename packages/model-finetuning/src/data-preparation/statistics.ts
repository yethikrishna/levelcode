import type { DataSample, DatasetStatistics } from './types'

// ============================================================================
// Statistics Calculator
// ============================================================================

export class StatisticsCalculator {
  calculate(samples: DataSample[]): DatasetStatistics {
    if (samples.length === 0) {
      return {
        totalSamples: 0,
        avgInputLength: 0,
        avgOutputLength: 0,
        vocabSize: 0,
        qualityScore: 0
      }
    }

    const basicStats = this.calculateBasicStats(samples)
    const vocabStats = this.calculateVocabularyStats(samples)
    const qualityStats = this.calculateQualityStats(samples)
    const distributionStats = this.calculateDistributionStats(samples)
    const complexityStats = this.calculateComplexityStats(samples)

    return {
      ...basicStats,
      ...vocabStats,
      ...qualityStats,
      labelDistribution: distributionStats,
      ...complexityStats
    }
  }

  private calculateBasicStats(samples: DataSample[]): {
    totalSamples: number
    avgInputLength: number
    avgOutputLength: number
  } {
    const totalSamples = samples.length
    const totalInputLength = samples.reduce((sum, s) => sum + s.input.length, 0)
    const totalOutputLength = samples.reduce((sum, s) => sum + s.output.length, 0)

    return {
      totalSamples,
      avgInputLength: totalInputLength / totalSamples,
      avgOutputLength: totalOutputLength / totalSamples
    }
  }

  private calculateVocabularyStats(samples: DataSample[]): {
    vocabSize: number
    avgTokensPerInput: number
    avgTokensPerOutput: number
    rareWords: string[]
    commonWords: Array<{ word: string; frequency: number }>
  } {
    const wordFreq = new Map<string, number>()
    let totalInputTokens = 0
    let totalOutputTokens = 0

    samples.forEach(sample => {
      const inputWords = this.tokenize(sample.input)
      const outputWords = this.tokenize(sample.output)
      
      totalInputTokens += inputWords.length
      totalOutputTokens += outputWords.length

      [...inputWords, ...outputWords].forEach(word => {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1)
      })
    })

    const vocabSize = wordFreq.size
    const avgTokensPerInput = totalInputTokens / samples.length
    const avgTokensPerOutput = totalOutputTokens / samples.length

    // Find rare words (appearing less than 3 times)
    const rareWords = Array.from(wordFreq.entries())
      .filter(([_, freq]) => freq < 3)
      .map(([word, _]) => word)

    // Find common words (top 20)
    const commonWords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, freq]) => ({ word, frequency: freq }))

    return {
      vocabSize,
      avgTokensPerInput,
      avgTokensPerOutput,
      rareWords,
      commonWords
    }
  }

  private calculateQualityStats(samples: DataSample[]): {
    qualityScore: number
    duplicateRate: number
    emptySamples: number
    avgQualityScore: number
  } {
    let totalQuality = 0
    let qualityCount = 0
    const seenInputs = new Set<string>()
    let duplicates = 0
    let emptySamples = 0

    samples.forEach(sample => {
      if (!sample.input || sample.input.trim().length === 0) {
        emptySamples++
      }

      if (seenInputs.has(sample.input.toLowerCase())) {
        duplicates++
      } else {
        seenInputs.add(sample.input.toLowerCase())
      }

      if (sample.quality !== undefined) {
        totalQuality += sample.quality
        qualityCount++
      }
    })

    const avgQualityScore = qualityCount > 0 ? totalQuality / qualityCount : 0
    const duplicateRate = duplicates / samples.length
    const emptyRate = emptySamples / samples.length
    
    // Overall quality score (0-100)
    const qualityScore = Math.round(
      (avgQualityScore * 0.4) + // Provided quality scores
      ((1 - duplicateRate) * 30) + // Deduction for duplicates
      ((1 - emptyRate) * 30) // Deduction for empty samples
    )

    return {
      qualityScore,
      duplicateRate,
      emptySamples,
      avgQualityScore
    }
  }

  private calculateDistributionStats(samples: DataSample[]): Record<string, number> {
    // This would depend on your specific dataset structure
    // For now, we'll analyze some basic patterns
    const categories = new Map<string, number>()

    samples.forEach(sample => {
      // Simple categorization based on input patterns
      const input = sample.input.toLowerCase()
      let category = 'general'

      if (input.includes('question') || input.includes('?')) {
        category = 'question answering'
      } else if (input.includes('translate') || input.includes('translation')) {
        category = 'translation'
      } else if (input.includes('summarize') || input.includes('summary')) {
        category = 'summarization'
      } else if (input.includes('write') || input.includes('create') || input.includes('generate')) {
        category = 'generation'
      } else if (input.includes('classify') || input.includes('categorize')) {
        category = 'classification'
      }

      categories.set(category, (categories.get(category) || 0) + 1)
    })

    return Object.fromEntries(categories)
  }

  private calculateComplexityStats(samples: DataSample[]): {
    avgSentenceCount: number
    avgWordCount: number
    complexityScore: number
    readabilityScore: number
  } {
    let totalSentenceCount = 0
    let totalWordCount = 0
    let totalComplexityScore = 0

    samples.forEach(sample => {
      const text = sample.input + ' ' + sample.output
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
      const words = this.tokenize(text)
      
      totalSentenceCount += sentences.length
      totalWordCount += words.length
      
      // Simple complexity based on average sentence length and word diversity
      const avgSentenceLength = words.length / sentences.length
      const uniqueWords = new Set(words.map(w => w.toLowerCase())).size
      const wordDiversity = uniqueWords / words.length
      
      const complexityScore = (avgSentenceLength * 0.6) + (wordDiversity * 40)
      totalComplexityScore += complexityScore
    })

    const avgSentenceCount = totalSentenceCount / samples.length
    const avgWordCount = totalWordCount / samples.length
    const avgComplexityScore = totalComplexityScore / samples.length
    
    // Readability score (simplified Flesch-Kincaid)
    const avgWordsPerSentence = avgWordCount / avgSentenceCount
    const avgSyllablesPerWord = 1.5 // Simplified calculation
    const readabilityScore = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord)

    return {
      avgSentenceCount,
      avgWordCount,
      complexityScore: Math.round(avgComplexityScore),
      readabilityScore: Math.max(0, Math.min(100, readabilityScore))
    }
  }

  private tokenize(text: string): string[] {
    // Simple tokenization - in production, use proper tokenizer
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0)
  }

  // Generate detailed report
  generateReport(samples: DataSample[]): string {
    const stats = this.calculate(samples)

    return `
Dataset Statistics Report
========================

Basic Statistics:
- Total Samples: ${stats.totalSamples}
- Average Input Length: ${stats.avgInputLength.toFixed(2)} characters
- Average Output Length: ${stats.avgOutputLength.toFixed(2)} characters

Vocabulary Statistics:
- Vocabulary Size: ${stats.vocabSize}
- Average Tokens per Input: ${(stats as any).avgTokensPerInput?.toFixed(2) || 'N/A'}
- Average Tokens per Output: ${(stats as any).avgTokensPerOutput?.toFixed(2) || 'N/A'}

Quality Metrics:
- Overall Quality Score: ${stats.qualityScore}/100
- Duplicate Rate: ${((stats as any).duplicateRate * 100).toFixed(2)}%
- Empty Samples: ${(stats as any).emptySamples}
- Average Quality Score: ${(stats as any).avgQualityScore?.toFixed(2) || 'N/A'}

Complexity Metrics:
- Average Sentence Count: ${(stats as any).avgSentenceCount?.toFixed(2)}
- Average Word Count: ${(stats as any).avgWordCount?.toFixed(2)}
- Complexity Score: ${(stats as any).complexityScore}
- Readability Score: ${(stats as any).readabilityScore?.toFixed(2)}

Label Distribution:
${Object.entries(stats.labelDistribution || {})
  .map(([label, count]) => `- ${label}: ${count} (${((count / stats.totalSamples) * 100).toFixed(1)}%)`)
  .join('\n')}

Top 10 Most Common Words:
${((stats as any).commonWords || [])
  .slice(0, 10)
  .map(({ word, frequency }) => `- ${word}: ${frequency}`)
  .join('\n')}

Rare Words (appearing < 3 times):
${((stats as any).rareWords || [])
  .slice(0, 20)
  .map(word => `- ${word}`)
  .join('\n')}
`.trim()
  }

  // Visual statistics for dashboard
  getVisualStats(samples: DataSample[]): {
    lengthDistribution: { input: number[]; output: number[] }
    qualityDistribution: number[]
    tokenDistribution: { input: number[]; output: number[] }
  } {
    const inputLengths = samples.map(s => s.input.length)
    const outputLengths = samples.map(s => s.output.length)
    const qualities = samples.filter(s => s.quality !== undefined).map(s => s.quality!)
    
    const inputTokens = samples.map(s => s.length?.tokens?.input || 0)
    const outputTokens = samples.map(s => s.length?.tokens?.output || 0)

    return {
      lengthDistribution: {
        input: this.createHistogram(inputLengths, 20),
        output: this.createHistogram(outputLengths, 20)
      },
      qualityDistribution: this.createHistogram(qualities, 10),
      tokenDistribution: {
        input: this.createHistogram(inputTokens, 20),
        output: this.createHistogram(outputTokens, 20)
      }
    }
  }

  private createHistogram(values: number[], bins: number): number[] {
    if (values.length === 0) return new Array(bins).fill(0)

    const min = Math.min(...values)
    const max = Math.max(...values)
    const binSize = (max - min) / bins
    
    const histogram = new Array(bins).fill(0)
    
    values.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binSize), bins - 1)
      histogram[binIndex]++
    })

    return histogram
  }
}