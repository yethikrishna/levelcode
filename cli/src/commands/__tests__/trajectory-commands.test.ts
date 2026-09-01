import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { COMMAND_REGISTRY } from '../command-registry'
import { TrajectoryReplay } from '@levelcode/sdk'

import type { RouterParams } from '../command-registry'
import type { TrajectoryStep } from '@levelcode/sdk'

const createMockParams = (overrides: Partial<RouterParams> = {}): RouterParams =>
  ({
    abortControllerRef: { current: null },
    agentMode: 'DEFAULT',
    inputRef: { current: null },
    inputValue: '',
    isChainInProgressRef: { current: false },
    isStreaming: false,
    logoutMutation: {} as RouterParams['logoutMutation'],
    streamMessageIdRef: { current: null },
    addToQueue: mock(() => {}),
    clearMessages: mock(() => {}),
    saveToHistory: mock(() => {}),
    scrollToLatest: mock(() => {}),
    sendMessage: mock(async () => {}),
    setBranchRunState: mock(() => {}),
    setCanProcessQueue: mock(() => {}),
    setInputFocused: mock(() => {}),
    setInputValue: mock(() => {}),
    setIsAuthenticated: mock(() => {}),
    setMessages: mock(() => {}),
    setUser: mock(() => {}),
    stopStreaming: mock(() => {}),
    ...overrides,
  }) as RouterParams

/** The router invokes handlers via the registry; find the trajectory commands. */
const getCommand = (name: string) => {
  const cmd = COMMAND_REGISTRY.find((c: { name: string }) => c.name === name)
  if (!cmd) throw new Error(`command not found: ${name}`)
  return cmd
}

const lastSystemText = (params: RouterParams): string => {
  const setMessages = params.setMessages as unknown as { mock: { calls: unknown[][] } }
  const calls = setMessages.mock.calls
  // Walk calls newest-last; each updater receives prev messages and returns
  // the next list — the system message is the one with variant 'ai' and a
  // string content produced by getSystemMessage.
  let sysText = ''
  for (const call of calls) {
    const updater = call[0] as (prev: unknown[]) => unknown[]
    let prev: unknown[] = []
    try {
      const messages = updater(prev) as Array<{ variant?: string; content?: unknown }>
      prev = messages
      const sys = [...messages].reverse().find((m) => m.variant === 'ai')
      if (!sys) continue
      const content = sys.content
      if (typeof content === 'string') sysText = content
    } catch {
      // Non-updater call (direct array) — skip.
    }
  }
  return sysText
}

