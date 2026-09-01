import { describe, it, expect } from 'bun:test'

import { trajectoryToMessages } from '../to-agent-messages'
import { TrajectoryReplay } from '../replay'

import type { TrajectoryStep, Trajectory } from '../replay'

let seq = 0
const step = (s: Omit<TrajectoryStep, 'index' | 'ts'> & { ts?: number }): TrajectoryStep => ({
  index: seq++,
  ts: s.ts ?? 1700000000000 + seq,
  ...s,
})

const makeTrajectory = (steps: TrajectoryStep[]): Trajectory => ({
  sessionId: 'traj-test',
  cwd: '/proj',
  startedAt: '2026-09-02T00:00:00.000Z',
  steps,
})

describe('trajectoryToMessages', () => {
  it('converts user/assistant/tool steps into a resumable message history', () => {
    const trajectory = makeTrajectory([
      step({ type: 'user_message', content: 'fix the bug' }),
      step({ type: 'assistant_message', content: 'reading the file' }),
      step({ type: 'tool_call', id: 'tc1', name: 'read_file', data: { path: 'a.ts' } }),
      step({ type: 'tool_result', id: 'tc1', name: 'read_file', data: [{ type: 'text', text: 'contents' }] }),
      step({ type: 'assistant_message', content: 'fixed it' }),
    ])

    const { sessionState, droppedToolCallIds } = trajectoryToMessages(trajectory, 4)

    expect(droppedToolCallIds).toEqual([])
    const history = sessionState.mainAgentState.messageHistory
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'assistant', 'tool', 'assistant'])

    // Tool call round-trips as a tool-call part on the assistant message.
    const callMsg = history[2]!
    if (callMsg.role !== 'assistant') throw new Error('expected assistant')
    const callPart = callMsg.content.find((p) => p.type === 'tool-call')
    expect(callPart).toMatchObject({ toolCallId: 'tc1', toolName: 'read_file' })

    const toolMsg = history[3]!
    if (toolMsg.role !== 'tool') throw new Error('expected tool')
    expect(toolMsg.toolCallId).toBe('tc1')
  })

  it('coalesces adjacent assistant text chunks into one message', () => {
    const trajectory = makeTrajectory([
      step({ type: 'user_message', content: 'q' }),
      step({ type: 'assistant_message', content: 'think' }),
      step({ type: 'delta', content: 'ing' }),
      step({ type: 'delta', content: ' out loud' }),
    ])
    const { sessionState } = trajectoryToMessages(trajectory, 3)
    const history = sessionState.mainAgentState.messageHistory
    expect(history).toHaveLength(2)
    const assistant = history[1]!
    if (assistant.role !== 'assistant') throw new Error('expected assistant')
    const text = assistant.content.find((p) => p.type === 'text')
    expect(text && 'text' in text ? text.text : '').toBe('thinking out loud')
  })

  it('drops a trailing unanswered tool call and reports it', () => {
    // Crash mid-round-trip: call recorded, result never captured.
    const trajectory = makeTrajectory([
      step({ type: 'user_message', content: 'q' }),
      step({ type: 'tool_call', id: 'tc9', name: 'write_file', data: { path: 'x.ts' } }),
    ])
    const { sessionState, droppedToolCallIds } = trajectoryToMessages(trajectory, 1)
    expect(droppedToolCallIds).toEqual(['tc9'])
    // The assistant message held only the tool call — stripped entirely.
    const history = sessionState.mainAgentState.messageHistory
    expect(history.map((m) => m.role)).toEqual(['user'])
  })

  it('keeps an answered tool call but drops a second unanswered one on the same message', () => {
    const trajectory = makeTrajectory([
      step({ type: 'user_message', content: 'q' }),
      step({ type: 'tool_call', id: 'a', name: 't1', data: {} }),
      step({ type: 'tool_result', id: 'a', name: 't1', data: [] }),
      step({ type: 'tool_call', id: 'b', name: 't2', data: {} }),
    ])
    const { sessionState, droppedToolCallIds } = trajectoryToMessages(trajectory, 3)
    expect(droppedToolCallIds).toEqual(['b'])
    const history = sessionState.mainAgentState.messageHistory
    const assistant = history[1]!
    if (assistant.role !== 'assistant') throw new Error('expected assistant')
    expect(assistant.content.some((p) => p.type === 'tool-call' && p.toolCallId === 'a')).toBe(true)
  })

  it('appends the branch prompt as the final user message', () => {
    const trajectory = makeTrajectory([step({ type: 'user_message', content: 'q' })])
    const { sessionState } = trajectoryToMessages(trajectory, 0, 'try a different approach')
    const history = sessionState.mainAgentState.messageHistory
    const last = history[history.length - 1]!
    if (last.role !== 'user') throw new Error('expected user')
    const text = last.content.find((p) => p.type === 'text')
    expect(text && 'text' in text ? text.text : '').toBe('try a different approach')
  })

  it('rejects out-of-range step indices', () => {
    const trajectory = makeTrajectory([step({ type: 'user_message', content: 'q' })])
    expect(() => trajectoryToMessages(trajectory, 1)).toThrow(RangeError)
    expect(() => trajectoryToMessages(trajectory, -1)).toThrow(RangeError)
  })

  it('round-trips with a real captured trajectory file on disk', () => {
    const tmp = require('os').tmpdir() + '/traj-roundtrip-' + Date.now()
    const steps = [
      step({ type: 'user_message', content: 'refactor foo' }),
      step({ type: 'tool_call', id: 'tc1', name: 'edit_file', data: { path: 'a.ts' } }),
      step({ type: 'tool_result', id: 'tc1', name: 'edit_file', data: [{ type: 'json', value: 'ok' }] }),
      step({ type: 'assistant_message', content: 'done' }),
    ]
    TrajectoryReplay.saveTrajectory(tmp, {
      sessionId: 'traj-rt',
      cwd: tmp,
      startedAt: new Date().toISOString(),
      steps,
    })
    try {
      const loaded = TrajectoryReplay.loadTrajectory(tmp, 'traj-rt')
      const { sessionState } = trajectoryToMessages(loaded, loaded.steps.length - 1, 'now simplify it')
      const history = sessionState.mainAgentState.messageHistory
      expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant', 'user'])
      expect(history[0]).toMatchObject({ role: 'user' })
    } finally {
      require('fs').rmSync(tmp, { recursive: true, force: true })
    }
  })
})
