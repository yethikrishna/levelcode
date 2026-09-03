import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  createTrajectoryRecorder,
  setActiveTrajectoryRecorder,
  getActiveTrajectoryRecorder,
} from '../trajectory-recorder'
import { setProjectRoot } from '../../project-files'
import { TrajectoryReplay } from '@levelcode/sdk'

describe('trajectory-recorder (TUI capture)', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'traj-rec-'))
    setProjectRoot(tmpDir)
  })
  afterEach(() => {
    setActiveTrajectoryRecorder(null)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('records prompt, coalesced text, and tool round-trip; flushes at boundaries', () => {
    const recorder = createTrajectoryRecorder('tui-run')
    expect(recorder).not.toBeNull()

    recorder!.recordUserMessage('fix the parser')
    // Text deltas before any tool call are still open — nothing flushed yet.
    recorder!.recordTextDelta('reading ')
    recorder!.recordTextDelta('files')

    recorder!.recordToolCall('tc1', 'read_file', { path: 'a.ts' })
    // The open text turn was closed by the tool-call boundary.
    recorder!.recordToolResult('tc1', 'read_file', [{ type: 'json', value: 'ok' }])

    recorder!.recordTextDelta('fixed it')
    recorder!.flush()

    const traj = TrajectoryReplay.loadTrajectory(tmpDir, recorder!.sessionId)
    expect(traj.label).toBe('tui-run')
    expect(traj.steps.map((s) => s.type)).toEqual([
      'user_message', 'assistant_message', 'tool_call', 'tool_result', 'assistant_message',
    ])
    expect(traj.steps[0]!.content).toBe('fix the parser')
    expect(traj.steps[1]!.content).toBe('reading files')

    // Convertible to a resumable state via the SDK bridge.
    const { trajectoryToMessages } = require('@levelcode/sdk') as {
      trajectoryToMessages: (t: unknown, i: number) => { sessionState: { mainAgentState: { messageHistory: unknown[] } } }
    }
    const { sessionState } = trajectoryToMessages(traj, traj.steps.length - 1)
    expect(sessionState.mainAgentState.messageHistory).toHaveLength(5) // user, text turn, tool-call turn, tool result, final text
  })

  it('survives a hard flush gap: file on disk holds everything flushed before the crash', () => {
    const recorder = createTrajectoryRecorder()
    recorder!.recordUserMessage('step one')
    recorder!.recordToolCall('tc1', 'edit_file', {})
    // No recordToolResult, no final flush — simulating a crash right here.
    // recordToolCall flushes at its own boundary, so the prompt AND the call
    // are already on disk (crash-safe), only the missing result is lost.
    const traj = TrajectoryReplay.loadTrajectory(tmpDir, recorder!.sessionId)
    expect(traj.steps.map((s) => s.type)).toEqual(['user_message', 'tool_call'])
  })

  it('module-level active recorder set/get/clear', () => {
    expect(getActiveTrajectoryRecorder()).toBeNull()
    const recorder = createTrajectoryRecorder()!
    setActiveTrajectoryRecorder(recorder)
    expect(getActiveTrajectoryRecorder()).toBe(recorder)
    setActiveTrajectoryRecorder(null)
    expect(getActiveTrajectoryRecorder()).toBeNull()
  })

  it('skips flush when nothing new (no spurious writes)', () => {
    const recorder = createTrajectoryRecorder()!
    recorder!.recordUserMessage('q')
    // appendSteps would have created the file; a second flush with nothing
    // new must not rewrite or duplicate steps.
    const before = TrajectoryReplay.loadTrajectory(tmpDir, recorder!.sessionId)
    recorder!.flush()
    const after = TrajectoryReplay.loadTrajectory(tmpDir, recorder!.sessionId)
    expect(after.steps).toHaveLength(before.steps.length)
  })
})
