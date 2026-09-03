import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { runHeadless } from '../run-headless'
import { loadHeadlessRunState, saveHeadlessRunState, forkSavedSession, listSavedSessions } from '../session-store'
import { setProjectRoot } from '../../project-files'

import type { PrintModeEvent } from '@levelcode/common/types/print-mode'
import type { LevelCodeClient, RunState } from '@levelcode/sdk'

type Sink = { stdout: string[]; stderr: string[] }

function makeSink() {
  const sink: Sink = { stdout: [], stderr: [] }
  const capture = {
    stdout: (chunk: string) => {
      sink.stdout.push(chunk)
    },
    stderr: (chunk: string) => {
      sink.stderr.push(chunk)
    },
  }
  return { sink, capture }
}

/** Fake client that replays a scripted sequence of PrintModeEvents. */
function fakeClient(events: PrintModeEvent[], error?: Error): LevelCodeClient {
  return {
    run: async ({ handleEvent }: any) => {
      for (const event of events) {
        await handleEvent?.(event)
      }
      if (error) throw error
      return {} as any
    },
  } as unknown as LevelCodeClient
}

const HAPPY_EVENTS: PrintModeEvent[] = [
  { type: 'start', messageHistoryLength: 0 },
  { type: 'text', text: 'Hello ' },
  { type: 'tool_call', toolCallId: 't1', toolName: 'read_file', input: {} },
  { type: 'text', text: 'world' },
  { type: 'finish', totalCost: 0.42 },
]

describe('runHeadless', () => {
  it('stream-json emits every event plus a final result line', async () => {
    const { sink, capture } = makeSink()
    const { exitCode, result } = await runHeadless({
      prompt: 'hi',
      outputFormat: 'stream-json',
      agentOverride: null,
      client: fakeClient(HAPPY_EVENTS),
      sink: capture,
    })

    expect(exitCode).toBe(0)
    const lines = sink.stdout.join('').trim().split('\n').map((l) => JSON.parse(l))
    // start, text, tool_call, text, finish + result
    expect(lines).toHaveLength(6)
    expect(lines[0]!.type).toBe('start')
    expect(lines[lines.length - 1]!.type).toBe('result')
    expect((result.type as string)).toBe('result')
    expect(result.is_error).toBe(false)
    expect(result.result).toBe('Hello world')
    expect(result.total_cost_usd).toBe(0.42)
    expect(result.num_tool_calls).toBe(1)
  })

  it('json emits exactly one result line with no event noise', async () => {
    const { sink, capture } = makeSink()
    const { exitCode } = await runHeadless({
      prompt: 'hi',
      outputFormat: 'json',
      agentOverride: null,
      client: fakeClient(HAPPY_EVENTS),
      sink: capture,
    })

    expect(exitCode).toBe(0)
    const lines = sink.stdout.join('').trim().split('\n')
    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0]!)
    expect(parsed.type).toBe('result')
    expect(parsed.subtype).toBe('success')
    expect(parsed.result).toBe('Hello world')
  })

  it('text streams assistant text verbatim and nothing else on stdout', async () => {
    const { sink, capture } = makeSink()
    const { exitCode } = await runHeadless({
      prompt: 'hi',
      outputFormat: 'text',
      agentOverride: null,
      client: fakeClient(HAPPY_EVENTS),
      sink: capture,
    })

    expect(exitCode).toBe(0)
    // The two text chunks, verbatim, plus a trailing newline.
    expect(sink.stdout.join('')).toBe('Hello world\n')
    expect(sink.stderr.join('')).toBe('')
  })

  it('tool errors set is_error and exit code 1', async () => {
    const { sink, capture } = makeSink()
    const { exitCode, result } = await runHeadless({
      prompt: 'hi',
      outputFormat: 'json',
      agentOverride: null,
      client: fakeClient(
        [{ type: 'error', message: 'model exploded' }],
      ),
      sink: capture,
    })

    expect(exitCode).toBe(1)
    expect(result.is_error).toBe(true)
    expect(result.subtype).toBe('error_during_execution')
  })

  it('lenientExit downgrades errors to exit code 0', async () => {
    const { exitCode } = await runHeadless({
      prompt: 'hi',
      outputFormat: 'json',
      agentOverride: null,
      lenientExit: true,
      client: fakeClient([{ type: 'error', message: 'boom' }]),
      sink: makeSink().capture,
    })

    expect(exitCode).toBe(0)
  })

  it('thrown run errors are reported, not propagated', async () => {
    const { sink, capture } = makeSink()
    const { exitCode, result } = await runHeadless({
      prompt: 'hi',
      outputFormat: 'text',
      agentOverride: null,
      client: fakeClient([], new Error('network down')),
      sink: capture,
    })

    expect(exitCode).toBe(1)
    expect(result.is_error).toBe(true)
    expect(sink.stderr.join('')).toContain('network down')
  })

  it('counts finish cost from the finish event only', async () => {
    const { sink, capture } = makeSink()
    const { result } = await runHeadless({
      prompt: 'hi',
      outputFormat: 'stream-json',
      agentOverride: null,
      client: fakeClient([
        { type: 'finish', totalCost: 7.5 },
        { type: 'finish', totalCost: 7.5 },
      ]),
      sink: capture,
    })

    expect(result.total_cost_usd).toBe(7.5)
  })
})

