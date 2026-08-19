/**
 * Adaptive Tool Selection
 *
 * Tracks per-task-type tool success rates using an epsilon-greedy
 * multi-armed bandit strategy. Balances exploration (trying under-used
 * tools that might be better) against exploitation (using tools that
 * have historically succeeded for the task type).
 */

import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// Types
// ============================================================================

/** Known task categories that tools can be selected for. */
export type TaskType = 'bug-fix' | 'refactor' | 'feature' | 'test' | 'docs' | 'review'

/**
 * A single tool's recorded statistics for a specific task type.
 */
export interface ToolStat {
  /** Tool identifier (e.g. "read-file", "grep", "edit", "terminal") */
  toolName: string
  /** Number of times this tool was attempted for the task type */
  attempts: number
  /** Number of successful attempts */
  successes: number
  /** Number of failed attempts */
  failures: number
  /** Rolling average latency in milliseconds */
  avgLatencyMs: number
  /** UCB1-style exploration score (computed at recommendation time) */
  _ucbScore?: number
}

/**
 * A recommendation returned to the caller — the tool name plus a
 * confidence score explaining why it was recommended.
 */
export interface ToolRecommendation {
  toolName: string
  /** Estimated success probability 0..1 */
  expectedSuccessRate: number
  /** Average latency observed for this task/tool pair */
  avgLatencyMs: number
  /** How many times this tool has been tried for this task type */
  sampleCount: number
  /** Why this tool was selected: "exploit" = best historical, "explore" = under-tested */
  reason: 'exploit' | 'explore'
}

/**
 * Full statistics snapshot across all task types.
 */
export interface ToolStats {
  /** Per-task-type per-tool stats */
  byTaskType: Record<TaskType, Map<string, ToolStat>>
  /** Total recorded attempts across all types */
  totalAttempts: number
  /** When stats were last updated (ISO timestamp) */
  lastUpdated: string
}

interface SerializedStats {
  byTaskType: Record<string, Record<string, ToolStat>>
  totalAttempts: number
  lastUpdated: string
  epsilon: number
}

// ============================================================================
// AdaptiveToolSelector
// ============================================================================

/**
 * Selects tools adaptively based on historical success rates.
 *
 * Uses an epsilon-greedy strategy: with probability `epsilon`, it explores
 * a randomly-chosen tool (including under-tried ones); otherwise it
 * exploits the tool with the highest observed success rate. The success
 * rate is computed with a Laplace smoothing (+1 success, +2 attempts) to
 * avoid cold-start problems for tools that have never been tried.
 */
export class AdaptiveToolSelector {
  private stats: Record<TaskType, Map<string, ToolStat>>
  private totalAttempts = 0
  private lastUpdated: string
  /** Probability of exploration vs exploitation (0..1, default 0.1) */
  private epsilon: number
  private persistPath: string | null = null

  /**
   * @param epsilon - Exploration probability (0 = always exploit, 1 = always explore). Default 0.1.
   */
  constructor(epsilon = 0.1) {
    this.epsilon = epsilon
    this.stats = {
      'bug-fix': new Map(),
      refactor: new Map(),
      feature: new Map(),
      test: new Map(),
      docs: new Map(),
      review: new Map(),
    }
    this.lastUpdated = new Date().toISOString()
  }

  /**
   * Record the result of using a tool for a specific task type.
   *
   * @param taskType - The category of task being performed
   * @param toolName - The tool that was used
   * @param success - Whether the tool use was successful
   * @param latencyMs - Wall-clock time the tool took to execute
   */
  recordResult(taskType: TaskType, toolName: string, success: boolean, latencyMs: number): void {
    const bucket = this.stats[taskType]
    const existing = bucket.get(toolName)

    if (existing) {
      const totalAttempts = existing.attempts + 1
      existing.avgLatencyMs =
        (existing.avgLatencyMs * existing.attempts + latencyMs) / totalAttempts
      existing.attempts = totalAttempts
      if (success) existing.successes++
      else existing.failures++
    } else {
      bucket.set(toolName, {
        toolName,
        attempts: 1,
        successes: success ? 1 : 0,
        failures: success ? 0 : 1,
        avgLatencyMs: latencyMs,
      })
    }

    this.totalAttempts++
    this.lastUpdated = new Date().toISOString()
  }

