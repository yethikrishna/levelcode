/**
 * Per-token pricing for supported models, in USD per 1,000,000 tokens.
 * Prices are approximate list prices (as of 2025) for input/output tokens.
 */
export interface ModelPricing {
  /** Model identifier (e.g., 'anthropic/claude-sonnet-4') */
  model: string
  /** Input (prompt) token price per million tokens in USD */
  inputPricePerMillion: number
  /** Output (completion) token price per million tokens in USD */
  outputPricePerMillion: number
  /** Optional cache-write price per million tokens */
  cacheWritePricePerMillion?: number
  /** Optional cache-read price per million tokens */
  cacheReadPricePerMillion?: number
}

/**
 * Usage data for a single LLM call.
 */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens?: number
  cacheWriteInputTokens?: number
  model: string
  timestamp?: number
}

/**
 * Cost guard budget configuration.
 */
export interface CostGuardConfig {
  /** Maximum total spend allowed per session in USD (default: 5.00) */
  budgetUsd?: number
  /** Fraction of budget at which to emit a warning (default: 0.5 = 50%) */
  warnThreshold?: number
  /** Fraction of budget at which to emit a critical warning (default: 0.9 = 90%) */
  criticalThreshold?: number
  /** Fraction of budget at which to hard-stop execution (default: 1.0 = 100%) */
  hardStopThreshold?: number
  /** Callback invoked when a threshold is crossed */
  onThreshold?: (event: CostThresholdEvent) => void
  /** Custom model pricing table entries to merge with defaults */
  customPricing?: ModelPricing[]
}

/**
 * Event emitted when a spending threshold is crossed.
 */
export interface CostThresholdEvent {
  sessionId: string
  threshold: 'warn' | 'critical' | 'hardstop'
  currentSpend: number
  budget: number
  percentUsed: number
  totalInputTokens: number
  totalOutputTokens: number
  timestamp: number
}

/**
 * Aggregate cost summary for a session.
 */
export interface CostSummary {
  sessionId: string
  totalSpend: number
  budget: number
  percentUsed: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  callCount: number
  status: 'ok' | 'warn' | 'critical' | 'stopped'
  breakdownByModel: Record<
    string,
    {
      inputTokens: number
      outputTokens: number
      spend: number
      calls: number
    }
  >
}

const DEFAULT_CONFIG: Required<Omit<CostGuardConfig, 'onThreshold' | 'customPricing'>> = {
  budgetUsd: 5.0,
  warnThreshold: 0.5,
  criticalThreshold: 0.9,
  hardStopThreshold: 1.0,
}

/**
 * Default model pricing table covering major providers and commonly used models.
 * Prices are approximate list prices per 1M tokens in USD.
 */
const DEFAULT_MODEL_PRICING: ModelPricing[] = [
  {
    model: 'anthropic/claude-opus-4.1',
    inputPricePerMillion: 15.0,
    outputPricePerMillion: 75.0,
    cacheWritePricePerMillion: 18.75,
    cacheReadPricePerMillion: 1.5,
  },
  {
    model: 'anthropic/claude-sonnet-4.5',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    cacheWritePricePerMillion: 3.75,
    cacheReadPricePerMillion: 0.3,
  },
  {
    model: 'anthropic/claude-sonnet-4',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    cacheWritePricePerMillion: 3.75,
    cacheReadPricePerMillion: 0.3,
  },
  {
    model: 'anthropic/claude-3.5-sonnet-20240620',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    cacheWritePricePerMillion: 3.75,
    cacheReadPricePerMillion: 0.3,
  },
  {
    model: 'anthropic/claude-3.5-haiku-20241022',
    inputPricePerMillion: 0.8,
    outputPricePerMillion: 4.0,
    cacheWritePricePerMillion: 1.0,
    cacheReadPricePerMillion: 0.08,
  },
  {
    model: 'openai/gpt-4o-2024-11-20',
    inputPricePerMillion: 2.5,
    outputPricePerMillion: 10.0,
  },
  {
    model: 'openai/gpt-4.1-2025-04-14',
    inputPricePerMillion: 2.0,
    outputPricePerMillion: 8.0,
  },
  {
    model: 'openai/gpt-4o-mini-2024-07-18',
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
  },
  {
    model: 'openai/gpt-5.1',
    inputPricePerMillion: 5.0,
    outputPricePerMillion: 25.0,
  },
  {
    model: 'openai/o3-mini-2025-01-31',
    inputPricePerMillion: 1.1,
    outputPricePerMillion: 4.4,
  },
  {
    model: 'openai/o3-2025-04-16',
    inputPricePerMillion: 2.0,
    outputPricePerMillion: 8.0,
  },
  {
    model: 'openai/o4-mini-2025-04-16',
    inputPricePerMillion: 1.1,
    outputPricePerMillion: 4.4,
  },
  {
    model: 'google/gemini-2.5-pro',
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 10.0,
  },
  {
    model: 'google/gemini-2.5-flash',
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
  },
  {
    model: 'x-ai/grok-4-07-09',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
  },
]

