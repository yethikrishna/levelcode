import type { ToolName } from '@levelcode/common/tools/constants'

/**
 * Task classification categories used to select role templates.
 */
export type TaskCategory =
  | 'frontend'
  | 'backend'
  | 'devops'
  | 'testing'
  | 'database'
  | 'security'
  | 'design'
  | 'documentation'
  | 'data-science'
  | 'mobile'
  | 'general'

/**
 * Autonomy level controlling how much independent decision-making
 * the synthesized agent is permitted.
 */
export type AutonomyLevel = 'low' | 'medium' | 'high' | 'full'

/**
 * Context provided when synthesizing a role for a task.
 */
export interface RoleContext {
  /** Team name or project context */
  teamName?: string
  /** Active development phase */
  phase?: string
  /** Preferred model for the synthesized agent */
  model?: string
  /** Specific tools that must be available */
  requiredTools?: string[]
  /** Specific tools that should be blocked */
  blockedTools?: string[]
  /** Additional system prompt instructions */
  extraInstructions?: string
  /** Hint for autonomy level */
  autonomyHint?: AutonomyLevel
}

/**
 * A synthesized role produced by the RoleSynthesizer.
 * Conforms to the shape expected by the agent spawn system.
 */
export interface SynthesizedRole {
  /** Unique role identifier (e.g., "frontend-react-specialist") */
  id: string
  /** Human-readable display name */
  displayName: string
  /** System prompt for the agent */
  systemPrompt: string
  /** Tools the agent is allowed to use */
  allowedTools: (ToolName | string)[]
  /** Autonomy level */
  autonomyLevel: AutonomyLevel
  /** Classified task category */
  category: TaskCategory
  /** Spawnable sub-agents */
  spawnableAgents: string[]
  /** Output mode */
  outputMode: 'last_message' | 'stream'
  /** Instructions prompt */
  instructionsPrompt: string
  /** Confidence score 0-1 for the classification */
  classificationConfidence: number
}

/**
 * Result of validating a synthesized role.
 */
export interface ValidationResult {
  /** Whether the role is valid */
  valid: boolean
  /** List of validation errors if invalid */
  errors: string[]
  /** List of warnings that do not block usage */
  warnings: string[]
}

/**
 * Keywords used to classify task descriptions into categories.
 */
const CATEGORY_KEYWORDS: Record<TaskCategory, string[]> = {
  frontend: [
    'react', 'vue', 'angular', 'svelte', 'css', 'html', 'ui', 'ux',
    'component', 'frontend', 'client-side', 'browser', 'dom', 'tailwind',
    'stylesheet', 'responsive', 'animation', 'webpage', 'nextjs', 'next.js',
    'vite', 'webpack', 'storybook', 'accessibility', 'a11y', 'design system',
  ],
  backend: [
    'api', 'server', 'endpoint', 'rest', 'graphql', 'grpc', 'microservice',
    'backend', 'server-side', 'node', 'express', 'fastify', 'django', 'flask',
    'spring', 'laravel', 'rails', 'middleware', 'authentication', 'authorization',
    'session', 'jwt', 'oauth', 'webhook', 'rate limit', 'caching',
  ],
  devops: [
    'docker', 'kubernetes', 'k8s', 'ci', 'cd', 'pipeline', 'deploy',
    'terraform', 'ansible', 'aws', 'azure', 'gcp', 'cloud', 'infrastructure',
    'nginx', 'caddy', 'reverse proxy', 'load balancer', 'monitoring', 'logging',
    'devops', 'container', 'helm', 'github actions', 'jenkins', 'build',
  ],
  testing: [
    'test', 'testing', 'spec', 'unittest', 'integration test', 'e2e',
    'jest', 'vitest', 'cypress', 'playwright', 'pytest', 'mock', 'stub',
    'fixture', 'coverage', 'assertion', 'tdd', 'bdd', 'regression',
  ],
  database: [
    'database', 'sql', 'postgres', 'mysql', 'sqlite', 'mongodb', 'redis',
    'migration', 'schema', 'query', 'index', 'orm', 'prisma', 'drizzle',
    'typeorm', 'sequelize', 'nosql', 'transaction', 'connection pool',
  ],
  security: [
    'security', 'vulnerability', 'auth', 'permission', 'xss', 'csrf',
    'injection', 'sanitize', 'encrypt', 'decrypt', 'hash', 'audit',
    'penetration', 'owasp', 'secret', 'credential', 'cve', 'patch',
  ],
  design: [
    'design', 'figma', 'wireframe', 'prototype', 'mockup', 'typography',
    'color', 'layout', 'brand', 'logo', 'icon', 'illustration',
  ],
  documentation: [
    'docs', 'documentation', 'readme', 'comment', 'changelog', 'wiki',
    'guide', 'tutorial', 'api doc', 'javadoc', 'jsdoc', 'tsdoc',
  ],
  'data-science': [
    'ml', 'machine learning', 'ai model', 'pandas', 'numpy', 'tensorflow',
    'pytorch', 'data pipeline', 'etl', 'analytics', 'visualization', 'jupyter',
    'notebook', 'inference', 'training', 'dataset', 'feature engineering',
  ],
  mobile: [
    'react native', 'flutter', 'swift', 'kotlin', 'ios', 'android',
    'mobile app', 'app store', 'play store', 'responsive mobile', 'push notification',
  ],
  general: [],
}

