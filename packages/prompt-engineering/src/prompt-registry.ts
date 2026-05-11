import { promises as fs } from 'fs'
import path from 'path'

import type {
  PromptTemplate,
  PromptRegistry,
} from './types'

/**
 * In-memory implementation of PromptRegistry with file persistence
 */
export class InMemoryPromptRegistry implements PromptRegistry {
  private templates = new Map<string, PromptTemplate>()
  private storagePath: string

  constructor(storagePath?: string) {
    this.storagePath = storagePath || path.join(process.cwd(), '.levelcode', 'prompt-registry.json')
  }

  /**
   * Initialize the registry by loading from storage
   */
  async initialize(): Promise<void> {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8')
      const templates = JSON.parse(data) as PromptTemplate[]
      
      this.templates.clear()
      for (const template of templates) {
        this.templates.set(template.id, template)
      }
    } catch (error) {
      // File doesn't exist or is invalid, start with empty registry
      console.debug('Prompt registry not found, starting with empty registry')
    }
  }

  /**
   * Save the registry to storage
   */
  private async saveToStorage(): Promise<void> {
    try {
      const dir = path.dirname(this.storagePath)
      await fs.mkdir(dir, { recursive: true })
      
      const templates = Array.from(this.templates.values())
      await fs.writeFile(this.storagePath, JSON.stringify(templates, null, 2))
    } catch (error) {
      console.error('Failed to save prompt registry:', error)
      throw new Error('Failed to save prompt registry')
    }
  }

  /**
   * Get a template by ID
   */
  async get(id: string): Promise<PromptTemplate | null> {
    return this.templates.get(id) || null
  }

  /**
   * Save a template
   */
  async save(template: PromptTemplate): Promise<void> {
    const existing = this.templates.get(template.id)
    
    if (existing) {
      // Update existing template
      this.templates.set(template.id, {
        ...template,
        version: this.incrementVersion(existing.version),
        metadata: {
          ...template.metadata,
          updatedAt: new Date(),
          usageCount: existing.metadata.usageCount,
        },
      })
    } else {
      // Create new template
      this.templates.set(template.id, {
        ...template,
        metadata: {
          ...template.metadata,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
    }

    await this.saveToStorage()
  }

  /**
   * List templates with optional filters
   */
  async list(filters?: {
    tags?: string[]
    createdBy?: string
    limit?: number
    offset?: number
  }): Promise<PromptTemplate[]> {
    let templates = Array.from(this.templates.values())

    // Apply filters
    if (filters) {
      if (filters.tags && filters.tags.length > 0) {
        templates = templates.filter(template =>
          filters.tags!.some(tag => template.tags.includes(tag))
        )
      }

      if (filters.createdBy) {
        templates = templates.filter(template =>
          template.metadata.createdBy === filters.createdBy
        )
      }

      // Sort by updated date (most recent first)
      templates.sort((a, b) => 
        b.metadata.updatedAt.getTime() - a.metadata.updatedAt.getTime()
      )

      // Apply pagination
      if (filters.offset) {
        templates = templates.slice(filters.offset)
      }
      if (filters.limit) {
        templates = templates.slice(0, filters.limit)
      }
    }

    return templates
  }

  /**
   * Delete a template
   */
  async delete(id: string): Promise<void> {
    if (!this.templates.has(id)) {
      throw new Error(`Template with ID '${id}' not found`)
    }

    this.templates.delete(id)
    await this.saveToStorage()
  }

  /**
   * Search templates by content
   */
  async search(query: string): Promise<PromptTemplate[]> {
    const lowerQuery = query.toLowerCase()
    const results: Array<{ template: PromptTemplate; score: number }> = []

    for (const template of this.templates.values()) {
      let score = 0

      // Search in name
      if (template.name.toLowerCase().includes(lowerQuery)) {
        score += 10
      }

      // Search in description
      if (template.description?.toLowerCase().includes(lowerQuery)) {
        score += 5
      }

      // Search in content
      if (template.content.toLowerCase().includes(lowerQuery)) {
        score += 3
      }

      // Search in tags
      for (const tag of template.tags) {
        if (tag.toLowerCase().includes(lowerQuery)) {
          score += 2
        }
      }

      if (score > 0) {
        results.push({ template, score })
      }
    }

    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score)

    return results.map(r => r.template)
  }

  /**
   * Increment usage count for a template
   */
  async incrementUsage(id: string): Promise<void> {
    const template = this.templates.get(id)
    if (template) {
      template.metadata.usageCount++
      await this.saveToStorage()
    }
  }

  /**
   * Update performance metrics for a template
   */
  async updatePerformance(id: string, score: number): Promise<void> {
    const template = this.templates.get(id)
    if (template) {
      const currentAvg = template.metadata.avgPerformance || 0
      const count = template.metadata.usageCount
      
      // Calculate new average
      const newAvg = (currentAvg * (count - 1) + score) / count
      template.metadata.avgPerformance = newAvg
      
      await this.saveToStorage()
    }
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
   * Get statistics about the registry
   */
  async getStats(): Promise<{
    totalTemplates: number
    totalUsage: number
    avgPerformance: number
    tagCounts: Record<string, number>
  }> {
    const templates = Array.from(this.templates.values())
    const totalUsage = templates.reduce((sum, t) => sum + t.metadata.usageCount, 0)
    const performances = templates
      .map(t => t.metadata.avgPerformance)
      .filter(p => p !== undefined) as number[]
    const avgPerformance = performances.length > 0
      ? performances.reduce((sum, p) => sum + p, 0) / performances.length
      : 0

    const tagCounts: Record<string, number> = {}
    for (const template of templates) {
      for (const tag of template.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1
      }
    }

    return {
      totalTemplates: templates.length,
      totalUsage,
      avgPerformance,
      tagCounts,
    }
  }
}