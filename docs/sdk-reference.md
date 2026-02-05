# SDK Reference

Complete API documentation for the `@levelcode/sdk` package.

## Installation

```bash
npm install @levelcode/sdk
# or
bun add @levelcode/sdk
```

## Quick Start

```typescript
import { LevelCodeClient } from '@levelcode/sdk';

const client = new LevelCodeClient({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const result = await client.run({
  agent: 'base',
  prompt: 'Add error handling to all API endpoints',
});
```

## LevelCodeClient

The main class for interacting with LevelCode.

### Constructor

```typescript
new LevelCodeClient(options: LevelCodeClientOptions)
```

#### Options

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `apiKey` | `string` | Yes | OpenRouter API key |
| `cwd` | `string` | No | Working directory (default: `process.cwd()`) |
| `model` | `string` | No | Default model (default: `anthropic/claude-3.5-sonnet`) |
| `maxTokens` | `number` | No | Max tokens per request (default: `8000`) |
| `timeout` | `number` | No | Request timeout in ms (default: `120000`) |
| `onError` | `(error: Error) => void` | No | Error callback |

### Methods

#### `run(options: RunOptions): Promise<RunResult>`

Execute an agent with a prompt.

```typescript
const result = await client.run({
  agent: 'base',
  prompt: 'Fix TypeScript errors',
  handleEvent: (event) => console.log(event),
});
```

##### RunOptions

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `agent` | `string` | Yes | Agent ID to run |
| `prompt` | `string` | Yes | The task prompt |
| `handleEvent` | `(event: Event) => void` | No | Event callback for streaming |
| `agentDefinitions` | `AgentDefinition[]` | No | Custom agent definitions |
| `customToolDefinitions` | `ToolDefinition[]` | No | Custom tool definitions |
| `context` | `Record<string, any>` | No | Additional context |

##### RunResult

```typescript
interface RunResult {
  success: boolean;
  changes: FileChange[];
  messages: Message[];
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
}
```

#### `stop(): void`

Stop the currently running agent.

```typescript
client.stop();
```

## AgentDefinition

Define custom agents with full control over behavior.

```typescript
interface AgentDefinition {
  id: string;
  displayName: string;
  model: string;
  toolNames: string[];
  instructionsPrompt: string;
  handleSteps?: () => AsyncGenerator<StepYield>;
  maxIterations?: number;
  temperature?: number;
}
```

### Example: Custom Code Reviewer

```typescript
const codeReviewer: AgentDefinition = {
  id: 'code-reviewer',
  displayName: 'Code Reviewer',
  model: 'anthropic/claude-3-opus',
  toolNames: ['read_files', 'grep', 'glob', 'end_turn'],
  instructionsPrompt: `You are a senior code reviewer.

    Your responsibilities:
    1. Check for security vulnerabilities
    2. Identify performance issues
    3. Ensure code follows best practices
    4. Suggest improvements

    Be constructive and specific in your feedback.`,
  temperature: 0.3,
  maxIterations: 20,
};
```

### Example: Agent with Steps

```typescript
const gitCommitter: AgentDefinition = {
  id: 'git-committer',
  displayName: 'Git Committer',
  model: 'openai/gpt-4o',
  toolNames: ['read_files', 'run_terminal_command', 'end_turn'],
  instructionsPrompt: 'Create meaningful git commits.',

  async *handleSteps() {
    // Step 1: Analyze changes
    yield { tool: 'run_terminal_command', command: 'git diff --staged' };

    // Step 2: Get recent commits for context
    yield { tool: 'run_terminal_command', command: 'git log --oneline -5' };

    // Step 3: Let the LLM create the commit
    yield 'STEP_ALL';
  },
};
```

## Built-in Tools

LevelCode includes these tools that agents can use:

| Tool | Description |
|------|-------------|
| `read_files` | Read file contents |
| `write_file` | Write content to a file |
| `edit_file` | Make surgical edits to a file |
| `grep` | Search file contents with regex |
| `glob` | Find files by pattern |
| `run_terminal_command` | Execute shell commands |
| `web_search` | Search the web |
| `fetch_url` | Fetch content from a URL |
| `end_turn` | End the agent's turn |

## Custom Tools

Create custom tools for your specific needs:

```typescript
import { defineTool, z } from '@levelcode/sdk';

const deployTool = defineTool({
  name: 'deploy',
  description: 'Deploy the application to production',
  parameters: z.object({
    environment: z.enum(['staging', 'production']),
    version: z.string().optional(),
  }),
  execute: async ({ environment, version }) => {
    // Your deployment logic
    const result = await deploy(environment, version);
    return { success: true, url: result.url };
  },
});

// Use in client
const client = new LevelCodeClient({
  apiKey: '...',
  tools: [deployTool],
});
```

## Events

The `handleEvent` callback receives these event types:

```typescript
type Event =
  | { type: 'agent_start'; agent: string }
  | { type: 'agent_end'; agent: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; tool: string; args: Record<string, any> }
  | { type: 'tool_result'; tool: string; result: any }
  | { type: 'file_edit'; filePath: string; diff: string }
  | { type: 'message'; role: 'assistant' | 'user'; content: string }
  | { type: 'error'; error: Error };
```

### Example: Progress Tracking

```typescript
await client.run({
  agent: 'base',
  prompt: 'Refactor the auth module',
  handleEvent: (event) => {
    switch (event.type) {
      case 'agent_start':
        console.log(`Starting agent: ${event.agent}`);
        break;
      case 'thinking':
        process.stdout.write('.');
        break;
      case 'tool_call':
        console.log(`Using tool: ${event.tool}`);
        break;
      case 'file_edit':
        console.log(`Edited: ${event.filePath}`);
        break;
      case 'error':
        console.error('Error:', event.error);
        break;
    }
  },
});
```

## Error Handling

```typescript
import { LevelCodeClient, LevelCodeError } from '@levelcode/sdk';

try {
  const result = await client.run({
    agent: 'base',
    prompt: 'Fix bugs',
  });
} catch (error) {
  if (error instanceof LevelCodeError) {
    console.error('LevelCode error:', error.message);
    console.error('Code:', error.code);
  } else {
    throw error;
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_API_KEY` | API key is missing or invalid |
| `RATE_LIMIT` | Rate limit exceeded |
| `MODEL_ERROR` | Model returned an error |
| `TIMEOUT` | Request timed out |
| `FILE_ERROR` | File operation failed |
| `TOOL_ERROR` | Tool execution failed |

## TypeScript Types

All types are exported from the package:

```typescript
import type {
  LevelCodeClientOptions,
  RunOptions,
  RunResult,
  AgentDefinition,
  ToolDefinition,
  Event,
  FileChange,
  Message,
} from '@levelcode/sdk';
```

---

*For more examples, see the [examples directory](https://github.com/YEthikrishna/levelcode/tree/main/sdk/examples)*