describe('runHeadless session resume', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hl-resume-'))
    setProjectRoot(tmpDir)
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('errors with exit code 2 when --continue finds no session', async () => {
    const { capture } = makeSink()
    const { exitCode, result } = await runHeadless({
      prompt: 'next turn',
      outputFormat: 'json',
      agentOverride: null,
      continueChat: true,
      client: fakeClient([]),
      sink: capture,
    })

    expect(exitCode).toBe(2)
    expect(result.is_error).toBe(true)
    expect(String(result.message)).toContain('No resumable session')
  })

  it('passes the loaded RunState as previousRun to the client', async () => {
    const state = { sessionState: { mainAgentState: { messageHistory: [] } } } as unknown as RunState
    const chatId = saveHeadlessRunState(state)
    expect(chatId).toBeTruthy()

    let sawPreviousRun: unknown
    const client = {
      run: async (opts: any) => {
        sawPreviousRun = opts.previousRun
        await opts.handleEvent?.({ type: 'text', text: 'resumed' })
        return state
      },
    } as unknown as LevelCodeClient

    const { exitCode, result } = await runHeadless({
      prompt: 'next turn',
      outputFormat: 'json',
      agentOverride: null,
      continueChat: true,
      continueId: chatId!,
      client,
      sink: makeSink().capture,
    })

    expect(exitCode).toBe(0)
    // Saved state round-trips through JSON, so compare by structure.
    expect(sawPreviousRun).toEqual(state)
    expect(result.result).toBe('resumed')
  })

  it('saves the finished run and reports session_id on success', async () => {
    const state = { sessionState: { mainAgentState: { messageHistory: [] } } } as unknown as RunState
    const client = {
      run: async ({ handleEvent }: any) => {
        await handleEvent?.({ type: 'text', text: 'done' })
        return state
      },
    } as unknown as LevelCodeClient

    const { capture } = makeSink()
    const { exitCode, result } = await runHeadless({
      prompt: 'first turn',
      outputFormat: 'json',
      agentOverride: null,
      client,
      sink: capture,
    })

    expect(exitCode).toBe(0)
    expect(result.session_id).toMatch(/^[0-9a-f-]{36}$/)

    // The saved session is resumable
    const loaded = loadHeadlessRunState(result.session_id as string)
    expect(loaded).not.toBeNull()
  })

  it('does not save a session after a failed run', async () => {
    const client = {
      run: async () => {
        throw new Error('boom')
      },
    } as unknown as LevelCodeClient

    const { result } = await runHeadless({
      prompt: 'failing',
      outputFormat: 'json',
      agentOverride: null,
      client,
      sink: makeSink().capture,
    })

    expect(result.is_error).toBe(true)
    expect(result.session_id).toBeUndefined()
  })
})

