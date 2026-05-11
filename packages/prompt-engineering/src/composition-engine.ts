import { nanoid } from 'nanoid' 
import {
  PromptComposition,
  CompositionPart,
  DynamicContent,
  CacheConfig,
  ExecutionContext,
  PromptTemplate,
  PromptEngineeringError,
} from './types'
import { TemplateEngine } from './template-engine'

// ============================================================================
// Composition Context
// ============================================================================

export interface CompositionContext extends ExecutionContext {
  templates: Map<string, PromptTemplate>
  functions: Map<string, CompositionFunction>
  cache: Map<string, CachedComposition>
}

export interface CompositionFunction {
  id: string
  execute: (context: CompositionContext, args: unknown[]) => Promise<unknown>
  cache?: CacheConfig
}

export interface CachedComposition {
  value: unknown
  timestamp: Date
  ttl: number
}

// ============================================================================
// Dynamic Content Resolvers
// ============================================================================

export interface ContentResolver {
  type: string
  resolve: (content: DynamicContent, context: CompositionContext) => Promise<unknown>
}

export class ContentResolverRegistry {
  private resolvers = new Map<string, ContentResolver>()

  constructor() {
    this.registerDefaultResolvers()
  }

  register(resolver: ContentResolver): void {
    this.resolvers.set(resolver.type, resolver)
  }

  async resolve(content: DynamicContent, context: CompositionContext): Promise<unknown> {
    const resolver = this.resolvers.get(content.source)
    if (!resolver) {
      throw new PromptEngineeringError(
        `No resolver found for content source: ${content.source}`,
        'NO_RESOLVER'
      )
    }
    return resolver.resolve(content, context)
  }

  private registerDefaultResolvers(): void {
    // Function resolver
    this.register({
      type: 'function',
      resolve: async (content, context) => {
        const functionId = content.config.functionId as string
        const func = context.functions.get(functionId)
        if (!func) {
          throw new PromptEngineeringError(
            `Function not found: ${functionId}`,
            'FUNCTION_NOT_FOUND'
          )
        }
        const args = content.config.args as unknown[] || []
        return func.execute(context, args)
      },
    })

    // API resolver
    this.register({
      type: 'api',
      resolve: async (content, context) => {
        const url = content.config.url as string
        const method = content.config.method as string || 'GET'
        const headers = content.config.headers as Record<string, string> || {}
        const body = content.config.body

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
        })

        if (!response.ok) {
          throw new PromptEngineeringError(
            `API request failed: ${response.status} ${response.statusText}`,
            'API_ERROR'
          )
        }

        return response.json()
      },
    })

    // Database resolver (placeholder)
    this.register({
      type: 'database',
      resolve: async (content, context) => {
        const query = content.config.query as string
        // This would integrate with your database layer
        throw new PromptEngineeringError(
          'Database resolver not implemented',
          'NOT_IMPLEMENTED'
        )
      },
    })

    // File resolver
    this.register({
      type: 'file',
      resolve: async (content, context) => {
        const filePath = content.config.path as string
        const fs = await import('fs/promises')
        try {
          const fileContent = await fs.readFile(filePath, 'utf-8')
          
          // Parse based on file extension
          const ext = filePath.split('.').pop()?.toLowerCase()
          switch (ext) {
            case 'json':
              return JSON.parse(fileContent)
            case 'md':
            case 'txt':
              return fileContent
            default:
              return fileContent
          }
        } catch (error) {
          throw new PromptEngineeringError(
            `Failed to read file: ${filePath}`,
            'FILE_READ_ERROR'
          )
        }
      },
    })
  }
}

// ============================================================================
// Composition Engine
// ============================================================================

export interface CompositionOptions {
  enableCache?: boolean
  defaultTTL?: number
  resolvers?: ContentResolver[]
  onPartStart?: (part: CompositionPart, context: CompositionContext) => void
  onPartComplete?: (part: CompositionPart, result: unknown, context: CompositionContext) => void
}

export class CompositionEngine {
  private templateEngine: TemplateEngine
  private resolverRegistry: ContentResolverRegistry
  private options: CompositionOptions

  constructor(
    templateEngine: TemplateEngine,
    options: CompositionOptions = {}
  ) {
    this.templateEngine = templateEngine
    this.options = {
      enableCache: true,
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      ...options,
    }
    this.resolverRegistry = new ContentResolverRegistry()
    
    // Register custom resolvers
    if (options.resolvers) {
      for (const resolver of options.resolvers) {
        this.resolverRegistry.register(resolver)
      }
    }
  }