/**
 * CostGuard tracks per-session token usage and enforces spending budgets.
 *
 * It emits warnings at configurable thresholds (50% / 90% by default) and
 * provides a `shouldStop()` method to check whether the hard budget limit
 * has been reached and further LLM calls should be blocked.
 *
 * @example
 * ```ts
 * const guard = new CostGuard({ budgetUsd: 5.00 })
 * guard.recordUsage({ inputTokens: 1000, outputTokens: 500, model: 'anthropic/claude-sonnet-4' })
 * console.log(guard.getSummary().totalSpend) // cost in USD
 * if (guard.shouldStop()) throw new Error('Budget exceeded')
 * ```
 */
export class CostGuard {
  private readonly sessionId: string
  private readonly config: Required<Omit<CostGuardConfig, 'onThreshold' | 'customPricing'>> &
    Pick<CostGuardConfig, 'onThreshold' | 'customPricing'>
  private readonly pricingTable: Map<string, ModelPricing>

  private totalInputTokens = 0
  private totalOutputTokens = 0
  private totalCacheReadTokens = 0
  private totalCacheWriteTokens = 0
  private totalSpend = 0
  private callCount = 0
  private lastThresholdFired: 'warn' | 'critical' | 'hardstop' | null = null
  private stopped = false
  private readonly modelBreakdown = new Map<
    string,
    { inputTokens: number; outputTokens: number; spend: number; calls: number }
  >()
  private readonly usageLog: Array<TokenUsage & { spend: number }> = []

  constructor(config?: CostGuardConfig) {
    this.sessionId = generateSessionId()
    this.config = { ...DEFAULT_CONFIG, ...config }

    this.pricingTable = new Map()
    for (const pricing of DEFAULT_MODEL_PRICING) {
      this.pricingTable.set(pricing.model, pricing)
    }
    if (config?.customPricing) {
      for (const pricing of config.customPricing) {
        this.pricingTable.set(pricing.model, pricing)
      }
    }
  }

  /**
   * Look up pricing for a given model, with fallback heuristics for unknown models.
   * If the exact model isn't in the table, attempts prefix matching (by provider).
   * Falls back to a mid-range estimate if no match is found.
   */
  private getPricing(model: string): ModelPricing {
    if (this.pricingTable.has(model)) {
      return this.pricingTable.get(model)!
    }

    for (const [key, pricing] of this.pricingTable) {
      if (model.startsWith(key.split('/')[0] + '/')) {
        if (model.includes('haiku') || model.includes('flash') || model.includes('mini')) {
          if (key.includes('haiku') || key.includes('flash') || key.includes('mini')) {
            return pricing
          }
        }
        if (model.includes('opus')) {
          if (key.includes('opus')) return pricing
        }
        if (model.includes('sonnet')) {
          if (key.includes('sonnet')) return pricing
        }
      }
    }

    const provider = model.includes('/') ? model.split('/')[0] : 'unknown'
    const fallbackPrices: Record<string, { input: number; output: number }> = {
      anthropic: { input: 3.0, output: 15.0 },
      openai: { input: 2.5, output: 10.0 },
      google: { input: 1.25, output: 5.0 },
      'x-ai': { input: 3.0, output: 15.0 },
      unknown: { input: 2.0, output: 10.0 },
    }
    const prices = fallbackPrices[provider as keyof typeof fallbackPrices] ?? fallbackPrices.unknown
    return {
      model: `__fallback__/${model}`,
      inputPricePerMillion: prices.input,
      outputPricePerMillion: prices.output,
    }
  }