describe('runHeadless fork', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hl-fork-'))
    setProjectRoot(tmpDir)
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('errors with exit code 2 when the fork id is unknown', async () => {
    const { exitCode, result } = await runHeadless({
      prompt: 'branch',
      outputFormat: 'json',
      agentOverride: null,
      forkId: 'no-such-session',
      client: fakeClient([]),
      sink: makeSink().capture,
    })
    expect(exitCode).toBe(2)
    expect(result.is_error).toBe(true)
    expect(String(result.message)).toContain('No forkable session')
  })

  it('forks with lineage and reports forked_from', async () => {
    const state = { sessionState: { mainAgentState: { messageHistory: [{ role: 'user', content: 'origin' }] } } } as unknown as RunState
    const originalId = saveHeadlessRunState(state)
    expect(originalId).toBeTruthy()

    let sawPreviousRun: unknown
    const client = {
      run: async (opts: any) => {
        sawPreviousRun = opts.previousRun
        await opts.handleEvent?.({ type: 'text', text: 'branched' })
        return state
      },
    } as unknown as LevelCodeClient

    const { exitCode, result } = await runHeadless({
      prompt: 'branch',
      outputFormat: 'json',
      agentOverride: null,
      forkId: originalId!,
      client,
      sink: makeSink().capture,
    })

    expect(exitCode).toBe(0)
    expect(result.forked_from).toBe(originalId)
    expect(result.session_id).toBeTruthy()
    expect(sawPreviousRun).toEqual(state)

    // Clone + lineage exist on disk; original has no marker
    const sessions = listSavedSessions()
    const forkEntry = sessions.find((s) => s.chatId === result.session_id)
    expect(forkEntry?.forkedFrom ?? undefined).toBe(originalId ?? undefined)
    const originalEntry = sessions.find((s) => s.chatId === originalId)
    expect(originalEntry?.forkedFrom ?? undefined).toBeUndefined()
  })
})

describe('runHeadless --output-schema', () => {
  const schema = {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      confidence: { type: 'number' },
    },
    required: ['answer', 'confidence'],
    additionalProperties: false,
  }

  const structuredClient = (value: unknown) =>
    ({
      run: async ({ handleEvent }: any) => {
        await handleEvent?.({ type: 'finish', totalCost: 0 })
        return {
          output: { type: 'structuredOutput', value },
        } as any
      },
    } as unknown as LevelCodeClient)

  it('valid structured output passes with schema_valid: true', async () => {
    const { exitCode, result } = await runHeadless({
      prompt: 'q',
      outputFormat: 'json',
      agentOverride: null,
      outputSchema: schema,
      client: structuredClient({ answer: 'yes', confidence: 0.9 }),
      sink: makeSink().capture,
    })

    expect(exitCode).toBe(0)
    expect(result.schema_valid).toBe(true)
  })

  it('invalid structured output fails with schema errors', async () => {
    const { exitCode, result } = await runHeadless({
      prompt: 'q',
      outputFormat: 'json',
      agentOverride: null,
      outputSchema: schema,
      client: structuredClient({ answer: 'yes', wrong: true }),
      sink: makeSink().capture,
    })

    expect(exitCode).toBe(1)
    expect(result.schema_valid).toBe(false)
    expect(Array.isArray(result.schema_errors)).toBe(true)
  })

  it('final text JSON is validated when no structured output was set', async () => {
    const client = {
      run: async ({ handleEvent }: any) => {
        await handleEvent?.({ type: 'text', text: '{"answer":"ok","confidence":0.5}' })
        await handleEvent?.({ type: 'finish', totalCost: 0 })
        return { output: { type: 'lastMessage', value: [] } } as any
      },
    } as unknown as LevelCodeClient

    const { exitCode, result } = await runHeadless({
      prompt: 'q',
      outputFormat: 'json',
      agentOverride: null,
      outputSchema: schema,
      client,
      sink: makeSink().capture,
    })

    expect(exitCode).toBe(0)
    expect(result.schema_valid).toBe(true)
  })

  it('non-JSON final text fails schema validation', async () => {
    const client = {
      run: async ({ handleEvent }: any) => {
        await handleEvent?.({ type: 'text', text: 'plain prose, not json' })
        await handleEvent?.({ type: 'finish', totalCost: 0 })
        return { output: { type: 'lastMessage', value: [] } } as any
      },
    } as unknown as LevelCodeClient

    const { exitCode, result } = await runHeadless({
      prompt: 'q',
      outputFormat: 'json',
      agentOverride: null,
      outputSchema: schema,
      client,
      sink: makeSink().capture,
    })

    expect(exitCode).toBe(1)
    expect(result.schema_valid).toBe(false)
  })
})

