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

import crypto from 'crypto'
import path from 'path'

import { getProjectRoot } from '../project-files'
import { initializeApp } from '../init/init-app'
import { getLevelCodeClient } from '../utils/levelcode-client'
import { isSensitiveFile } from '../utils/create-run-config'
import { saveHeadlessRunState, loadHeadlessRunState, forkSavedSession } from './session-store'
import { loadAgentDefinitions } from '../utils/local-agent-registry'
import Ajv from 'ajv'

import type { AgentDefinition } from '@levelcode/sdk'

import type { PrintModeEvent } from '@levelcode/common/types/print-mode'
import type { FileFilter, LevelCodeClient } from '@levelcode/sdk'
import { TrajectoryReplay } from '@levelcode/sdk'
import type { TrajectoryStep } from '@levelcode/sdk'

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
  /** Resume the most recent conversation (or continueId if provided). */
  continueChat?: boolean
  continueId?: string | null
  /** Branch from the given session id: original untouched, lineage kept. */
  forkId?: string | null
  /** With forkId: truncate the cloned history to its first N messages. */
  atMessage?: number | null
  /** JSON schema (draft-07) the structured output must satisfy. */
  outputSchema?: Record<string, unknown>
  /**
   * With -p: record the run's steps to `.levelcode/trajectories/<session>.json`
   * (crash-safe incremental writes). Optional value is a label. The captured
   * trajectory is replayable/branchable via the SDK's TrajectoryReplay.
   */
  captureTrajectory?: boolean | string
  /**
   * Save a crash-resumable checkpoint every N completed agent steps
   * (default 5 when true). Checkpoints land under a pre-generated session
   * id that the final save overwrites, so `--continue <id>` always resumes
   * the newest state — even after a hard crash or a failed run.
   */
  checkpointEvery?: number | string | boolean
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

  // --capture-trajectory: record every main-agent step (user prompt, text,
  // tool calls/results) into .levelcode/trajectories/<session>.json. Writes
  // are incremental (buffer flushed on each tool boundary), so a crashed run
  // still leaves a replayable/branchable trajectory — this is the capture
  // path the SDK's TrajectoryReplay was built against but never had.
  const captureRaw = options.captureTrajectory
  const captureEnabled =
    captureRaw === true ||
    (typeof captureRaw === 'string' && captureRaw.trim() !== '' && captureRaw !== 'false')
  const captureLabel =
    typeof captureRaw === 'string' && captureRaw.trim() !== '' ? captureRaw.trim() : undefined
  const captureSessionId = `traj-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const trajectorySteps: TrajectoryStep[] = []
  let captureFlushedCount = 0
  // Text deltas coalesce into one assistant_message so trajectories hold
  // model turns, not streaming fragments.
  let openText = ''
  let openTextTs = 0

  const flushTrajectory = () => {
    if (!captureEnabled || trajectorySteps.length === captureFlushedCount) return
    try {
      // appendSteps overwrites the file with the full accumulated step list;
      // pass only the newly captured slice so the file grows monotonically.
      TrajectoryReplay.appendSteps(
        projectRoot,
        captureSessionId,
        trajectorySteps.slice(captureFlushedCount),
        captureLabel,
      )
      captureFlushedCount = trajectorySteps.length
    } catch {
      // Trajectory capture is best-effort; never break the run over it.
    }
  }

  const pushStep = (step: TrajectoryStep) => {
    if (!captureEnabled) return
    trajectorySteps.push({ ...step, session: captureSessionId })
  }

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
        if (captureEnabled && !event.agentId) {
          if (!openText) openTextTs = Date.now()
          openText += event.text
        }
        break
      case 'error':
        sawError = true
        if (outputFormat === 'text') {
          err(`error: ${event.message}\n`)
        }
        if (captureEnabled) {
          if (openText) {
            pushStep({ index: 0, type: 'assistant_message', ts: openTextTs, content: openText })
            openText = ''
          }
          flushTrajectory()
        }
        break
      case 'tool_call':
        numToolCalls += 1
        // Subagent tool calls arrive re-emitted with parentAgentId (spawn-agents);
        // main-loop calls carry neither parentAgentId nor (reliably) agentId.
        if (captureEnabled && !event.parentAgentId) {
          // Close any open text run before the tool boundary, then record
          // the call and flush — this is the crash-resume boundary.
          if (openText) {
            pushStep({ index: 0, type: 'assistant_message', ts: openTextTs, content: openText })
            openText = ''
          }
          pushStep({
            index: 0,
            type: 'tool_call',
            ts: Date.now(),
            id: event.toolCallId,
            name: event.toolName,
            data: event.input,
          })
          flushTrajectory()
        }
        break
      case 'tool_result':
        if (captureEnabled && !event.parentAgentId) {
          pushStep({
            index: 0,
            type: 'tool_result',
            ts: Date.now(),
            id: event.toolCallId,
            name: event.toolName,
            data: event.output,
          })
          flushTrajectory()
        }
        break
      case 'finish':
        sawFinish = true
        totalCost = event.totalCost
        if (captureEnabled) {
          if (openText) {
            pushStep({ index: 0, type: 'assistant_message', ts: openTextTs, content: openText })
            openText = ''
          }
          flushTrajectory()
        }
        break
    }
  }

  let previousRun: unknown
  let forkedFromId: string | null = null
  let forkedChatId: string | null = null
  if (options.forkId) {
    let forked: ReturnType<typeof forkSavedSession>
    try {
      forked = forkSavedSession(options.forkId, {
        atMessage: options.atMessage ?? undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (outputFormat === 'text') {
        err(`error: ${message}
