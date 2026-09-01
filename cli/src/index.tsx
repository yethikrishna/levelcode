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
  fork?: string
  atMessage?: string
  outputSchema?: string
  watch?: boolean | string
}>()

// `doctor` runs from node builtins only — never load the heavy runtime.
const argv1 = process.argv[2]
if (argv1 === 'doctor') {
  void import('./doctor/doctor').then((m) => {
    const checks = m.runDoctorChecks()
    if (process.argv.includes('--json')) {
      process.stdout.write(m.formatDoctorJson(checks))
    } else {
      process.stdout.write(m.formatDoctorReport(checks))
    }
    process.exit(m.doctorExitCode(checks))
  })
} else if (argv1 === 'agents') {
  // Swarm console: reads on-disk team state, no agent runtime needed.
  const args = program.args.slice(1)
  const watchFlag = options.watch === true
  const watchInterval = typeof options.watch === 'string' ? Number(options.watch) : NaN
  const teamName = args.find((a) => !a.startsWith('-'))
  void import('./agents-console/run-agents').then(async (m) => {
    if (watchFlag || (Number.isFinite(watchInterval) && watchInterval > 0)) {
      const intervalMs = Number.isFinite(watchInterval) && watchInterval > 0
        ? watchInterval * 1000
        : 5000
      await m.runWatchLoop(intervalMs)
      return // unreachable; runWatchLoop exits via SIGINT
    }
    const { output, exitCode } = m.renderAgentsCommand(teamName)
    process.stdout.write(output)
    process.exit(exitCode)
  })
  } else if (argv1 === 'sessions') {
  // Saved-session listing: disk-only, no runtime.
  void import('./headless/session-store').then(async (m) => {
    // Fast path never runs initializeApp; set the project root explicitly.
    const { setProjectRoot } = await import('./project-files')
    setProjectRoot(process.cwd())
    // `sessions <id>`: inspect one session's message history (fork points).
    const sessions = m.listSavedSessions()
    const detailId = program.args.slice(1).find((a) => !a.startsWith('-'))
    if (detailId) {
      const match =
        sessions.find((s0) => s0.chatId === detailId) ??
        sessions.find((s0) => s0.chatId.startsWith(detailId))
      if (!match) {
        process.stdout.write(`No session matching "${detailId}".\n`)
        process.exit(1)
      }
      const detail = m.getSessionMessages(match.chatId)
      if (!detail) {
        process.stdout.write(`Session "${match.chatId}" is unreadable.\n`)
        process.exit(1)
      }
      const lines: string[] = [
        `Session ${match.chatId} (${detail.historyLength} messages)`,
        `Fork: levelcode -p --fork ${match.chatId} --at-message <n> "prompt"`,
        '',
      ]
      for (const message of detail.messages) {
        lines.push(`  [${String(message.index).padStart(3)}] ${message.role.padEnd(10)} ${message.preview}`)
      }
      process.stdout.write(lines.join('\n') + '\n')
      process.exit(0)
    }
    if (sessions.length === 0) {
      process.stdout.write(
        'No saved sessions in this project.\nRun levelcode -p "..." to create one.\n',
      )
      process.exit(0)
    }
    const lines: string[] = ['Saved sessions (newest first):', '']
    for (const session of sessions) {
      const when = new Date(session.modifiedAt).toISOString().replace('T', ' ').slice(0, 16)
      const fork = session.forkedFrom ? `  (fork of ${session.forkedFrom.slice(0, 8)})` : ''
      lines.push(
        `  ${session.chatId.slice(0, 8)}  ${when}  ${session.messageCount} msgs  ${session.firstPrompt || '(no prompt)'}${fork}`,
      )
    }
    lines.push('', 'Resume: levelcode -p --continue <id> · Fork: levelcode -p --fork <id> "prompt"', '')
    process.stdout.write(lines.join('\n'))
    process.exit(0)
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
    let outputSchema: Record<string, unknown> | undefined
    if (options.outputSchema) {
      try {
        outputSchema = JSON.parse(
          (await import('fs')).readFileSync(options.outputSchema, 'utf-8'),
        ) as Record<string, unknown>
      } catch (error) {
        console.error(
          `error: --output-schema: ${error instanceof Error ? error.message : String(error)}`,
        )
        process.exit(2)
      }
    }
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
      forkId:
        typeof options.fork === 'string' && options.fork.trim().length > 0
          ? options.fork.trim()
          : null,
      atMessage:
        options.atMessage !== undefined && options.atMessage.trim().length > 0
          ? Number(options.atMessage)
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