describe('runHeadless --checkpoint + --capture-trajectory compose', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hl-compose-'))
    setProjectRoot(tmpDir)
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('a crashed run persists both a resumable session and a replayable trajectory', async () => {
    const client = {
      run: async (opts: any) => {
        for (const stepNumber of [1, 2]) {
          await opts.onStepComplete?.({
            stepNumber,
            fileContext: { projectPath: '/proj' },
            agentState: { agentId: 'a1', messageHistory: [{ role: 'user', content: `s${stepNumber}` }] },
          })
        }
        await opts.handleEvent?.({ type: 'tool_call', toolCallId: 'tc1', toolName: 'edit_file', input: { path: 'a.ts' } })
        await opts.handleEvent?.({ type: 'tool_result', toolCallId: 'tc1', toolName: 'edit_file', output: [{ type: 'json', value: 'ok' }] })
        throw new Error('killed mid-run')
      },
    } as unknown as LevelCodeClient

    const { exitCode, result } = await runHeadless({
      prompt: 'long task',
      outputFormat: 'json',
      agentOverride: null,
      checkpointEvery: 1,
      captureTrajectory: 'compose-test',
      client,
      sink: makeSink().capture,
    })

    expect(exitCode).toBe(1)
    expect(result.is_error).toBe(true)

    // 1) The checkpoint: a resumable session with the step-2 state.
    const sessionId = result.session_id as string
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/)
    const loaded = loadHeadlessRunState(sessionId) as any
    expect(loaded?.sessionState?.mainAgentState?.messageHistory?.[0]?.content).toBe('s2')

    // 2) The trajectory: prompt + tool call + tool result, replayable.
    const { TrajectoryReplay } = (await import('@levelcode/sdk')) as any
    const trajectoryId = result.trajectory_id as string
    expect(trajectoryId).toMatch(/^traj-\d+-[0-9a-f]{8}$/)
    const traj = TrajectoryReplay.loadTrajectory(tmpDir, trajectoryId)
    expect(traj.label).toBe('compose-test')
    expect(traj.steps.map((s: any) => s.type)).toEqual(['user_message', 'tool_call', 'tool_result'])

    // 3) The trajectory converts back into a resumable state.
    const { trajectoryToMessages } = (await import('@levelcode/sdk')) as any
    const { sessionState } = trajectoryToMessages(traj, traj.steps.length - 1)
    expect(sessionState.mainAgentState.messageHistory).toHaveLength(3) // user + assistant(tool-call part) + tool
  })
})