/**
 * Tool sets per category.
 */
const CATEGORY_TOOLS: Record<TaskCategory, (ToolName | string)[]> = {
  frontend: [
    'read_files', 'read_subtree', 'write_file', 'str_replace',
    'propose_str_replace', 'propose_write_file', 'run_terminal_command',
    'code_search', 'find_files', 'glob', 'list_directory',
    'web_search', 'verify_changes', 'run_file_change_hooks',
    'write_todos', 'think_deeply', 'skill', 'set_output',
  ],
  backend: [
    'read_files', 'read_subtree', 'write_file', 'str_replace',
    'propose_str_replace', 'propose_write_file', 'run_terminal_command',
    'code_search', 'find_files', 'glob', 'list_directory',
    'web_search', 'verify_changes', 'run_file_change_hooks',
    'write_todos', 'think_deeply', 'skill', 'set_output',
  ],
  devops: [
    'read_files', 'read_subtree', 'write_file', 'str_replace',
    'propose_str_replace', 'propose_write_file', 'run_terminal_command',
    'code_search', 'find_files', 'glob', 'list_directory',
    'web_search', 'verify_changes', 'run_file_change_hooks',
    'write_todos', 'think_deeply', 'skill', 'set_output',
  ],
  testing: [
    'read_files', 'read_subtree', 'write_file', 'str_replace',
    'propose_str_replace', 'propose_write_file', 'run_terminal_command',
    'code_search', 'find_files', 'glob', 'list_directory',
    'web_search', 'verify_changes', 'run_file_change_hooks',
    'write_todos', 'think_deeply', 'skill', 'set_output',
  ],
  database: [
    'read_files', 'read_subtree', 'write_file', 'str_replace',
    'propose_str_replace', 'propose_write_file', 'run_terminal_command',
    'code_search', 'find_files', 'glob', 'list_directory',
    'web_search', 'verify_changes', 'run_file_change_hooks',
    'write_todos', 'think_deeply', 'skill', 'set_output',
  ],
  security: [
    'read_files', 'read_subtree', 'write_file', 'str_replace',
    'propose_str_replace', 'propose_write_file', 'run_terminal_command',
    'code_search', 'find_files', 'glob', 'list_directory',
    'web_search', 'verify_changes', 'run_file_change_hooks',
    'write_todos', 'think_deeply', 'skill', 'set_output',
  ],
  design: [
    'read_files', 'read_subtree', 'write_file', 'str_replace',
    'propose_str_replace', 'propose_write_file',
    'code_search', 'find_files', 'glob', 'list_directory',
    'web_search', 'read_docs', 'write_todos', 'think_deeply', 'skill', 'set_output',
  ],
  documentation: [
    'read_files', 'read_subtree', 'write_file', 'str_replace',
    'propose_str_replace', 'propose_write_file',
    'code_search', 'find_files', 'glob', 'list_directory',
    'web_search', 'read_docs', 'write_todos', 'think_deeply', 'skill', 'set_output',
  ],
  'data-science': [
    'read_files', 'read_subtree', 'write_file', 'str_replace',
    'propose_str_replace', 'propose_write_file', 'run_terminal_command',
    'code_search', 'find_files', 'glob', 'list_directory',
    'web_search', 'verify_changes', 'run_file_change_hooks',
    'write_todos', 'think_deeply', 'skill', 'set_output',
  ],
  mobile: [
    'read_files', 'read_subtree', 'write_file', 'str_replace',
    'propose_str_replace', 'propose_write_file', 'run_terminal_command',
    'code_search', 'find_files', 'glob', 'list_directory',
    'web_search', 'verify_changes', 'run_file_change_hooks',
    'write_todos', 'think_deeply', 'skill', 'set_output',
  ],
  general: [
    'read_files', 'read_subtree', 'write_file', 'str_replace',
    'propose_str_replace', 'propose_write_file', 'run_terminal_command',
    'code_search', 'find_files', 'glob', 'list_directory', 'read_docs',
    'web_search', 'verify_changes', 'run_file_change_hooks',
    'write_todos', 'think_deeply', 'skill', 'set_output', 'end_turn',
    'suggest_followups', 'remember',
  ],
}

