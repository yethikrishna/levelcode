# @levelcode/cli

The official CLI for **LevelCode** - an open-source AI coding agent that outperforms Claude Code.

[![npm version](https://img.shields.io/npm/v/@levelcode/cli.svg)](https://www.npmjs.com/package/@levelcode/cli)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://github.com/yethikrishna/levelcode/blob/master/LICENSE)

## Features

- **Multi-Agent Architecture**: Specialized agents work together for precise codebase editing
- **200+ Model Support**: Use any model via OpenRouter (Claude, GPT, DeepSeek, Qwen, etc.)
- **Terminal-First**: Beautiful, responsive UI with real-time streaming
- **Custom Workflows**: Create specialized agents with TypeScript

## Installation

```bash
# Using npm
npm install -g @levelcode/cli

# Using bun (recommended)
bun install -g @levelcode/cli

# Using yarn
yarn global add @levelcode/cli
```

## Quick Start

1. **Set your API key:**

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
```

Get your key from [OpenRouter](https://openrouter.ai/keys).

2. **Run LevelCode:**

```bash
cd your-project
levelcode
```

3. **Start coding with AI:**

Just tell LevelCode what you want:
- "Fix the SQL injection vulnerability"
- "Add rate limiting to all API endpoints"
- "Refactor the database connection code"
- "Add unit tests for the auth module"

## CLI Options

```bash
# Use a specific model
levelcode --model anthropic/claude-3.5-sonnet

# Set working directory
levelcode --cwd /path/to/project

# Non-interactive mode
levelcode "Add error handling to all API calls"

# Show help
levelcode --help
```

## Configuration

Create a `levelcode.config.ts` in your project:

```typescript
export default {
  model: 'anthropic/claude-3.5-sonnet',
  ignore: ['node_modules/**', 'dist/**'],
};
```

## Development

### Running in Development Mode

```bash
bun run dev
```

### Testing

```bash
bun test
```

### Interactive E2E Testing

For testing interactive CLI features, install tmux:

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt-get install tmux

# Windows (via WSL)
wsl --install && sudo apt-get install tmux
```

Run the proof-of-concept:

```bash
bun run test:tmux-poc
```

## Documentation

- [Full Documentation](https://github.com/yethikrishna/levelcode#readme)
- [SDK Reference](https://github.com/yethikrishna/levelcode/tree/master/sdk)
- [Custom Agents Guide](https://github.com/yethikrishna/levelcode/blob/master/docs/custom-agents.md)
- [Configuration Options](https://github.com/yethikrishna/levelcode/blob/master/docs/configuration.md)

## License

Apache-2.0 - Created by [Yethikrishna R](https://github.com/yethikrishna)
