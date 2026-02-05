# Installation Guide

This guide covers all methods of installing LevelCode on your system.

## Prerequisites

Before installing LevelCode, ensure you have:

- **Node.js 18+** or **Bun 1.3.5+**
- A terminal that supports ANSI colors
- An [OpenRouter API key](https://openrouter.ai/keys)

## Installation Methods

### 1. NPM (Recommended for most users)

```bash
npm install -g levelcode
```

### 2. Bun (Fastest)

```bash
bun install -g levelcode
```

### 3. Yarn

```bash
yarn global add levelcode
```

### 4. From Source (For development)

```bash
# Clone the repository
git clone https://github.com/yethikrishna/levelcode.git
cd levelcode

# Install dependencies
bun install

# Build the project
bun run build

# Link for global use
bun link
```

## SDK Installation

If you want to use LevelCode programmatically:

```bash
# NPM
npm install @levelcode/sdk

# Bun
bun add @levelcode/sdk

# Yarn
yarn add @levelcode/sdk
```

## Configuration

### 1. Set your API key

```bash
# Option 1: Environment variable
export OPENROUTER_API_KEY="sk-or-v1-your-key-here"

# Option 2: .env file in your project
echo "OPENROUTER_API_KEY=sk-or-v1-your-key-here" > .env
```

### 2. Verify installation

```bash
levelcode --version
```

### 3. Run LevelCode

```bash
cd your-project
levelcode
```

## Platform-Specific Notes

### Windows

LevelCode works on Windows via:
- Windows Subsystem for Linux (WSL) - Recommended
- Git Bash
- PowerShell (with some limitations)

For the best experience on Windows, use WSL:

```bash
# Install WSL
wsl --install

# In WSL, install Bun
curl -fsSL https://bun.sh/install | bash

# Install LevelCode
bun install -g levelcode
```

### macOS

LevelCode works out of the box on macOS. We recommend using Bun for faster installation:

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install LevelCode
bun install -g levelcode
```

### Linux

LevelCode is fully supported on all major Linux distributions:

```bash
# Using Bun (recommended)
curl -fsSL https://bun.sh/install | bash
bun install -g levelcode

# Using npm
npm install -g levelcode
```

## Troubleshooting

### "Command not found" after installation

Ensure the npm/bun global bin directory is in your PATH:

```bash
# For npm
export PATH="$PATH:$(npm config get prefix)/bin"

# For bun
export PATH="$PATH:$HOME/.bun/bin"
```

Add this line to your `~/.bashrc` or `~/.zshrc` for persistence.

### Permission errors on Linux/macOS

If you get EACCES errors, avoid using sudo. Instead:

```bash
# Configure npm to use a different directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH="$PATH:$HOME/.npm-global/bin"
```

### API key not working

1. Verify your key at [OpenRouter](https://openrouter.ai/keys)
2. Check for typos in the key
3. Ensure the key has sufficient credits

## Next Steps

- [Quick Start Guide](./quickstart.md)
- [Configuration Options](./configuration.md)
- [Your First Agent](./custom-agents.md)

---

*Need help? Open an issue on [GitHub](https://github.com/yethikrishna/levelcode/issues)*
