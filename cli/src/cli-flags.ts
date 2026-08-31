/**
 * CLI flag surface — shared by the thin launcher (`index.tsx`) and the heavy
 * bootstrap (`cli-main.tsx`).
 *
 * This module must stay dependency-light (commander + node builtins only) so
 * the launcher can answer `--help`, `--version`, and unknown-flag errors in
 * tens of milliseconds, before the multi-megabyte agent runtime loads.
 */

import { createRequire } from 'module'

import { Command } from 'commander'

export function loadPackageVersion(): string {
  const fromEnv = process.env.LEVELCODE_CLI_VERSION
  if (fromEnv) {
    return fromEnv
  }

  try {
    const require = createRequire(import.meta.url)
    const pkg = require('../package.json') as { version?: string }
    if (pkg.version) {
      return pkg.version
    }
  } catch {
    // Fall through to the dev default below
  }

  return 'dev'
}

export function createProgram(): Command {
  const program = new Command()

  return program
    .name('levelcode')
    .description('LevelCode CLI - AI-powered coding assistant')
    .version(loadPackageVersion(), '-v, --version', 'Print the CLI version')
    .option(
      '--agent <agent-id>',
      'Run a specific agent id (skips loading local .agents overrides)',
    )
    .option('--clear-logs', 'Remove any existing CLI log files before starting')
    .option(
      '--continue [conversation-id]',
      'Continue from a previous conversation (optionally specify a conversation id)',
    )
    .option(
      '--cwd <directory>',
      'Set the working directory (default: current directory)',
    )
    .option('--free', 'Start in FREE mode')
    .option('--lite', 'Start in FREE mode (deprecated, use --free)')
    .option('--max', 'Start in MAX mode')
    .option('--plan', 'Start in PLAN mode')
    .helpOption('-h, --help', 'Show this help message')
    .option(
      '-p, --print',
      'Run headless: execute the prompt and print output without the TUI',
    )
    .option(
      '--output-format <format>',
      'Headless output: text | json | stream-json (requires -p)',
      'text',
    )
    .argument('[prompt...]', 'Initial prompt to send to the agent')
    .allowExcessArguments(true)
}