describe('runHeadless --capture-trajectory', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hl-traj-'))
    setProjectRoot(tmpDir)
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const roundTripClient = () =>
    ({
      run: async ({ handleEvent }: any) => {
        await handleEvent?.({ type: 'text', text: 'thinking ' })
        await handleEvent?.({ type: 'text', text: 'hard' })
        await handleEvent?.({ type: 'tool_call', toolCallId: 'tc1', toolName: 'read_file', input: { path: 'a.ts' } })
        await handleEvent?.({ type: 'tool_result', toolCallId: 'tc1', toolName: 'read_file', output: [{ type: 'text', text: 'contents' }] })
        // Subagent events must be excluded from the trajectory.
        await handleEvent?.({ type: 'tool_call', toolCallId: 'tc2', toolName: 'spawn_agents', input: {}, agentId: 'child-1', parentAgentId: 'main-1' } as any)
        await handleEvent?.({ type: 'tool_result', toolCallId: 'tc2', toolName: 'spawn_agents', output: [], parentAgentId: 'main-1' } as any)
        await handleEvent?.({ type: 'text', text: 'subagent text', agentId: 'child-1' } as any)
        await handleEvent?.({ type: 'text', text: ' done' })
        await handleEvent?.({ type: 'finish', totalCost: 0.1 })
        return { sessionState: { mainAgentState: { messageHistory: [] } } } as any
      },
    }) as unknown as LevelCodeClient

  it('writes a replayable trajectory: user_message, coalesced text, tool call/result', async () => {
    const { exitCode, result } = await runHeadless({
      prompt: 'do the thing',
      outputFormat: 'json',
      agentOverride: null,
      captureTrajectory: true,
      client: roundTripClient(),
      sink: makeSink().capture,
    })

    expect(exitCode).toBe(0)
    expect(result.trajectory_id).toMatch(/^traj-\d+-[0-9a-f]{8}$/)
    expect(result.trajectory_steps).toBe(5)

    const { TrajectoryReplay } = (await import('@levelcode/sdk')) as any
    const traj = TrajectoryReplay.loadTrajectory(tmpDir, result.trajectory_id)
    expect(traj.steps.map((s: any) => s.type)).toEqual([
      'user_message', 'assistant_message', 'tool_call', 'tool_result', 'assistant_message',
    ])
    expect(traj.steps[0].content).toBe('do the thing')
    // The two text chunks around the tool call coalesce into model turns.
    expect(traj.steps[1].content).toBe('thinking hard')
    expect(traj.steps[2].name).toBe('read_file')
    expect(traj.steps[4].content).toBe(' done')

    // Replay reconstructs a message history from the captured steps.
    const replay = TrajectoryReplay.replayFromStep(traj, traj.steps.length - 1)
    expect(replay.messages.length).toBeGreaterThan(0)
  })

  it('carries the label into the trajectory file', async () => {
    const { result } = await runHeadless({
      prompt: 'q',
      outputFormat: 'json',
      agentOverride: null,
      captureTrajectory: 'experiment-a',
      client: roundTripClient(),
      sink: makeSink().capture,
    })
    const { TrajectoryReplay } = (await import('@levelcode/sdk')) as any
    const traj = TrajectoryReplay.loadTrajectory(tmpDir, result.trajectory_id)
    expect(traj.label).toBe('experiment-a')
  })

  it('writes no trajectory when the flag is absent', async () => {
    const { result } = await runHeadless({
      prompt: 'q',
      outputFormat: 'json',
      agentOverride: null,
      client: roundTripClient(),
      sink: makeSink().capture,
    })
    expect(result.trajectory_id).toBeUndefined()
    const dir = path.join(tmpDir, '.levelcode', 'trajectories')
    expect(fs.existsSync(dir)).toBe(false)
  })
})

describe('runHeadless context metrics', () => {
  it('reports context_tokens and history_messages from the finished run', async () => {
    const state = {
      sessionState: {
        mainAgentState: {
          contextTokenCount: 4521,
          messageHistory: [{ role: 'user' }, { role: 'assistant' }, { role: 'tool' }],
        },
      },
    } as unknown as RunState
    const client = {
      run: async ({ handleEvent }: any) => {
        await handleEvent?.({ type: 'text', text: 'done' })
        return state
      },
    } as unknown as LevelCodeClient

    const { exitCode, result } = await runHeadless({
      prompt: 'q',
      outputFormat: 'json',
      agentOverride: null,
      client,
      sink: makeSink().capture,
    })

    expect(exitCode).toBe(0)
    expect(result.context_tokens).toBe(4521)
    expect(result.history_messages).toBe(3)
  })

  it('omits metrics when the run exposes none', async () => {
    const client = {
      run: async ({ handleEvent }: any) => {
        await handleEvent?.({ type: 'text', text: 'done' })
        return { sessionState: {} } as any
      },
    } as unknown as LevelCodeClient

    const { result } = await runHeadless({
      prompt: 'q',
      outputFormat: 'json',
      agentOverride: null,
      client,
      sink: makeSink().capture,
    })

    expect(result.context_tokens).toBeUndefined()
    expect(result.history_messages).toBeUndefined()
  })
})

