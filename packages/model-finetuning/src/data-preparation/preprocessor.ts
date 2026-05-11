import type { PreprocessingConfig, TokenizationConfig, FormattingConfig, FilteringConfig, AugmentationConfig } from '../types'
import type { DataSample, ProcessedDataset } from './types'

// ============================================================================
// Data Preprocessor
// ============================================================================

export class DataPreprocessor {
  private config: PreprocessingConfig
  private tokenizer?: any

  constructor(config: PreprocessingConfig) {
    this.config = config
  }

  async process(samples: DataSample[]): Promise<ProcessedDataset> {
    // Initialize tokenizer if needed
    await this.initializeTokenizer()

    // Apply filtering first
    let filteredSamples = this.applyFiltering(samples)

    // Apply formatting
    filteredSamples = this.applyFormatting(filteredSamples)

    // Apply augmentation if enabled
    if (this.config.augmentation.enabled) {
      filteredSamples = this.applyAugmentation(filteredSamples)
    }

    // Calculate token lengths
    const samplesWithTokens = await this.calculateTokenLengths(filteredSamples)

    // Create train/validation/test splits
    const splits = this.createSplits(samplesWithTokens)

    // Calculate statistics
    const statistics = this.calculateStatistics(samplesWithTokens)

    return {
      samples: samplesWithTokens,
      splits,
      statistics,
      tokenizer: this.config.tokenization.tokenizer || 'default',
      config: {} as any // Dataset config would be passed in
    }
  }

  private async initializeTokenizer(): Promise<void> {
    if (!this.config.tokenization.tokenizer) {
      return
    }

    // In a real implementation, you would load the actual tokenizer
    // For now, we'll simulate it
    this.tokenizer = {
      encode: (text: string) => this.simulateTokenization(text),
      decode: (tokens: number[]) => text,
      model_max_length: this.config.tokenization.maxLength
    }
  }

  private simulateTokenization(text: string): number[] {
    // Simple word-level tokenization for simulation
    // In reality, you'd use the actual tokenizer from transformers, tiktoken, etc.
    return text.split(/\s+/).map((_, i) => i)
  }

  private applyFiltering(samples: DataSample[]): DataSample[] {
    const config = this.config.filtering
    return samples.filter(sample => {
      // Length filtering
      if (config.minLength && sample.input.length < config.minLength) {
        return false
      }
      if (config.maxLength && sample.input.length > config.maxLength) {
        return false
      }
      if (config.minResponseLength && sample.output.length < config.minResponseLength) {
        return false
      }
      if (config.maxResponseLength && sample.output.length > config.maxResponseLength) {
        return false
      }

      // Prohibited words filtering
      if (config.prohibitedWords) {
        const text = (sample.input + ' ' + sample.output).toLowerCase()
        for (const word of config.prohibitedWords) {
          if (text.includes(word.toLowerCase())) {
            return false
          }
        }
      }

      // Required patterns filtering
      if (config.requiredPatterns) {
        const text = sample.input + ' ' + sample.output
        for (const pattern of config.requiredPatterns) {
          const regex = new RegExp(pattern)
          if (!regex.test(text)) {
            return false
          }
        }
      }

      // Quality threshold filtering
      if (config.qualityThreshold && sample.quality && sample.quality < config.qualityThreshold) {
        return false
      }

      return true
    })
  }

  private applyFormatting(samples: DataSample[]): DataSample[] {
    const config = this.config.formatting
    return samples.map(sample => {
      let formattedInput = sample.input
      let formattedOutput = sample.output

      switch (config.formatStyle) {
        case 'chatml':
          formattedInput = this.formatChatML(sample, config)
          break
        case 'alpaca':
          formattedInput = this.formatAlpaca(sample, config)
          break
        case 'vicuna':
          formattedInput = this.formatVicuna(sample, config)
          break
        case 'custom':
          formattedInput = this.formatCustom(sample, config)
          break
        default:
          // Keep original format
          break
      }

      return {
        ...sample,
        input: formattedInput,
        output: formattedOutput
      }
    })
  }

  private formatChatML(sample: DataSample, config: FormattingConfig): string {
    let formatted = ''

    if (config.systemPrompt) {
      formatted += `<|im_start|>system\n${config.systemPrompt}<|im_end|>\n`
    }

    formatted += `<|im_start|>user\n${sample.input}<|im_end|>\n`
    formatted += `<|im_start|>assistant\n${sample.output}<|im_end|>`

    return formatted
  }

