import { createBase2 } from './base2'
import { truncateTrace } from '../../../evals/buffbench/trace-utils'

// Minimal base2 evals harness for planning/subgoal evals (v1 criteria target >=65%)
// Integrates trajectory (trace) capture via truncateTrace

const definition = {
  ...createBase2('default', { noAskUser: true }),
  id: 'base2-eval-runner',
  displayName: 'Base2 Evals Harness (Planning/Subgoal)',
  // Minimal harness: focus planning/subgoal, use traces for eval
  evalHarness: {
    target: 0.65,
    focus: 'planning/subgoal',
    capture: truncateTrace,
  },
}

export default definition
