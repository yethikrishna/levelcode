/**
 * Smart model routing by task type.
 *
 * The `SmartModelRouter` inspects a prompt and the requesting agent's type to
 * classify what kind of work is being requested, then selects an appropriate
 * model tier for the job. The goal is to reserve expensive high-reasoning
 * models for work that genuinely needs them while routing cheaper/faster
 * models for simple tasks like file picking, search, or summarization.
 *
 * Tiers:
 *  - strong  → planning, complex reasoning, architecture decisions (opus/gpt-5/o-series)
 *  - balanced → editing, code writing, moderate reasoning (sonnet/gpt-4/qwen-coder)
 *  - fast    → search, file picking, classification, short answers (haiku/deepseek/gpt-mini)
 */

// ============================================================================
// Types
// ============================================================================

export type TaskType =
  | 'planning'
  | 'complex-reasoning'
  | 'editing'
  | 'code-generation'
  | 'review'
  | 'search'
  | 'file-picking'
  | 'summarization'
  | 'classification'
  | 'simple-qa'
  | 'chat'

export type ModelTier = 'strong' | 'balanced' | 'fast'

export type BudgetTier = 'unlimited' | 'standard' | 'economy'

export interface RoutingTableEntry {
  taskType: TaskType
  tier: ModelTier
  description: string
  keywords: string[]
}

export interface RoutingDecision {
  taskType: TaskType
  tier: ModelTier
  model: string
  confidence: number
  reason: string
}

export interface ModelPool {
  strong: string[]
  balanced: string[]
  fast: string[]
}

export interface SmartRouterConfig {
  /** Override the default model pool. */
  models?: Partial<ModelPool>
  /** Budget hint: limits which tiers are eligible. */
  budget?: BudgetTier
  /** Fallback model when nothing else matches. Defaults to the first balanced model. */
  fallbackModel?: string
}

// ============================================================================
// Default routing table
// ============================================================================

const DEFAULT_ROUTING_TABLE: RoutingTableEntry[] = [
  {
    taskType: 'planning',
    tier: 'strong',
    description: 'High-level architecture, planning, multi-step task decomposition',
    keywords: [
      'plan',
      'design the',
      'architect',
      'approach',
      'strategy',
      'break down',
      'decompose',
      'roadmap',
      'how should i',
      'how to implement',
      'refactor plan',
      'migration',
    ],
  },
  {
    taskType: 'complex-reasoning',
    tier: 'strong',
    description: 'Hard reasoning, debugging subtle bugs, algorithm design, mathematical reasoning',
    keywords: [
      'debug',
      'why does this',
      'root cause',
      'race condition',
      'deadlock',
      'memory leak',
      'algorithm',
      'complex',
      'analyze this',
      'investigate',
      'diagnose',
      'prove',
      'prove that',
    ],
  },
  {
    taskType: 'review',
    tier: 'balanced',
    description: 'Code review, feedback, evaluation of existing code',
    keywords: [
      'review',
      'audit',
      'critique',
      'feedback',
      'check for',
      'is this correct',
      'evaluate',
      'assess',
      'best practice',
    ],
  },
  {
    taskType: 'editing',
    tier: 'balanced',
    description: 'Editing/writing code in existing files, modifying implementations',
    keywords: [
      'edit',
      'fix',
      'update',
      'modify',
      'change',
      'replace',
      'rewrite',
      'implement',
      'add a feature',
      'add the',
      'create function',
      'write a',
    ],
  },
  {
    taskType: 'code-generation',
    tier: 'balanced',
    description: 'Generating code blocks, functions, components',
    keywords: [
      'generate',
      'write code',
      'create a',
      'build a',
      'scaffold',
      'boilerplate',
      'function that',
      'component',
      'class that',
    ],
  },
  {
    taskType: 'search',
    tier: 'fast',
    description: 'Searching for files, text, references, grep-like queries',
    keywords: [
      'search',
      'find',
      'grep',
      'look up',
      'where is',
      'locate',
      'lookup',
      'which file',
      'list files',
      'glob',
      'riprep',
      'rg ',
      'reference',
      'usages of',
    ],
  },
  {
    taskType: 'file-picking',
    tier: 'fast',
    description: 'Choosing which files to read/edit from context, selecting relevant files',
    keywords: [
      'pick files',
      'which files',
      'relevant files',
      'select files',
      'choose files',
      'files to',
      'files i need',
      'explore',
      'browse',
    ],
  },
  {
    taskType: 'summarization',
    tier: 'fast',
    description: 'Summarizing, condensing text, extracting key points',
    keywords: [
      'summarize',
      'summary',
      'tldr',
      'key points',
      'condense',
      'distill',
      'recap',
      'main points',
    ],
  },
  {
    taskType: 'classification',
    tier: 'fast',
    description: 'Classifying, categorizing, routing, simple decision-making',
    keywords: [
      'classify',
      'categorize',
      'label',
      'what type',
      'which category',
      'is this a',
      'determine if',
      'yes or no',
      'true or false',
    ],
  },
  {
    taskType: 'simple-qa',
    tier: 'fast',
    description: 'Simple factual questions, short answers, explanations of basic concepts',
    keywords: [
      'what is',
      'who is',
      'when is',
      'where is',
      'how do i',
      'explain',
      'define',
      'meaning of',
      'difference between',
    ],
  },
  {
    taskType: 'chat',
    tier: 'fast',
    description: 'Open-ended casual conversation, greetings, brainstorming light ideas',
    keywords: [
      'hi',
      'hello',
      'hey',
      'thanks',
      'thank you',
      'help me',
      'can you',
      'chat',
      'talk',
    ],
  },
]