  /**
   * Calculate the cost in USD for a single token usage record.
   */
  private calculateCost(usage: TokenUsage): number {
    const pricing = this.getPricing(usage.model)
    let cost = 0

    cost += (usage.inputTokens / 1_000_000) * pricing.inputPricePerMillion
    cost += (usage.outputTokens / 1_000_000) * pricing.outputPricePerMillion

    if (usage.cacheReadInputTokens && pricing.cacheReadPricePerMillion) {
      cost += (usage.cacheReadInputTokens / 1_000_000) * pricing.cacheReadPricePerMillion
    }
    if (usage.cacheWriteInputTokens && pricing.cacheWritePricePerMillion) {
      cost += (usage.cacheWriteInputTokens / 1_000_000) * pricing.cacheWritePricePerMillion
    }

    return cost
  }

  /**
   * Record token usage from an LLM call and update running totals.
   * Automatically checks thresholds and fires callbacks.
   *
   * @param usage - Token counts and model identifier for the call
   * @returns The calculated cost for this specific call in USD
   */
  recordUsage(usage: TokenUsage): number {
    if (this.stopped) {
      return 0
    }

    const cost = this.calculateCost(usage)
    const timestamp = usage.timestamp ?? Date.now()

    this.totalInputTokens += usage.inputTokens
    this.totalOutputTokens += usage.outputTokens
    this.totalCacheReadTokens += usage.cacheReadInputTokens ?? 0
    this.totalCacheWriteTokens += usage.cacheWriteInputTokens ?? 0
    this.totalSpend += cost
    this.callCount += 1

    const existing = this.modelBreakdown.get(usage.model) ?? {
      inputTokens: 0,
      outputTokens: 0,
      spend: 0,
      calls: 0,
    }
    existing.inputTokens += usage.inputTokens
    existing.outputTokens += usage.outputTokens
    existing.spend += cost
    existing.calls += 1
    this.modelBreakdown.set(usage.model, existing)

    this.usageLog.push({ ...usage, spend: cost, timestamp })

    this.checkThresholds()

    return cost
  }

  /**
   * Check which thresholds have been crossed and fire appropriate callbacks.
   */
  private checkThresholds(): void {
    const percentUsed = this.totalSpend / this.config.budgetUsd
    const sessionId = this.sessionId

    if (
      percentUsed >= this.config.hardStopThreshold &&
      this.lastThresholdFired !== 'hardstop'
    ) {
      this.stopped = true
      this.lastThresholdFired = 'hardstop'
      this.config.onThreshold?.({
        sessionId,
        threshold: 'hardstop',
        currentSpend: this.totalSpend,
        budget: this.config.budgetUsd,
        percentUsed,
        totalInputTokens: this.totalInputTokens,
        totalOutputTokens: this.totalOutputTokens,
        timestamp: Date.now(),
      })
      return
    }

    if (
      percentUsed >= this.config.criticalThreshold &&
      this.lastThresholdFired !== 'critical' &&
      this.lastThresholdFired !== 'hardstop'
    ) {
      this.lastThresholdFired = 'critical'
      this.config.onThreshold?.({
        sessionId,
        threshold: 'critical',
        currentSpend: this.totalSpend,
        budget: this.config.budgetUsd,
        percentUsed,
        totalInputTokens: this.totalInputTokens,
        totalOutputTokens: this.totalOutputTokens,
        timestamp: Date.now(),
      })
      return
    }

    if (
      percentUsed >= this.config.warnThreshold &&
      !this.lastThresholdFired
    ) {
      this.lastThresholdFired = 'warn'
      this.config.onThreshold?.({
        sessionId,
        threshold: 'warn',
        currentSpend: this.totalSpend,
        budget: this.config.budgetUsd,
        percentUsed,
        totalInputTokens: this.totalInputTokens,
        totalOutputTokens: this.totalOutputTokens,
        timestamp: Date.now(),
      })
    }
  }

