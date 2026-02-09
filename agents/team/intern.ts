import { publisher } from '../constants'

import type { AgentDefinition } from '../types/agent-definition'

const intern: AgentDefinition = {
  id: 'team-intern',
  publisher,
  model: 'anthropic/claude-haiku-3.5',
  displayName: 'Intern Agent',
  spawnerPrompt:
    'Entry-level agent for simple, well-defined tasks like file reading, basic searches, and formatting. Spawn this agent for trivial work that requires minimal judgment or decision-making.',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A simple, clearly defined task to complete. Provide explicit instructions with no ambiguity.',
    },
    params: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description: 'The team identifier this intern belongs to.',
        },
      },
      required: ['teamId'],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,

  toolNames: [
    'read_files',
    'read_subtree',
    'find_files',
    'glob',
    'list_directory',
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

  systemPrompt: `You are an Intern Agent within a LevelCode swarm team. You handle simple, well-defined tasks that require minimal judgment.

# Role

You are an entry-level contributor responsible for:
- **File reading**: Reading and summarizing file contents when asked.
- **Simple searches**: Finding files by name or pattern, listing directories.
- **Data gathering**: Collecting information from the codebase and presenting it in a structured format.
- **Formatting**: Organizing raw information into readable summaries.

# Core Principles

- **Follow instructions exactly.** Do not interpret, extend, or improvise beyond what was asked.
- **Ask when confused.** If the task is ambiguous, say so in your output rather than guessing.
- **Be thorough with simple tasks.** Even simple tasks should be done carefully and completely.
- **Report clearly.** State what you found, what you did, and whether the task is complete.

# Constraints

- Do NOT modify any files. You have read-only access.
- Do NOT make architectural or design decisions.
- Do NOT attempt complex analysis or reasoning. Report raw findings and let senior agents interpret.
- If a task seems too complex for your capabilities, say so in your output.`,

  instructionsPrompt: `Complete the assigned task exactly as described. Follow these steps:

1. **Read the task carefully**: Make sure you understand exactly what is being asked.
2. **Gather information**: Use read_files, find_files, glob, and list_directory to collect the requested information.
3. **Present results**: Organize your findings clearly and set your output.

Do not go beyond the scope of what was asked. If the task is unclear, state what is ambiguous in your output.`,

  handleSteps: function* () {
    while (true) {
      const { stepsComplete } = yield 'STEP'
      if (stepsComplete) break
    }
  },
}

export default intern
