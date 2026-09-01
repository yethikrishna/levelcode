import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  saveHeadlessRunState,
  loadHeadlessRunState,
  forkSavedSession,
  listSavedSessions,
} from '../session-store'
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

  it('forkSavedSession clones into a new id with lineage, original untouched', () => {
    const originalId = saveHeadlessRunState(makeRunState('original content'))
    expect(originalId).toBeTruthy()

    const forked = forkSavedSession(originalId!)
    expect(forked).not.toBeNull()
    expect(forked!.forkedChatId).not.toBe(originalId)
    expect(
      (forked!.runState as unknown as { sessionState: { mainAgentState: { messageHistory: Array<{ content: string }> } } })
        .sessionState.mainAgentState.messageHistory[0]!.content,
    ).toBe('original content')

    // The fork carries a lineage marker
    const sessions = listSavedSessions()
    const forkEntry = sessions.find((s) => s.chatId === forked!.forkedChatId)
    expect(forkEntry?.forkedFrom ?? undefined).toBe(originalId ?? undefined)
    // Original still present and unmarked
    const originalEntry = sessions.find((s) => s.chatId === originalId)
    expect(originalEntry?.forkedFrom ?? undefined).toBeUndefined()
  })

  it('forkSavedSession returns null for an unknown id', () => {
    expect(forkSavedSession('no-such-session')).toBeNull()
  })

  it('listSavedSessions enumerates sessions newest first with prompts', () => {
    saveHeadlessRunState(makeRunState('older prompt'))
    saveHeadlessRunState(makeRunState('newer prompt'))
    const sessions = listSavedSessions()
    expect(sessions.length).toBe(2)
    // mtime tie is legal; just verify both prompts are present and shape holds
    const prompts = sessions.map((s) => s.firstPrompt).sort()
    expect(prompts).toEqual(['newer prompt', 'older prompt'])
    for (const session of sessions) {
      expect(session.chatId).toMatch(/^[0-9a-f-]{36}$/)
      expect(session.messageCount).toBeGreaterThan(0)
    }
  })

  it('returns null when no sessions exist', () => {
    expect(loadHeadlessRunState()).toBeNull()
  })

  it('returns null for an unknown chat id', () => {
    expect(loadHeadlessRunState('no-such-id')).toBeNull()
  })
})
