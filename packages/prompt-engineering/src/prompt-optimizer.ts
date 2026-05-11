import { z } from 'zod'

import type {
  PromptTemplate,
  CompiledPrompt,
  OptimizationResult,
  PromptTest,
} from './types'
import type { PromptRegistry } from './prompt-registry'

/**
 * Prompt optimizer for improving template performance
 */
export class PromptOptimizer {
  constructor(private registry: PromptRegistry) {}

  /**
   * Optimize a prompt template based on performance data
   */
  async optimize(template: PromptTemplate): Promise<OptimizationResult> {
    // Get historical performance data
    const beforeMetrics = await this.getTemplateMetrics(template)
    
    // Apply optimization techniques
    const optimizedTemplate = await this.applyOptimizations(template)
    
    // Save the optimized template
    await this.registry.save(optimizedTemplate)
    
    // Simulate after metrics (in real implementation, would run A/B tests)
    const afterMetrics = await this.simulateOptimizedMetrics(optimizedTemplate)
    
    return {
      template: optimizedTemplate,
      beforeMetrics,
      afterMetrics,
      techniques: this.getAppliedTechniques(template, optimizedTemplate),
    }
  }

  /**
   * Create an A/B test for comparing prompt variants
   */
  async createTest(params: {
    name: string
    description?: string
    controlTemplate: PromptTemplate
    variantTemplates: PromptTemplate[]
    trafficSplit?: number[]
    successCriteria?: {
      minImprovement: number
      confidence: number
    }
  }): Promise<PromptTest> {
    const trafficSplit = params.trafficSplit || 
      params.variantTemplates.map(() => 100 / (params.variantTemplates.length + 1))
    
    // Ensure traffic split sums to 100
    const total = trafficSplit.reduce((sum, v) => sum + v, 0)
    const normalizedSplit = trafficSplit.map(v => (v / total) * 100)

    return {
      id: this.generateTestId(),
      name: params.name,
      description: params.description,
      templates: {
        control: params.controlTemplate,
        variants: params.variantTemplates,
      },
      config: {
        trafficSplit: normalizedSplit,
        successCriteria: params.successCriteria || {
          minImprovement: 5,
          confidence: 0.95,
        },
        stopConditions: {
          minSampleSize: 100,
          maxDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
        },
      },
      status: 'draft',
    }
  }

  /**
   * Get performance metrics for a template
   */
  private async getTemplateMetrics(template: PromptTemplate): Promise<{
    avgScore: number
    avgLatency: number
    avgCost: number
    sampleSize: number
  }> {
    // In a real implementation, this would query actual performance data
    return {
      avgScore: template.metadata.avgPerformance || 70,
      avgLatency: 1500,
      avgCost: 0.05,
      sampleSize: template.metadata.usageCount,
    }
  }

  /**
   * Apply optimization techniques to a template
   */
  private async applyOptimizations(template: PromptTemplate): Promise<PromptTemplate> {
    let optimizedContent = template.content
    const techniques: string[] = []

    // Technique 1: Improve clarity and remove ambiguity
    if (this.hasAmbiguousLanguage(optimizedContent)) {
      optimizedContent = this.improveClarity(optimizedContent)
      techniques.push('clarity-improvement')
    }

    // Technique 2: Add structure with clear sections
    if (this.lacksStructure(optimizedContent)) {
      optimizedContent = this.addStructure(optimizedContent)
      techniques.push('structure-enhancement')
    }

    // Technique 3: Optimize placeholder usage
    if (this.hasInefficientPlaceholders(optimizedContent)) {
      optimizedContent = this.optimizePlaceholders(optimizedContent)
      techniques.push('placeholder-optimization')
    }

    // Technique 4: Add examples if missing
    if (this.missingExamples(optimizedContent)) {
      optimizedContent = this.addExamples(optimizedContent)
      techniques.push('example-addition')
    }

    // Technique 5: Reduce redundancy
    if (this.hasRedundancy(optimizedContent)) {
      optimizedContent = this.removeRedundancy(optimizedContent)
      techniques.push('redundancy-removal')
    }

    return {
      ...template,
      id: `${template.id}-optimized`,
      name: `${template.name} (Optimized)`,
      content: optimizedContent,
      version: this.incrementVersion(template.version),
      tags: [...template.tags, 'optimized'],
      metadata: {
        ...template.metadata,
        updatedAt: new Date(),
      },
    }
  }

  /**
   * Check if content has ambiguous language
   */
  private hasAmbiguousLanguage(content: string): boolean {
    const ambiguousWords = ['maybe', 'perhaps', 'might', 'could', 'possibly', 'somewhat']
    return ambiguousWords.some(word => content.toLowerCase().includes(word))
  }

