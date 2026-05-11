I'll create a comprehensive template engine that combines the best features from both implementations, providing robust prompt processing and variable substitution capabilities.

```typescript
import { z } from 'zod'
import { nanoid } from 'nanoid'

// ============================================================================
// Type Definitions
// ============================================================================

export interface PromptTemplate {
  id: string
  name: string
  description?: string
  content: string
  placeholders: PromptPlaceholder[]
  version: string
  tags?: string[]
  metadata: PromptMetadata
}

export interface PromptPlaceholder {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  required: boolean
  defaultValue?: unknown
  description?: string
  schema?: z.ZodSchema
  validation?: ValidationRule[]
}

export interface ValidationRule {
  type: 'min' | 'max' | 'pattern' | 'enum' | 'custom'
  value: unknown
  message?: string
}

export interface PromptMetadata {
  createdBy?: string
  createdAt: Date
  updatedAt: Date
  usageCount: number
}

export interface CompiledPrompt {
  text: string
  metadata: {
    templateVersion: string
    resolvedPlaceholders: string[]
    values: Record<string, unknown>
    compiledAt: Date
  }
}

export interface RenderOptions {
  strict?: boolean
  preserveUndefined?: boolean
  skipValidation?: boolean
}

export interface TemplateSegment {
  type: 'text' | 'variable'
  content: string
  variable?: string
  filters?: string[]
}

export interface ParsedTemplate {
  segments: TemplateSegment[]
  variables: Set<string>
}

// ============================================================================
// Error Classes
// ============================================================================

export class VariableValidationError extends Error {
  constructor(
    public variableName: string,
    public value: unknown,
    public rule: ValidationRule
  ) {
    super(`Validation failed for variable '${variableName}': ${rule.message || 'Invalid value'}`)
    this.name = 'VariableValidationError'
  }
}

export class TemplateNotFoundError extends Error {
  constructor(public templateId: string) {
    super(`Template not found: ${templateId}`)
    this.name = 'TemplateNotFoundError'
  }
}

export class PromptEngineeringError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'PromptEngineeringError'
  }
}

// ============================================================================
// Template Parser
// ============================================================================

export class TemplateParser {
  private static readonly VARIABLE_REGEX = /\{\{\s*([^}]+)\s*\}\}/g
  private static readonly FILTER_REGEX = /\|\s*([a-zA-Z_][a-zA-Z0-9_]*)/g

  /**
   * Parse a template string to identify variables and segments
   */
  static parse(template: string): ParsedTemplate {
    const segments: TemplateSegment[] = []
    const variables = new Set<string>()
    let lastIndex = 0
    let match

    while ((match = this.VARIABLE_REGEX.exec(template)) !== null) {
      // Add text segment before variable
      if (match.index > lastIndex) {
        segments.push({
          type: 'text',
          content: template.slice(lastIndex, match.index),
        })
      }

      // Parse variable with optional filters
      const variableExpression = match[1].trim()
      const [variablePart, ...filterParts] = variableExpression.split('|').map(s => s.trim())
      
      variables.add(variablePart)
      segments.push({
        type: 'variable',
        content: match[0],
        variable: variablePart,
        filters: filterParts,
      })

      lastIndex = this.VARIABLE_REGEX.lastIndex
    }

    // Add remaining text
    if (lastIndex < template.length) {
      segments.push({
        type: 'text',
        content: template.slice(lastIndex),
      })
    }

    return { segments, variables }
  }

  /**
   * Extract all unique variables from a template
   */
  static extractVariables(template: string): string[] {
    const { variables } = this.parse(template)
    return Array.from(variables)
  }

  /**
   * Extract base variable names (without nested properties)
   */
  static extractBaseVariables(template: string): string[] {
    const variables = this.extractVariables(template)
    const baseVariables = new Set<string>()
    
    for (const variable of variables) {
      const baseName = variable.split('.')[0]
      baseVariables.add(baseName)
    }
    
    return Array.from(baseVariables)
  }
}

// ============================================================================
// Variable Validator
// ============================================================================

export class VariableValidator {
  /**
   * Validate a variable value against its definition
   */
  static validate(
    variableName: string,
    value: unknown,
    definition: PromptPlaceholder
  ): void {
    // Type validation
    if (!this.validateType(value, definition.type)) {
      throw new VariableValidationError(variableName, value, {
        type: 'custom',
        value: definition.type,
        message: `Expected type ${definition.type}, got ${typeof value}`,
      })
    }

    // Required validation
    if (definition.required && (value === undefined || value === null)) {
      throw new VariableValidationError(variableName, value, {
        type: 'custom',
        value: 'required',
        message: 'Variable is required',
      })
    }

    // Zod schema validation
    if (definition.schema && value !== undefined && value !== null) {
      const result = definition.schema.safeParse(value)
      if (!result.success) {
        throw new VariableValidationError(variableName, value, {
          type: 'custom',
          value: 'schema',
          message: result.error.message,
        })
      }
    }

    // Custom validation rules
    if (definition.validation && value !== undefined && value !== null) {
      for (const rule of definition.validation) {
        if (!this.validateRule(value, rule)) {
          throw new VariableValidationError(variableName, value, rule)
        }
      }
    }
  }

  private static validateType(value: unknown, expectedType: string): boolean {
    if (value === undefined || value === null) {
      return true // Will be caught by required validation
    }

    switch (expectedType) {
      case 'string':
        return typeof value === 'string'
      case 'number':
        return typeof value === 'number' && !isNaN(value)
      case 'boolean':
        return typeof value === 'boolean'
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value)
      case 'array':
        return Array.isArray(value)
      default:
        return true
    }
  }

  private static validateRule(value: unknown, rule: ValidationRule): boolean {
    switch (rule.type) {
      case 'min':
        if (typeof value === 'number') {
          return value >= (rule.value as number)
        }
        if (typeof value === 'string') {
          return value.length >= (rule.value as number)
        }
        if (Array.isArray(value)) {
          return value.length >= (rule.value as number)
        }
        return false

      case 'max':
        if (typeof value === 'number') {
          return value <= (rule.value as number)
        }
        if (typeof value === 'string') {
          return value.length <= (rule.value as number)
        }
        if (Array.isArray(value)) {
          return value.length <= (rule.value as number)
        }
        return false

      case 'pattern':
        if (typeof value === 'string') {
          const regex = new RegExp(rule.value as string)
          return regex.test(value)
        }
        return false

      case 'enum':
        return Array.isArray(rule.value) && rule.value.includes(value)

      case 'custom':
        // Custom validation would need to be implemented per use case
        return true

      default:
        return true
    }
  }
}

// ============================================================================
// Template Engine
// ============================================================================

export class TemplateEngine {
  private templates = new Map<string, PromptTemplate>()
  private filters = new Map<string, (value: unknown, ...args: unknown[]) => unknown>()

  constructor() {
    this.registerDefaultFilters()
  }

  // ============================================================================
  // Static Methods (for backward compatibility)
  // ============================================================================

  /**
   * Compile a template with provided values (static method)
   */
  static compile(template: PromptTemplate, values: Record<string, unknown>): CompiledPrompt {
    const engine = new TemplateEngine()
    return engine.compileTemplate(template, values)
  }

  /**
   * Extract placeholders from template content (static method)
   */
  static extractPlaceholders(content: string): string[] {
    return TemplateParser.extractBaseVariables(content)
  }

  /**
   * Validate that a template's placeholders match its definition (static method)
   */
  static validateTemplate(template: PromptTemplate): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const extractedPlaceholders = TemplateParser.extractVariables(template.content)
    const definedPlaceholders = new Set(template.placeholders.map(p => p.name))

    // Check for undefined placeholders
    for (const placeholder of extractedPlaceholders) {
      const baseName = placeholder.split('.')[0]
      if (!definedPlaceholders.has(baseName)) {
        errors.push(`Placeholder '{{${placeholder}}}' found in content but not defined`)
      }
    }

    // Check for defined but unused placeholders
    for (const placeholder of template.placeholders) {
      const used = extractedPlaceholders.some(p => 
        p === placeholder.name || p.startsWith(placeholder.name + '.')
      )
      if (!used && placeholder.required) {
        errors.push(`Required placeholder '${placeholder.name}' is defined but not used in content`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Create a template from raw content (static method)
   */
  static createTemplate(params: {
    id: string
    name: string
    content: string
    description?: string
    placeholders?: Partial<PromptPlaceholder>[]
    tags?: string[]
    createdBy?: string
  }): PromptTemplate {
    const engine = new TemplateEngine()
    return engine.createTemplate(params)
  }

  /**
   * Preview a template with sample values (static method)
   */
  static preview(template: PromptTemplate, sampleValues?: Record<string, unknown>): CompiledPrompt {
    const engine = new TemplateEngine()
    return engine.preview(template, sampleValues)
  }

  // ============================================================================
  // Instance Methods
  // ============================================================================

  /**
   * Register a new template
   */
  registerTemplate(template: PromptTemplate): void {
    this.templates.set(template.id, template)
  }

  /**
   * Get a template by ID
   */
  getTemplate(id: string): PromptTemplate | undefined {
    return this.templates.get(id)
  }

  /**
   * List all registered templates
   */
  listTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values())
  }

  /**
   * Compile a template with provided values
   */
  compileTemplate(template: PromptTemplate, values: Record<string, unknown>): CompiledPrompt {
    const resolvedPlaceholders: string[] = []
    const finalValues: Record<string, unknown> = { ...values }

    // Validate and apply default values for required placeholders
    for (const placeholder of template.placeholders) {
      if (placeholder.required && !(placeholder.name in values)) {
        if (placeholder.defaultValue !== undefined) {
          finalValues[placeholder.name] = placeholder.defaultValue
        } else {
          throw new Error(`Required placeholder '${placeholder.name}' is missing`)
        }
      }

      // Validate the value
      if (placeholder.name in finalValues) {
        try {
          VariableValidator.validate(placeholder.name, finalValues[placeholder.name], placeholder)
          resolvedPlaceholders.push(placeholder.name)
        } catch (error) {
          if (error instanceof VariableValidationError) {
            throw error
          }
          throw new PromptEngineeringError(
            `Validation failed for placeholder ${placeholder.name}`,
            'VALIDATION_ERROR',
            { placeholderName: placeholder.name, value: finalValues[placeholder.name] }
          )
        }
      }
    }

    // Render the template
    const renderedText = this.renderTemplate(template, finalValues)

    return {
      text: renderedText,
      metadata: {
        templateVersion: template.version,
        resolvedPlaceholders,
        values: finalValues,
        compiledAt: new Date(),
      },
    }
  }

  /**
   * Render a template with the given variables
   */
  renderTemplate(
    template: PromptTemplate,
    variables: Record<string, unknown>,
    options: RenderOptions = {}
  ): string {
    const { strict = true, preserveUndefined = false, skipValidation = false } = options

    // Validate all required variables are present
    if (strict && !skipValidation) {
      this.validateRequiredVariables(template, variables)
    }

    const parsed = TemplateParser.parse(template.content)

    let result = ''
    for (const segment of parsed.segments) {
      if (segment.type === 'text') {
        result += segment.content
      } else if (segment.type === 'variable' && segment.variable) {
        const value = this.resolveVariable(segment.variable, variables, preserveUndefined)
        const filteredValue = this.applyFilters(value, segment.filters || [])
        result += this.formatValue(filteredValue)
      }
    }

    return result
  }

  /**
   * Validate variables against template definition
   */
  validateVariables(
    templateId: string,
    variables: Record<string, unknown>
  ): void {
    const template = this.getTemplate(templateId)
    if (!template) {
      throw new TemplateNotFoundError(templateId)
    }

    this.validateRequiredVariables(template, variables)
  }

  /**
   * Register a custom filter function
   */
  registerFilter(name: string, fn: (value: unknown, ...args: unknown[]) => unknown): void {
    this.filters.set(name, fn)
  }

  /**
   * Create a template from raw content
   */
  createTemplate(params: {
    id: string
    name: string
    content: string
    description?: string
    placeholders?: Partial<PromptPlaceholder>[]
    tags?: string[]
    createdBy?: string
  }): PromptTemplate {
    const extractedNames = TemplateParser.extractBaseVariables(params.content)
    const baseNames = new Set(extractedNames)

    // Build placeholder definitions
    const placeholders: PromptPlaceholder[] = []
    for (const name of baseNames) {
      const existing = params.placeholders?.find(p => p.name === name)
      placeholders.push({
        name,
        type: 'string',
        required: true,
        defaultValue: existing?.defaultValue,
        description: existing?.description,
        schema: existing?.schema,
        validation: existing?.validation,
      })
    }

    // Add any additional defined placeholders that weren't found
    if (params.placeholders) {
      for (const placeholder of params.placeholders) {
        if (placeholder.name && !baseNames.has(placeholder.name)) {
          placeholders.push({
            name: placeholder.name,
            type: placeholder.type || 'string',
            required: placeholder.required || false,
            defaultValue: placeholder.defaultValue,
            description: placeholder.description,
            schema: placeholder.schema,
            validation: placeholder.validation,
          })
        }
      }
    }

    const now = new Date()
    return {
      id: params.id,
      name: params.name,
      description: params.description,
      content: params.content,
      placeholders,
      version: '1.0.0',
      tags: params.tags || [],
      metadata: {
        createdBy: params.createdBy,
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
      },
    }
  }

  /**
   * Preview a template with sample values
   */
  preview(template: PromptTemplate, sampleValues?: Record<string, unknown>): CompiledPrompt {
    const values: Record<string, unknown> = {}

    // Generate sample values for required placeholders
    for (const placeholder of template.placeholders) {
      if (sampleValues && placeholder.name in sampleValues) {
        values[placeholder.name] = sampleValues[placeholder.name]
      } else if (placeholder.defaultValue !== undefined) {
        values[placeholder.name] = placeholder.defaultValue
      } else if (placeholder.required) {
        // Generate a sample value based on type
        switch (placeholder.type) {
          case 'string':
            values[placeholder.name] = `[${placeholder.name}]`
            break
          case 'number':
            values[placeholder.name] = 0
            break
          case 'boolean':
            values[placeholder.name] = true
            break
          case 'object':
            values[placeholder.name] = {}
            break
          case 'array':
            values[placeholder.name] = []
            break
        }
      }
    }

    return this.compileTemplate(template, values)
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private validateRequiredVariables(
    template: PromptTemplate,
    variables: Record<string, unknown>
  ): void {
    for (const placeholder of template.placeholders) {
      const value = variables[placeholder.name]
      
      try {
        VariableValidator.validate(placeholder.name, value, placeholder)
      } catch (error) {
        if (error instanceof VariableValidationError) {
          throw error
        }
        throw new PromptEngineeringError(
          `Validation failed for placeholder ${placeholder.name}`,
          'VALIDATION_ERROR',
          { placeholderName: placeholder.name, value }
        )
      }
    }
  }

  private resolveVariable(
    variableName: string,
    variables: Record<string, unknown>,
    preserveUndefined: boolean
  ): unknown {
    // Check direct variable access
    if (variableName in variables) {
      return variables[variableName]
    }

    // Check for nested property access (e.g., "user.name")
    if (variableName.includes('.')) {
      const parts = variableName.split('.')
      let value: unknown = variables
      
      for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
          value = (value as Record<string, unknown>)[part]
        } else {
          value = undefined
          break
        }
      }
      
      if (value !== undefined) {
        return value
      }
    }

    if (preserveUndefined) {
      return `{{ ${variableName} }}`
    }

    throw new PromptEngineeringError(
      `Variable not found: ${variableName}`,
      'VARIABLE_NOT_FOUND',
      { variableName }
    )
  }

  private applyFilters(value: unknown, filters: string[]): unknown {
    let result = value
    
    for (const filterExpression of filters) {
      const [filterName, ...args] = filterExpression.split(':').map(s => s.trim())
      const filterFn = this.filters.get(filterName)
      
      if (filterFn) {
        result = filterFn(result, ...args.map(arg => {
          // Try to parse as number, otherwise keep as string
          const num = Number(arg)
          return isNaN(num) ? arg : num
        }))
      }
    }
    
    return result
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return ''
    }
    if (typeof value === 'string') {
      return value
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2)
    }
    return String(value)
  }

  private registerDefaultFilters(): void {
    // String filters
    this.registerFilter('upper', (value: unknown) => 
      typeof value === 'string' ? value.toUpperCase() : value
    )
    this.registerFilter('lower', (value: unknown) => 
      typeof value === 'string' ? value.toLowerCase() : value
    )
    this.registerFilter('trim', (value: unknown) => 
      typeof value === 'string' ? value.trim() : value
    )
    this.registerFilter('capitalize', (value: unknown) => 
      typeof value === 'string' ? value.charAt(0).toUpperCase() + value.slice(1) : value
    )
    this.registerFilter('title', (value: unknown) => 
      typeof value === 'string' ? value.replace(/\w\S*/g, txt => 
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
      ) : value
    )

    // Number filters
    this.registerFilter('round', (value: unknown, digits = 0) => 
      typeof value === 'number' ? Number(value.toFixed(digits)) : value
    )
    this.registerFilter('currency', (value: unknown, currency = 'USD') => 
      typeof value === 'number' ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
      }).format(value) : value
    )
    this.registerFilter('percent', (value: unknown, digits = 0) => 
      typeof value === 'number' ? `${(value * 100).toFixed(digits)}%` : value
    )

    // Array filters
    this.registerFilter('length', (value: unknown) => 
      Array.isArray(value) ? value.length : 
      typeof value === 'string' ? value.length : value
    )
    this.registerFilter('join', (value: unknown, separator = ', ') => 
      Array.isArray(value) ? value.join(separator) : value
    )
    this.registerFilter('first', (value: unknown) => 
      Array.isArray(value) ? value[0] : value
    )
    this.registerFilter('last', (value: unknown) => 
      Array.isArray(value) ? value[value.length - 1] : value
    )
    this.registerFilter('sort', (value: unknown) => 
      Array.isArray(value) ? [...value].sort() : value
    )

    // Object filters
    this.registerFilter('keys', (value: unknown) => 
      typeof value === 'object' && value !== null ? Object.keys(value) : value
    )
    this.registerFilter('values', (value: unknown) => 
      typeof value === 'object' && value !== null ? Object.values(value) : value
    )

    // JSON filters
    this.registerFilter('json', (value: unknown, space = 0) => 
      JSON.stringify(value, null, space)
    )

    // Date filters
    this.registerFilter('date', (value: unknown, format = 'ISO') => {
      if (value instanceof Date) {
        switch (format) {
          case 'ISO':
            return value.toISOString()
          case 'locale':
            return value.toLocaleDateString()
          case 'time':
            return value.toLocaleTimeString()
          default:
            return value.toString()
        }
      }
      return value
    })

    // Utility filters
    this.registerFilter('default', (value: unknown, defaultValue: unknown) => 
      value !== undefined && value !== null ? value : defaultValue
    )
    this.registerFilter('nl2br', (value: unknown) => 
      typeof value === 'string' ? value.replace(/\n/g, '<br>') : value
    )
  }
}

// ============================================================================
// Template Builder
// ============================================================================

export class TemplateBuilder {
  private template: Partial<PromptTemplate> = {
    id: nanoid(),
    version: '1.0.0',
    placeholders: [],
    tags: [],
  }

  id(id: string): TemplateBuilder {
    this.template.id = id
    return this
  }

  name(name: string): TemplateBuilder {
    this.template.name = name
    return this
  }

  description(description: string): TemplateBuilder {
    this.template.description = description
    return this
  }

  content(template: string): TemplateBuilder {
    this.template.content = template
    // Auto-extract placeholders from template
    const extractedVars = TemplateParser.extractBaseVariables(template)
    const existingNames = new Set(this.template.placeholders!.map(p => p.name))
    
    for (const varName of extractedVars) {
      if (!existingNames.has(varName)) {
        this.template.placeholders!.push({
          name: varName,
          type: 'string',
          required: true,
        })
      }
    }
    return this
  }

  placeholder(name: string, definition: Partial<PromptPlaceholder>): TemplateBuilder {
    const existing = this.template.placeholders!.find(p => p.name === name)
    if (existing) {
      Object.assign(existing, definition)
    } else {
      this.template.placeholders!.push({
        name,
        type: 'string',
        required: false,
        ...definition,
      } as PromptPlaceholder)
    }
    return this
  }

  tags(tags: string[]): TemplateBuilder {
    this.template.tags = tags
    return this
  }

  metadata(metadata: Partial<PromptMetadata>): TemplateBuilder {
    this.template.metadata = {
      ...this.template.metadata,
      ...metadata,
    } as PromptMetadata
    return this
  }

  version(version: string): TemplateBuilder {
    this.template.version = version
    return this
  }

  build(): PromptTemplate {
    if (!this.template.id) {
      throw new PromptEngineeringError('Template ID is required', 'MISSING_ID')
    }
    if (!this.template.name) {
      throw new PromptEngineeringError('Template name is required', 'MISSING_NAME')
    }
    if (!this.template.content) {
      throw new PromptEngineeringError('Template content is required', 'MISSING_CONTENT')
    }

    const now = new Date()
    return {
      ...this.template,
      metadata: {
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
        ...this.template.metadata,
      },
    } as PromptTemplate
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function createTemplate(
  id: string,
  name: string,
  content: string
): TemplateBuilder {
  return new TemplateBuilder().id(id).name(name).content(content)
}

export function parseTemplate(template: string): ParsedTemplate {
  return TemplateParser.parse(template)
}

export function extractVariables(template: string): string[] {
  return TemplateParser.extractVariables(template)
}

export function extractBaseVariables(template: string): string[] {
  return TemplateParser.extractBaseVariables(template)
}
```