  /**
   * Compose a prompt from its parts
   */
  async compose(
    composition: PromptComposition,
    variables: Record<string, unknown> = {}
  ): Promise<string> {
    const context: CompositionContext = {
      variables,
      history: [],
      templates: new Map(),
      functions: new Map(),
      cache: new Map(),
      metadata: {
        executionId: nanoid(),
        startTime: new Date(),
      },
    }

    // Load templates referenced in composition
    await this.loadCompositionTemplates(composition, context)

    // Sort parts by order
    const sortedParts = composition.parts.sort((a, b) => a.order - b.order)

    const results: string[] = []
    for (const part of sortedParts) {
      const result = await this.composePart(part, context)
      if (result !== null && result !== undefined) {
        results.push(String(result))
      }
    }

    return results.join('\n').trim()
  }

  /**
   * Compose a single part
   */
  private async composePart(
    part: CompositionPart,
    context: CompositionContext
  ): Promise<unknown> {
    this.options.onPartStart?.(part, context)

    // Check condition
    if (part.condition && !this.evaluateCondition(part.condition, context)) {
      return null
    }

    let result: unknown

    try {
      switch (part.type) {
        case 'text':
          result = part.content as string
          break
        case 'template':
          result = await this.composeTemplatePart(part, context)
          break
        case 'variable':
          result = this.resolveVariable(part.content as string, context)
          break
        case 'conditional':
          result = await this.composeConditionalPart(part, context)
          break
        case 'dynamic':
          result = await this.composeDynamicPart(part, context)
          break
        default:
          throw new PromptEngineeringError(
            `Unknown part type: ${part.type}`,
            'UNKNOWN_PART_TYPE'
          )
      }

      this.options.onPartComplete?.(part, result, context)
      return result
    } catch (error) {
      throw new PromptEngineeringError(
        `Failed to compose part ${part.id}: ${error}`,
        'COMPOSITION_ERROR'
      )
    }
  }

  /**
   * Compose a template part
   */
  private async composeTemplatePart(
    part: CompositionPart,
    context: CompositionContext
  ): Promise<string> {
    const templateId = part.content as string
    const template = context.templates.get(templateId)
    
    if (!template) {
      throw new PromptEngineeringError(
        `Template not found: ${templateId}`,
        'TEMPLATE_NOT_FOUND'
      )
    }

    return this.templateEngine.renderTemplate(template, context.variables)
  }

  /**
   * Compose a conditional part
   */
  private async composeConditionalPart(
    part: CompositionPart,
    context: CompositionContext
  ): Promise<unknown> {
    const config = part.content as {
      condition: string
      truePart: CompositionPart
      falsePart?: CompositionPart
    }

    if (this.evaluateCondition(config.condition, context)) {
      return await this.composePart(config.truePart, context)
    } else if (config.falsePart) {
      return await this.composePart(config.falsePart, context)
    }

    return null
  }

  /**
   * Compose a dynamic part
   */
  private async composeDynamicPart(
    part: CompositionPart,
    context: CompositionContext
  ): Promise<unknown> {
    const content = part.content as DynamicContent
    
    // Check cache
    if (this.options.enableCache && content.cache) {
      const cacheKey = this.generateCacheKey(content, context)
      const cached = context.cache.get(cacheKey)
      
      if (cached && cached.timestamp.getTime() + cached.ttl > Date.now()) {
        return cached.value
      }
    }

    // Resolve content
    const result = await this.resolverRegistry.resolve(content, context)

    // Cache result
    if (this.options.enableCache && content.cache) {
      const cacheKey = this.generateCacheKey(content, context)
      const ttl = content.cache.ttl || this.options.defaultTTL!
      context.cache.set(cacheKey, {
        value: result,
        timestamp: new Date(),
        ttl,
      })
    }

    return result
  }

  /**
   * Load templates referenced in composition
   */
  private async loadCompositionTemplates(
    composition: PromptComposition,
    context: CompositionContext
  ): Promise<void> {
    for (const part of composition.parts) {
      if (part.type === 'template') {
        const templateId = part.content as string
        const template = this.templateEngine.getTemplate(templateId)
        
        if (!template) {
          throw new PromptEngineeringError(
            `Template not found: ${templateId}`,
            'TEMPLATE_NOT_FOUND'
          )
        }
        
        context.templates.set(templateId, template)
      } else if (part.type === 'conditional') {
        const config = part.content as any
        // Recursively load templates in conditional parts
        const conditionalComposition = {
          parts: [config.truePart, config.falsePart].filter(Boolean),
        } as PromptComposition
        await this.loadCompositionTemplates(conditionalComposition, context)
      }
    }
  }

  /**
   * Resolve a variable from context
   */
  private resolveVariable(path: string, context: CompositionContext): unknown {
    // Check direct variable access
    if (path in context.variables) {
      return context.variables[path]
    }

    // Check nested property access
    if (path.includes('.')) {
      const parts = path.split('.')
      let value: unknown = context.variables
      
      for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
          value = (value as Record<string, unknown>)[part]
        } else {
          return undefined
        }
      }
      