describe('runHeadless failure contract', () => {
  it('reports failure when the run finishes without any output or finish event', async () => {
    const { sink, capture } = makeSink()
    const { exitCode, result } = await runHeadless({
      prompt: 'hi',
      outputFormat: 'json',
      agentOverride: null,
      client: fakeClient([]),
      sink: capture,
    })

    expect(exitCode).toBe(1)
    expect(result.is_error).toBe(true)
    expect(result.subtype).toBe('error_during_execution')
  })

  it('does not flag failure when text was produced but finish never arrived', async () => {
    const { sink, capture } = makeSink()
    const { exitCode, result } = await runHeadless({
      prompt: 'hi',
      outputFormat: 'json',
      agentOverride: null,
      client: fakeClient([{ type: 'text', text: 'partial answer' }]),
      sink: capture,
    })

    expect(exitCode).toBe(0)
    expect(result.is_error).toBe(false)
    expect(result.result).toBe('partial answer')
  })

  it('converts unhandled rejections during the run into the error contract', async () => {
    const { sink, capture } = makeSink()
    // Mimic the SDK's detached stream failure: the rejection surfaces as an
    // unhandledRejection process event instead of a rejected run() promise.
    // (Emitted directly so bun's own unhandled-rejection watchdog, which
    // fails the test before our listener sees it, is not triggered.)
    const flakyClient = {
      run: async ({ handleEvent }: any) => {
        await handleEvent?.({ type: 'text', text: 'partial' })
        process.emit(
          'unhandledRejection',
          new Error('connection refused mid-stream'),
          Promise.resolve(),
        )
        return {} as any
      },
    } as unknown as LevelCodeClient

    const { exitCode, result } = await runHeadless({
      prompt: 'hi',
      outputFormat: 'json',
      agentOverride: null,
      client: flakyClient,
      sink: capture,
    })

    expect(exitCode).toBe(1)
    expect(result.is_error).toBe(true)
  })
})

