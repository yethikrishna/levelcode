import { createBase2 } from './base2'
import { SubgoalNode, SubgoalTree, buildLinearTree } from './subgoal-tree'

/**
 * base2-scaffold (Berserk Iteration 3, upgraded in Berserk Iteration 7+)
 * Planning layer with subgoal tree, confidence scoring, dependency tracking,
 * progress tracking, and automatic replanning on failure.
 *
 * The canonical subgoal tree implementation now lives in ./subgoal-tree.ts
 * (see {@link SubgoalNode} and {@link SubgoalTree}). This file re-exports a
 * backward-compatible `Subgoal` interface and wires a default planning tree
 * that uses the new implementation under the hood.
 */

/**
 * Legacy Subgoal interface — kept for backward compatibility with prompt
 * schemas. Prefer {@link SubgoalNode} for programmatic use, as it adds
 * dependency tracking (`dependsOn`), progress tracking, failure history,
 * and automatic replanning support.
 */
interface Subgoal {
  id: string
  task: string
  confidence: number // 0.0 - 1.0
  children: Subgoal[]
  status?: 'pending' | 'in_progress' | 'completed' | 'blocked'
}

/**
 * Build the default planning tree using the enhanced {@link SubgoalTree}.
 * This demonstrates dependency wiring: `validate` depends on both `decompose`
 * and `context` completing first.
 */
function buildDefaultPlanningTree(): SubgoalTree {
  const root = new SubgoalNode('root', 'Analyze and plan coding task', 0.95)

  const decompose = new SubgoalNode(
    'decompose',
    'Decompose into subgoals',
    0.85,
  )
  const context = new SubgoalNode(
    'context',
    'Identify GCC context integration points',
    0.80,
  )
  const validate = new SubgoalNode(
    'validate',
    'Validate plan feasibility and risks',
    0.75,
    ['decompose', 'context'],
  )

  root.addChild(decompose)
  root.addChild(context)
  root.addChild(validate)

  return new SubgoalTree(root)
}

const defaultPlanningTree = buildDefaultPlanningTree()

/**
 * Install a replan callback on the default tree: when a subgoal fails,
 * generate a recovery child that re-runs context gathering with reduced
 * confidence and re-enters validation.
 */
defaultPlanningTree.setReplanCallback((tree, failed) => {
  const recoverId = tree.nextId('recover')
  const recovery = new SubgoalNode(
    recoverId,
    `Recover from failure in "${failed.task}": gather additional context and replan`,
    Math.max(0.3, failed.confidence - 0.2),
    [],
  )
  const revalId = tree.nextId('reval')
  const revalidate = new SubgoalNode(
    revalId,
    'Re-validate plan after recovery',
    0.65,
    [recoverId],
  )
  return [recovery, revalidate]
})

const definition = {
  ...createBase2('default', { planOnly: true }),
  id: 'base2-scaffold',
  displayName: 'Berserk Base2 Scaffold',
  // Enhanced subgoal tree with dependency tracking, progress, auto-replan
  planningTree: defaultPlanningTree,
  // Legacy-shaped tree snapshot kept for prompt/serialization compatibility
  planningTreeLegacy: {
    root: {
      id: 'root',
      task: 'Analyze and plan coding task',
      confidence: 0.95,
      status: 'pending',
      children: [
        {
          id: 'decompose',
          task: 'Decompose into subgoals',
          confidence: 0.85,
          status: 'pending',
          children: [],
        },
        {
          id: 'context',
          task: 'Identify GCC context integration points',
          confidence: 0.80,
          status: 'pending',
          children: [],
        },
        {
          id: 'validate',
          task: 'Validate plan feasibility and risks',
          confidence: 0.75,
          status: 'pending',
          children: [],
        },
      ],
    } satisfies Subgoal,
  },
  // Planning prompt for subgoal decomposition, confidence estimation, and
  // dependency declaration.
  planningPrompt: `You are in planning mode. Break the user request into a hierarchical subgoal tree.
For each subgoal assign a confidence score (0.0-1.0) based on:
- Task clarity and known patterns (high)
- Unknowns, complexity, or external deps (lower)

Additionally, declare dependencies between subgoals: list IDs of any subgoals
that MUST complete before this subgoal can start. The engine uses these
dependencies to determine readiness and to backtrack/replan on failure.

Return ONLY the tree as JSON. Each node should have: id, task, confidence,
status ("pending"), children, and an optional "dependsOn" array of IDs.
No prose.`,
  // Integration point for future GCC context
  gccContext: {
    placeholder: true,
    futureIntegration: 'GCC context injection hook',
  },
}

export default definition
export { SubgoalNode, SubgoalTree, buildLinearTree }
