import { TrajectoryReplay } from '@levelcode/sdk'
import { getProjectRoot } from '../project-files'

import type { TrajectoryStep } from '@levelcode/sdk'

/**
 * Interactive-run trajectory capture — the TUI counterpart of
 * `levelcode -p --capture-trajectory`. One recorder per run, created by the
 * boot flag (`--capture-trajectory [label]`) and driven by the same event
 * kinds headless sees: the prompt as `user_message`, then tool
 * call/result steps flushed at each boundary (crash-safe — a killed TUI
 * still leaves a replayable trajectory), and coalesced text turns.
 *
 * Mirrors the effort dial's module-state pattern: the recorder is
 * process-global because the TUI boot path (cli-main → chat) has no clean
 * channel to thread a per-run object into use-send-message's closures.
 */

export type TrajectoryRecorder = {
  /** Record the user prompt (first step of every trajectory). */
  recordUserMessage: (content: string) => void
  /** Main-agent text/assistant delta; coalesced into one message per turn. */
  recordTextDelta: (text: string) => void
  /** Main-agent tool call — closes the open text turn, flushes. */
  recordToolCall: (id: string, name: string, input: unknown) => void
  /** Main-agent tool result — flushes (crash-safe boundary). */
  recordToolResult: (id: string, name: string, output: unknown) => void
  /** Final flush (finish event). */
  flush: () => void
  /** The session id the trajectory is stored under. */
  sessionId: string
}

let activeRecorder: TrajectoryRecorder | null = null

export function setActiveTrajectoryRecorder(recorder: TrajectoryRecorder | null): void {
  activeRecorder = recorder
}

export function getActiveTrajectoryRecorder(): TrajectoryRecorder | null {
  return activeRecorder
}

export function createTrajectoryRecorder(label?: string): TrajectoryRecorder | null {
  const sessionId = `traj-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  const projectRoot = (() => {
    try {
      return getProjectRoot() ?? process.cwd()
    } catch {
      return process.cwd()
    }
  })()

  const steps: TrajectoryStep[] = []
  let flushedCount = 0
  let openText = ''
  let openTextTs = 0

  const flush = () => {
    closeOpenText()
    if (steps.length === flushedCount) return
    try {
      // appendSteps re-indexes; only the new slice is passed so the file
      // grows monotonically.
      TrajectoryReplay.appendSteps(
        projectRoot,
        sessionId,
        steps.slice(flushedCount),
        label,
      )
      flushedCount = steps.length
    } catch {
      // Capture is best-effort; never break the run over it.
    }
  }

  const push = (step: Omit<TrajectoryStep, 'index' | 'session'>) => {
    steps.push({ ...step, index: 0, session: sessionId } as TrajectoryStep)
  }

  const closeOpenText = () => {
    if (!openText) return
    push({ type: 'assistant_message', ts: openTextTs, content: openText })
    openText = ''
  }

  const recorder: TrajectoryRecorder = {
    sessionId,
    recordUserMessage: (content) => {
      push({ type: 'user_message', ts: Date.now(), content })
      flush()
    },
    recordTextDelta: (text) => {
      if (!openText) openTextTs = Date.now()
      openText += text
    },
    recordToolCall: (id, name, input) => {
      closeOpenText()
      push({ type: 'tool_call', ts: Date.now(), id, name, data: input })
      flush()
    },
    recordToolResult: (id, name, output) => {
      push({ type: 'tool_result', ts: Date.now(), id, name, data: output })
      flush()
    },
    flush,
  }
  return recorder
}
