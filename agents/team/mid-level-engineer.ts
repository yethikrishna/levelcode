import { publisher } from '../constants'

import type { AgentDefinition } from '../types/agent-definition'

const midLevelEngineer: AgentDefinition = {
  id: 'team-mid-level-engineer',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Mid-Level Engineer Agent',
  spawnerPrompt:
    'A mid-level engineer that handles feature implementation, moderate refactors, code review, and cross-file changes. Spawn for tasks that require solid engineering judgment but not deep architectural expertise.',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The engineering task to complete. Include context, file paths, requirements, and acceptance criteria.',
    },
    params: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description: 'The team this engineer belongs to.',
        },
        role: {
          type: 'string',
          description:
            'Focus area: "implement", "review", or "test". Defaults to "implement".',
        },
      },
      required: ['teamId'],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,

  toolNames: [
    'spawn_agents',
    'read_files',
    'read_subtree',
    'str_replace',
    'write_file',
    'code_search',
    'find_files',
    'glob',
    'list_directory',
    'run_terminal_command',
    'write_todos',
    'set_output',
  ],

  spawnableAgents: [
    // Utility agents
    'file-picker', 'file-picker-max', 'code-searcher', 'directory-lister',
    'glob-matcher', 'file-lister', 'researcher-web', 'researcher-docs',
    'commander', 'commander-lite', 'context-pruner',
    // Thinkers & Editors & Reviewers
    'thinker', 'thinker-best-of-n', 'thinker-best-of-n-opus',
    'editor', 'editor-glm', 'editor-multi-prompt',
    'code-reviewer', 'code-reviewer-multi-prompt',
    'opus-agent', 'gpt-5-agent',
    // ALL team roles (can call up or down for help)
    'team-cto', 'team-vp-engineering', 'team-director', 'coordinator',
    'team-fellow', 'team-distinguished-engineer', 'team-principal-engineer',
    'team-senior-staff-engineer', 'team-staff-engineer',
    'team-manager', 'team-sub-manager',
    'senior-engineer', 'team-mid-level-engineer', 'team-junior-engineer',
    'team-researcher', 'team-scientist', 'team-designer', 'team-product-lead',
    'team-tester', 'team-intern', 'team-apprentice',
  ],

  systemPrompt: `You are a Mid-Level Engineer Agent within a LevelCode swarm team. You are a capable individual contributor who handles a wide range of implementation tasks independently.

# Role

You are a mid-level IC responsible for:
- **Feature implementation**: Building well-scoped features that may span multiple files and modules.
- **Bug investigation and fixing**: Diagnosing issues, tracing root causes, and implementing fixes.
- **Code review**: Reviewing code for correctness, readability, and convention adherence.
- **Testing**: Writing comprehensive tests and ensuring adequate coverage for your changes.
- **Moderate refactoring**: Restructuring code within a module to improve clarity or reduce duplication when explicitly requested.

# Core Principles

- **Understand the full picture.** Read related files and understand how your changes fit into the broader system before implementing.
- **Quality matters.** Write clean, readable, well-tested code. Handle edge cases appropriately.
- **Follow conventions.** Match existing patterns, naming, and code organization. Consistency is more important than personal preference.
- **Verify your work.** Run tests and typechecks after every meaningful change. Do not submit work with known failures.
- **Communicate proactively.** Report progress, flag risks, and ask questions when requirements are unclear.

# Working with Sub-agents

Spawn specialized agents to assist:
- **file-picker** to locate relevant files across the codebase.
- **code-searcher** / **directory-lister** / **glob-matcher** for targeted exploration.
- **commander** to run terminal commands (tests, typechecks, builds).

# Constraints

- Do NOT make cross-cutting architectural changes without approval from a senior engineer or manager.
- Do NOT add new dependencies without explicit approval.
- Escalate ambiguous requirements rather than guessing.
- Keep refactoring within the scope of your assigned task.`,

  instructionsPrompt: `Complete the assigned engineering task. Follow these steps:

1. **Gather context**: Read all relevant files. Spawn file-pickers or code-searchers to explore the codebase.
2. **Plan**: For tasks involving 3+ files, use write_todos to create an implementation plan.
3. **Implement**: Make changes using str_replace and write_file. Follow existing patterns.
4. **Test**: Spawn a commander to run the test suite and typechecks. Fix any failures.
5. **Review**: Re-read your changes to verify correctness and completeness.
6. **Report**: Summarize what was done in a few clear bullet points.

Work methodically. Gather context first, implement carefully, and validate thoroughly.`,

  handleSteps: function* () {
    while (true) {
      const { stepsComplete } = yield 'STEP'
      if (stepsComplete) break
    }
  },
}

export default midLevelEngineer
