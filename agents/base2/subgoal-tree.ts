/**
 * Enhanced Subgoal Tree (#15)
 *
 * Builds on the basic Subgoal interface defined in base2-scaffold.ts and adds:
 * - **Dependency tracking** between subgoals (a subgoal can declare prerequisites
 *   that must complete before it becomes runnable).
 * - **Progress tracking** per subgoal (percent complete, start/end timestamps,
 *   attempt count, failure history).
 * - **Automatic replanning** when a subgoal fails — the tree marks dependent
 *   subgoals as blocked, generates alternative subgoals, and marks the tree
 *   as needing replanning.
 *
 * The module exports the {@link SubgoalNode} class, the {@link SubgoalTree}
 * orchestrator, and a set of type definitions used by base2 agents.
 *
 * @module agents/base2/subgoal-tree
 */

// ============================================================================
// Subgoal Types
// ============================================================================

/**
 * Status of a subgoal in the tree.
 */
export type SubgoalStatus =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'skipped'

/**
 * A single failure record for a subgoal.
 */
export interface FailureRecord {
  /** When the failure occurred (epoch ms). */
  at: number
  /** Human-readable error description. */
  error: string
  /** Optional error category (e.g. 'typecheck', 'test', 'review'). */
  category?: string
}

/**
 * Read-only snapshot of a subgoal's current state, suitable for logging
 * or serialization into prompts.
 */
export interface SubgoalSnapshot {
  id: string
  task: string
  status: SubgoalStatus
  /** 0.0–1.0 */
  progress: number
  /** 0.0–1.0 confidence this subgoal can be completed successfully. */
  confidence: number
  /** IDs of subgoals this subgoal depends on (must complete first). */
  dependsOn: string[]
  /** Number of times this subgoal has been attempted. */
  attempts: number
  /** Failure history (most recent last). */
  failures: FailureRecord[]
  /** When this subgoal was first marked in_progress (epoch ms), or null. */
  startedAt: number | null
  /** When this subgoal reached completed/failed/skipped (epoch ms), or null. */
  endedAt: number | null
  /** Child subgoals (tree structure). */
  children: SubgoalSnapshot[]
}

// ============================================================================
// SubgoalNode
// ============================================================================

/**
 * A single node in the subgoal tree.
 *
 * Each node has:
 * - An identity (id, task description)
 * - Dependency edges (dependsOn) pointing to other node ids
 * - Progress state (status, progress fraction, timestamps)
 * - Bookkeeping for retries (attempts, failures)
 */
export class SubgoalNode {
  readonly id: string
  readonly task: string
  confidence: number
  readonly children: SubgoalNode[] = []
  /** Parent reference, or null for the root. */
  parent: SubgoalNode | null = null

  status: SubgoalStatus = 'pending'
  /** 0.0–1.0 progress within this subgoal (0 = not started, 1 = complete). */
  progress: number = 0
  /** IDs of other SubgoalNodes that must be completed before this one can run. */
  dependsOn: Set<string> = new Set()

  attempts: number = 0
  failures: FailureRecord[] = []
  startedAt: number | null = null
  endedAt: number | null = null

  constructor(
    id: string,
    task: string,
    confidence: number = 0.8,
    dependsOn: string[] = [],
  ) {
    this.id = id
    this.task = task
    this.confidence = Math.max(0, Math.min(1, confidence))
    for (const dep of dependsOn) this.dependsOn.add(dep)
  }

  /**
   * Add a child subgoal, setting its parent reference.
   */
  addChild(child: SubgoalNode): void {
    child.parent = this
    this.children.push(child)
  }

  /**
   * Declare that this subgoal depends on another (by id).
   */
  addDependency(subgoalId: string): void {
    if (subgoalId !== this.id) this.dependsOn.add(subgoalId)
  }