/**
 * Base system prompt templates per category.
 */
const CATEGORY_PROMPTS: Record<TaskCategory, string> = {
  frontend: `You are a Frontend Specialist agent with deep expertise in modern web UI development.
You excel at building React/Vue/Angular components, styling with CSS/Tailwind, ensuring responsive
layouts, accessibility (a11y), and smooth UX interactions.

Key principles:
- Follow the existing design system and component patterns in the codebase.
- Prioritize accessibility: semantic HTML, ARIA attributes, keyboard navigation.
- Ensure responsive behavior across viewport sizes.
- Reuse existing components and utilities rather than building from scratch.
- Match the project's CSS/styling conventions precisely.
- Test your understanding by reading adjacent components before writing new ones.`,

  backend: `You are a Backend Specialist agent focused on server-side development, APIs, and service architecture.
You build robust endpoints, handle data validation, implement business logic, and ensure proper error handling.

Key principles:
- Follow existing API patterns and middleware conventions in the codebase.
- Validate all inputs at the boundary. Return meaningful error responses.
- Respect existing database abstraction layers (ORM/query builder patterns).
- Implement proper error handling and logging.
- Consider performance implications (N+1 queries, pagination, caching).
- Read existing route/controller files to understand conventions before implementing.`,

  devops: `You are a DevOps & Infrastructure agent specializing in CI/CD, containerization, and cloud deployment.
You configure Dockerfiles, Kubernetes manifests, CI pipelines, and infrastructure as code.

Key principles:
- Follow existing deployment and pipeline conventions in the repository.
- Use minimal, secure base images for containers.
- Implement proper health checks and resource limits.
- Prefer immutable infrastructure patterns.
- Verify pipeline syntax and consider failure modes.
- Read existing Dockerfile/workflow files before making changes.`,

  testing: `You are a Testing & QA Specialist agent focused on writing and maintaining test suites.
You create unit tests, integration tests, and end-to-end tests following project conventions.

Key principles:
- Follow the project's existing test patterns, framework choices, and naming conventions.
- Test behavior, not implementation details.
- Write clear Arrange-Act-Assert structured tests.
- Use existing test utilities, factories, and fixtures rather than reinventing.
- Cover edge cases and error paths, not just the happy path.
- Ensure tests are deterministic (no flaky tests).
- Read existing tests to understand patterns before writing new ones.`,

  database: `You are a Database Specialist agent skilled in schema design, migrations, query optimization, and data modeling.
You work with SQL and NoSQL databases, ORMs, and data access layers.

Key principles:
- Follow existing migration and schema conventions in the codebase.
- Consider indexing, constraints, and data integrity in every change.
- Write backward-compatible migrations where possible.
- Optimize queries: avoid N+1 patterns, use appropriate joins.
- Respect existing ORM/model patterns.
- Read existing schema/model files before making changes.`,

  security: `You are a Security Specialist agent focused on identifying and remediating security vulnerabilities.
You apply OWASP guidelines, implement proper auth/permission checks, and ensure secrets are handled safely.

Key principles:
- Apply the principle of least privilege in all permission checks.
- Sanitize and validate all user input.
- Never log or expose secrets, tokens, or credentials.
- Use established security libraries; never roll your own crypto.
- Follow existing security patterns in the codebase.
- Flag potential vulnerabilities you encounter even outside the assigned task.`,

  design: `You are a Design Implementation specialist who translates design intent into code.
You focus on visual fidelity, spacing, typography, color, and interaction design.

Key principles:
- Respect the existing design system tokens (colors, spacing, typography).
- Match Figma/design specs precisely when provided.
- Maintain visual consistency with surrounding components.
- Use proper semantic markup even when "div soup" would be easier.
- Consider dark mode, responsive states, and loading/error states.
- Read theme/token files before writing styled components.`,

  documentation: `You are a Documentation Specialist agent responsible for clear, accurate, and well-structured documentation.
You write READMEs, API docs, inline comments, changelogs, and guides.

Key principles:
- Follow existing documentation style and structure in the repository.
- Write for the intended audience (new contributors vs. experienced users).
- Include working code examples where appropriate.
- Keep docs close to the code they document.
- Verify that documented commands and examples actually work.
- Avoid duplicating information that already exists elsewhere — link instead.`,

  'data-science': `You are a Data Science & ML agent experienced in building data pipelines, ML training workflows,
and data processing code. You work with Python data ecosystems, data transformation, and model integration.

Key principles:
- Follow existing pipeline and notebook conventions in the project.
- Ensure data transformations are deterministic and reproducible.
- Handle missing data and edge cases explicitly.
- Document assumptions about data distributions and quality.
- Use vectorized operations over loops where possible.
- Read existing pipeline code before adding new steps.`,

  mobile: `You are a Mobile Development specialist for iOS/Android/cross-platform apps.
You build screens, implement navigation, handle platform-specific APIs, and ensure mobile performance.

Key principles:
- Follow existing navigation and state management patterns in the codebase.
- Consider mobile-specific constraints: battery, memory, network bandwidth.
- Handle offline states and poor connectivity gracefully.
- Respect platform design conventions (Material Design / Human Interface Guidelines).
- Ensure touch targets are appropriately sized and accessible.
- Read existing screen/component files before implementing new ones.`,

  general: `You are a generalist software engineering agent capable of handling a wide range of development tasks.
You analyze code, follow project conventions, implement features, fix bugs, and validate your work.

Key principles:
- Understand before acting. Read relevant files and explore the codebase before making changes.
- Follow existing code style, patterns, and conventions exactly.
- Make minimal, focused changes. Do not refactor unrelated code.
- Verify your work by running relevant checks and tests.
- Ask for clarification when requirements are ambiguous.
- Document your reasoning in commit messages or task updates.`,
}

