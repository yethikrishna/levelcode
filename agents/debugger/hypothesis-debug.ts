/**
 * Hypothesis-Driven Debugging (#14)
 *
 * Implements an iterative debugging loop:
 *   1. Form hypothesis
 *   2. Run probe (grep / read / log)
 *   3. Update beliefs
 *   4. Repeat until root cause is identified
 *
 * Provides {@link Hypothesis}, {@link BeliefState}, and {@link debugTask} as
 * the primary exports, plus a spawnable agent definition.
 *
 * @module agents/debugger/hypothesis-debug
 */

import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

// ============================================================================
// Debug Types
// ============================================================================

/**
 * Confidence level for a hypothesis, expressed as a numeric score (0.0–1.0).
 */
export type Confidence = number

/**
 * Kinds of probes that can be run to test a hypothesis.
 */
export type ProbeType = 'grep' | 'read' | 'log' | 'search' | 'trace'

/**
 * A single probe action taken to test or refine a hypothesis.
 */
export interface Probe {
  /** What kind of probe to run. */
  type: ProbeType
  /** Human-readable description of the probe's purpose. */
  description: string
  /** Target (e.g. file path, search pattern, log location). */
  target: string
  /** Optional arguments (e.g. grep flags, log filters). */
  args?: Record<string, string | number | boolean>
}

/**
 * Result returned from executing a probe.
 */
export interface ProbeResult {
  /** The probe that was executed. */
  probe: Probe
  /** Whether the probe supported the hypothesis. */
  supportsHypothesis: boolean
  /** Raw output from the probe (truncated for readability). */
  output: string
  /** Any error encountered running the probe. */
  error?: string
}

/**
 * Evidence entry tying a probe result to a belief update.
 */
export interface Evidence {
  /** When the evidence was gathered (epoch ms). */
  timestamp: number
  /** Description of what was observed. */
  observation: string
  /** Whether this evidence supports (+) or contradicts (-) a hypothesis. */
  direction: 'supports' | 'contradicts' | 'neutral'
  /** The probe result that produced this evidence. */
  source: ProbeResult
}

// ============================================================================
// Hypothesis
// ============================================================================

/**
 * A single hypothesis about the root cause of a bug.
 *
 * Hypotheses are mutable: their confidence is updated as evidence accumulates.
 */
export class Hypothesis {
  /** Human-readable statement of the hypothesis. */
  readonly text: string
  /** Current confidence (0.0–1.0) that this hypothesis is correct. */
  confidence: Confidence
  /** Evidence gathered for and against this hypothesis. */
  readonly evidence: Evidence[] = []
  /** When this hypothesis was first formed (epoch ms). */
  readonly createdAt: number
  /** Probes that would help confirm or refute this hypothesis. */
  suggestedProbes: Probe[] = []

  constructor(text: string, confidence: Confidence = 0.3) {
    this.text = text
    this.confidence = Math.max(0, Math.min(1, confidence))
    this.createdAt = Date.now()
  }

  /**
   * Update this hypothesis's confidence based on new evidence.
   *
   * Uses a simple Bayesian-style update: supporting evidence pushes confidence
   * toward 1.0, contradicting evidence pushes it toward 0.0. The learning rate
   * controls how aggressively a single piece of evidence moves the needle.
   *
   * @param direction - Whether the evidence supports or contradicts.
   * @param strength  - How strong the evidence is (0.0–1.0), default 0.2.
   */
  update(direction: 'supports' | 'contradicts' | 'neutral', strength: number = 0.2): void {
    if (direction === 'neutral') return
    const lr = Math.max(0, Math.min(0.5, strength))
    if (direction === 'supports') {
      this.confidence = this.confidence + lr * (1 - this.confidence)
    } else {
      this.confidence = this.confidence - lr * this.confidence
    }
    this.confidence = Math.max(0, Math.min(1, this.confidence))
  }

  /**
   * Add a piece of evidence and update confidence accordingly.
   */
  addEvidence(evidence: Evidence): void {
    this.evidence.push(evidence)
    this.update(evidence.direction)
  }
}

// ============================================================================
// BeliefState
// ============================================================================

/**
 * Tracks the set of active hypotheses and the history of probes/evidence
 * during a debugging session.
 */