  /**
   * Mark this subgoal as in-progress, starting the timer.
   */
  start(): void {
    if (this.status === 'completed' || this.status === 'skipped') return
    this.status = 'in_progress'
    if (this.startedAt === null) this.startedAt = Date.now()
    this.attempts += 1
  }

  /**
   * Update progress fraction (clamped to 0.0–1.0).
   */
  setProgress(p: number): void {
    this.progress = Math.max(0, Math.min(1, p))
  }

  /**
   * Mark this subgoal as successfully completed.
   */
  complete(): void {
    this.status = 'completed'
    this.progress = 1
    this.endedAt = Date.now()
  }

  /**
   * Record a failure. If the failure count exceeds the retry threshold, the
   * subgoal is marked as failed and dependents become blocked.
   *
   * @param error     - Description of what went wrong.
   * @param category  - Optional error category.
   * @param maxRetries - Maximum retry attempts before permanent failure (default 2).
   * @returns The new status after recording the failure.
   */
  fail(
    error: string,
    category?: string,
    maxRetries: number = 2,
  ): SubgoalStatus {
    this.failures.push({ at: Date.now(), error, category })

    if (this.attempts >= maxRetries) {
      this.status = 'failed'
      this.endedAt = Date.now()
    } else {
      this.status = 'pending'
      this.progress = 0
    }

    return this.status
  }

  /**
   * Skip this subgoal (e.g. because a prerequisite failed and it is no
   * longer relevant).
   */
  skip(): void {
    this.status = 'skipped'
    this.endedAt = Date.now()
  }

  /**
   * Reset the subgoal to pending state (used during replanning).
   */
  reset(): void {
    this.status = 'pending'
    this.progress = 0
    this.startedAt = null
    this.endedAt = null
  }

  /**
   * Produce a read-only snapshot of this node and its descendants.
   */
  snapshot(): SubgoalSnapshot {
    return {
      id: this.id,
      task: this.task,
      status: this.status,
      progress: this.progress,
      confidence: this.confidence,
      dependsOn: Array.from(this.dependsOn),
      attempts: this.attempts,
      failures: [...this.failures],
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      children: this.children.map((c) => c.snapshot()),
    }
  }
}

// ============================================================================
// SubgoalTree
// ============================================================================

/**
 * Callback invoked when a subgoal fails and the tree determines that
 * replanning is needed.
 */
export type ReplanCallback = (
  tree: SubgoalTree,
  failedNode: SubgoalNode,
) => SubgoalNode[] | void

/**
 * Orchestrates a tree of {@link SubgoalNode}s:
 * - Computes readiness based on dependency completion
 * - Tracks overall progress
 * - Detects failures and triggers automatic replanning
 */
export class SubgoalTree {
  /** Root of the tree. */
  readonly root: SubgoalNode
  /** All nodes indexed by id for O(1) lookup. */
  private readonly nodeIndex: Map<string, SubgoalNode> = new Map()
  /** Called when a subgoal fails and replanning is required. */
  private onReplan?: ReplanCallback
  /** Monotonically increasing counter for generating unique ids. */
  private idCounter = 0

  constructor(root: SubgoalNode) {
    this.root = root
    this.indexNode(root)
    this.recomputeReadiness()
  }

  /**
   * Install a replan callback that fires when a subgoal transitions to
   * `failed`. The callback can return new {@link SubgoalNode}s to append
   * to the failed node's parent as alternatives.
   */
  setReplanCallback(cb: ReplanCallback): void {
    this.onReplan = cb
  }

  /**
   * Look up a node by id.
   */
  getNode(id: string): SubgoalNode | undefined {
    return this.nodeIndex.get(id)
  }

  /**
   * Return all nodes in a flat array (depth-first pre-order).
   */
  getAllNodes(): SubgoalNode[] {
    const out: SubgoalNode[] = []
    const walk = (n: SubgoalNode) => {
      out.push(n)
      for (const c of n.children) walk(c)
    }
    walk(this.root)
    return out
  }