  private formatAlpaca(sample: DataSample, config: FormattingConfig): string {
    let formatted = ''

    if (config.instructionTemplate) {
      formatted = config.instructionTemplate
        .replace('{instruction}', sample.input)
        .replace('{input}', '')
        .replace('{output}', sample.output)
    } else {
      formatted = `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
${sample.input}

### Response:
${sample.output}`
    }

    return formatted
  }

  private formatVicuna(sample: DataSample, config: FormattingConfig): string {
    let formatted = ''

    if (config.systemPrompt) {
      formatted += `${config.systemPrompt}\n\n`
    }

    formatted += `USER: ${sample.input}\nASSISTANT: ${sample.output}`

    return formatted
  }

  private formatCustom(sample: DataSample, config: FormattingConfig): string {
    if (config.instructionTemplate && config.responseTemplate) {
      const instruction = config.instructionTemplate
        .replace('{input}', sample.input)
        .replace('{instruction}', sample.input)
      
      const response = config.responseTemplate
        .replace('{output}', sample.output)
        .replace('{response}', sample.output)

      return instruction + response
    }

    return sample.input + sample.output
  }

  private applyAugmentation(samples: DataSample[]): DataSample[] {
    const config = this.config.augmentation
    const augmentedSamples = [...samples]

    // Calculate how many augmented samples to create
    const targetSize = Math.floor(samples.length * config.augmentationFactor)
    const numToCreate = targetSize - samples.length

    if (numToCreate <= 0) {
      return samples
    }

    // Create augmented samples
    for (let i = 0; i < numToCreate; i++) {
      const originalSample = samples[i % samples.length]
      const augmentedSample = this.augmentSample(originalSample, config)
      if (augmentedSample) {
        augmentedSamples.push(augmentedSample)
      }
    }

    return augmentedSamples
  }

  private augmentSample(sample: DataSample, config: AugmentationConfig): DataSample | null {
    const techniques = config.techniques

    for (const technique of techniques) {
      switch (technique) {
        case 'paraphrasing':
          return this.paraphraseSample(sample)
        case 'back_translation':
          return this.backTranslateSample(sample)
        case 'synonym_replacement':
          return this.replaceSynonyms(sample)
        case 'template_variation':
          return this.varyTemplate(sample)
      }
    }

    return null
  }

  private paraphraseSample(sample: DataSample): DataSample {
    // In a real implementation, you would use a paraphrasing model
    // For now, we'll simulate it with simple transformations
    const paraphrasedInput = this.simpleParaphrase(sample.input)
    const paraphrasedOutput = this.simpleParaphrase(sample.output)

    return {
      ...sample,
      id: `${sample.id}_paraphrased`,
      input: paraphrasedInput,
      output: paraphrasedOutput,
      metadata: {
        ...sample.metadata,
        augmentation: 'paraphrasing'
      }
    }
  }

  private backTranslateSample(sample: DataSample): DataSample {
    // In a real implementation, you would translate to another language and back
    // For now, we'll simulate it
    const translatedInput = this.simpleTranslate(sample.input, 'intermediate')
    const backTranslatedInput = this.simpleTranslate(translatedInput, 'back')
    
    const translatedOutput = this.simpleTranslate(sample.output, 'intermediate')
    const backTranslatedOutput = this.simpleTranslate(translatedOutput, 'back')

    return {
      ...sample,
      id: `${sample.id}_back_translated`,
      input: backTranslatedInput,
      output: backTranslatedOutput,
      metadata: {
        ...sample.metadata,
        augmentation: 'back_translation'
      }
    }
  }

  private replaceSynonyms(sample: DataSample): DataSample {
    // In a real implementation, you would use a thesaurus or word embeddings
    // For now, we'll simulate with simple word replacements
    const inputWithSynonyms = this.replaceSimpleSynonyms(sample.input)
    const outputWithSynonyms = this.replaceSimpleSynonyms(sample.output)

    return {
      ...sample,
      id: `${sample.id}_synonyms`,
      input: inputWithSynonyms,
      output: outputWithSynonyms,
      metadata: {
        ...sample.metadata,
        augmentation: 'synonym_replacement'
      }
    }
  }