/**
 * Spawnable sub-agents that are generally useful across categories.
 */
const BASE_SPAWNABLE_AGENTS = [
  'file-picker', 'file-picker-max', 'code-searcher', 'directory-lister',
  'glob-matcher', 'file-lister', 'researcher-web', 'researcher-docs',
  'commander', 'commander-lite', 'context-pruner',
  'thinker', 'thinker-best-of-n', 'thinker-best-of-n-opus',
  'editor', 'editor-glm', 'editor-multi-prompt',
  'code-reviewer', 'code-reviewer-multi-prompt',
  'opus-agent', 'gpt-5-agent',
]

/**
 * Classify a task description into a category with confidence score.
 */
function classifyTask(task: string): { category: TaskCategory; confidence: number } {
  const lower = task.toLowerCase()
  const scores: Record<TaskCategory, number> = {
    frontend: 0, backend: 0, devops: 0, testing: 0,
    database: 0, security: 0, design: 0, documentation: 0,
    'data-science': 0, mobile: 0, general: 0,
  }

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [TaskCategory, string[]][]) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        scores[category]++
      }
    }
  }

  let bestCategory: TaskCategory = 'general'
  let bestScore = 0
  for (const [cat, score] of Object.entries(scores) as [TaskCategory, number][]) {
    if (score > bestScore) {
      bestScore = score
      bestCategory = cat
    }
  }

  const totalHits = Object.values(scores).reduce((a, b) => a + b, 0)
  const confidence = totalHits > 0 ? Math.min(1, bestScore / Math.max(totalHits, 3)) : 0.3

  return { category: bestCategory, confidence }
}