  /**
   * Check whether the hard budget stop has been triggered.
   * When this returns true, no further LLM calls should be made.
   */
  shouldStop(): boolean {
    return this.stopped
  }

  /**
   * Get a comprehensive cost summary for this session.
   */
  getSummary(): CostSummary {
    const percentUsed = this.totalSpend / this.config.budgetUsd
    let status: CostSummary['status'] = 'ok'
    if (this.stopped) status = 'stopped'
    else if (percentUsed >= this.config.criticalThreshold) status = 'critical'
    else if (percentUsed >= this.config.warnThreshold) status = 'warn'

    const breakdownByModel: CostSummary['breakdownByModel'] = {}
    for (const [model, data] of this.modelBreakdown) {
      breakdownByModel[model] = { ...data }
    }

    return {
      sessionId: this.sessionId,
      totalSpend: this.totalSpend,
      budget: this.config.budgetUsd,
      percentUsed,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalCacheReadTokens: this.totalCacheReadTokens,
      totalCacheWriteTokens: this.totalCacheWriteTokens,
      callCount: this.callCount,
      status,
      breakdownByModel,
    }
  }

  /**
   * Get the remaining budget in USD.
   */
  getRemainingBudget(): number {
    return Math.max(0, this.config.budgetUsd - this.totalSpend)
  }

  /**
   * Get the current total spend in USD.
   */
  getCurrentSpend(): number {
    return this.totalSpend
  }

  /**
   * Get total token counts across all calls.
   */
  getTotalTokens(): { input: number; output: number } {
    return {
      input: this.totalInputTokens,
      output: this.totalOutputTokens,
    }
  }

  /**
   * Reset the guard to initial state, clearing all accumulated usage.
   */
  reset(): void {
    this.totalInputTokens = 0
    this.totalOutputTokens = 0
    this.totalCacheReadTokens = 0
    this.totalCacheWriteTokens = 0
    this.totalSpend = 0
    this.callCount = 0
    this.lastThresholdFired = null
    this.stopped = false
    this.modelBreakdown.clear()
    this.usageLog.length = 0
  }

  /**
   * Retrieve the full usage log for this session.
   */
  getUsageLog(): ReadonlyArray<TokenUsage & { spend: number }> {
    return [...this.usageLog]
  }

  /**
   * Estimate how many more output tokens can be generated on the given model
   * before the budget is exhausted. Returns Infinity if no estimate is possible.
   */
  estimateRemainingOutputTokens(model: string): number {
    const pricing = this.getPricing(model)
    const remaining = this.getRemainingBudget()
    if (remaining <= 0) return 0
    return Math.floor((remaining / pricing.outputPricePerMillion) * 1_000_000)
  }

  /**
   * Register or override pricing for a specific model.
   */
  setModelPricing(pricing: ModelPricing): void {
    this.pricingTable.set(pricing.model, pricing)
  }
}

/**
 * Generate a short random session ID.
 */
function generateSessionId(): string {
  return `cost-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Create a CostGuard instance with default $5 budget and console warning callbacks.
 * Convenience factory for quick setup.
 */
export function createCostGuard(config?: CostGuardConfig): CostGuard {
  return new CostGuard({
    onThreshold: (event) => {
      const pct = (event.percentUsed * 100).toFixed(1)
      const prefix = event.threshold === 'hardstop'
        ? '🛑 COST GUARD HARD STOP'
        : event.threshold === 'critical'
          ? '⚠️  COST GUARD CRITICAL'
          : '💰 COST GUARD WARNING'
      console.warn(
        `${prefix}: $${event.currentSpend.toFixed(4)} / $${event.budget.toFixed(2)} (${pct}%) — session ${event.sessionId}`,
      )
    },
    ...config,
  })
}

/**
 * Format a cost value as a USD string.
 */
export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(4)}¢`
  return `$${usd.toFixed(4)}`
}