  private varyTemplate(sample: DataSample): DataSample {
    // Vary the template or structure of the prompt
    const variations = [
      `Question: ${sample.input}\nAnswer: ${sample.output}`,
      `Q: ${sample.input}\nA: ${sample.output}`,
      `Input: ${sample.input}\nOutput: ${sample.output}`
    ]

    const variation = variations[Math.floor(Math.random() * variations.length)]

    return {
      ...sample,
      id: `${sample.id}_template_variation`,
      input: variation,
      output: '',
      metadata: {
        ...sample.metadata,
        augmentation: 'template_variation'
      }
    }
  }

  // Helper methods for augmentation (simplified implementations)
  private simpleParaphrase(text: string): string {
    // Simple paraphrasing by swapping synonyms and reordering
    const replacements: Record<string, string> = {
      'quick': 'fast',
      'fast': 'quick',
      'good': 'great',
      'great': 'good',
      'important': 'significant',
      'significant': 'important'
    }

    let paraphrased = text
    for (const [original, replacement] of Object.entries(replacements)) {
      const regex = new RegExp(`\\b${original}\\b`, 'gi')
      paraphrased = paraphrased.replace(regex, replacement)
    }

    return paraphrased
  }

  private simpleTranslate(text: string, direction: 'intermediate' | 'back'): string {
    // Simulated translation - in reality you'd use a translation API
    if (direction === 'intermediate') {
      return `[TRANSLATED] ${text}`
    } else {
      return text.replace('[TRANSLATED] ', '')
    }
  }

  private replaceSimpleSynonyms(text: string): string {
    const synonyms: Record<string, string[]> = {
      'happy': ['joyful', 'cheerful', 'glad'],
      'sad': ['unhappy', 'sorrowful', 'depressed'],
      'big': ['large', 'huge', 'enormous'],
      'small': ['tiny', 'little', 'petite']
    }

    let result = text
    for (const [word, synonymList] of Object.entries(synonyms)) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi')
      const synonym = synonymList[Math.floor(Math.random() * synonymList.length)]
      result = result.replace(regex, synonym)
    }

    return result
  }

  private async calculateTokenLengths(samples: DataSample[]): Promise<DataSample[]> {
    if (!this.tokenizer) {
      return samples
    }

    return samples.map(sample => {
      const inputTokens = this.tokenizer!.encode(sample.input)
      const outputTokens = this.tokenizer!.encode(sample.output)

      return {
        ...sample,
        length: {
          input: sample.input.length,
          output: sample.output.length,
          tokens: {
            input: inputTokens.length,
            output: outputTokens.length
          }
        }
      }
    })
  }

  private createSplits(samples: DataSample[]): {
    train: DataSample[]
    validation: DataSample[]
    test: DataSample[]
  } {
    // Shuffle samples
    const shuffled = [...samples].sort(() => Math.random() - 0.5)

    const total = shuffled.length
    const trainSize = Math.floor(total * 0.8)
    const validationSize = Math.floor(total * 0.1)

    return {
      train: shuffled.slice(0, trainSize),
      validation: shuffled.slice(trainSize, trainSize + validationSize),
      test: shuffled.slice(trainSize + validationSize)
    }
  }

  private calculateStatistics(samples: DataSample[]): any {
    const totalSamples = samples.length
    let totalInputLength = 0
    let totalOutputLength = 0
    let totalInputTokens = 0
    let totalOutputTokens = 0

    samples.forEach(sample => {
      totalInputLength += sample.input.length
      totalOutputLength += sample.output.length
      
      if (sample.length?.tokens) {
        totalInputTokens += sample.length.tokens.input
        totalOutputTokens += sample.length.tokens.output
      }
    })

    return {
      totalSamples,
      avgInputLength: totalInputLength / totalSamples,
      avgOutputLength: totalOutputLength / totalSamples,
      avgInputTokens: totalInputTokens / totalSamples,
      avgOutputTokens: totalOutputTokens / totalSamples,
      vocabSize: this.estimateVocabSize(samples)
    }
  }

  private estimateVocabSize(samples: DataSample[]): number {
    const allWords = new Set<string>()
    samples.forEach(sample => {
      const words = (sample.input + ' ' + sample.output).toLowerCase().split(/\s+/)
      words.forEach(word => allWords.add(word))
    })
    return allWords.size
  }
}