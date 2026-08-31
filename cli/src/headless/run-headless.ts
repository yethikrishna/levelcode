/**
 * Headless (print) mode — runs one prompt through the agent without the TUI
 * and writes a machine-readable event stream to stdout.
 *
 * This is what makes LevelCode scriptable infrastructure: CI pipelines, the
 * web dashboard, and shell one-liners all consume the same PrintModeEvent
 * NDJSON protocol the TUI is built on.
 *
 * Output contract (one JSON object per line):
 *   {"type":"system","subtype":"init",...}          first line, always (json/stream-json)
 *   {"type":"tool_call"|"tool_result"|"text"|...}   stream events, verbatim (stream-json)
 *   {"type":"result",...}                           final line, always (json/stream-json)
 *
 * In `text` mode the assistant text streams verbatim to stdout and human
 * errors go to stderr, so `levelcode -p "..." | wc -l` behaves like a unix
 * citizen.
 */

import path from 'path'

import { getProjectRoot } from '../project-files'
import { initializeApp } from '../init/init-app'
import { getLevelCodeClient } from '../utils/levelcode-client'
import { isSensitiveFile } from '../utils/create-run-config'

import type { PrintModeEvent } from '@levelcode/common/types/print-mode'
import type { FileFilter, LevelCodeClient } from '@levelcode/sdk'

export type HeadlessOptions = {
  prompt: string
  /** One of: text (default), json (single result object), stream-json (NDJSON). */
  outputFormat: 'text' | 'json' | 'stream-json'
  /** Agent id to run (default: base2). */
  agentOverride: string | null
  /** Working directory override for this run. */
  cwdOverride?: string
  /** Exit with code 0 even if the run reports an error (default: false). */
  lenientExit?: boolean
  /** Test seam: run against this client instead of the real one. */
  client?: LevelCodeClient
  /** Test seam: capture output instead of writing to the process streams. */
  sink?: {
    stdout: (chunk: string) => void
    stderr: (chunk: string) => void
  }
}

export type HeadlessResult = {
  exitCode: number
  /** The final result payload (also the single object for --output-format json). */
  result: Record<string, unknown>
}

const resolveClient = async (override?: LevelCodeClient) =>
  override ?? (await getLevelCodeClient())

export async function runHeadless(options: HeadlessOptions): Promise<HeadlessResult> {
  const { prompt, outputFormat, agentOverride, cwdOverride, sink } = options
  const out = sink?.stdout ?? ((chunk: string) => process.stdout.write(chunk))
  const err = sink?.stderr ?? ((chunk: string) => process.stderr.write(chunk))

  const startedAt = Date.now()

  if (!options.client) {
    await initializeApp({ cwd: cwdOverride })
  }

  let projectRoot = options.cwdOverride ?? process.cwd()
  if (!options.cwdOverride) {
    try {
      projectRoot = getProjectRoot() ?? projectRoot
    } catch {
      // Not initialized (unit tests / direct invocation): fall back to cwd.
    }
  }

  const emit = (event: Record<string, unknown>) => {
    out(JSON.stringify(event) + '\n')
  }

  const client = await resolveClient(options.client)
  if (!client) {
    const result = {
      type: 'result',
      subtype: 'error_during_execution' as const,
      is_error: true,
      message: 'Failed to initialize LevelCode client (no API key?)',
    }
    if (outputFormat === 'text') {
      err(result.message + '\n')
    } else {
      emit({ type: 'system', subtype: 'init', ok: false })
      emit(result)
    }
    return { exitCode: 1, result }
  }

  let sawError = false
  let finalText = ''
  let totalCost = 0
  let numToolCalls = 0
  let sawFinish = false

  // The SDK's streaming internals can surface failures as unhandled
  // rejections instead of rejecting the awaited run() promise (e.g. a
  // provider connection dying mid-stream). Headless is a short-lived
  // dedicated process, so trap them here and convert to the error contract
  // rather than letting the run report success with no output.
  const rejectionHandler = (reason: unknown) => {
    sawError = true
    const message =
      reason instanceof Error ? reason.message : String(reason ?? 'unknown')
    if (outputFormat === 'text') {
      err(`error: ${message}\n`)
    }
  }
  process.on('unhandledRejection', rejectionHandler)

  const handleEvent = (event: PrintModeEvent) => {
    if (outputFormat === 'stream-json') {
      emit(event as unknown as Record<string, unknown>)
    }

    switch (event.type) {
      case 'text':
        finalText += event.text
        if (outputFormat === 'text') out(event.text)
        break
      case 'error':
        sawError = true
        if (outputFormat === 'text') {
          err(`error: ${event.message}\n`)
        }
        break
      case 'tool_call':
        numToolCalls += 1
        break
      case 'finish':
        sawFinish = true
        totalCost = event.totalCost
        break
    }
  }

  try {
    await client.run({
      agent: agentOverride ?? 'base2',
      prompt,
      handleEvent,
      maxAgentSteps: 100,
      fileFilter: ((filePath: string) => {
        if (isSensitiveFile(filePath)) return { status: 'blocked' }
        return { status: 'allow' }
      }) satisfies FileFilter,
    })
  } catch (error) {
    sawError = true
    const message = error instanceof Error ? error.message : String(error)
    if (outputFormat === 'text') {
      err(`error: ${message}\n`)
    }
  } finally {
    process.off('unhandledRejection', rejectionHandler)
  }

  // A run that neither errored nor finished is a failure too (e.g. the
  // model stream died silently): never report success without output.
  if (!sawError && !sawFinish && finalText.length === 0) {
    sawError = true
  }

  const result: Record<string, unknown> = {
    type: 'result',
    subtype: sawError
      ? ('error_during_execution' as const)
      : ('success' as const),
    is_error: sawError,
    duration_ms: Date.now() - startedAt,
    total_cost_usd: totalCost,
    num_tool_calls: numToolCalls,
    result: finalText,
    project: path.basename(projectRoot),
  }

  if (outputFormat === 'stream-json') {
    emit(result)
  } else if (outputFormat === 'json') {
    emit(result)
  } else {
    // text mode already streamed the assistant text; trailing newline only
    out('\n')
  }

  const exitCode = sawError && !options.lenientExit ? 1 : 0
  return { exitCode, result }
}