`)
        return { exitCode: 2, result: { type: 'result', subtype: 'error_during_execution' as const, is_error: true, message } }
      }
      emit({ type: 'system', subtype: 'init', ok: false })
      emit({ type: 'result', subtype: 'error_during_execution' as const, is_error: true, message })
      return { exitCode: 2, result: { type: 'result', subtype: 'error_during_execution' as const, is_error: true, message } }
    }
    if (!forked) {
      const message = `No forkable session found for "${options.forkId}". Run levelcode sessions to list saved sessions.`
      if (outputFormat === 'text') {
        err(`error: ${message}
`)
        return { exitCode: 2, result: { type: 'result', subtype: 'error_during_execution' as const, is_error: true, message } }
      }
      emit({ type: 'system', subtype: 'init', ok: false })
      emit({ type: 'result', subtype: 'error_during_execution' as const, is_error: true, message })
      return { exitCode: 2, result: { type: 'result', subtype: 'error_during_execution' as const, is_error: true, message } }
    }
    previousRun = forked.runState
    forkedFromId = options.forkId
    forkedChatId = forked.forkedChatId
  } else if (options.continueChat) {
    const loaded = loadHeadlessRunState(options.continueId ?? undefined)
    if (!loaded) {
      const id = options.continueId ?? '(most recent)'
      const message = `No resumable session found for ${id}. Run levelcode -p without --continue first, or pass a valid session_id.`
      if (outputFormat === 'text') {
        err(`error: ${message}
