# Creating Custom Agents

Learn how to create specialized agents for your specific workflows.

## Overview

LevelCode's multi-agent architecture allows you to create custom agents that handle specific tasks. Agents can:

- Use different models for different tasks
- Have specialized tools
- Define step-by-step workflows
- Spawn sub-agents

## Basic Agent Structure

```typescript
// .agents/my-agent.ts
import type { AgentDefinition } from '@levelcode/sdk';

const myAgent: AgentDefinition = {
  // Unique identifier
  id: 'my-agent',

  // Display name shown in UI
  displayName: 'My Custom Agent',

  // Model to use (any OpenRouter model)
  model: 'anthropic/claude-3.5-sonnet',

  // Tools this agent can use
  toolNames: ['read_files', 'write_file', 'grep', 'end_turn'],

  // System prompt / instructions
  instructionsPrompt: `You are a specialized agent that...`,

  // Optional: Temperature (0-1)
  temperature: 0.7,

  // Optional: Max iterations
  maxIterations: 50,
};

export default myAgent;
```

## Agent Types

### 1. Simple Agent

A basic agent that responds to prompts:

```typescript
const simpleAgent: AgentDefinition = {
  id: 'code-explainer',
  displayName: 'Code Explainer',
  model: 'anthropic/claude-3-haiku',
  toolNames: ['read_files', 'end_turn'],
  instructionsPrompt: `You explain code in simple terms.
    Read the requested files and provide clear explanations
    suitable for beginners.`,
};
```

### 2. Workflow Agent

An agent with predefined steps:

```typescript
const workflowAgent: AgentDefinition = {
  id: 'test-writer',
  displayName: 'Test Writer',
  model: 'anthropic/claude-3.5-sonnet',
  toolNames: ['read_files', 'write_file', 'run_terminal_command', 'end_turn'],
  instructionsPrompt: `You write comprehensive tests for code.`,

  async *handleSteps() {
    // Step 1: Find source files
    yield { tool: 'glob', pattern: 'src/**/*.ts' };

    // Step 2: Read the files to test
    yield 'STEP_ALL'; // Let LLM decide what to read

    // Step 3: Write tests
    yield 'STEP_ALL';

    // Step 4: Run tests to verify
    yield { tool: 'run_terminal_command', command: 'bun test' };
  },
};
```

### 3. Multi-Step Agent

An agent that performs complex multi-step operations:

```typescript
const refactoringAgent: AgentDefinition = {
  id: 'refactorer',
  displayName: 'Refactoring Agent',
  model: 'anthropic/claude-3-opus',
  toolNames: ['read_files', 'edit_file', 'grep', 'run_terminal_command', 'end_turn'],
  instructionsPrompt: `You are an expert at refactoring code.

    Your process:
    1. Understand the current code structure
    2. Identify patterns that can be improved
    3. Plan the refactoring carefully
    4. Make changes incrementally
    5. Verify each change works`,

  async *handleSteps() {
    // Phase 1: Analysis
    yield { tool: 'grep', pattern: 'TODO|FIXME|HACK', path: 'src' };

    // Phase 2: Let LLM analyze and plan
    yield 'STEP_ALL';

    // Phase 3: Run tests after each change
    yield { tool: 'run_terminal_command', command: 'bun test' };
  },
};
```

## Tools Reference

### Available Tools

| Tool | Description | Example |
|------|-------------|---------|
| `read_files` | Read file contents | `{ tool: 'read_files', paths: ['src/index.ts'] }` |
| `write_file` | Create/overwrite a file | `{ tool: 'write_file', path: 'src/new.ts', content: '...' }` |
| `edit_file` | Make precise edits | `{ tool: 'edit_file', path: 'src/index.ts', edits: [...] }` |
| `grep` | Search in files | `{ tool: 'grep', pattern: 'function', path: 'src' }` |
| `glob` | Find files | `{ tool: 'glob', pattern: '**/*.ts' }` |
| `run_terminal_command` | Execute shell command | `{ tool: 'run_terminal_command', command: 'npm test' }` |
| `end_turn` | Finish the agent's turn | `{ tool: 'end_turn' }` |

### Yielding Steps

In `handleSteps()`, you can yield:

```typescript
async *handleSteps() {
  // Yield a specific tool call
  yield { tool: 'grep', pattern: 'error', path: 'src' };

  // Let the LLM take over for one step
  yield 'STEP';

  // Let the LLM complete all remaining steps
  yield 'STEP_ALL';

  // Yield multiple tool calls (executed in order)
  yield [
    { tool: 'read_files', paths: ['package.json'] },
    { tool: 'read_files', paths: ['tsconfig.json'] },
  ];
}
```

## Best Practices

### 1. Clear Instructions

Write detailed, specific instructions:

```typescript
// Good
instructionsPrompt: `You are a security auditor.

  Your task:
  1. Scan for SQL injection vulnerabilities
  2. Check for XSS vulnerabilities
  3. Look for hardcoded secrets
  4. Verify input validation

  For each issue found:
  - Describe the vulnerability
  - Show the problematic code
  - Suggest a fix with code example`

// Bad
instructionsPrompt: `Check for security issues.`
```

### 2. Appropriate Model Selection

Choose models based on task complexity:

```typescript
// Complex reasoning - use powerful model
model: 'anthropic/claude-3-opus',

// Simple tasks - use fast model
model: 'anthropic/claude-3-haiku',

// Code generation - use coding model
model: 'deepseek/deepseek-coder',
```

### 3. Limit Tool Access

Only provide tools the agent needs:

```typescript
// Code reviewer - read-only
toolNames: ['read_files', 'grep', 'glob', 'end_turn'],

// Code editor - needs write access
toolNames: ['read_files', 'edit_file', 'write_file', 'end_turn'],
```

### 4. Handle Errors Gracefully

```typescript
async *handleSteps() {
  try {
    yield { tool: 'run_terminal_command', command: 'npm test' };
  } catch (error) {
    yield { tool: 'read_files', paths: ['test-results.json'] };
    yield 'STEP'; // Let LLM analyze the failure
  }
}
```

## Example Agents

### Git Committer

```typescript
const gitCommitter: AgentDefinition = {
  id: 'git-committer',
  displayName: 'Git Committer',
  model: 'openai/gpt-4o',
  toolNames: ['run_terminal_command', 'read_files', 'end_turn'],
  instructionsPrompt: `Create meaningful git commits.

    Process:
    1. Analyze staged changes with git diff
    2. Read relevant files for context
    3. Craft a clear commit message following conventional commits
    4. Stage additional related files if needed
    5. Create the commit`,

  async *handleSteps() {
    yield { tool: 'run_terminal_command', command: 'git diff --staged' };
    yield { tool: 'run_terminal_command', command: 'git status' };
    yield 'STEP_ALL';
  },
};
```

### Documentation Generator

```typescript
const docGenerator: AgentDefinition = {
  id: 'doc-generator',
  displayName: 'Documentation Generator',
  model: 'anthropic/claude-3.5-sonnet',
  toolNames: ['read_files', 'write_file', 'glob', 'end_turn'],
  instructionsPrompt: `Generate comprehensive documentation.

    For each file:
    - Document all exported functions
    - Include parameter types and descriptions
    - Add usage examples
    - Note any edge cases or gotchas`,

  async *handleSteps() {
    yield { tool: 'glob', pattern: 'src/**/*.ts' };
    yield 'STEP_ALL';
  },
};
```

### Dependency Updater

```typescript
const depUpdater: AgentDefinition = {
  id: 'dep-updater',
  displayName: 'Dependency Updater',
  model: 'anthropic/claude-3.5-sonnet',
  toolNames: ['read_files', 'edit_file', 'run_terminal_command', 'end_turn'],
  instructionsPrompt: `Update project dependencies safely.

    Process:
    1. Check for outdated packages
    2. Review changelogs for breaking changes
    3. Update one package at a time
    4. Run tests after each update
    5. Revert if tests fail`,

  async *handleSteps() {
    yield { tool: 'run_terminal_command', command: 'npm outdated' };
    yield { tool: 'read_files', paths: ['package.json'] };
    yield 'STEP_ALL';
  },
};
```

## Using Custom Agents

### In CLI

Place agents in `.agents/` directory, then use:

```bash
levelcode --agent my-agent "Your prompt"
```

### In SDK

```typescript
import { LevelCodeClient } from '@levelcode/sdk';
import myAgent from './agents/my-agent';

const client = new LevelCodeClient({ apiKey: '...' });

await client.run({
  agent: 'my-agent',
  agentDefinitions: [myAgent],
  prompt: 'Your task here',
});
```

---

*See more examples in the [agents directory](https://github.com/yethikrishna/levelcode/tree/main/agents)*