      return value
    }

    return undefined
  }

  /**
   * Evaluate a condition expression
   */
  private evaluateCondition(condition: string, context: CompositionContext): boolean {
    try {
      const variables = context.variables
      
      // Replace variable references
      let evalExpression = condition.replace(/\b(\w+)\b/g, (match) => {
        if (match in variables) {
          return JSON.stringify(variables[match])
        }
        return match
      })

      // Safe evaluation
      return Function('"use strict"; return (' + evalExpression + ')')()
    } catch (error) {
      throw new PromptEngineeringError(
        `Failed to evaluate condition: ${condition}`,
        'CONDITION_ERROR'
      )
    }
  }

  /**
   * Generate cache key for dynamic content
   */
  private generateCacheKey(content: DynamicContent, context: CompositionContext): string {
    const keyParts = [
      content.source,
      JSON.stringify(content.config),
      JSON.stringify(context.variables),
    ]
    return Buffer.from(keyParts.join('|')).toString('base64')
  }

  /**
   * Register a custom function
   */
  registerFunction(func: CompositionFunction): void {
    context.functions.set(func.id, func)
  }
}

// ============================================================================
// Composition Builder
// ============================================================================

export class CompositionBuilder {
  private composition: Partial<PromptComposition> = {
    id: nanoid(),
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date(),
    parts: [],
    variables: {},
  }

  id(id: string): CompositionBuilder {
    this.composition.id = id
    return this
  }

  name(name: string): CompositionBuilder {
    this.composition.name = name
    return this
  }

  description(description: string): CompositionBuilder {
    this.composition.description = description
    return this
  }

  addPart(part: CompositionPart): CompositionBuilder {
    this.composition.parts!.push(part)
    return this
  }

  text(id: string, content: string, order: number): CompositionBuilder {
    this.composition.parts!.push({
      id,
      type: 'text',
      content,
      order,
    })
    return this
  }

  template(id: string, templateId: string, order: number, condition?: string): CompositionBuilder {
    this.composition.parts!.push({
      id,
      type: 'template',
      content: templateId,
      order,
      condition,
    })
    return this
  }

  variable(id: string, variableName: string, order: number, condition?: string): CompositionBuilder {
    this.composition.parts!.push({
      id,
      type: 'variable',
      content: variableName,
      order,
      condition,
    })
    return this
  }

  dynamic(
    id: string,
    source: DynamicContent['source'],
    config: Record<string, unknown>,
    order: number,
    cache?: CacheConfig,
    condition?: string
  ): CompositionBuilder {
    this.composition.parts!.push({
      id,
      type: 'dynamic',
      content: { source, config, cache },
      order,
      condition,
    })
    return this
  }

  conditional(
    id: string,
    condition: string,
    truePart: CompositionPart,
    falsePart?: CompositionPart,
    order: number
  ): CompositionBuilder {
    this.composition.parts!.push({
      id,
      type: 'conditional',
      content: { condition, truePart, falsePart },
      order,
    })
    return this
  }

  variables(vars: Record<string, any>): CompositionBuilder {
    this.composition.variables = { ...this.composition.variables, ...vars }
    return this
  }

  build(): PromptComposition {
    if (!this.composition.id) {
      throw new PromptEngineeringError('Composition ID is required', 'MISSING_ID')
    }
    if (!this.composition.name) {
      throw new PromptEngineeringError('Composition name is required', 'MISSING_NAME')
    }
    if (!this.composition.parts || this.composition.parts.length === 0) {
      throw new PromptEngineeringError('Composition must have at least one part', 'MISSING_PARTS')
    }

    return this.composition as PromptComposition
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function createComposition(id: string, name: string): CompositionBuilder {
  return new CompositionBuilder().id(id).name(name)
}

export function createTextPart(
  id: string,
  content: string,
  order: number,
  condition?: string
): CompositionPart {
  return {
    id,
    type: 'text',
    content,
    order,
    condition,
  }
}

export function createTemplatePart(
  id: string,
  templateId: string,
  order: number,
  condition?: string
): CompositionPart {
  return {
    id,
    type: 'template',
    content: templateId,
    order,
    condition,
  }
}

export function createVariablePart(
  id: string,
  variableName: string,
  order: number,
  condition?: string
): CompositionPart {
  return {
    id,
    type: 'variable',
    content: variableName,
    order,
    condition,
  }
}

export function createDynamicPart(
  id: string,
  source: DynamicContent['source'],
  config: Record<string, unknown>,
  order: number,
  cache?: CacheConfig,
  condition?: string
): CompositionPart {
  return {
    id,
    type: 'dynamic',
    content: { source, config, cache },
    order,
    condition,
  }
}

export function createConditionalPart(
  id: string,
  condition: string,
  truePart: CompositionPart,
  falsePart?: CompositionPart,
  order: number
): CompositionPart {
  return {
    id,
    type: 'conditional',
    content: { condition, truePart, falsePart },
    order,
  }
}