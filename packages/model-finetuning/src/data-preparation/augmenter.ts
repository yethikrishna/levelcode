import type { AugmentationConfig } from '../types'
import type { DataSample } from './types'

// ============================================================================
// Data Augmenter
// ============================================================================

export class DataAugmenter {
  private config: AugmentationConfig
  private rng: () => number

  constructor(config: AugmentationConfig) {
    this.config = config
    this.rng = this.createRNG(config.seed)
  }

  async augment(samples: DataSample[]): Promise<DataSample[]> {
    const augmentedSamples: DataSample[] = []
    
    for (const sample of samples) {
      augmentedSamples.push(sample)
      
      // Generate augmented versions
      const numAugmentations = Math.floor(this.config.augmentationFactor) - 1
      for (let i = 0; i < numAugmentations; i++) {
        const augmented = await this.augmentSample(sample)
        if (augmented) {
          augmentedSamples.push(augmented)
        }
      }
    }

    return augmentedSamples
  }

  private async augmentSample(sample: DataSample): Promise<DataSample | null> {
    const technique = this.config.techniques[
      Math.floor(this.rng() * this.config.techniques.length)
    ]

    switch (technique) {
      case 'paraphrasing':
        return this.paraphrase(sample)
      case 'back_translation':
        return this.backTranslate(sample)
      case 'synonym_replacement':
        return this.replaceSynonyms(sample)
      case 'template_variation':
        return this.varyTemplate(sample)
      default:
        return null
    }
  }

  private async paraphrase(sample: DataSample): Promise<DataSample> {
    // Advanced paraphrasing using multiple techniques
    const paraphrasedInput = await this.advancedParaphrase(sample.input)
    const paraphrasedOutput = await this.advancedParaphrase(sample.output)

    return {
      ...sample,
      id: `${sample.id}_paraphrased_${Date.now()}`,
      input: paraphrasedInput,
      output: paraphrasedOutput,
      metadata: {
        ...sample.metadata,
        augmentation: 'paraphrasing',
        originalInput: sample.input,
        originalOutput: sample.output
      }
    }
  }

  private async advancedParaphrase(text: string): Promise<string> {
    // Apply multiple paraphrasing techniques
    let paraphrased = text

    // 1. Sentence structure variation
    paraphrased = this.varySentenceStructure(paraphrased)

    // 2. Synonym replacement (contextual)
    paraphrased = this.contextualSynonymReplacement(paraphrased)

    // 3. Passive/active voice swapping
    paraphrased = this.swapVoice(paraphrased)

    // 4. Clause reordering
    paraphrased = this.reorderClauses(paraphrased)

    return paraphrased
  }

  private varySentenceStructure(text: string): string {
    const sentences = text.split(/(?<=[.!?])\s+/)
    return sentences.map(sentence => {
      // Simple sentence structure variations
      if (sentence.startsWith('However,')) {
        return sentence.replace('However,', '') + ', however.'
      }
      if (sentence.includes('because')) {
        return sentence.replace(/(.*) because (.*)/, '$2, so $1.')
      }
      return sentence
    }).join(' ')
  }