`)
        return { exitCode: 2, result: { type: 'result', subtype: 'error_during_execution' as const, is_error: true, message } }
      }
      emit({ type: 'system', subtype: 'init', ok: false })
      emit({ type: 'result', subtype: 'error_during_execution' as const, is_error: true, message })
      return { exitCode: 2, result: { type: 'result', subtype: 'error_during_execution' as const, is_error: true, message } }
    }
    previousRun = loaded
  }

  let finishedRun: unknown
  // --output-schema: force structured output on the agent definition.
  let agentArg: string | AgentDefinition = agentOverride ?? 'base2'
  if (options.outputSchema) {
    const definitions = loadAgentDefinitions()
    const base = definitions.find((d) => d.id === (agentOverride ?? 'base2'))
    if (base) {
      agentArg = {
        ...base,
        outputMode: 'structured_output',
        outputSchema: options.outputSchema as never,
      }
    }
  }

  // Checkpointing: one pre-generated session id for the whole run. Periodic
  // saves and the final save land in the same chat dir, so --continue <id>
  // always resumes the newest state and a crash never orphans the work.
  const checkpointRaw = options.checkpointEvery
  const checkpointEnabled =
    checkpointRaw === true ||
    checkpointRaw === 'true' ||
    (typeof checkpointRaw === 'string' && checkpointRaw.trim() !== '' && checkpointRaw !== 'false') ||
    (typeof checkpointRaw === 'number' && checkpointRaw > 0)
  const checkpointEvery = Math.max(
    1,
    typeof checkpointRaw === 'number'
      ? Math.floor(checkpointRaw)
      : Number.parseInt(String(checkpointRaw ?? ''), 10) || 5,
  )
  const checkpointChatId = checkpointEnabled ? crypto.randomUUID() : null
  let lastCheckpointStep = 0
  let checkpointSaved = false

  // The trajectory begins with the prompt as a user_message step — replay
  // reconstructs history from it, so it must be the first captured step.
  if (captureEnabled) {
    pushStep({ index: 0, type: 'user_message', ts: Date.now(), content: prompt })
    flushTrajectory()
  }

  try {
    finishedRun = await client.run({
      agent: agentArg,
      prompt,
      ...(previousRun ? { previousRun: previousRun as never } : {}),
      handleEvent,
      ...(checkpointChatId
        ? {
            onStepComplete: async (info: {
              stepNumber: number
              fileContext: unknown
              agentState: unknown
            }) => {
              if (info.stepNumber - lastCheckpointStep < checkpointEvery) return
              lastCheckpointStep = info.stepNumber
              try {
                saveHeadlessRunState(
                  {
                    sessionState: {
                      fileContext: info.fileContext,
                      mainAgentState: info.agentState,
                    },
                    output: { type: 'error', message: 'Run in progress (checkpoint)' },
                  } as never,
                  { chatId: checkpointChatId },
                )
              } catch { /* checkpoint persistence is best-effort */ }
              checkpointSaved = true
            },
          }
        : {}),
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

  // --output-schema: validate the structured result. The runtime guarantees
  // set_output was called when the agent definition carries a schema; this
  // client-side pass verifies the value against the schema (draft-07).
  let structuredValue: unknown = undefined
  let schemaValid: boolean | undefined = undefined
  let schemaErrors: unknown = undefined
  if (options.outputSchema) {
    const output = (finishedRun as { output?: { type?: string; value?: unknown } } | undefined)
      ?.output
    if (output?.type === 'structuredOutput') {
      structuredValue = output.value
    } else if (finalText.trim().length > 0) {
      try {
        structuredValue = JSON.parse(finalText)
      } catch {
        structuredValue = undefined
      }
    }
    try {
      const ajv = new Ajv({ allErrors: true })
      const validate = ajv.compile(options.outputSchema)
      schemaValid = validate(structuredValue) as boolean
      if (!schemaValid) {
        schemaErrors = validate.errors
        sawError = true
      }
    } catch (schemaError) {
      schemaValid = false
      schemaErrors = [
        { message: schemaError instanceof Error ? schemaError.message : String(schemaError) },
      ]
      sawError = true
    }
  }

  // Context metrics: the runtime tracks the last known context size per
  // step (contextTokenCount). Surfacing it lets CI alert on runaway growth.
  const finishedSession = finishedRun as
    | { sessionState?: { mainAgentState?: { contextTokenCount?: number; messageHistory?: unknown[] } } }
    | undefined
  const contextTokenCount = finishedSession?.sessionState?.mainAgentState?.contextTokenCount
  const historyLength = finishedSession?.sessionState?.mainAgentState?.messageHistory?.length

  // Persist the session for --continue chaining (best-effort). Failed runs
  // save too when checkpointing produced partial progress: the newest state
  // is resumable even though this run errored.
  let sessionId: string | null = null
  if (finishedRun && (!sawError || checkpointChatId)) {
    try {
      sessionId = saveHeadlessRunState(finishedRun as never, {
        chatId: checkpointChatId ?? forkedChatId ?? undefined,
        forkedFrom: forkedFromId ?? undefined,
      })
    } catch { /* persistence is best-effort */ }
  }
  // A run that threw before finishing saved no final state, but if at least
  // one periodic checkpoint landed, it is already on disk under the
  // pre-generated id — report it so the operator has a resume handle.
  const reportedSessionId =
    sessionId ?? (checkpointChatId && sawError && checkpointSaved ? checkpointChatId : null)

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
    ...(reportedSessionId ? { session_id: reportedSessionId } : {}),
    ...(forkedFromId ? { forked_from: forkedFromId } : {}),
    ...(captureEnabled && trajectorySteps.length > 0
      ? { trajectory_id: captureSessionId, trajectory_steps: trajectorySteps.length }
      : {}),
    ...(schemaValid !== undefined
      ? { schema_valid: schemaValid, ...(schemaErrors ? { schema_errors: schemaErrors } : {}) }
      : {}),
    ...(typeof contextTokenCount === 'number' ? { context_tokens: contextTokenCount } : {}),
    ...(typeof historyLength === 'number' ? { history_messages: historyLength } : {}),
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