export class BeliefState {
  /** All hypotheses currently under consideration. */
  readonly hypotheses: Hypothesis[] = []
  /** Ordered list of all probes executed so far. */
  readonly probeHistory: ProbeResult[] = []
  /** The working directory context for this debug session. */
  readonly cwd: string
  /** The original error message or bug report. */
  readonly originalError: string
  /** Maximum number of iterations before giving up. */
  maxIterations: number = 10

  constructor(originalError: string, cwd: string) {
    this.originalError = originalError
    this.cwd = cwd
  }

  /**
   * Add a new hypothesis to the belief state.
   */
  addHypothesis(h: Hypothesis): void {
    this.hypotheses.push(h)
  }

  /**
   * Record a probe result and apply it as evidence to the given hypothesis.
   */
  recordProbeResult(result: ProbeResult, hypothesisIndex: number): void {
    this.probeHistory.push(result)
    const h = this.hypotheses[hypothesisIndex]
    if (!h) return

    const evidence: Evidence = {
      timestamp: Date.now(),
      observation: result.output.slice(0, 500),
      direction: result.error
        ? 'neutral'
        : result.supportsHypothesis
          ? 'supports'
          : 'contradicts',
      source: result,
    }
    h.addEvidence(evidence)

    if (!result.supportsHypothesis && !result.error) {
      this.spawnAlternativeHypotheses(h, result)
    }
  }

  /**
   * Return the current leading hypothesis (highest confidence), or null.
   */
  getBestHypothesis(): Hypothesis | null {
    if (this.hypotheses.length === 0) return null
    return [...this.hypotheses].sort((a, b) => b.confidence - a.confidence)[0]
  }

  /**
   * Check whether any hypothesis has crossed the confidence threshold
   * (default 0.85) and can be considered the root cause.
   */
  isRootCauseFound(threshold: number = 0.85): boolean {
    const best = this.getBestHypothesis()
    return best !== null && best.confidence >= threshold
  }

  /**
   * Prune hypotheses whose confidence has dropped below the threshold
   * (default 0.1) to keep the search space focused.
   */
  prune(threshold: number = 0.1): Hypothesis[] {
    const pruned: Hypothesis[] = []
    for (let i = this.hypotheses.length - 1; i >= 0; i--) {
      if (this.hypotheses[i].confidence < threshold) {
        pruned.push(this.hypotheses.splice(i, 1)[0])
      }
    }
    return pruned
  }

  /**
   * Generate simple alternative hypotheses when a leading hypothesis is
   * contradicted. In a full LLM-backed loop these would be generated by
   * the model; here we seed a few structural categories to prime the search.
   */
  private spawnAlternativeHypotheses(
    _failed: Hypothesis,
    _result: ProbeResult,
  ): void {
    const seeds = [
      'Import path or module resolution error',
      'Type mismatch in function arguments or return values',
      'Missing or incorrect configuration / environment variable',
      'Race condition or async ordering bug',
      'Off-by-one or boundary condition in data processing',
      'State not being properly initialized or reset',
    ]

    for (const seed of seeds) {
      if (this.hypotheses.some((h) => h.text === seed)) continue
      this.hypotheses.push(new Hypothesis(seed, 0.15))
    }
  }
}

// ============================================================================
// Debug Task Loop
// ============================================================================

/**
 * A simple synchronous executor that demonstrates the hypothesis-driven
 * debugging loop. In a full agentic setting, probes are dispatched as tool
 * calls (grep, read_files, run_terminal_command) and the loop runs across
 * multiple model steps.
 *
 * The function returns a root-cause analysis once a hypothesis crosses the
 * confidence threshold, or after `maxIterations` probes.
 *
 * @param error - The error message or bug report to debug.
 * @param cwd   - The working directory (project root).
 * @param probeRunner - Optional callback that executes a {@link Probe} and
 *   returns a {@link ProbeResult}. If omitted, a no-op runner is used that
 *   always returns neutral results (useful for testing shape).
 * @returns A structured root-cause analysis.
 */