  private contextualSynonymReplacement(text: string): string {
    // Context-aware synonym replacement
    const contextualReplacements: Record<string, string[]> = {
      'important': ['crucial', 'vital', 'essential', 'significant'],
      'good': ['excellent', 'great', 'wonderful', 'fantastic'],
      'bad': ['poor', 'terrible', 'awful', 'dreadful'],
      'big': ['large', 'huge', 'enormous', 'massive'],
      'small': ['tiny', 'little', 'minor', 'petite'],
      'fast': ['quick', 'rapid', 'swift', 'speedy'],
      'slow': ['sluggish', 'gradual', 'leisurely', 'unhurried']
    }

    let result = text
    const words = text.split(/\s+/)
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i].toLowerCase().replace(/[^a-z]/g, '')
      if (contextualReplacements[word]) {
        const synonyms = contextualReplacements[word]
        const replacement = synonyms[Math.floor(this.rng() * synonyms.length)]
        result = result.replace(new RegExp(`\\b${words[i]}\\b`, 'i'), replacement)
      }
    }

    return result
  }

  private swapVoice(text: string): string {
    // Simple active/passive voice swapping
    const passivePatterns = [
      /(.*) was (.*) by (.*)/,
      /(.*) were (.*) by (.*)/,
      /(.*) is (.*) by (.*)/,
      /(.*) are (.*) by (.*)/
    ]

    let result = text
    
    for (const pattern of passivePatterns) {
      result = result.replace(pattern, '$3 $2 $1')
    }

    return result
  }

  private reorderClauses(text: string): string {
    // Simple clause reordering
    const conjunctions = ['and', 'but', 'or', 'so', 'yet', 'for']
    const parts = text.split(new RegExp(`\\s+(${conjunctions.join('|')})\\s+`))
    
    if (parts.length >= 3) {
      // Rearrange: clause1 + conjunction + clause2 -> clause2 + conjunction + clause1
      const clause1 = parts[0]
      const conjunction = parts[1]
      const clause2 = parts[2]
      
      if (this.rng() > 0.5) {
        return `${clause2} ${conjunction} ${clause1}`
      }
    }

    return text
  }

  private async backTranslate(sample: DataSample): Promise<DataSample> {
    // Simulated back translation through multiple languages
    const languages = ['es', 'fr', 'de', 'it', 'pt']
    const intermediateLang = languages[Math.floor(this.rng() * languages.length)]
    
    const translatedInput = await this.translateText(sample.input, intermediateLang)
    const backTranslatedInput = await this.translateText(translatedInput, 'en')
    
    const translatedOutput = await this.translateText(sample.output, intermediateLang)
    const backTranslatedOutput = await this.translateText(translatedOutput, 'en')

    return {
      ...sample,
      id: `${sample.id}_back_translated_${Date.now()}`,
      input: backTranslatedInput,
      output: backTranslatedOutput,
      metadata: {
        ...sample.metadata,
        augmentation: 'back_translation',
        intermediateLanguage: intermediateLang,
        originalInput: sample.input,
        originalOutput: sample.output
      }
    }
  }

  private async translateText(text: string, targetLanguage: string): Promise<string> {
    // Simulated translation - in production, use translation API
    const translations: Record<string, Record<string, string>> = {
      'es': {
        'hello': 'hola',
        'world': 'mundo',
        'good': 'bueno',
        'bad': 'malo',
        'big': 'grande',
        'small': 'pequeño'
      },
      'fr': {
        'hello': 'bonjour',
        'world': 'monde',
        'good': 'bon',
        'bad': 'mauvais',
        'big': 'grand',
        'small': 'petit'
      },
      'de': {
        'hello': 'hallo',
        'world': 'welt',
        'good': 'gut',
        'bad': 'schlecht',
        'big': 'groß',
        'small': 'klein'
      }
    }

    if (targetLanguage === 'en') {
      // Back translation
      const reverseTranslations: Record<string, string> = {
        'hola': 'hello',
        'mundo': 'world',
        'bueno': 'good',
        'malo': 'bad',
        'grande': 'big',
        'pequeño': 'small',
        'bonjour': 'hello',
        'monde': 'world',
        'bon': 'good',
        'mauvais': 'bad',
        'grand': 'big',
        'petit': 'small',
        'hallo': 'hello',
        'welt': 'world',
        'gut': 'good',
        'schlecht': 'bad',
        'groß': 'big',
        'klein': 'small'
      }

      let translated = text
      for (const [foreign, english] of Object.entries(reverseTranslations)) {
        translated = translated.replace(new RegExp(foreign, 'g'), english)
      }
      return translated
    }

    // Forward translation
    let translated = text
    const langDict = translations[targetLanguage] || {}
    
    for (const [english, foreign] of Object.entries(langDict)) {
      translated = translated.replace(new RegExp(english, 'g'), foreign)
    }

    return `[${targetLanguage.toUpperCase()}] ${translated}`
  }

  private async replaceSynonyms(sample: DataSample): Promise<DataSample> {
    const augmentedInput = this.advancedSynonymReplacement(sample.input)
    const augmentedOutput = this.advancedSynonymReplacement(sample.output)

    return {
      ...sample,
      id: `${sample.id}_synonyms_${Date.now()}`,
      input: augmentedInput,
      output: augmentedOutput,
      metadata: {
        ...sample.metadata,
        augmentation: 'synonym_replacement',
        originalInput: sample.input,
        originalOutput: sample.output
      }
    }
  }

  private advancedSynonymReplacement(text: string): string {
    // Advanced synonym replacement with context awareness
    const synonymGroups: Record<string, string[]> = {
      // Adjectives
      'happy': ['joyful', 'cheerful', 'delighted', 'pleased', 'content'],
      'sad': ['unhappy', 'sorrowful', 'melancholy', 'dejected', 'gloomy'],
      'angry': ['furious', 'enraged', 'irate', 'livid', 'incensed'],
      'scared': ['afraid', 'frightened', 'terrified', 'fearful', 'alarmed'],
      
      // Verbs
      'run': ['sprint', 'dash', 'jog', 'scamper', 'bolt'],
      'walk': ['stroll', 'amble', 'saunter', 'march', 'stride'],
      'say': ['state', 'declare', 'mention', 'express', 'announce'],
      'think': ['believe', 'consider', 'suppose', 'reckon', 'deem'],
      
      // Nouns
      'problem': ['issue', 'challenge', 'difficulty', 'obstacle', 'hurdle'],
      'solution': ['answer', 'resolution', 'remedy', 'fix', 'approach'],
      'information': ['data', 'details', 'facts', 'knowledge', 'insights'],
      'method': ['approach', 'technique', 'strategy', 'procedure', 'way']
    }

    let result = text.toLowerCase()
    const replacedWords = new Set<string>()
    
    for (const [word, synonyms] of Object.entries(synonymGroups)) {
      if (!replacedWords.has(word) && result.includes(word)) {
        const synonym = synonyms[Math.floor(this.rng() * synonyms.length)]
        const regex = new RegExp(`\\b${word}\\b`, 'gi')
        result = result.replace(regex, synonym)
        replacedWords.add(word)
      }
    }

    return result
  }

  private async varyTemplate(sample: DataSample): Promise<DataSample> {
    const templates = [
      {
        input: 'Q: {text}\nA:',
        output: '{response}'
      },
      {
        input: 'Question: {text}\nAnswer:',
        output: '{response}'
      },
      {
        input: 'Human: {text}\nAssistant:',
        output: '{response}'
      },
      {
        input: 'You are given the following: {text}\nProvide:',
        output: '{response}'
      },
      {
        input: 'Consider this: {text}\nNow respond:',
        output: '{response}'
      },
      {
        input: '{text}\n\nResponse:',
        output: '{response}'
      }
    ]

    const template = templates[Math.floor(this.rng() * templates.length)]
    
    const formattedInput = template.input.replace('{text}', sample.input)
    const formattedOutput = template.output.replace('{response}', sample.output)

    return {
      ...sample,
      id: `${sample.id}_template_${Date.now()}`,
      input: formattedInput,
      output: formattedOutput,
      metadata: {
        ...sample.metadata,
        augmentation: 'template_variation',
        templateUsed: JSON.stringify(template),
        originalInput: sample.input,
        originalOutput: sample.output
      }
    }
  }

  private createRNG(seed?: number): () => number {
    if (seed !== undefined) {
      let state = seed
      return () => {
        state = (state * 9301 + 49297) % 233280
        return state / 233280
      }
    } else {
      return Math.random
    }
  }

  // Advanced augmentation: Mix multiple techniques
  async mixedAugmentation(sample: DataSample): Promise<DataSample> {
    const techniques = this.config.techniques.sort(() => this.rng() - 0.5)
    let augmentedSample = { ...sample }

    for (const technique of techniques.slice(0, 2)) { // Apply 2 random techniques
      switch (technique) {
        case 'paraphrasing':
          augmentedSample = await this.paraphrase(augmentedSample)
          break
        case 'synonym_replacement':
          augmentedSample = await this.replaceSynonyms(augmentedSample)
          break
        case 'template_variation':
          augmentedSample = await this.varyTemplate(augmentedSample)
          break
      }
    }

    return {
      ...augmentedSample,
      id: `${sample.id}_mixed_${Date.now()}`,
      metadata: {
        ...augmentedSample.metadata,
        augmentation: 'mixed',
        techniquesUsed: techniques.slice(0, 2)
      }
    }
  }
}