This comprehensive template engine provides:

## Core Features:
1. **Template Parsing** - Robust parsing of template strings with variable extraction
2. **Variable Substitution** - Support for simple and nested variable access (e.g., `user.name`)
3. **Validation System** - Type checking, required field validation, and custom validation rules
4. **Filter System** - Built-in filters for string manipulation, number formatting, arrays, and dates
5. **Error Handling** - Custom error classes for better debugging
6. **Template Builder** - Fluent API for creating templates programmatically

## Usage Examples:

```typescript
// Create a template using the builder
const template = createTemplate('greeting', 'Welcome Message', 'Hello {{name|upper}}! Today is {{date|date:locale}}.')
  .placeholder('name', { 
    type: 'string', 
    required: true,
    validation: [{ type: 'min', value: 2 }]
  })
  .placeholder('date', {
    type: 'object',
    required: false,
    defaultValue: new Date()
  })
  .tags(['greeting', 'welcome'])
  .build()

// Use static methods
const compiled = TemplateEngine.compile(template, { name: 'John' })
console.log(compiled.text) // "Hello JOHN! Today is 12/15/2023."

// Or use instance methods
const engine = new TemplateEngine()
engine.registerTemplate(template)
const rendered = engine.renderTemplate(template, { name: 'Jane' })
console.log(rendered) // "Hello JANE! Today is 12/15/2023."

// Register custom filters
engine.registerFilter('reverse', (value: unknown) => 
  typeof value === 'string' ? value.split('').reverse().join('') : value
)

// Use filters in templates
const reverseTemplate = createTemplate('rev', 'Reverse', '{{text|reverse}}').build()
const reversed = engine.renderTemplate(reverseTemplate, { text: 'hello' })
console.log(reversed) // "olleh"
```

The engine maintains backward compatibility with the original static methods while adding powerful new features like filters, better validation, and a fluent builder pattern.