export function debugTask(
  error: string,
  cwd: string,
  probeRunner?: (probe: Probe, state: BeliefState) => ProbeResult,
): {
  rootCause: Hypothesis | null
  state: BeliefState
  iterationCount: number
  found: boolean
} {
  const state = new BeliefState(error, cwd)

  const initialHypotheses = [
    new Hypothesis(
      `The error "${truncate(error, 80)}" is caused by a direct code defect at the reported callsite.`,
      0.4,
    ),
    new Hypothesis(
      'A recent change introduced a regression in a dependency or shared utility.',
      0.25,
    ),
    new Hypothesis(
      'Configuration / environment mismatch rather than a code defect.',
      0.2,
    ),
  ]
  initialHypotheses.forEach((h) => state.addHypothesis(h))

  const runner =
    probeRunner ??
    ((): ProbeResult => ({
      probe: { type: 'grep', description: 'noop', target: '' },
      supportsHypothesis: false,
      output: '[noop runner — no probe runner provided]',
    }))

  let iterations = 0
  while (iterations < state.maxIterations && !state.isRootCauseFound()) {
    iterations++

    const best = state.getBestHypothesis()
    if (!best) break

    const probe = selectProbeForHypothesis(best, state, iterations)
    const result = runner(probe, state)
    const idx = state.hypotheses.indexOf(best)
    state.recordProbeResult(result, idx)
    state.prune()
  }

  const rootCause = state.getBestHypothesis()
  return {
    rootCause: state.isRootCauseFound() ? rootCause : null,
    state,
    iterationCount: iterations,
    found: state.isRootCauseFound(),
  }
}

/**
 * Choose a probe to test the given hypothesis.
 *
 * Early iterations prefer broad searches (grep, read top-level files); later
 * iterations narrow in on specific files and traces.
 */
