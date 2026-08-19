/**
 * Tree-of-Thought Planner (#11)
 *
 * Implements Tree-of-Thought reasoning for coding tasks. The planner generates
 * multiple candidate plan branches, scores each on confidence/completeness/risk,
 * selects the best plan, and supports backtracking/replanning when feedback is
 * received.
 *
 * @module agents/planner/tot-planner
 */

import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

// ============================================================================
// Plan Types
// ============================================================================

/**
 * Represents a single step within a plan branch.
 */
export interface PlanStep {
  /** Unique identifier for the step. */
  id: string
  /** Human-readable description of the step. */
  action: string
  /** The specific tool or agent to invoke (e.g. 'spawn_agents', 'read_files'). */
  tool?: string
  /** Optional file paths or targets this step operates on. */
  targets?: string[]
  /** Per-step confidence (0.0–1.0). */
  confidence: number
}

/**
 * Score breakdown for a plan, produced by {@link TreeOfThoughtPlanner.scorePlan}.
 */
export interface PlanScore {
  /** Overall confidence that the plan will succeed (0.0–1.0). */
  confidence: number
  /** Fraction of the task requirements the plan covers (0.0–1.0). */
  completeness: number
  /** Inverse risk level: higher = safer (0.0–1.0). */
  riskSafety: number
  /** Weighted aggregate score used for ranking. */
  aggregate: number
  /** Human-readable explanation of the score. */
  rationale: string[]
}

/**
 * A candidate plan branch in the Tree-of-Thought search.
 */
export interface PlanBranch {
  /** Unique branch identifier. */
  id: string
  /** Short, descriptive name for this branch. */
  name: string
  /** Ordered steps the branch proposes to take. */
  steps: PlanStep[]
  /** Score assigned by the scoring function (if scored). */
  score?: PlanScore
  /** Parent branch id (null for root-level candidates). */
  parentId: string | null
  /** Depth in the thought tree (0 for initial candidates). */
  depth: number
}

/**
 * Feedback signal used to trigger backtracking / replanning.
 */
export interface PlanFeedback {
  /** Whether the plan or a step failed. */
  success: boolean
  /** Which step id failed, if applicable. */
  failedStepId?: string
  /** Free-text description of what went wrong. */
  message: string
  /** Any additional context (e.g. error output). */
  context?: Record<string, unknown>
}

// ============================================================================
// Tree-of-Thought Planner
// ============================================================================

/**
 * Default weights used when computing the aggregate score.
 */
const DEFAULT_WEIGHTS = {
  confidence: 0.45,
  completeness: 0.35,
  riskSafety: 0.2,
} as const

/**
 * Tree-of-Thought Planner.
 *
 * Generates `n` candidate plan branches for a given task, scores each branch
 * across multiple dimensions, selects the highest-scoring branch, and supports
 * backtracking and replanning when execution encounters failures.
 */
export class TreeOfThoughtPlanner {
  private branchCounter = 0
  private stepCounter = 0
  private readonly history: PlanBranch[] = []
  private readonly weights = DEFAULT_WEIGHTS

  /**
   * Generate `n` candidate plan branches for the given task description.
   *
   * In a full LLM-backed implementation each branch would be produced by a
   * separate model call with different reasoning seeds; here we produce a
   * deterministic structured set of branches that the agent can refine via
   * its own reasoning loop.
   *
   * @param task - The task description / user request.
   * @param n - Number of candidate branches to generate (default 3).
   * @returns An array of unscored {@link PlanBranch} candidates.
   */
  generatePlans(task: string, n: number = 3): PlanBranch[] {
    const strategies = [
      'direct-implementation',
      'incremental-explore-first',
      'conservative-validate-first',
    ]

    const branches: PlanBranch[] = []
    for (let i = 0; i < n; i++) {
      const strategy = strategies[i % strategies.length]
      const branch = this.buildBranch(task, strategy, i)
      branches.push(branch)
      this.history.push(branch)
    }
    return branches
  }