// Default model pool (follows the LevelCode / OpenRouter-style prefixes).
const DEFAULT_MODEL_POOL: ModelPool = {
  strong: [
    'anthropic/claude-opus-4',
    'openai/gpt-5',
    'anthropic/claude-opus-4-5',
    'openai/o3',
  ],
  balanced: [
    'anthropic/claude-sonnet-4',
    'anthropic/claude-sonnet-4-5',
    'deepseek/deepseek-v3',
    'openai/gpt-4o',
    'alibaba/qwen2.5-coder-32b-instruct',
    'ollama/qwen2.5-coder',
  ],
  fast: [
    'anthropic/claude-haiku-4',
    'anthropic/claude-haiku-4-5',
    'deepseek/deepseek-chat',
    'openai/gpt-4o-mini',
    'google/gemini-2.0-flash',
    'groq/llama-3.1-8b-instant',
  ],
}

// Map of agent types → preferred default tier when the prompt is ambiguous.
const AGENT_TYPE_DEFAULT_TIER: Record<string, ModelTier> = {
  thinker: 'strong',
  'thinker-best-of-n': 'strong',
  'thinker-best-of-n-opus': 'strong',
  editor: 'balanced',
  'editor-glm': 'balanced',
  'editor-gpt-5': 'strong',
  'editor-multi-prompt': 'balanced',
  reviewer: 'balanced',
  coordinator: 'balanced',
  cto: 'strong',
  'vp-engineering': 'strong',
  director: 'strong',
  manager: 'balanced',
  'sub-manager': 'balanced',
  'product-lead': 'strong',
  'senior-engineer': 'balanced',
  'staff-engineer': 'balanced',
  'distinguished-engineer': 'strong',
  fellow: 'strong',
  scientist: 'strong',
  researcher: 'strong',
  designer: 'balanced',
  'junior-engineer': 'balanced',
  apprentice: 'balanced',
  intern: 'fast',
  tester: 'balanced',
  scout: 'fast',
  base2: 'balanced',
  'base2-fast': 'fast',
  'base2-free': 'fast',
  'base2-max': 'strong',
  'base2-plan': 'strong',
  'base2-scaffold': 'balanced',
  commander: 'strong',
  'commander-lite': 'balanced',
}

// ============================================================================
// SmartModelRouter
// ============================================================================

/**
 * Task-aware model router.
 *
 * Usage:
 * ```ts
 * const router = new SmartModelRouter()
 * const task = router.classifyTask('Plan the refactor of the auth module', 'thinker')
 * const decision = router.selectModel(task, 'standard')
 * console.log(decision.model) // e.g. "anthropic/claude-opus-4"
 * ```
 */
export class SmartModelRouter {
  private readonly models: ModelPool
  private readonly budget: BudgetTier
  private readonly fallbackModel: string
  private readonly routingTable: RoutingTableEntry[]