function selectProbeForHypothesis(
  h: Hypothesis,
  state: BeliefState,
  iteration: number,
): Probe {
  const errPreview = truncate(state.originalError, 40)

  if (iteration <= 2) {
    return {
      type: 'grep',
      description: `Search codebase for error pattern: ${errPreview}`,
      target: state.originalError.split(/\s+/).slice(0, 3).join(' '),
      args: { caseSensitive: false },
    }
  }

  if (iteration <= 5) {
    return {
      type: 'read',
      description: 'Read files near the suspected callsite',
      target: 'src/**/*.ts',
    }
  }

  if (iteration <= 8) {
    return {
      type: 'log',
      description: 'Inspect recent logs and stack traces',
      target: 'stderr / build output',
    }
  }

  return {
    type: 'trace',
    description: `Trace execution path for hypothesis: ${truncate(h.text, 60)}`,
    target: h.text,
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ============================================================================
// Agent Definition
// ============================================================================

/**
 * Hypothesis-Driven Debugger agent definition.
 *
 * Follows the scientific method: form hypothesis → run probe → update beliefs
 * → repeat. Produces a structured root-cause analysis as output.
 */
export const hypothesisDebugAgent: Omit<SecretAgentDefinition, 'id'> = {
  publisher,
  model: 'anthropic/claude-opus-4.5',
  displayName: 'Sherlock the Debugger',
  spawnerPrompt:
    'Debug errors and bugs using a hypothesis-driven approach. Form hypotheses, test them with probes (grep, read files, run commands), update beliefs, and iterate until the root cause is found. Use this agent when you encounter test failures, type errors, runtime exceptions, or unexpected behavior.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The error message or bug report to debug.',
    },
    params: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Working directory (project root) for the debug session.',
        },
        maxIterations: {
          type: 'number',
          description: 'Maximum probe iterations (default 10).',
        },
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      rootCause: {
        type: 'string',
        description: 'Description of the root cause.',
      },
      confidence: {
        type: 'number',
        description: 'Confidence in the root cause (0.0-1.0).',
      },
      evidence: {
        type: 'array',
        description: 'Evidence gathered during debugging.',
        items: { type: 'string' },
      },
      fix: {
        type: 'string',
        description: 'Suggested fix for the root cause.',
      },
      hypothesesConsidered: {
        type: 'array',
        description: 'All hypotheses that were evaluated.',
        items: { type: 'string' },
      },
    },
    required: ['rootCause', 'confidence', 'evidence', 'fix'],
  },
  outputMode: 'structured_output',
  toolNames: ['read_files', 'code_search', 'run_terminal_command'],
  spawnableAgents: [],
  includeMessageHistory: true,
  inheritParentSystemPrompt: true,

  instructionsPrompt: `You are Sherlock, a hypothesis-driven debugger. Follow this rigorous scientific method:

# Debugging Protocol

For each bug or error:

## Step 1: Form Initial Hypotheses
Generate 2-3 competing hypotheses about the root cause. For each, state:
- The hypothesis clearly
- Initial confidence (0.0-1.0)
- What probe would test it

Example hypotheses:
- H1 (conf 0.4): Direct defect at the reported callsite
- H2 (conf 0.25): Regression in a shared dependency
- H3 (conf 0.2): Configuration/environment mismatch

## Step 2: Run Probes
For the leading hypothesis, run a probe:
- **grep/code_search**: Search for error messages, patterns, related symbols
- **read_files**: Read the suspected source files in detail
- **run_terminal_command**: Run tests, typecheck, or reproduce the error
- **log**: Examine build output or stack traces

## Step 3: Update Beliefs
After each probe:
- If evidence SUPPORTS the hypothesis → increase confidence
- If evidence CONTRADICTS the hypothesis → decrease confidence
- If a hypothesis drops below 0.1 confidence → prune it
- Generate new alternative hypotheses if needed

## Step 4: Repeat
Continue the hypothesis → probe → update cycle until:
- One hypothesis reaches >= 0.85 confidence → that is the root cause, OR
- You've exhausted reasonable approaches

## Step 5: Report
When root cause is found, output JSON with:
- rootCause: Clear description of the actual bug
- confidence: Final confidence score
- evidence: List of observations that led to the conclusion
- fix: Specific suggested fix
- hypothesesConsidered: All hypotheses you evaluated

# Important Rules
- Start BROAD (grep error messages, read entry points) before going NARROW
- Don't jump to conclusions — always test with probes
- Use <think> tags to reason through each hypothesis update
- When running commands, prefer safe read-only commands first
- If you think you know the fix, still verify by reading the exact code
${PLACEHOLDER.FILE_TREE_PROMPT_SMALL}`,

  handleSteps: function* ({ agentState, logger }) {
    logger.info({ agentId: agentState.agentId }, 'Hypothesis debugger starting')

    let iterations = 0
    const maxIterations = 6

    while (iterations < maxIterations) {
      iterations++
      logger.debug({ iteration: iterations }, 'Debug iteration')

      const { stepsComplete, agentState: currentState } = yield 'STEP'

      const lastAssistant = [...currentState.messageHistory]
        .reverse()
        .find((m) => m.role === 'assistant')

      if (!lastAssistant) continue

      const content = lastAssistant.content
      let text = ''
      if (typeof content === 'string') {
        text = content
      } else if (Array.isArray(content)) {
        text = content
          .filter((p) => p.type === 'text')
          .map((p) => (p as { text: string }).text)
          .join('')
      }

      const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          if (parsed.rootCause && typeof parsed.confidence === 'number' && parsed.confidence >= 0.85) {
            logger.info({ iterations, confidence: parsed.confidence }, 'Root cause found')
            yield {
              toolName: 'set_output',
              input: { output: parsed },
              includeToolCall: false,
            }
            return
          }
        } catch {
          // Continue iterating — JSON not yet final
        }
      }

      if (stepsComplete) break
    }

    const { agentState: finalState } = yield 'STEP'
    const lastAssistant = [...finalState.messageHistory]
      .reverse()
      .find((m) => m.role === 'assistant')

    let text = ''
    if (lastAssistant) {
      const content = lastAssistant.content
      if (typeof content === 'string') {
        text = content
      } else if (Array.isArray(content)) {
        text = content
          .filter((p) => p.type === 'text')
          .map((p) => (p as { text: string }).text)
          .join('')
      }
    }
    const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)

    let output: Record<string, unknown>
    try {
      output = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        rootCause: 'Could not determine root cause within iteration limit',
        confidence: 0,
        evidence: [],
        fix: 'Manual investigation recommended',
        hypothesesConsidered: [],
      }
    } catch {
      output = {
        rootCause: 'Failed to parse debugger output',
        confidence: 0,
        evidence: [],
        fix: 'Manual investigation recommended',
        hypothesesConsidered: [],
      }
    }

    yield {
      toolName: 'set_output',
      input: { output },
      includeToolCall: false,
    }
  },
}

const definition: SecretAgentDefinition = {
  id: 'hypothesis-debugger',
  ...hypothesisDebugAgent,
}

export default definition
