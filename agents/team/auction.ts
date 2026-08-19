/**
 * Inter-Agent Auction Protocol
 *
 * Coordinates task assignment across a team of agents using a
 * first-price sealed-bid auction. When the coordinator announces a task,
 * eligible agents submit bids containing confidence, ETA, and estimated
 * token cost. The coordinator resolves the auction by selecting the
 * bid with the lowest confidence-weighted expected cost
 * (cost = etaMs/confidence + tokenPenalty), balancing speed, confidence,
 * and token budget.
 */

import * as crypto from 'crypto'

// ============================================================================
// Types
// ============================================================================

/**
 * A task being auctioned among agents.
 */
export interface AuctionTask {
  /** Unique task identifier */
  id: string
  /** Human-readable description */
  description: string
  /** Task category / tags for eligibility filtering */
  tags?: string[]
  /** Required agent capabilities (e.g. ["typescript", "browser", "docker"]) */
  requiredCapabilities?: string[]
  /** Optional priority (higher = tighter SLA, prefers faster agents) */
  priority?: number
  /** Maximum acceptable wall-clock time in milliseconds */
  deadlineMs?: number
  /** Maximum acceptable token budget */
  maxTokens?: number
  /** Arbitrary task metadata passed to bidders */
  metadata?: Record<string, unknown>
}

/**
 * A bid submitted by an agent for a specific task.
 */
export interface Bid {
  /** Bid id (auto-generated) */
  id: string
  /** Task this bid is for */
  taskId: string
  /** Agent submitting the bid */
  agentId: string
  /** Agent's self-reported confidence that it can complete the task (0..1) */
  confidence: number
  /** Estimated wall-clock time in milliseconds */
  etaMs: number
  /** Estimated total tokens (input + output) the agent will consume */
  estimatedTokens: number
  /** Optional free-form justification / plan sketch */
  justification?: string
  /** When the bid was submitted (ISO timestamp) */
  submittedAt: string
}

/**
 * The winner and supporting data from a resolved auction.
 */
export interface AuctionResult {
  /** Task id */
  taskId: string
  /** Winning agent id */
  winnerAgentId: string
  /** The winning bid */
  winningBid: Bid
  /** All submitted bids ranked by expected cost (lowest first) */
  rankedBids: Array<Bid & { expectedCost: number }>
  /** When the auction was resolved (ISO timestamp) */
  resolvedAt: string
  /** Whether the auction had at least one bid */
  hadBidders: boolean
}

/**
 * Descriptor for an agent participating in auctions.
 */
export interface AgentDescriptor {
  /** Agent id */
  id: string
  /** Capabilities this agent advertises */
  capabilities: string[]
  /** Cost multiplier for tokens (per 1k tokens, in arbitrary cost units) */
  tokenCostRate?: number
  /** Cost multiplier for latency (per second, in arbitrary cost units) */
  latencyCostRate?: number
}

// ============================================================================
// AgentAuction
// ============================================================================

/**
 * Runs sealed-bid auctions for inter-agent task assignment.
 *
 * Flow:
 * 1. Coordinator calls {@link announceTask} to open an auction.
 * 2. Eligible agents evaluate the task and call {@link submitBid}.
 * 3. After the bidding window, coordinator calls {@link resolveAuction},
 *    which picks the lowest confidence-weighted cost.
 *
 * The expected cost for a bid is:
 *   cost = (etaMs / 1000) * latencyRate
 *        + (estimatedTokens / 1000) * tokenRate
 *        * (2 - confidence)
 *
 * Lower confidence inflates the cost (risk premium); higher confidence
 * reduces it. Agents with low confidence are dispreferred even if they
 * are fast or cheap.
 */
export class AgentAuction {
  /** Agent registry: agentId → descriptor */
  private agents: Map<string, AgentDescriptor> = new Map()
  /** Open auctions: taskId → task */
  private openAuctions: Map<string, AuctionTask> = new Map()
  /** Submitted bids: taskId → bids */
  private bids: Map<string, Bid[]> = new Map()
  /** Resolved auctions: taskId → result */
  private resolved: Map<string, AuctionResult> = new Map()
  /** Default cost rates */
  private defaultTokenCostRate = 0.01
  private defaultLatencyCostRate = 1.0
  /** Bidding window duration in ms (defaults to 5 seconds; coordinator may resolve earlier) */
  private biddingWindowMs = 5000
  /** When each auction was announced (taskId → timestamp ms) */
  private announcedAt: Map<string, number> = new Map()

  constructor(options?: { biddingWindowMs?: number; tokenCostRate?: number; latencyCostRate?: number }) {
    if (options?.biddingWindowMs) this.biddingWindowMs = options.biddingWindowMs
    if (options?.tokenCostRate) this.defaultTokenCostRate = options.tokenCostRate
    if (options?.latencyCostRate) this.defaultLatencyCostRate = options.latencyCostRate
  }

  /**
   * Register an agent as eligible to bid.
   */
  registerAgent(descriptor: AgentDescriptor): void {
    this.agents.set(descriptor.id, descriptor)
  }