  constructor(config: SmartRouterConfig = {}) {
    this.models = {
      strong: config.models?.strong ?? DEFAULT_MODEL_POOL.strong,
      balanced: config.models?.balanced ?? DEFAULT_MODEL_POOL.balanced,
      fast: config.models?.fast ?? DEFAULT_MODEL_POOL.fast,
    }
    this.budget = config.budget ?? 'standard'
    this.fallbackModel = config.fallbackModel ?? this.models.balanced[0]
    this.routingTable = DEFAULT_ROUTING_TABLE
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Classify a prompt (and optional agent type) into a `TaskType`.
   *
   * Heuristic: lower-case the prompt and check for keyword matches from the
   * routing table. The task with the highest keyword hit count wins.
   * Falls back to an agent-type-based default when no keywords match.
   */
  classifyTask(prompt: string, agentType?: string): TaskType {
    const lower = prompt.toLowerCase().trim()

    let bestTask: TaskType = 'chat'
    let bestScore = 0

    for (const entry of this.routingTable) {
      let score = 0
      for (const kw of entry.keywords) {
        if (lower.includes(kw.toLowerCase())) {
          score++
        }
      }
      if (score > bestScore) {
        bestScore = score
        bestTask = entry.taskType
      }
    }

    if (bestScore === 0 && agentType) {
      const tier = AGENT_TYPE_DEFAULT_TIER[agentType]
      if (tier === 'strong') bestTask = 'complex-reasoning'
      else if (tier === 'balanced') bestTask = 'editing'
      else bestTask = 'simple-qa'
    }

    return bestTask
  }

  /**
   * Select a concrete model for a given task type and budget.
   *
   * Budget downgrade rules:
   *  - 'economy' forces all tasks to 'fast' tier
   *  - 'standard' allows strong/balanced/fast as classified
   *  - 'unlimited' is the same as standard (no upgrade)
   */
  selectModel(task: TaskType, budget?: BudgetTier): RoutingDecision {
    const effectiveBudget = budget ?? this.budget
    const entry = this.routingTable.find((e) => e.taskType === task)
    let tier = entry?.tier ?? 'balanced'

    if (effectiveBudget === 'economy') {
      tier = 'fast'
    }

    const availableModels = this.models[tier]
    const model = availableModels[0] ?? this.fallbackModel

    const confidence = this.confidenceFor(task, tier)
    const reason = entry
      ? `Task "${task}" → tier "${tier}" (${entry.description})`
      : `Unrecognized task "${task}", defaulting to tier "${tier}"`

    return { taskType: task, tier, model, confidence, reason }
  }

  /**
   * Convenience method that combines classification and selection.
   */
  route(prompt: string, agentType?: string, budget?: BudgetTier): RoutingDecision {
    const task = this.classifyTask(prompt, agentType)
    return this.selectModel(task, budget)
  }

  /**
   * Return the full routing table (useful for debugging / UI display).
   */
  getRoutingTable(): RoutingTableEntry[] {
    return [...this.routingTable]
  }

  /**
   * Return the current model pool grouped by tier.
   */
  getModelPool(): ModelPool {
    return {
      strong: [...this.models.strong],
      balanced: [...this.models.balanced],
      fast: [...this.models.fast],
    }
  }

  /**
   * Return a map of agent types to their default tier assignments
   * (useful for exposing routing configuration).
   */
  getAgentTierDefaults(): Record<string, ModelTier> {
    return { ...AGENT_TYPE_DEFAULT_TIER }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private confidenceFor(task: TaskType, _tier: ModelTier): number {
    const entry = this.routingTable.find((e) => e.taskType === task)
    if (!entry) return 0.3
    const keywordCount = entry.keywords.length
    return Math.min(1, 0.5 + keywordCount / 40)
  }
}

// ============================================================================
// Default singleton
// ============================================================================

let defaultRouter: SmartModelRouter | null = null

/**
 * Return a shared `SmartModelRouter` instance with default configuration.
 */
export function getSmartModelRouter(config?: SmartRouterConfig): SmartModelRouter {
  if (!defaultRouter || config) {
    defaultRouter = new SmartModelRouter(config)
  }
  return defaultRouter
}
