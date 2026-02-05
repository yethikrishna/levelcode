# Configuration

LevelCode can be configured through environment variables, configuration files, and command-line arguments.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key | Required |
| `LEVELCODE_MODEL` | Default model to use | `anthropic/claude-3.5-sonnet` |
| `LEVELCODE_DEBUG` | Enable debug logging | `false` |
| `LEVELCODE_MAX_TOKENS` | Maximum tokens per request | `8000` |
| `LEVELCODE_TIMEOUT` | Request timeout in ms | `120000` |

## Configuration File

Create a `levelcode.config.ts` or `levelcode.config.js` in your project root:

```typescript
import { defineConfig } from '@levelcode/sdk';

export default defineConfig({
  // Default model for all agents
  model: 'anthropic/claude-3.5-sonnet',

  // Maximum tokens per request
  maxTokens: 8000,

  // Request timeout in milliseconds
  timeout: 120000,

  // Per-agent model overrides
  agents: {
    // Use a powerful model for editing
    editor: {
      model: 'anthropic/claude-3-opus',
      maxTokens: 16000,
    },
    // Use a fast model for file picking
    filePicker: {
      model: 'anthropic/claude-3-haiku',
      maxTokens: 4000,
    },
    // Use a reasoning model for planning
    planner: {
      model: 'openai/o1',
    },
  },

  // Files and directories to ignore
  ignore: [
    'node_modules/**',
    '*.lock',
    'dist/**',
    'build/**',
    '.git/**',
    '*.min.js',
    '*.map',
  ],

  // Maximum file size to read (in bytes)
  maxFileSize: 1024 * 1024, // 1MB

  // Enable/disable features
  features: {
    // Auto-format code after edits
    autoFormat: true,
    // Run tests after changes
    autoTest: false,
    // Create git commits automatically
    autoCommit: false,
  },

  // Custom tools (advanced)
  tools: [],
});
```

## CLI Arguments

```bash
# Specify model
levelcode --model anthropic/claude-3-opus

# Set working directory
levelcode --cwd /path/to/project

# Enable debug mode
levelcode --debug

# Non-interactive mode
levelcode "Your prompt here" --no-interactive

# Output to file
levelcode "Review code" --output review.md

# Specify config file
levelcode --config ./my-config.ts
```

## Model Selection

LevelCode supports any model available on [OpenRouter](https://openrouter.ai/models). Popular choices:

### For General Coding
- `anthropic/claude-3.5-sonnet` - Best balance of quality and speed
- `anthropic/claude-3-opus` - Highest quality, slower
- `openai/gpt-4o` - Fast and capable

### For Quick Tasks
- `anthropic/claude-3-haiku` - Very fast, lower cost
- `openai/gpt-4o-mini` - Good for simple tasks

### For Complex Reasoning
- `openai/o1` - Best for complex logic
- `anthropic/claude-3-opus` - Excellent reasoning

### For Code Generation
- `deepseek/deepseek-coder` - Specialized for code
- `qwen/qwen-2.5-coder-32b-instruct` - Strong coding model

## Ignore Patterns

The `ignore` configuration uses glob patterns:

```typescript
ignore: [
  // Ignore all node_modules
  'node_modules/**',

  // Ignore specific file types
  '*.log',
  '*.lock',
  '*.map',

  // Ignore build outputs
  'dist/**',
  'build/**',
  '.next/**',

  // Ignore large files
  '*.min.js',
  '*.bundle.js',

  // Ignore specific directories
  '.git/**',
  'coverage/**',
  '__pycache__/**',
]
```

## Project-Specific Settings

Create a `.levelcode` directory in your project for project-specific settings:

```
your-project/
├── .levelcode/
│   ├── config.ts      # Project config
│   ├── agents/        # Custom agents
│   └── tools/         # Custom tools
└── ...
```

## Per-Directory Overrides

You can create `levelcode.config.ts` files in subdirectories to override settings for specific parts of your project:

```
your-project/
├── levelcode.config.ts         # Root config
├── packages/
│   └── api/
│       └── levelcode.config.ts # API-specific config
└── apps/
    └── web/
        └── levelcode.config.ts # Web-specific config
```

## Security Configuration

### API Key Security

Never commit your API key. Use environment variables or a `.env` file (add to `.gitignore`):

```bash
# .env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

### File Access Restrictions

Limit which files LevelCode can access:

```typescript
export default defineConfig({
  // Only allow access to src directory
  allowedPaths: ['src/**', 'tests/**'],

  // Block sensitive files
  blockedPaths: ['.env*', '*.pem', '*.key', 'secrets/**'],
});
```

---

*For more advanced configuration options, see the [SDK Reference](./sdk-reference.md)*