  /**
   * Score a plan branch across confidence, completeness, and risk dimensions.
   *
   * @param plan - The plan branch to evaluate.
   * @returns A {@link PlanScore} with per-dimension scores and rationale.
   */
  scorePlan(plan: PlanBranch): PlanScore {
    const rationale: string[] = []

    const stepCount = plan.steps.length
    const avgStepConfidence =
      stepCount === 0
        ? 0
        : plan.steps.reduce((sum, s) => sum + s.confidence, 0) / stepCount

    const confidence = this.clamp(avgStepConfidence)
    rationale.push(
      `Average step confidence across ${stepCount} steps: ${confidence.toFixed(2)}`,
    )

    const hasExplore = plan.steps.some((s) =>
      /explore|read|search|gather/i.test(s.action),
    )
    const hasImplement = plan.steps.some((s) =>
      /implement|edit|write|str_replace|write_file/i.test(s.action),
    )
    const hasValidate = plan.steps.some((s) =>
      /verify|test|review|typecheck|validate/i.test(s.action),
    )

    let completeness = 0
    if (hasExplore) completeness += 0.34
    if (hasImplement) completeness += 0.33
    if (hasValidate) completeness += 0.33
    completeness = this.clamp(completeness)
    rationale.push(
      `Pipeline coverage — explore:${hasExplore} implement:${hasImplement} validate:${hasValidate}`,
    )

    const hasDestructive = plan.steps.some((s) =>
      /delete|rm |git push|force|drop/i.test(s.action),
    )
    const riskSafety = hasDestructive ? 0.4 : 0.85
    rationale.push(
      hasDestructive
        ? 'Plan contains potentially destructive actions — risk elevated'
        : 'No obviously destructive actions detected — risk acceptable',
    )

    const aggregate = this.clamp(
      confidence * this.weights.confidence +
        completeness * this.weights.completeness +
        riskSafety * this.weights.riskSafety,
    )

    const score: PlanScore = {
      confidence,
      completeness,
      riskSafety,
      aggregate,
      rationale,
    }

    plan.score = score
    return score
  }

  /**
   * Select the best-scoring plan from a set of candidates.
   *
   * @param plans - Candidate plan branches.
   * @returns The plan with the highest aggregate score, or `null` if empty.
   */
  selectBestPlan(plans: PlanBranch[]): PlanBranch | null {
    if (plans.length === 0) return null

    let best: PlanBranch | null = null
    let bestScore = -Infinity

    for (const plan of plans) {
      const score = plan.score ?? this.scorePlan(plan)
      if (score.aggregate > bestScore) {
        bestScore = score.aggregate
        best = plan
      }
    }
    return best
  }

  /**
   * Replan after receiving feedback about a plan's execution.
   *
   * If a specific step failed, the planner backtracks to the parent branch
   * (or generates new alternatives if already at root) and produces revised
   * candidates.
   *
   * @param plan - The plan that was being executed.
   * @param feedback - Feedback about success/failure.
   * @returns A new array of candidate {@link PlanBranch} replacements.
   */
  replanIfNeeded(plan: PlanBranch, feedback: PlanFeedback): PlanBranch[] {
    if (feedback.success) {
      return [plan]
    }

    const backtrackLevel = feedback.failedStepId
      ? Math.max(0, plan.depth - 1)
      : 0

    const revised: PlanBranch[] = []
    for (let i = 0; i < 2; i++) {
      const branch: PlanBranch = {
        id: `branch-${++this.branchCounter}`,
        name: `${plan.name}-retry-${i + 1}`,
        parentId: plan.parentId,
        depth: backtrackLevel,
        steps: this.buildRecoveredSteps(plan, feedback, i),
      }
      this.scorePlan(branch)
      revised.push(branch)
      this.history.push(branch)
    }
    return revised
  }