describe('runHeadless --checkpoint', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hl-checkpoint-'))
    setProjectRoot(tmpDir)
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  /** Client that fires onStepComplete with the given step numbers, then finishes. */
  const steppingClient = (steps: number[]) =>
    ({
      run: async (opts: any) => {
        for (const stepNumber of steps) {
          await opts.onStepComplete?.({
            stepNumber,
            fileContext: { projectPath: '/proj' },
            agentState: { agentId: 'a1', messageHistory: [{ role: 'user', content: `s${stepNumber}` }] },
          })
        }
        await opts.handleEvent?.({ type: 'finish', totalCost: 0 })
        return { sessionState: { mainAgentState: { messageHistory: [] } } } as any
      },
    }) as unknown as LevelCodeClient

  it('overwrites periodic checkpoints with the final state in one chat dir', async () => {
    const before = new Set(listSavedSessions().map((s) => s.chatId))
    const { result } = await runHeadless({
      prompt: 'long task',
      outputFormat: 'json',
      agentOverride: null,
      checkpointEvery: 2,
      client: steppingClient([2, 3, 4, 6]),
      sink: makeSink().capture,
    })

    expect(result.is_error).toBe(false)
    const sessionId = result.session_id as string
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/)
    // Periodic saves and the final save share one pre-generated chat dir.
    const newDirs = listSavedSessions().filter((s) => !before.has(s.chatId))
    expect(newDirs.map((s) => s.chatId)).toEqual([sessionId])

    // The loaded state is the finished run's, not a "Run in progress" stub.
    const loaded = loadHeadlessRunState(sessionId) as any
    expect(loaded?.sessionState?.mainAgentState?.messageHistory).toEqual([])
  })

  it('throttles checkpoint saves to every Nth completed step', async () => {
    // Throwing at step 8 means no final save — the last checkpoint on disk
    // reveals exactly which step was last persisted.
    const client = {
      run: async (opts: any) => {
        for (const stepNumber of [1, 2, 3, 4, 5, 6, 7]) {
          await opts.onStepComplete?.({
            stepNumber,
            fileContext: {},
            agentState: { agentId: 'a1', messageHistory: [{ role: 'user', content: `s${stepNumber}` }] },
          })
        }
        throw new Error('died at step 8')
      },
    } as unknown as LevelCodeClient

    const before = new Set(listSavedSessions().map((s) => s.chatId))
    const { result } = await runHeadless({
      prompt: 'long task',
      outputFormat: 'json',
      agentOverride: null,
      checkpointEvery: 3,
      client,
      sink: makeSink().capture,
    })

    expect(result.is_error).toBe(true)
    expect(result.session_id).toMatch(/^[0-9a-f-]{36}$/)
    const loaded = loadHeadlessRunState(result.session_id as string) as any
    // Checkpoint fires at steps 3 and 6; step 7 is below the threshold.
    expect(loaded?.sessionState?.mainAgentState?.messageHistory?.[0]?.content).toBe('s6')
    // Still exactly one chat dir despite seven step events.
    const newDirs = listSavedSessions().filter((s) => !before.has(s.chatId))
    expect(newDirs).toHaveLength(1)
  })

  it('does not pass onStepComplete when checkpointEvery is not set', async () => {
    const before = new Set(listSavedSessions().map((s) => s.chatId))
    const client = {
      run: async (opts: any) => {
        expect(opts.onStepComplete).toBeUndefined()
        await opts.handleEvent?.({ type: 'finish', totalCost: 0 })
        return { sessionState: { mainAgentState: { messageHistory: [] } } } as any
      },
    } as unknown as LevelCodeClient

    const { result } = await runHeadless({
      prompt: 'q',
      outputFormat: 'json',
      agentOverride: null,
      client,
      sink: makeSink().capture,
    })
    expect(result.is_error).toBe(false)
    expect(result.session_id).toBeTruthy()
    expect(listSavedSessions().filter((s) => !before.has(s.chatId))).toHaveLength(1)
  })

  it('resumes a checkpoint-shaped save (error-stub output) without crashing', async () => {
    // A crashed --checkpoint run leaves {sessionState, output: {type:'error',
    // message:'Run in progress (checkpoint)'}} on disk. --continue must load
    // it, pass the partial history as previousRun, and start a fresh run.
    const checkpointState = {
      sessionState: {
        fileContext: { projectPath: '/proj', agentTemplates: [] },
        mainAgentState: {
          agentId: 'a1',
          childRunIds: [],
          messageHistory: [{ role: 'user', content: 'original task' }],
        },
      },
      output: { type: 'error', message: 'Run in progress (checkpoint)' },
    } as unknown as RunState
    const chatId = saveHeadlessRunState(checkpointState)
    expect(chatId).toBeTruthy()

    let sawPreviousRun: unknown
    const client = {
      run: async (opts: any) => {
        sawPreviousRun = opts.previousRun
        await opts.handleEvent?.({ type: 'finish', totalCost: 0 })
        return { sessionState: { mainAgentState: { messageHistory: [] } } } as any
      },
    } as unknown as LevelCodeClient

    const { exitCode, result } = await runHeadless({
      prompt: 'continue where you left off',
      outputFormat: 'json',
      agentOverride: null,
      continueChat: true,
      continueId: chatId!,
      client,
      sink: makeSink().capture,
    })

    expect(exitCode).toBe(0)
    expect(result.is_error).toBe(false)
    expect(sawPreviousRun).toEqual(checkpointState)
  })

  it('reports the resume handle for a run that throws mid-flight', async () => {
    // Checkpoint fires at steps 2 (checkpointEvery=2); the throw means no
    // final save, so the operator resumes from the step-2 checkpoint.
    const client = {
      run: async (opts: any) => {
        for (const stepNumber of [1, 2, 3]) {
          await opts.onStepComplete?.({
            stepNumber,
            fileContext: { projectPath: '/proj' },
            agentState: { agentId: 'a1', messageHistory: [{ role: 'user', content: `step ${stepNumber}` }] },
          })
        }
        throw new Error('process killed mid-run')
      },
    } as unknown as LevelCodeClient

    const { result } = await runHeadless({
      prompt: 'long task',
      outputFormat: 'json',
      agentOverride: null,
      checkpointEvery: 2,
      client,
      sink: makeSink().capture,
    })

    expect(result.is_error).toBe(true)
    expect(result.session_id).toMatch(/^[0-9a-f-]{36}$/)
    const loaded = loadHeadlessRunState(result.session_id as string) as any
    expect(loaded?.sessionState?.mainAgentState?.messageHistory?.[0]?.content).toBe('step 2')
  })
})
/** Helper: the result payload reports success. */
function exitCodeIsZero(result: Record<string, unknown>): boolean {
  return result.is_error === false
}