/**
 * Generate a role ID from category and task hints.
 */
function generateRoleId(category: TaskCategory, task: string): string {
  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 3)
    .join('-')
  return `${category}-${slug || 'specialist'}`
}

/**
 * Generate a display name from category.
 */
function generateDisplayName(category: TaskCategory): string {
  const names: Record<TaskCategory, string> = {
    frontend: 'Frontend Specialist',
    backend: 'Backend Specialist',
    devops: 'DevOps Engineer',
    testing: 'QA & Test Engineer',
    database: 'Database Engineer',
    security: 'Security Engineer',
    design: 'Design Implementer',
    documentation: 'Documentation Writer',
    'data-science': 'Data Science Engineer',
    mobile: 'Mobile Developer',
    general: 'Software Engineer',
  }
  return names[category]
}

/**
 * Determine autonomy level from task description and context hint.
 */
function determineAutonomy(task: string, context?: RoleContext): AutonomyLevel {
  if (context?.autonomyHint) return context.autonomyHint

  const lower = task.toLowerCase()
  if (
    lower.includes('auto') || lower.includes('autonomous')
    || lower.includes('full control') || lower.includes('independent')
  ) return 'full'

  if (
    lower.includes('review') || lower.includes('approve')
    || lower.includes('critical') || lower.includes('production')
  ) return 'low'

  if (lower.includes('implement') || lower.includes('build') || lower.includes('create')) {
    return 'medium'
  }

  return 'medium'
}

/**
 * Dynamic Role Synthesizer.
 *
 * Given a task description, proposes a custom agent role with an appropriate
 * system prompt, tool set, and autonomy level based on task classification.
 * Uses template-based generation with keyword classification across
 * frontend/backend/devops/testing/database/security/design/docs/data/mobile/general.
 */
export class RoleSynthesizer {
  private customTemplates: Map<string, Partial<SynthesizedRole>> = new Map()