  /**
   * Return all plan branches ever generated by this planner instance.
   */
  getHistory(): readonly PlanBranch[] {
    return this.history
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private buildBranch(
    task: string,
    strategy: string,
    index: number,
  ): PlanBranch {
    const baseSteps: PlanStep[] = []
    const branchId = `branch-${++this.branchCounter}`

    switch (strategy) {
      case 'direct-implementation':
        baseSteps.push(
          this.mkStep('Read relevant files to understand context', 'read_files', 0.8),
          this.mkStep(`Implement: ${task}`, 'spawn_agents', 0.75),
          this.mkStep('Verify changes with typecheck/tests', 'verify_changes', 0.7),
        )
        break

      case 'incremental-explore-first':
        baseSteps.push(
          this.mkStep('Run repo_map to understand codebase structure', 'repo_map', 0.9),
          this.mkStep('Search for similar patterns in codebase', 'code_search', 0.85),
          this.mkStep('Read identified files in detail', 'read_files', 0.85),
          this.mkStep('Spawn thinker to plan implementation', 'spawn_agents', 0.8),
          this.mkStep(`Implement incrementally: ${task}`, 'str_replace', 0.7),
          this.mkStep('Run code-reviewer on changes', 'spawn_agents', 0.75),
          this.mkStep('Verify changes', 'verify_changes', 0.7),
        )
        break

      case 'conservative-validate-first':
      default:
        baseSteps.push(
          this.mkStep('Gather full context (map + search + read)', 'repo_map', 0.9),
          this.mkStep('Validate assumptions with researcher', 'spawn_agents', 0.8),
          this.mkStep('Write todos before editing', 'write_todos', 0.95),
          this.mkStep(`Implement: ${task}`, 'spawn_agents', 0.75),
          this.mkStep('Self-critique the diff', 'spawn_agents', 0.8),
          this.mkStep('Run verify_changes', 'verify_changes', 0.75),
          this.mkStep('Run full test suite', 'run_terminal_command', 0.7),
        )
        break
    }

    return {
      id: branchId,
      name: strategy,
      steps: baseSteps,
      parentId: null,
      depth: 0,
    }
  }

  private buildRecoveredSteps(
    original: PlanBranch,
    feedback: PlanFeedback,
    variant: number,
  ): PlanStep[] {
    const prefix = original.steps
      .slice(
        0,
        feedback.failedStepId
          ? original.steps.findIndex((s) => s.id === feedback.failedStepId)
          : 0,
      )
      .map((s) => ({ ...s }))

    const recoverySteps: PlanStep[] =
      variant === 0
        ? [
            this.mkStep(
              `Investigate failure: ${feedback.message}`,
              'code_search',
              0.7,
            ),
            this.mkStep('Read affected files for root cause', 'read_files', 0.75),
            this.mkStep('Apply fix with editor agent', 'spawn_agents', 0.65),
            this.mkStep('Re-verify changes', 'verify_changes', 0.7),
          ]
        : [
            this.mkStep(
              `Backtrack and re-plan: ${feedback.message}`,
              'write_todos',
              0.75,
            ),
            this.mkStep('Gather additional context', 'code_search', 0.8),
            this.mkStep('Spawn thinker for alternative approach', 'spawn_agents', 0.7),
            this.mkStep('Implement revised solution', 'spawn_agents', 0.65),
            this.mkStep('Full verification cycle', 'verify_changes', 0.7),
          ]

    return [...prefix, ...recoverySteps]
  }

  private mkStep(
    action: string,
    tool: string | undefined,
    confidence: number,
    targets?: string[],
  ): PlanStep {
    return {
      id: `step-${++this.stepCounter}`,
      action,
      tool,
      targets,
      confidence: this.clamp(confidence),
    }
  }

  private clamp(v: number): number {
    return Math.max(0, Math.min(1, v))
  }
}

// ============================================================================
// Agent Definition
// ============================================================================

/**
 * Tree-of-Thought Planner agent definition.
 *
 * This agent generates multiple candidate plans for a coding task, scores
 * them, and returns the best plan as structured output. It is intended to
 * be spawned by orchestrator agents (like base2) before implementation begins.
 */
export const totPlannerAgent: Omit<SecretAgentDefinition, 'id'> = {
  publisher,
  model: 'anthropic/claude-opus-4.5',
  displayName: 'Arbor the Tree-of-Thought Planner',
  spawnerPrompt:
    'Generate and evaluate multiple candidate plans for a coding task using Tree-of-Thought reasoning. Spawn this agent when faced with a complex or ambiguous task where multiple approaches are possible and you want to compare alternatives before implementing.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The coding task to plan for.',
    },
    params: {
      type: 'object',
      properties: {
        branchCount: {
          type: 'number',
          description: 'Number of candidate plan branches to generate (default 3).',
        },
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      selectedPlan: {
        type: 'object',
        description: 'The highest-scoring plan branch.',
      },
      alternatives: {
        type: 'array',
        description: 'Alternative candidate plans that were considered.',
      },
      rationale: {
        type: 'string',
        description: 'Why the selected plan was chosen.',
      },
    },
  },
  outputMode: 'structured_output',
  toolNames: [],
  spawnableAgents: [],
  includeMessageHistory: true,
  inheritParentSystemPrompt: false,