  /**
   * Improve clarity by replacing ambiguous language
   */
  private improveClarity(content: string): string {
    const replacements: Record<string, string> = {
      'maybe': 'should',
      'perhaps': 'should',
      'might': 'should',
      'could': 'should',
      'possibly': 'should',
      'somewhat': 'partially',
    }

    let improved = content
    for (const [ambiguous, clear] of Object.entries(replacements)) {
      const regex = new RegExp(`\\b${ambiguous}\\b`, 'gi')
      improved = improved.replace(regex, clear)
    }

    return improved
  }

  /**
   * Check if content lacks structure
   */
  private lacksStructure(content: string): boolean {
    const hasHeadings = /^#+\s/m.test(content)
    const hasLists = /^\s*[-*+]\s/m.test(content)
    const hasSections = content.includes('\n\n') && content.length > 500
    return !hasHeadings && !hasLists && hasSections
  }

  /**
   * Add structure to content
   */
  private addStructure(content: string): string {
    const paragraphs = content.split('\n\n')
    if (paragraphs.length < 3) return content

    let structured = `# Task\n\n${paragraphs[0]}\n\n`

    if (paragraphs.length > 1) {
      structured += `## Context\n\n${paragraphs[1]}\n\n`
    }

    if (paragraphs.length > 2) {
      structured += `## Instructions\n\n${paragraphs.slice(2).join('\n\n')}\n`
    }

    return structured
  }

  /**
   * Check if placeholders are used inefficiently
   */
  private hasInefficientPlaceholders(content: string): boolean {
    const placeholderRegex = /\{\{([^}]+)\}\}/g
    const placeholders = content.match(placeholderRegex) || []
    
    // Check for redundant placeholders
    const uniquePlaceholders = new Set(placeholders)
    return placeholders.length !== uniquePlaceholders.size
  }

  /**
   * Optimize placeholder usage
   */
  private optimizePlaceholders(content: string): string {
    // Remove duplicate placeholders
    const seen = new Set<string>()
    const placeholderRegex = /\{\{([^}]+)\}\}/g
    
    return content.replace(placeholderRegex, (match, placeholder) => {
      if (seen.has(placeholder)) {
        return '' // Remove duplicate
      }
      seen.add(placeholder)
      return match
    })
  }

  /**
   * Check if examples are missing
   */
  private missingExamples(content: string): boolean {
    const hasExample = /example|for instance|e\.?\.?g\.?/i.test(content)
    const hasCodeBlock = /```/.test(content)
    const isLongContent = content.length > 1000
    return isLongContent && !hasExample && !hasCodeBlock
  }

  /**
   * Add examples to content
   */
  private addExamples(content: string): string {
    const exampleSection = `\n\n## Example\n\nHere's an example of how to approach this:\n\n\`\`\`\n[Your example here]\n\`\`\``
    return content + exampleSection
  }

  /**
   * Check for redundancy
   */
  private hasRedundancy(content: string): boolean {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim())
    const uniqueSentences = new Set(sentences.map(s => s.trim().toLowerCase()))
    return sentences.length > uniqueSentences.length * 1.2
  }

  /**
   * Remove redundant content
   */
  private removeRedundancy(content: string): string {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim())
    const seen = new Set<string>()
    const unique: string[] = []

    for (const sentence of sentences) {
      const normalized = sentence.trim().toLowerCase()
      if (!seen.has(normalized)) {
        seen.add(normalized)
        unique.push(sentence)
      }
    }

    return unique.join('. ') + (content.endsWith('.') ? '' : '.')
  }

  /**
   * Simulate optimized metrics (for demo purposes)
   */
  private async simulateOptimizedMetrics(template: PromptTemplate): Promise<{
    avgScore: number
    avgLatency: number
    avgCost: number
    sampleSize: number
  }> {
    const baseMetrics = await this.getTemplateMetrics(template)
    
    // Simulate improvement
    const improvement = Math.random() * 0.15 + 0.05 // 5-20% improvement
    const newScore = Math.min(100, baseMetrics.avgScore * (1 + improvement))
    const newLatency = baseMetrics.avgLatency * (1 - improvement * 0.3)
    const newCost = baseMetrics.avgCost * (1 + improvement * 0.1)

    return {
      avgScore: Math.round(newScore),
      avgLatency: Math.round(newLatency),
      avgCost: Math.round(newCost * 10000) / 10000,
      sampleSize: 0, // New template has no usage yet
    }
  }

  /**
   * Get list of applied optimization techniques
   */
  private getAppliedTechniques(
    original: PromptTemplate,
    optimized: PromptTemplate
  ): string[] {
    const techniques: string[] = []

    if (original.content !== optimized.content) {
      techniques.push('content-optimization')
    }

    if (original.tags.length < optimized.tags.length) {
      techniques.push('tag-enhancement')
    }

    if (original.version !== optimized.version) {
      techniques.push('version-update')
    }

    return techniques
  }

  /**
   * Generate a test ID
   */
  private generateTestId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Increment version number
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.')
    const patch = parseInt(parts[2] || '0', 10) + 1
    return `${parts[0]}.${parts[1]}.${patch}`
  }
}