  /**
   * Recommend the top-k tools for a given task type.
   *
   * One of the recommendations may be an "explore" pick (random under-tried
   * tool) when epsilon-greedy triggers exploration; the rest are the
   * top-(k-1) tools by smoothed success rate.
   *
   * @param taskType - The category of task
   * @param k - Number of recommendations to return (default 5)
   * @returns Array of tool recommendations sorted by expected value
   */
  recommendTools(taskType: TaskType, k = 5): ToolRecommendation[] {
    const bucket = this.stats[taskType]
    const allTools = Array.from(bucket.values())
    const totalAttemptsForType = allTools.reduce((sum, s) => sum + s.attempts, 0)

    const scored: Array<ToolStat & { _score: number }> = allTools.map((stat) => {
      const smoothedRate = (stat.successes + 1) / (stat.attempts + 2)
      const explorationBonus = Math.sqrt(
        Math.log(totalAttemptsForType + 1) / (stat.attempts + 1),
      )
      const latencyPenalty = Math.min(stat.avgLatencyMs / 30000, 1)
      const score = smoothedRate + 0.3 * explorationBonus - 0.1 * latencyPenalty
      return { ...stat, _score: score }
    })

    scored.sort((a, b) => b._score - a._score)

    const recs: ToolRecommendation[] = []
    const shouldExplore = Math.random() < this.epsilon && scored.length > 0

    if (shouldExplore && scored.length > 1) {
      const minTries = Math.min(...scored.map((s) => s.attempts))
      const explorables = scored.filter((s) => s.attempts <= minTries + 1)
      const explorePick = explorables[Math.floor(Math.random() * explorables.length)]!
      recs.push({
        toolName: explorePick.toolName,
        expectedSuccessRate: explorePick.successes / Math.max(explorePick.attempts, 1),
        avgLatencyMs: explorePick.avgLatencyMs,
        sampleCount: explorePick.attempts,
        reason: 'explore',
      })
    }

    for (const s of scored) {
      if (recs.length >= k) break
      if (recs.some((r) => r.toolName === s.toolName)) continue
      recs.push({
        toolName: s.toolName,
        expectedSuccessRate: s.successes / Math.max(s.attempts, 1),
        avgLatencyMs: s.avgLatencyMs,
        sampleCount: s.attempts,
        reason: 'exploit',
      })
    }

    return recs.slice(0, k)
  }

  /**
   * Get the full statistics snapshot across all task types.
   */
  getStats(): ToolStats {
    return {
      byTaskType: { ...this.stats },
      totalAttempts: this.totalAttempts,
      lastUpdated: this.lastUpdated,
    }
  }

  /**
   * Set the epsilon exploration rate.
   * @param value - New epsilon value (0..1)
   */
  setEpsilon(value: number): void {
    this.epsilon = Math.max(0, Math.min(1, value))
  }

  /**
   * Save statistics to a JSON file.
   *
   * @param filePath - Path to write; defaults to `<persistDir>/adaptive-tools.json` if persistToDisk was called
   */
  save(filePath?: string): void {
    const target = filePath ?? this.persistPath
    if (!target) throw new Error('No save path configured; call persistToDisk() or supply filePath')

    const serialized: SerializedStats = {
      byTaskType: {} as Record<string, Record<string, ToolStat>>,
      totalAttempts: this.totalAttempts,
      lastUpdated: this.lastUpdated,
      epsilon: this.epsilon,
    }
    for (const [taskType, bucket] of Object.entries(this.stats)) {
      serialized.byTaskType[taskType] = {}
      for (const [toolName, stat] of bucket) {
        serialized.byTaskType[taskType]![toolName] = stat
      }
    }

    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, JSON.stringify(serialized, null, 2), 'utf-8')
  }

  /**
   * Load statistics from a JSON file (merges with existing in-memory stats).
   *
   * @param filePath - Path to read
   */
  load(filePath: string): void {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as SerializedStats

    this.totalAttempts = data.totalAttempts ?? 0
    this.lastUpdated = data.lastUpdated ?? new Date().toISOString()
    this.epsilon = data.epsilon ?? 0.1

    for (const [taskType, tools] of Object.entries(data.byTaskType ?? {})) {
      const bucket = this.stats[taskType as TaskType]
      if (!bucket) continue
      for (const [toolName, stat] of Object.entries(tools)) {
        bucket.set(toolName, stat as ToolStat)
      }
    }

    this.persistPath = filePath
  }

  /**
   * Convenience: configure a default persistence directory and
   * auto-load existing stats if present.
   *
   * @param cwd - Working directory; stats stored in `.levelcode/adaptive-tools.json`
   */
  persistToDisk(cwd: string): void {
    this.persistPath = path
      .join(cwd, '.levelcode', 'adaptive-tools.json')
      .replace(/\\/g, '/')
    if (fs.existsSync(this.persistPath)) {
      this.load(this.persistPath)
    }
  }

  /**
   * Reset all statistics (useful for testing).
   */
  reset(): void {
    for (const key of Object.keys(this.stats) as TaskType[]) {
      this.stats[key] = new Map()
    }
    this.totalAttempts = 0
    this.lastUpdated = new Date().toISOString()
  }
}

let defaultSelector: AdaptiveToolSelector | null = null

export function getDefaultAdaptiveToolSelector(): AdaptiveToolSelector {
  if (!defaultSelector) defaultSelector = new AdaptiveToolSelector()
  return defaultSelector
}

export function resetDefaultAdaptiveToolSelector(): void {
  defaultSelector = null
}