  systemPrompt: `You are Arbor, a Tree-of-Thought planning specialist. When given a coding task, you generate ${PLACEHOLDER.AGENT_NAME} distinct candidate plans (branches), evaluate each against confidence, completeness, and risk, and select the best plan.

# Planning Protocol

1. **Generate branches**: Produce ${PLACEHOLDER.AGENT_NAME} different approaches:
   - Branch A: Direct implementation (fast, higher risk)
   - Branch B: Incremental with exploration first (balanced)
   - Branch C: Conservative with heavy validation (safe, slower)

2. **Score each branch** on three dimensions (0.0-1.0):
   - **Confidence**: How likely is this approach to succeed given known codebase patterns?
   - **Completeness**: Does the plan cover exploration, implementation, AND verification?
   - **Risk safety**: Does it avoid destructive operations and minimize irreversible changes?

3. **Select the best branch** using weighted scoring: 45% confidence, 35% completeness, 20% risk safety.

4. **Output structured JSON** with the selected plan, alternatives, and rationale.

# Important
- Think about the specific files, tools, and agents that would be involved.
- Do NOT actually implement anything — you are only planning.
- Use <think> tags to reason through each branch before scoring.
${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}
${PLACEHOLDER.FILE_TREE_PROMPT_SMALL}`,

  instructionsPrompt: `Generate ${PLACEHOLDER.AGENT_NAME} candidate plans for the user's request, score them, and select the best. Output ONLY valid JSON matching the output schema — no prose outside the JSON.`,

  handleSteps: function* ({ agentState, logger }) {
    logger.info({ agentId: agentState.agentId }, 'ToT Planner starting')

    const { agentState: afterStep } = yield 'STEP'

    const lastAssistant = [...afterStep.messageHistory]
      .reverse()
      .find((m) => m.role === 'assistant')

    let rawText = ''
    if (lastAssistant) {
      const content = lastAssistant.content
      if (typeof content === 'string') {
        rawText = content
      } else if (Array.isArray(content)) {
        rawText = content
          .filter((p) => p.type === 'text')
          .map((p) => (p as { text: string }).text)
          .join('')
      }
    }

    const cleaned = rawText.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    let parsedOutput: Record<string, unknown>
    try {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      parsedOutput = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : { error: 'No JSON found in planner output', raw: cleaned }
    } catch {
      parsedOutput = { error: 'Failed to parse planner JSON', raw: cleaned }
    }

    yield {
      toolName: 'set_output',
      input: { output: parsedOutput },
      includeToolCall: false,
    }
  },
}

const definition: SecretAgentDefinition = {
  id: 'tot-planner',
  ...totPlannerAgent,
}

export default definition
