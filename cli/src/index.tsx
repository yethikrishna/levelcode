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
}>()

// `doctor` runs from node builtins only — never load the heavy runtime.
const argv1 = process.argv[2]
if (argv1 === 'doctor') {
  void import('./doctor/doctor').then((m) => {
    const checks = m.runDoctorChecks()
    process.stdout.write(m.formatDoctorReport(checks))
    process.exit(m.doctorExitCode(checks))
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
    const { exitCode } = await m.runHeadless({
      prompt,
      outputFormat: format as 'text' | 'json' | 'stream-json',
      agentOverride: options.agent?.trim() || null,
      cwdOverride: options.cwd,
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