describe('/trajectory:replay + /trajectory:branch', () => {
  let tmpDir: string
  let realCwd: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'traj-cmd-'))
    realCwd = process.cwd()
    process.chdir(tmpDir)
    const steps: TrajectoryStep[] = [
      { index: 0, type: 'user_message', ts: 1, content: 'refactor foo' },
      { index: 1, type: 'tool_call', ts: 2, id: 'tc1', name: 'edit_file', data: { path: 'a.ts' } },
      { index: 2, type: 'tool_result', ts: 3, id: 'tc1', name: 'edit_file', data: [{ type: 'json', value: 'ok' }] },
      { index: 3, type: 'assistant_message', ts: 4, content: 'done' },
    ]
    TrajectoryReplay.saveTrajectory(tmpDir, {
      sessionId: 'traj-cmd-test',
      cwd: tmpDir,
      startedAt: new Date().toISOString(),
      steps,
    })
  })

  afterEach(() => {
    process.chdir(realCwd)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('replay prints the step-by-step view of a captured trajectory', async () => {
    const cmd = getCommand('trajectory:replay')
    const params = createMockParams()
    await cmd.handler(params, 'traj-cmd-test')

    const text = lastSystemText(params)
    expect(text).toContain('traj-cmd-tes')
    expect(text).toContain('[user_message] refactor foo')
    expect(text).toContain('[tool_call] edit_file')
    expect(text).toContain('/trajectory:branch traj-cmd-tes <step> <prompt>')
  })

  it('replay with unknown id surfaces the error as a system message', async () => {
    const cmd = getCommand('trajectory:replay')
    const params = createMockParams()
    await cmd.handler(params, 'no-such-id')

    const text = lastSystemText(params)
    expect(text).toContain('Trajectory replay error')
    expect(text).toContain('no-such-id')
  })

  it('replay without args shows usage', async () => {
    const cmd = getCommand('trajectory:replay')
    const params = createMockParams()
    await cmd.handler(params, '')

    expect(lastSystemText(params)).toContain('Usage: /trajectory:replay')
  })

  it('branch seeds the next run with reconstructed history and sends the prompt', async () => {
    const cmd = getCommand('trajectory:branch')
    const params = createMockParams()
    await cmd.handler(params, 'traj-cmd-test 3 now simplify it')

    // RunState seeded for the next sendMessage run.
    const setBranchRunState = params.setBranchRunState as unknown as {
      mock: { calls: unknown[][] }
    }
    expect(setBranchRunState.mock.calls).toHaveLength(1)
    const seeded = setBranchRunState.mock.calls[0]![0] as {
      sessionState: { mainAgentState: { messageHistory: Array<{ role: string }> } }
    }
    expect(seeded.sessionState.mainAgentState.messageHistory.map((m) => m.role)).toEqual([
      'user', 'assistant', 'tool', 'assistant',
    ])

    // The branch prompt is sent as a new user message.
    const sendMessage = params.sendMessage as unknown as { mock: { calls: unknown[][] } }
    expect(sendMessage.mock.calls).toHaveLength(1)
    expect(sendMessage.mock.calls[0]![0]).toMatchObject({
      content: 'now simplify it',
      agentMode: 'DEFAULT',
    })

    // Confirmation system message notes the context injection.
    const text = lastSystemText(params)
    expect(text).toContain('Branched from trajectory traj-cmd-tes')
    expect(text).toContain('step 3')
  })

  it('branch drops unanswered tool calls at the cut and says so', async () => {
    // Append a trailing unanswered tool call.
    const loaded = TrajectoryReplay.loadTrajectory(tmpDir, 'traj-cmd-test')
    loaded.steps.push({ index: 4, type: 'tool_call', ts: 5, id: 'tc2', name: 'write_file', data: {} })
    TrajectoryReplay.saveTrajectory(tmpDir, loaded)

    const cmd = getCommand('trajectory:branch')
    const params = createMockParams()
    await cmd.handler(params, 'traj-cmd-test 4 retry')

    const setBranchRunState = params.setBranchRunState as unknown as {
      mock: { calls: unknown[][] }
    }
    const seeded = setBranchRunState.mock.calls[0]![0] as {
      sessionState: { mainAgentState: { messageHistory: Array<{ role: string }> } }
    }
    // tc2's assistant message was stripped: history ends at 'done'.
    expect(seeded.sessionState.mainAgentState.messageHistory.map((m) => m.role)).toEqual([
      'user', 'assistant', 'tool', 'assistant',
    ])
    expect(lastSystemText(params)).toContain('unanswered tool call')
  })

  it('branch with an out-of-range step fails cleanly without seeding', async () => {
    const cmd = getCommand('trajectory:branch')
    const params = createMockParams()
    await cmd.handler(params, 'traj-cmd-test 99 retry')

    expect(
      (params.setBranchRunState as unknown as { mock: { calls: unknown[][] } }).mock.calls,
    ).toHaveLength(0)
    expect(
      (params.sendMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls,
    ).toHaveLength(0)
    expect(lastSystemText(params)).toContain('out of range')
  })

  it('branch with too few args shows usage', async () => {
    const cmd = getCommand('trajectory:branch')
    const params = createMockParams()
    await cmd.handler(params, 'traj-cmd-test 3')

    expect(lastSystemText(params)).toContain('Usage: /trajectory:branch')
  })
})