  /**
   * Return nodes that are currently `ready` (all dependencies completed
   * and node itself is pending/in_progress).
   */
  getReadySubgoals(): SubgoalNode[] {
    return this.getAllNodes().filter((n) => n.status === 'ready')
  }

  /**
   * Return subgoals that are currently `in_progress`.
   */
  getInProgressSubgoals(): SubgoalNode[] {
    return this.getAllNodes().filter((n) => n.status === 'in_progress')
  }

  /**
   * Return subgoals marked as `failed`.
   */
  getFailedSubgoals(): SubgoalNode[] {
    return this.getAllNodes().filter((n) => n.status === 'failed')
  }

  /**
   * Compute overall progress as the average of leaf-node progress values.
   */
  getOverallProgress(): number {
    const leaves = this.getAllNodes().filter((n) => n.children.length === 0)
    if (leaves.length === 0) return this.root.progress
    const total = leaves.reduce((sum, n) => sum + n.progress, 0)
    return total / leaves.length
  }

  /**
   * Whether every leaf node is in a terminal state (completed/skipped/failed).
   */
  isComplete(): boolean {
    return this.getAllNodes()
      .filter((n) => n.children.length === 0)
      .every((n) =>
        (['completed', 'skipped', 'failed'] as SubgoalStatus[]).includes(n.status),
      )
  }

  /**
   * Mark a node as started. Also marks ancestor nodes as in_progress if they
   * were still pending.
   */
  start(id: string): void {
    const node = this.nodeIndex.get(id)
    if (!node) return
    node.start()
    this.markAncestorsInProgress(node)
  }

  /**
   * Update a node's progress.
   */
  updateProgress(id: string, p: number): void {
    const node = this.nodeIndex.get(id)
    if (!node) return
    node.setProgress(p)
  }

  /**
   * Mark a node as completed. Recomputes readiness so any dependents that
   * now have all dependencies satisfied become `ready`.
   */
  complete(id: string): void {
    const node = this.nodeIndex.get(id)
    if (!node) return
    node.complete()
    this.recomputeReadiness()
    this.attemptParentCompletion(node.parent)
  }

  /**
   * Mark a node as failed. Blocks dependents and fires the replan callback
   * if one is installed.
   *
   * @param id       - Node id that failed.
   * @param error    - Description of the failure.
   * @param category - Optional error category.
   */
  fail(id: string, error: string, category?: string): void {
    const node = this.nodeIndex.get(id)
    if (!node) return
    const newStatus = node.fail(error, category)

    if (newStatus === 'failed') {
      this.blockDependents(node)
      if (this.onReplan) {
        const replacements = this.onReplan(this, node)
        if (replacements && replacements.length > 0 && node.parent) {
          for (const rep of replacements) {
            node.parent.addChild(rep)
            this.indexNode(rep)
          }
        }
      }
    }

    this.recomputeReadiness()
  }

  /**
   * Skip a node (e.g. after a parent subgoal was reworked).
   */
  skip(id: string): void {
    const node = this.nodeIndex.get(id)
    if (!node) return
    node.skip()
    for (const child of node.children) this.skip(child.id)
    this.recomputeReadiness()
  }

  /**
   * Recompute which nodes are `ready`. A node becomes ready when:
   * - It is currently `pending`
   * - All dependencies (dependsOn) are `completed`
   */
  recomputeReadiness(): void {
    for (const node of this.getAllNodes()) {
      if (node.status !== 'pending') continue
      const allDepsComplete = Array.from(node.dependsOn).every((depId) => {
        const dep = this.nodeIndex.get(depId)
        return dep && dep.status === 'completed'
      })
      if (allDepsComplete && node.dependsOn.size > 0) {
        node.status = 'ready'
      } else if (node.dependsOn.size === 0 && node.status === 'pending') {
        node.status = 'ready'
      }
    }
  }

