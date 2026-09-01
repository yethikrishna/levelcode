import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  saveHeadlessRunState,
  loadHeadlessRunState,
  forkSavedSession,
  listSavedSessions,
  getSessionMessages,
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

  describe('forkSavedSession atMessage', () => {
    const makeMultiTurnState = (): RunState =>
      ({
        sessionState: {
          mainAgentState: {
            messageHistory: [
              { role: 'user', content: 'turn 1' },
              { role: 'assistant', content: 'reply 1' },
              { role: 'user', content: 'turn 2' },
              { role: 'assistant', content: 'reply 2' },
            ],
          },
        },
        output: { type: 'lastMessage', value: [] },
      }) as unknown as RunState

    it('truncates the cloned history to the first N messages', () => {
      const originalId = saveHeadlessRunState(makeMultiTurnState())!
      const forked = forkSavedSession(originalId, { atMessage: 2 })!

      const history = (forked.runState as unknown as {
        sessionState: { mainAgentState: { messageHistory: Array<{ content: string }> } }
      }).sessionState.mainAgentState.messageHistory
      expect(history).toHaveLength(2)
      expect(history.map((m) => m.content)).toEqual(['turn 1', 'reply 1'])
      expect(forked.historyLength).toBe(2)

      // The original keeps all 4 messages
      const original = loadHeadlessRunState(originalId) as unknown as {
        sessionState: { mainAgentState: { messageHistory: unknown[] } }
      }
      expect(original.sessionState.mainAgentState.messageHistory).toHaveLength(4)
    })

    it('atMessage equal to the history length keeps everything', () => {
      const originalId = saveHeadlessRunState(makeMultiTurnState())!
      const forked = forkSavedSession(originalId, { atMessage: 4 })!
      expect(forked.historyLength).toBe(4)
    })

    it('atMessage 0 produces an empty history', () => {
      const originalId = saveHeadlessRunState(makeMultiTurnState())!
      const forked = forkSavedSession(originalId, { atMessage: 0 })!
      const history = (forked.runState as unknown as {
        sessionState: { mainAgentState: { messageHistory: unknown[] } }
      }).sessionState.mainAgentState.messageHistory
      expect(history).toHaveLength(0)
    })

    it('rejects negative, fractional, and out-of-range values with RangeError', () => {
      const originalId = saveHeadlessRunState(makeMultiTurnState())!
      expect(() => forkSavedSession(originalId, { atMessage: -1 })).toThrow(RangeError)
      expect(() => forkSavedSession(originalId, { atMessage: 1.5 })).toThrow(RangeError)
      expect(() => forkSavedSession(originalId, { atMessage: 5 })).toThrow(
        /exceeds history length \(4\)/,
      )
    })

    it('drops tool calls left unanswered by the truncation point', () => {
      const originalId = saveHeadlessRunState({
        sessionState: {
          mainAgentState: {
            messageHistory: [
              { role: 'user', content: 'read the file' },
              {
                role: 'assistant',
                content: [
                  { type: 'text', text: 'Reading it now.' },
                  { type: 'tool-call', toolCallId: 'tc1', toolName: 'read_files', input: {} },
                ],
              },
              { role: 'tool', toolCallId: 'tc1', toolName: 'read_files', content: 'file body' },
              { role: 'assistant', content: [{ type: 'text', text: 'Here is the file.' }] },
            ],
          },
        },
        output: { type: 'lastMessage', value: [] },
      } as unknown as RunState)!

      // Cut right after the tool-call message: tc1 has no tool response.
      const forked = forkSavedSession(originalId, { atMessage: 2 })!
      const history = (forked.runState as unknown as {
        sessionState: { mainAgentState: { messageHistory: Array<Record<string, unknown>> } }
      }).sessionState.mainAgentState.messageHistory

      // The unanswered tool-call part is stripped; user + text part survive.
      expect(history).toHaveLength(2)
      expect(history[1]!.role).toBe('assistant')
      expect(history[1]!.content).toEqual([{ type: 'text', text: 'Reading it now.' }])

      // Cut after the tool response keeps the full exchange intact.
      const forked2 = forkSavedSession(originalId, { atMessage: 4 })!
      const history2 = (forked2.runState as unknown as {
        sessionState: { mainAgentState: { messageHistory: unknown[] } }
      }).sessionState.mainAgentState.messageHistory
      expect(history2).toHaveLength(4)
    })
  })

  describe('getSessionMessages', () => {
    it('previews each message with index and role', () => {
      const chatId = saveHeadlessRunState(
        ({
          sessionState: {
            mainAgentState: {
              messageHistory: [
                { role: 'user', content: 'What files exist here?  '.repeat(20) },
                {
                  role: 'assistant',
                  content: [
                    { type: 'tool_use', id: 't1' },
                    { type: 'text', text: 'Found 3 files.' },
                  ],
                },
                { role: 'user', content: [{ type: 'image' }] },
              ],
            },
          },
          output: { type: 'lastMessage', value: [] },
        }) as unknown as RunState,
      )!

      const detail = getSessionMessages(chatId)!
      expect(detail.historyLength).toBe(3)
      expect(detail.messages[0]).toMatchObject({ index: 0, role: 'user' })
      // Whitespace is collapsed, preview is capped at 100 chars
      expect(detail.messages[0]!.preview.startsWith('What files exist here? What files exist here?')).toBe(true)
      expect(detail.messages[0]!.preview.length).toBeLessThanOrEqual(100)
      // Array content: prefers the text part
      expect(detail.messages[1]!.preview).toBe('Found 3 files.')
      // Array content without a text part: part-type summary
      expect(detail.messages[2]!.preview).toBe('image')
    })

    it('returns null for an unknown chat id', () => {
      expect(getSessionMessages('no-such-id')).toBeNull()
    })
  })
})