  /**
   * Unregister an agent (no longer eligible to bid).
   */
  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId)
  }

  /**
   * Announce a new task, opening an auction for eligible agents to bid on.
   *
   * @param task - The task to auction
   * @returns List of agentIds that are eligible to bid (possess required capabilities)
   */
  announceTask(task: AuctionTask): string[] {
    if (this.openAuctions.has(task.id)) {
      throw new Error(`Auction already open for task ${task.id}`)
    }
    this.openAuctions.set(task.id, task)
    this.bids.set(task.id, [])
    this.announcedAt.set(task.id, Date.now())

    const eligible = this.getEligibleAgents(task)
    return eligible
  }

  /**
   * Submit a bid for a task.
   *
   * @param agentId - Agent placing the bid
   * @param bid - Bid data (taskId, confidence, etaMs, estimatedTokens, etc.)
   */
  submitBid(
    agentId: string,
    bid: Omit<Bid, 'id' | 'agentId' | 'submittedAt'> & { justification?: string },
  ): Bid {
    const task = this.openAuctions.get(bid.taskId)
    if (!task) throw new Error(`No open auction for task ${bid.taskId}`)
    if (this.resolved.has(bid.taskId)) {
      throw new Error(`Auction for task ${bid.taskId} is already resolved`)
    }
    if (!this.agents.has(agentId)) throw new Error(`Unknown agent ${agentId}`)

    const confidence = Math.max(0, Math.min(1, bid.confidence))
    const fullBid: Bid = {
      id: `bid_${crypto.randomBytes(8).toString('hex')}`,
      taskId: bid.taskId,
      agentId,
      confidence,
      etaMs: Math.max(0, bid.etaMs),
      estimatedTokens: Math.max(0, bid.estimatedTokens),
      justification: bid.justification,
      submittedAt: new Date().toISOString(),
    }
    this.bids.get(bid.taskId)!.push(fullBid)
    return fullBid
  }

  /**
   * Resolve the auction for a task and select a winner.
   *
   * @param taskId - Task to resolve
   * @returns AuctionResult with winner and ranked bids
   */
  resolveAuction(taskId: string): AuctionResult {
    const task = this.openAuctions.get(taskId)
    if (!task) throw new Error(`No open auction for task ${taskId}`)
    if (this.resolved.has(taskId)) return this.resolved.get(taskId)!

    const bids = this.bids.get(taskId) ?? []

    const ranked = bids
      .map((b) => ({
        ...b,
        expectedCost: this.computeExpectedCost(b, task),
      }))
      .sort((a, b) => a.expectedCost - b.expectedCost)

    const winner = ranked[0]
    const result: AuctionResult = {
      taskId,
      winnerAgentId: winner?.agentId ?? '',
      winningBid: winner as unknown as Bid,
      rankedBids: ranked,
      resolvedAt: new Date().toISOString(),
      hadBidders: ranked.length > 0,
    }

    if (!winner) {
      result.winnerAgentId = ''
    }

    this.resolved.set(taskId, result)
    this.openAuctions.delete(taskId)
    return result
  }

  /**
   * Get all bids submitted for a task (including after resolution).
   */
  getBids(taskId: string): Bid[] {
    return [...(this.bids.get(taskId) ?? [])]
  }

  /**
   * Check whether the bidding window for an announced task has elapsed.
   */
  isBiddingWindowClosed(taskId: string): boolean {
    const announced = this.announcedAt.get(taskId)
    if (announced === undefined) return true
    return Date.now() - announced >= this.biddingWindowMs
  }

  /**
   * List currently open (unresolved) auctions.
   */
  getOpenAuctions(): AuctionTask[] {
    return Array.from(this.openAuctions.values())
  }

  /**
   * Get the resolved result for a task, or null if not yet resolved.
   */
  getResult(taskId: string): AuctionResult | null {
    return this.resolved.get(taskId) ?? null
  }

  /**
   * Cancel an open auction without selecting a winner.
   */
  cancelAuction(taskId: string): void {
    this.openAuctions.delete(taskId)
    this.bids.delete(taskId)
    this.announcedAt.delete(taskId)
  }

  // ============================================================================
  // Internals
  // ============================================================================

  private getEligibleAgents(task: AuctionTask): string[] {
    const required = new Set(task.requiredCapabilities ?? [])
    const eligible: string[] = []
    for (const [id, desc] of this.agents) {
      const caps = new Set(desc.capabilities)
      let ok = true
      for (const req of required) {
        if (!caps.has(req)) {
          ok = false
          break
        }
      }
      if (ok) eligible.push(id)
    }
    return eligible
  }

  private computeExpectedCost(bid: Bid, task: AuctionTask): number {
    const agent = this.agents.get(bid.agentId)
    const tokenRate = agent?.tokenCostRate ?? this.defaultTokenCostRate
    const latencyRate = agent?.latencyCostRate ?? this.defaultLatencyCostRate

    const latencyCost = (bid.etaMs / 1000) * latencyRate
    const tokenCost = (bid.estimatedTokens / 1000) * tokenRate
    const confidencePenalty = 2 - bid.confidence
    const priorityMultiplier = task.priority ? 1 + task.priority * 0.1 : 1

    let cost = (latencyCost + tokenCost) * confidencePenalty * priorityMultiplier

    if (task.deadlineMs && bid.etaMs > task.deadlineMs) {
      cost *= 10
    }
    if (task.maxTokens && bid.estimatedTokens > task.maxTokens) {
      cost *= 10
    }

    return cost
  }
}

/**
 * Singleton default auction instance (primarily for tests and simple use cases;
 * production team coordinators should create their own instance).
 */
let defaultAuction: AgentAuction | null = null

export function getDefaultAgentAuction(): AgentAuction {
  if (!defaultAuction) defaultAuction = new AgentAuction()
  return defaultAuction
}

export function resetDefaultAgentAuction(): void {
  defaultAuction = null
}