  /**
   * Produce a hierarchical snapshot of the entire tree for logging/prompts.
   */
  snapshot(): SubgoalSnapshot {
    return this.root.snapshot()
  }

  /**
   * Render the tree as an indented text tree (useful for debug prompts).
   */
  render(showProgress: boolean = true): string {
    const lines: string[] = []
    const walk = (n: SubgoalNode, depth: number) => {
      const indent = '  '.repeat(depth)
      const statusChar = statusIcon(n.status)
      const progress = showProgress ? ` [${Math.round(n.progress * 100)}%]` : ''
      const deps = n.dependsOn.size > 0
        ? ` (depends on: ${Array.from(n.dependsOn).join(', ')})`
        : ''
      lines.push(
        `${indent}${statusChar} ${n.id}: ${n.task}${progress}${deps}`,
      )
      for (const c of n.children) walk(c, depth + 1)
    }
    walk(this.root, 0)
    return lines.join('\n')
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private indexNode(node: SubgoalNode): void {
    this.nodeIndex.set(node.id, node)
    for (const child of node.children) {
      child.parent = node
      this.indexNode(child)
    }
  }

  private markAncestorsInProgress(node: SubgoalNode): void {
    let p = node.parent
    while (p) {
      if (p.status === 'pending' || p.status === 'ready') {
        p.status = 'in_progress'
        if (p.startedAt === null) p.startedAt = Date.now()
      }
      p = p.parent
    }
  }

  private attemptParentCompletion(parent: SubgoalNode | null): void {
    if (!parent) return
    const nonLeafChildren = parent.children.filter((c) => c.children.length > 0)
    const leafChildren = parent.children.filter((c) => c.children.length === 0)
    const leavesDone = leafChildren.every((c) =>
      (['completed', 'skipped', 'failed'] as SubgoalStatus[]).includes(c.status),
    )
    if (leavesDone && nonLeafChildren.length === 0) {
      const hasFailure = leafChildren.some((c) => c.status === 'failed')
      if (hasFailure) {
        parent.status = 'failed'
      } else {
        parent.complete()
      }
      parent.endedAt = Date.now()
      this.attemptParentCompletion(parent.parent)
    }
  }

  private blockDependents(node: SubgoalNode): void {
    for (const candidate of this.getAllNodes()) {
      if (candidate.dependsOn.has(node.id) && candidate.status !== 'completed') {
        candidate.status = 'blocked'
        this.blockDependents(candidate)
      }
    }
  }

  /**
   * Generate a unique subgoal id.
   */
  nextId(prefix: string = 'sg'): string {
    this.idCounter += 1
    return `${prefix}-${this.idCounter}`
  }
}

// ============================================================================
// Helpers
// ============================================================================

function statusIcon(s: SubgoalStatus): string {
  switch (s) {
    case 'pending':
      return '○'
    case 'ready':
      return '◎'
    case 'in_progress':
      return '◐'
    case 'completed':
      return '●'
    case 'failed':
      return '✗'
    case 'blocked':
      return '⊘'
    case 'skipped':
      return '○'
    default:
      return '?'
  }
}

/**
 * Convenience factory: build a simple linear subgoal tree from an ordered
 * list of task descriptions, where each subgoal depends on the previous one.
 *
 * @param tasks - Ordered list of task descriptions.
 * @returns A fully-wired {@link SubgoalTree} with one leaf per task.
 */
export function buildLinearTree(tasks: string[]): SubgoalTree {
  const root = new SubgoalNode('root', 'Complete the user request', 0.95)
  let prevId: string | null = null
  let counter = 0

  for (const task of tasks) {
    counter += 1
    const id = `sg-${counter}`
    const node = new SubgoalNode(id, task, 0.75, prevId ? [prevId] : [])
    root.addChild(node)
    prevId = id
  }

  return new SubgoalTree(root)
}

// ============================================================================
// Default export
// ============================================================================

export default {
  SubgoalNode,
  SubgoalTree,
  buildLinearTree,
}