  /**
   * Synthesize a custom agent role for a given task.
   *
   * @param task - Natural language task description
   * @param context - Optional context (team, phase, model preferences, etc.)
   * @returns A SynthesizedRole ready for agent spawning
   */
  async synthesizeRole(
    task: string,
    context?: RoleContext,
  ): Promise<SynthesizedRole> {
    const { category, confidence } = classifyTask(task)
    const autonomyLevel = determineAutonomy(task, context)

    let tools = [...CATEGORY_TOOLS[category]]
    if (context?.requiredTools) {
      for (const t of context.requiredTools) {
        if (!tools.includes(t)) tools.push(t)
      }
    }
    if (context?.blockedTools) {
      tools = tools.filter((t) => !context.blockedTools!.includes(t))
    }

    const roleId = generateRoleId(category, task)
    const displayName = generateDisplayName(category)
    const basePrompt = CATEGORY_PROMPTS[category]

    const extraInstructions = context?.extraInstructions
      ? `\n\n# Additional Instructions\n\n${context.extraInstructions}`
      : ''

    const systemPrompt = `${basePrompt}
# Task Context

You are working on: ${task}
${context?.teamName ? `Team: ${context.teamName}` : ''}
${context?.phase ? `Phase: ${context.phase}` : ''}
Autonomy level: ${autonomyLevel}
${extraInstructions}

# Working Standards

- Read relevant files before making changes. Use file-picker / code-searcher / glob-matcher to find what you need.
- Follow existing code patterns precisely. Mimic style, naming, and structure.
- Make minimal, focused changes to accomplish the task.
- After implementing, spawn a commander to run typechecks and relevant tests.
- Spawn a code-reviewer to validate your work before completing.
- When finished, provide a concise summary of changes made.`

    const instructionsPrompt = `Complete the following task: ${task}

Approach:
1. Gather context by spawning file-pickers and reading relevant files.
2. Plan your approach using write_todos for multi-step work.
3. Implement changes following existing codebase conventions.
4. Validate by spawning commanders for typecheck and test commands.
5. Spawn a code-reviewer to verify quality.
6. Report completion with a summary of changes.`

    const role: SynthesizedRole = {
      id: roleId,
      displayName,
      systemPrompt,
      allowedTools: tools,
      autonomyLevel,
      category,
      spawnableAgents: [...BASE_SPAWNABLE_AGENTS],
      outputMode: 'last_message',
      instructionsPrompt,
      classificationConfidence: confidence,
    }

    const customOverride = this.customTemplates.get(category)
    if (customOverride) {
      Object.assign(role, customOverride)
    }

    return role
  }

  /**
   * Validate a synthesized role for structural correctness.
   *
   * @param role - The role to validate
   * @returns ValidationResult with errors and warnings
   */
  validateRole(role: Partial<SynthesizedRole>): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!role.id || typeof role.id !== 'string' || role.id.length === 0) {
      errors.push('Role must have a non-empty string id')
    }
    if (!role.displayName || typeof role.displayName !== 'string') {
      errors.push('Role must have a non-empty displayName')
    }
    if (!role.systemPrompt || typeof role.systemPrompt !== 'string' || role.systemPrompt.length < 50) {
      errors.push('Role systemPrompt must be a non-empty string of at least 50 characters')
    }
    if (!Array.isArray(role.allowedTools) || role.allowedTools.length === 0) {
      errors.push('Role must have at least one allowed tool')
    }
    if (
      role.autonomyLevel
      && !['low', 'medium', 'high', 'full'].includes(role.autonomyLevel)
    ) {
      errors.push(`Invalid autonomyLevel: ${role.autonomyLevel}`)
    }
    if (
      role.category
      && !Object.keys(CATEGORY_KEYWORDS).includes(role.category)
    ) {
      warnings.push(`Unknown category: ${role.category}`)
    }
    if (role.allowedTools && role.allowedTools.length < 3) {
      warnings.push('Role has fewer than 3 allowed tools; this may limit capability')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  /**
   * Register a custom template override for a specific category.
   */
  registerCustomTemplate(
    category: TaskCategory,
    template: Partial<SynthesizedRole>,
  ): void {
    this.customTemplates.set(category, template)
  }

  /**
   * Get all task categories with their keyword sets (for introspection/UI).
   */
  getCategories(): { name: TaskCategory; keywordCount: number }[] {
    return (Object.entries(CATEGORY_KEYWORDS) as [TaskCategory, string[]][]).map(
      ([name, keywords]) => ({ name, keywordCount: keywords.length }),
    )
  }
}

/**
 * Singleton global role synthesizer.
 */
let _globalSynthesizer: RoleSynthesizer | null = null

/**
 * Get the global RoleSynthesizer singleton.
 */
export function getRoleSynthesizer(): RoleSynthesizer {
  if (!_globalSynthesizer) {
    _globalSynthesizer = new RoleSynthesizer()
  }
  return _globalSynthesizer
}

/**
 * Reset the global synthesizer (primarily for testing).
 */
export function resetRoleSynthesizer(): void {
  _globalSynthesizer = null
}

export { CATEGORY_KEYWORDS, CATEGORY_TOOLS, CATEGORY_PROMPTS, BASE_SPAWNABLE_AGENTS }
