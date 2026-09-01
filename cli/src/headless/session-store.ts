/**
 * Headless session persistence — a thin, explicit wrapper over the TUI's
 * chat-state storage format ({projectDataDir}/chats/<id>/run-state.json).
 *
 * Headless runs save their RunState after completion so a later run can
 * resume them via `levelcode -p --continue [id]`, and the saved format is
 * the same one the TUI writes — sessions are interchangeable between the
 * two surfaces.
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

import { getProjectDataDir } from '../project-files'
import { loadMostRecentChatState } from '../utils/run-state-storage'

import type { RunState } from '@levelcode/sdk'

const RUN_STATE_FILENAME = 'run-state.json'
const CHAT_MESSAGES_FILENAME = 'chat-messages.json'

/**
 * Save a finished headless RunState as a new chat directory.
 * Returns the chat id (also emitted in the headless `result` event as
 * session_id) so callers can chain runs with --continue <id>.
 */
export function saveHeadlessRunState(
  runState: RunState,
  opts?: {
    /** Explicit chat id (used when cloning a forked session). */
    chatId?: string
    /** Lineage marker: the session this one was forked from. */
    forkedFrom?: string
  },
): string | null {
  try {
    const chatId = opts?.chatId ?? crypto.randomUUID()
    const chatDir = path.join(getProjectDataDir(), 'chats', chatId)
    fs.mkdirSync(chatDir, { recursive: true })
    fs.writeFileSync(
      path.join(chatDir, RUN_STATE_FILENAME),
      JSON.stringify(runState, null, 2),
      'utf-8',
    )
    // Headless has no transcript view model; an empty messages array keeps
    // the storage format compatible with loadMostRecentChatState (which
    // requires both files) and with TUI resume (context comes from runState).
    fs.writeFileSync(
      path.join(chatDir, CHAT_MESSAGES_FILENAME),
      '[]',
      'utf-8',
    )
    if (opts?.forkedFrom) {
      fs.writeFileSync(
        path.join(chatDir, 'forked-from.json'),
        JSON.stringify({ forkedFrom: opts.forkedFrom, forkedAt: Date.now() }),
        'utf-8',
      )
    }
    return chatId
  } catch {
    return null
  }
}

/**
 * Load the RunState to resume: the given chat id, or the most recent chat
 * in this project (TUI sessions included).
 */
export function loadHeadlessRunState(chatId?: string): RunState | null {
  const loaded = loadMostRecentChatState(chatId)
  return loaded?.runState ?? null
}

export type SavedSessionSummary = {
  chatId: string
  /** Modification time of the run-state file (ms). */
  modifiedAt: number
  /** First user prompt in the history, truncated for listing. */
  firstPrompt: string
  /** Number of messages in the stored history. */
  messageCount: number
  /** The session this one was forked from, if any. */
  forkedFrom?: string
}

/** Enumerate saved sessions in this project, newest first. */
export function listSavedSessions(): SavedSessionSummary[] {
  const out: SavedSessionSummary[] = []
  let chatsDir: string
  try {
    chatsDir = path.join(getProjectDataDir(), 'chats')
  } catch {
    return []
  }

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(chatsDir, { withFileTypes: true })
  } catch {
    return []
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const chatDir = path.join(chatsDir, entry.name)
    const runStatePath = path.join(chatDir, RUN_STATE_FILENAME)
    try {
      if (!fs.existsSync(runStatePath)) continue
      const stat = fs.statSync(runStatePath)
      const runState = JSON.parse(fs.readFileSync(runStatePath, 'utf-8')) as {
        sessionState?: { mainAgentState?: { messageHistory?: Array<{ role?: string; content?: unknown }> } }
      }
      const history = runState.sessionState?.mainAgentState?.messageHistory ?? []
      const firstUser = history.find((m) => m.role === 'user')
      const text =
        typeof firstUser?.content === 'string'
          ? firstUser.content
          : Array.isArray(firstUser?.content)
            ? ((firstUser!.content as Array<{ type?: string; text?: string }>)
                .find((part) => part.type === 'text')?.text ?? '')
            : ''
      let forkedFrom: string | undefined
      const forkPath = path.join(chatDir, 'forked-from.json')
      if (fs.existsSync(forkPath)) {
        try {
          forkedFrom = (JSON.parse(fs.readFileSync(forkPath, 'utf-8')) as { forkedFrom?: string }).forkedFrom
        } catch {
          forkedFrom = undefined
        }
      }
      out.push({
        chatId: entry.name,
        modifiedAt: stat.mtimeMs,
        firstPrompt: text.slice(0, 80),
        messageCount: history.length,
        forkedFrom,
      })
    } catch {
      // Unreadable session: skip
    }
  }

  out.sort((a, b) => b.modifiedAt - a.modifiedAt)
  return out
}

/**
 * Fork a saved session: clone its RunState into a new session marked with
 * lineage, and return both ids. The original session is untouched.
 *
 * opts.atMessage truncates the cloned history to its first N messages —
 * branch the conversation from an earlier point instead of the end.
 */
export function forkSavedSession(
  sourceChatId: string,
  opts?: { atMessage?: number },
): { forkedChatId: string; runState: RunState; historyLength: number } | null {
  const runState = loadHeadlessRunState(sourceChatId)
  if (!runState) return null

  const history = runState.sessionState?.mainAgentState?.messageHistory ?? []
  const historyLength = history.length

  if (opts?.atMessage !== undefined) {
    if (!Number.isInteger(opts.atMessage) || opts.atMessage < 0) {
      throw new RangeError('--at-message must be a non-negative integer')
    }
    if (opts.atMessage > historyLength) {
      throw new RangeError(
        `--at-message ${opts.atMessage} exceeds history length (${historyLength})`,
      )
    }
    const defined = runState as Required<RunState>
    const truncated = { ...defined }
    truncated.sessionState = { ...defined.sessionState }
    truncated.sessionState.mainAgentState = {
      ...defined.sessionState.mainAgentState,
      messageHistory: history.slice(0, opts.atMessage),
    }
    const forkedChatId = saveHeadlessRunState(truncated, { forkedFrom: sourceChatId })
    if (!forkedChatId) return null
    return { forkedChatId, runState: truncated, historyLength: opts.atMessage }
  }

  const forkedChatId = saveHeadlessRunState(runState, { forkedFrom: sourceChatId })
  if (!forkedChatId) return null
  return { forkedChatId, runState, historyLength }
}

export type SessionMessagePreview = {
  index: number
  role: string
  /** First ~100 chars of text content (or a part-type summary). */
  preview: string
}

/** Inspect a session's message history (for choosing a fork point). */
export function getSessionMessages(
  chatId: string,
): { messages: SessionMessagePreview[]; historyLength: number } | null {
  const runState = loadHeadlessRunState(chatId)
  if (!runState) return null
  const history =
    runState.sessionState?.mainAgentState?.messageHistory ?? []
  const messages: SessionMessagePreview[] = history.map((message, index) => {
    const content = (message as { content?: unknown }).content
    let preview: string
    if (typeof content === 'string') {
      preview = content
    } else if (Array.isArray(content)) {
      const parts = content as Array<{ type?: string; text?: string }>
      const textPart = parts.find((part) => part.type === 'text')
      preview = textPart?.text ?? parts.map((part) => part.type ?? '?').join('+')
    } else {
      preview = ''
    }
    return {
      index,
      role: (message as { role?: string }).role ?? 'unknown',
      preview: preview.replace(/\s+/g, ' ').trim().slice(0, 100),
    }
  })
  return { messages, historyLength: messages.length }
}
