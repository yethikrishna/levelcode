import type { FormattingConfig } from '../types'
import type { DataSample } from './types'

// ============================================================================
// Data Formatter
// ============================================================================

export class DataFormatter {
  private config: FormattingConfig

  constructor(config: FormattingConfig) {
    this.config = config
  }

  // Format samples for different model architectures
  formatForModel(samples: DataSample[], modelType: string): DataSample[] {
    switch (modelType.toLowerCase()) {
      case 'llama':
        return this.formatForLlama(samples)
      case 'mistral':
        return this.formatForMistral(samples)
      case 'falcon':
        return this.formatForFalcon(samples)
      case 'gpt':
      case 'gpt2':
        return this.formatForGPT(samples)
      case 'bert':
        return this.formatForBERT(samples)
      case 't5':
        return this.formatForT5(samples)
      default:
        return this.formatGeneric(samples)
    }
  }

  // Format for Llama models
  private formatForLlama(samples: DataSample[]): DataSample[] {
    return samples.map(sample => {
      let formatted = ''

      if (this.config.systemPrompt) {
        formatted += `<s>[INST] <<SYS>>\n${this.config.systemPrompt}\n<</SYS>>\n\n`
      } else {
        formatted += `<s>[INST] `
      }

      formatted += `${sample.input} [/INST] ${sample.output}</s>`

      return {
        ...sample,
        input: formatted,
        output: ''
      }
    })
  }

  // Format for Mistral models
  private formatForMistral(samples: DataSample[]): DataSample[] {
    return samples.map(sample => {
      let formatted = ''

      if (this.config.systemPrompt) {
        formatted += `<s>[INST] ${this.config.systemPrompt}\n\n`
      } else {
        formatted += `<s>[INST] `
      }

      formatted += `${sample.input} [/INST] ${sample.output}</s>`

      return {
        ...sample,
        input: formatted,
        output: ''
      }
    })
  }

  // Format for Falcon models
  private formatForFalcon(samples: DataSample[]): DataSample[] {
    return samples.map(sample => {
      let formatted = ''

      if (this.config.systemPrompt) {
        formatted += `${this.config.systemPrompt}\n`
      }

      formatted += `User: ${sample.input}\nAssistant: ${sample.output}`

      return {
        ...sample,
        input: formatted,
        output: ''
      }
    })
  }

  // Format for GPT models
  private formatForGPT(samples: DataSample[]): DataSample[] {
    return samples.map(sample => {
      let formatted = ''

      if (this.config.systemPrompt) {
        formatted += `${this.config.systemPrompt}\n\n`
      }

      formatted += `Q: ${sample.input}\nA: ${sample.output}`

      return {
        ...sample,
        input: formatted,
        output: ''
      }
    })
  }

  // Format for BERT models (sequence classification)
  private formatForBERT(samples: DataSample[]): DataSample[] {
    return samples.map(sample => {
      // BERT uses [CLS] and [SEP] tokens
      const formatted = `[CLS] ${sample.input} [SEP] ${sample.output} [SEP]`

      return {
        ...sample,
        input: formatted,
        output: ''
      }
    })
  }

  // Format for T5 models (seq2seq)
  private formatForT5(samples: DataSample[]): DataSample[] {
    return samples.map(sample => {
      // T5 uses task prefixes
      let formatted = ''
      
      if (this.config.systemPrompt) {
        formatted += `${this.config.systemPrompt}: `
      } else {
        formatted = 'summarize: '
      }

      formatted += `${sample.input} ${this.config.responseTemplate || ''} ${sample.output}`

      return {
        ...sample,
        input: formatted,
        output: ''
      }
    })
  }

  // Generic formatting
  private formatGeneric(samples: DataSample[]): DataSample[] {
    return samples.map(sample => {
      let formatted = ''

      if (this.config.systemPrompt) {
        formatted += `${this.config.systemPrompt}\n\n`
      }

      if (this.config.instructionTemplate) {
        formatted += this.config.instructionTemplate
          .replace('{input}', sample.input)
          .replace('{instruction}', sample.input)
      } else {
        formatted += `Input: ${sample.input}\nOutput: `
      }

      if (this.config.responseTemplate) {
        formatted += this.config.responseTemplate
          .replace('{output}', sample.output)
          .replace('{response}', sample.output)
      } else {
        formatted += sample.output
      }

      return {
        ...sample,
        input: formatted,
        output: ''
      }
    })
  }

  // Format for instruction following
  formatInstructionFollowing(samples: DataSample[]): DataSample[] {
    return samples.map(sample => {
      const formatted = `### Instruction:\n${sample.input}\n\n### Response:\n${sample.output}`

      return {
        ...sample,
        input: formatted,
        output: ''
      }
    })
  }

  // Format for chat models with conversation history
  formatChat(samples: DataSample[], includeHistory: boolean = true): DataSample[] {
    return samples.map(sample => {
      let formatted = ''

      if (this.config.systemPrompt) {
        formatted += `System: ${this.config.systemPrompt}\n\n`
      }

      formatted += `Human: ${sample.input}\nAssistant: ${sample.output}`

      return {
        ...sample,
        input: formatted,
        output: ''
      }
    })
  }

  // Format for multi-turn conversations
  formatMultiTurn(conversations: Array<{ turns: Array<{ role: string; content: string }> }>): DataSample[] {
    const samples: DataSample[] = []

    conversations.forEach((conversation, convIndex) => {
      for (let i = 0; i < conversation.turns.length - 1; i += 2) {
        const userTurn = conversation.turns[i]
        const assistantTurn = conversation.turns[i + 1]

        if (userTurn.role === 'user' && assistantTurn.role === 'assistant') {
          let formatted = ''

          // Include system prompt if it's the first turn
          if (i === 0 && this.config.systemPrompt) {
            formatted += `System: ${this.config.systemPrompt}\n\n`
          }

          // Include history up to current turn
          if (this.config.includeHistory) {
            const historyLimit = this.config.historyLimit || i
            const startIdx = Math.max(0, i - historyLimit)
            
            for (let j = startIdx; j < i; j++) {
              const turn = conversation.turns[j]
              formatted += `${turn.role.charAt(0).toUpperCase() + turn.role.slice(1)}: ${turn.content}\n`
            }
          }

          formatted += `Human: ${userTurn.content}\nAssistant: ${assistantTurn.content}`

          samples.push({
            id: `conv_${convIndex}_turn_${i}`,
            input: formatted,
            output: '',
            metadata: {
              conversationIndex: convIndex,
              turnIndex: i,
              originalTurns: conversation.turns
            }
          })
        }
      }
    })

    return samples
  }

  // Export samples to different file formats
  exportToFile(samples: DataSample[], format: 'jsonl' | 'json' | 'csv', outputPath: string): void {
    const fs = require('fs')

    switch (format) {
      case 'jsonl':
        const jsonlContent = samples.map(s => JSON.stringify({
          text: s.input,
          metadata: s.metadata
        })).join('\n')
        fs.writeFileSync(outputPath, jsonlContent)
        break

      case 'json':
        const jsonContent = JSON.stringify(samples.map(s => ({
          text: s.input,
          metadata: s.metadata
        })), null, 2)
        fs.writeFileSync(outputPath, jsonContent)
        break

      case 'csv':
        const csvHeader = 'text,metadata\n'
        const csvContent = samples.map(s => 
          `"${s.input.replace(/"/g, '""')}","${JSON.stringify(s.metadata).replace(/"/g, '""')}"`
        ).join('\n')
        fs.writeFileSync(outputPath, csvHeader + csvContent)
        break
    }
  }
}