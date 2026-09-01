#!/usr/bin/env bun
//
// LevelCode CLI entrypoint.
//
// This file is intentionally dependency-light: it only wires the flag parser
// (commander) and then hands off to `./cli-main`, which lazily imports the
// multi-megabyte agent runtime and TUI. Keeping the heavy graph out of the
// entrypoint's static imports is what makes `--help`, `--version`, and
// unknown-flag errors resolve instantly instead of blocking on a full
// application boot.

import { createProgram, loadPackageVersion } from './cli-flags'

// Commander answers the help/version flags and rejects unknown options
// synchronously during parse: printing and exiting before the heavy import
// below ever starts.
const program = createProgram().parse(process.argv)
const options = program.opts<{
  print?: boolean
  outputFormat?: string
  agent?: string
  cwd?: string
  worktree?: string
  effort?: string
  continue?: boolean | string
}>()

// `doctor` runs from node builtins only — never load the heavy runtime.
const argv1 = process.argv[2]
if (argv1 === 'doctor') {
  void import('./doctor/doctor').then((m) => {
    const checks = m.runDoctorChecks()
    process.stdout.write(m.formatDoctorReport(checks))
    process.exit(m.doctorExitCode(checks))
  })
} else if (argv1 === 'agents') {
  // Swarm console: reads on-disk team state, no agent runtime needed.
  const teamName = process.argv[3]
  void import('./agents-console/run-agents').then((m) => {
    const { output, exitCode } = m.renderAgentsCommand(teamName)
    process.stdout.write(output)
    process.exit(exitCode)
  })
} else if (options.print) {
  // Headless mode is built for pipes and CI: no TTY required, no renderer.
  const prompt = program.args.join(' ').trim()
  const format = options.outputFormat ?? 'text'
  if (!prompt) {
    console.error('error: -p/--print requires a prompt, e.g. levelcode -p "explain this repo"')
    process.exit(2)
  }
  if (!['text', 'json', 'stream-json'].includes(format)) {
    console.error(
      `error: unknown --output-format "${format}" (expected text, json, or stream-json)`,
    )
    process.exit(2)
  }
  void import('./headless/run-headless').then(async (m) => {
    if (options.effort) {
      const { setEffortLevel } = await import('./utils/effort')
      setEffortLevel(options.effort as never)
    }
    const { resolveWorktreeBoot } = await import('./utils/worktree-boot')
    const cwdOverride = await resolveWorktreeBoot(
      options.worktree,
      options.cwd,
      (msg) => console.error(`error: ${msg}`),
    )
    const { exitCode } = await m.runHeadless({
      prompt,
      outputFormat: format as 'text' | 'json' | 'stream-json',
      agentOverride: options.agent?.trim() || null,
      cwdOverride,
      continueChat: Boolean(options.continue),
      continueId:
        typeof options.continue === 'string' && options.continue.trim().length > 0
          ? options.continue.trim()
          : null,
    })
    process.exit(exitCode)
  })
} else {
  // Reaching this line means the process is actually booting the interactive
  // app. Refuse gracefully when there is no terminal to draw on — rendering a
  // TUI into a pipe produces escape-sequence garbage, and the multi-second
  // runtime import would otherwise exit silently at the end anyway.
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error(
      `LevelCode ${loadPackageVersion()} requires an interactive terminal (TTY).\n` +
        'Run `levelcode` inside a terminal to start the agent UI.\n' +
        'Use `levelcode --help` for flags that work without one, or `levelcode -p "<prompt>"` for headless mode.',
    )
    process.exit(1)
  }

  // Reaching this line means we have a TTY and are booting the full app.
  void import('./cli-main').then((m) => m.runCli())
}
