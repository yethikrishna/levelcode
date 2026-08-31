import { describe, it, expect } from 'bun:test'

import { runHeadless } from '../run-headless'

import type { PrintModeEvent } from '@levelcode/common/types/print-mode'
import type { LevelCodeClient } from '@levelcode/sdk'

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
