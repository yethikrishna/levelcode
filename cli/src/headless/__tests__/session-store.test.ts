import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { saveHeadlessRunState, loadHeadlessRunState } from '../session-store'
import { setProjectRoot, getProjectDataDir } from '../../project-files'

import type { RunState } from '@levelcode/sdk'

const makeRunState = (marker: string): RunState =>
  ({
    sessionState: {
      mainAgentState: { messageHistory: [{ role: 'user', content: marker }] },
    },
    output: { type: 'lastMessage', value: [] },
  }) as unknown as RunState

describe('headless session store', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hl-session-'))
    setProjectRoot(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('save returns a chat id and the state round-trips by id', () => {
    const state = makeRunState('resume-me')
    const chatId = saveHeadlessRunState(state)

    expect(chatId).toBeTruthy()
    expect(chatId).toMatch(/^[0-9a-f-]{36}$/)

    const loaded = loadHeadlessRunState(chatId!)
    expect(loaded).not.toBeNull()
    expect(
      (loaded as unknown as { sessionState: { mainAgentState: { messageHistory: Array<{ content: string }> } } })
        .sessionState.mainAgentState.messageHistory[0]!.content,
    ).toBe('resume-me')

    // Both files exist (TUI-compatible format)
    const chatDir = path.join(getProjectDataDir(), 'chats', chatId!)
    expect(fs.existsSync(path.join(chatDir, 'run-state.json'))).toBe(true)
    expect(fs.existsSync(path.join(chatDir, 'chat-messages.json'))).toBe(true)
  })

  it('load without an id returns the most recent saved session', () => {
    const first = saveHeadlessRunState(makeRunState('first'))
    const second = saveHeadlessRunState(makeRunState('second'))

    expect(first).toBeTruthy()
    expect(second).toBeTruthy()

    // Linux mtime granularity can make both saves appear simultaneous;
    // age the first chat DIRECTORY (what getMostRecentChatDir sorts by).
    const past = new Date(Date.now() - 60_000)
    const firstChatDir = path.join(getProjectDataDir(), 'chats', first!)
    fs.utimesSync(firstChatDir, past, past)
    for (const file of fs.readdirSync(firstChatDir)) {
      fs.utimesSync(path.join(firstChatDir, file), past, past)
    }

    const loaded = loadHeadlessRunState()
    expect(
      (loaded as unknown as { sessionState: { mainAgentState: { messageHistory: Array<{ content: string }> } } })
        .sessionState.mainAgentState.messageHistory[0]!.content,
    ).toBe('second')
  })

  it('returns null when no sessions exist', () => {
    expect(loadHeadlessRunState()).toBeNull()
  })

  it('returns null for an unknown chat id', () => {
    expect(loadHeadlessRunState('no-such-id')).toBeNull()
  })
})
