# Architecture

Understanding how LevelCode works under the hood.

## Overview

LevelCode uses a **multi-agent architecture** where specialized agents collaborate to complete coding tasks. This approach provides:

- Better context understanding
- More accurate edits
- Parallel task execution
- Specialization per task type

```
┌─────────────────────────────────────────────────────────────┐
│                      User Prompt                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator Agent                        │
│  • Analyzes the task                                        │
│  • Determines which agents to invoke                        │
│  • Coordinates the workflow                                  │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  File Picker    │ │    Planner      │ │    Editor       │
│  Agent          │ │    Agent        │ │    Agent        │
│                 │ │                 │ │                 │
│  Finds relevant │ │  Plans changes  │ │  Makes precise  │
│  files          │ │  and ordering   │ │  code edits     │
└─────────────────┘ └─────────────────┘ └─────────────────┘
          │                   │                   │
          └───────────────────┴───────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Reviewer Agent                            │
│  • Validates changes                                        │
│  • Runs tests                                               │
│  • Ensures quality                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Final Output                            │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Agent Runtime

The agent runtime (`packages/agent-runtime`) is responsible for:

- Executing agent definitions
- Managing tool calls
- Handling streaming responses
- Coordinating sub-agents

```typescript
// Simplified agent runtime loop
async function runAgent(agent: AgentDefinition, prompt: string) {
  const messages: Message[] = [
    { role: 'system', content: agent.instructionsPrompt },
    { role: 'user', content: prompt },
  ];

  while (true) {
    const response = await callModel(agent.model, messages);

    if (response.toolCalls) {
      for (const call of response.toolCalls) {
        const result = await executeTool(call);
        messages.push({ role: 'tool', content: result });
      }
    }

    if (response.finished) break;
  }
}
```

### 2. Tool System

Tools provide agents with capabilities:

```typescript
// Tool definition structure
interface Tool {
  name: string;
  description: string;
  parameters: ZodSchema;
  execute: (params: any) => Promise<ToolResult>;
}
```

Built-in tools include:
- **File Operations**: `read_files`, `write_file`, `edit_file`
- **Search**: `grep`, `glob`
- **Execution**: `run_terminal_command`
- **Web**: `web_search`, `fetch_url`

### 3. Model Integration

LevelCode uses [OpenRouter](https://openrouter.ai) to access 200+ models:

```typescript
// Model call abstraction
async function callModel(model: string, messages: Message[]) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      tools: getToolDefinitions(),
    }),
  });

  return response.json();
}
```

## Agent Types

### Base Agent

The default agent that handles general coding tasks:

- Uses `anthropic/claude-3.5-sonnet` by default
- Has access to all tools
- Automatically plans and executes changes

### File Picker Agent

Specialized for finding relevant files:

- Uses a fast model (`claude-3-haiku`)
- Analyzes project structure
- Returns a ranked list of relevant files

### Editor Agent

Specialized for making code changes:

- Uses a powerful model (`claude-3-opus`)
- Makes precise, surgical edits
- Preserves code style and formatting

### Reviewer Agent

Validates changes:

- Checks for errors and issues
- Runs tests
- Suggests improvements

## Data Flow

### 1. Request Flow

```
User Input
    │
    ▼
CLI/SDK Parser
    │
    ▼
Agent Selector
    │
    ▼
Agent Runtime ──────▶ Model API
    │                     │
    │◀────────────────────┘
    │
    ▼
Tool Executor
    │
    ▼
File System / Shell
    │
    ▼
Response Builder
    │
    ▼
User Output
```

### 2. Message Flow

```typescript
// Example message flow for "Add error handling"
[
  { role: 'system', content: 'You are LevelCode...' },
  { role: 'user', content: 'Add error handling to src/api.ts' },
  { role: 'assistant', content: null, tool_calls: [
    { function: 'read_files', arguments: { paths: ['src/api.ts'] } }
  ]},
  { role: 'tool', content: '// File contents...' },
  { role: 'assistant', content: null, tool_calls: [
    { function: 'edit_file', arguments: { path: 'src/api.ts', edits: [...] } }
  ]},
  { role: 'tool', content: 'File edited successfully' },
  { role: 'assistant', content: 'I added try-catch blocks to all API functions.' },
]
```

## File Operations

### Edit Algorithm

LevelCode uses a precise edit algorithm:

1. **Parse** - Understand the file structure
2. **Locate** - Find the exact edit location
3. **Transform** - Apply the change
4. **Validate** - Ensure valid syntax
5. **Format** - Preserve code style

```typescript
interface FileEdit {
  path: string;
  edits: {
    startLine: number;
    endLine: number;
    newContent: string;
  }[];
}
```

### Conflict Resolution

When multiple edits affect the same region:

1. Sort edits by line number (descending)
2. Apply edits from bottom to top
3. This prevents line number shifts from affecting subsequent edits

## Streaming

LevelCode streams responses for better UX:

```typescript
// SDK streaming
await client.run({
  agent: 'base',
  prompt: 'Add tests',
  handleEvent: (event) => {
    switch (event.type) {
      case 'thinking':
        // Show thinking indicator
        break;
      case 'tool_call':
        // Show tool being used
        break;
      case 'file_edit':
        // Show file being edited
        break;
    }
  },
});
```

## Error Handling

### Retry Logic

```typescript
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

### Graceful Degradation

- If a model is unavailable, try a fallback model
- If an edit fails, show the diff and let user decide
- If tests fail, report the failure without reverting

## Performance Optimizations

### 1. Parallel Tool Calls

When tools are independent, execute them in parallel:

```typescript
// Instead of sequential
for (const call of toolCalls) {
  await executeTool(call);
}

// Execute in parallel
await Promise.all(toolCalls.map(executeTool));
```

### 2. Caching

- Cache file contents during a session
- Cache model responses for identical prompts
- Cache glob patterns for file discovery

### 3. Streaming

- Stream model responses as they arrive
- Apply edits progressively
- Show progress in real-time

## Security

### Sandboxing

- Tool execution is sandboxed
- File access is restricted to project directory
- Shell commands are validated

### API Key Protection

- Keys are never logged
- Keys are not sent to models
- Keys are stored securely in environment variables

---

*For implementation details, see the source code in [`packages/agent-runtime`](https://github.com/YEthikrishna/levelcode/tree/main/packages/agent-runtime)*
