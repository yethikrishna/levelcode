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
 */
export function forkSavedSession(
  sourceChatId: string,
): { forkedChatId: string; runState: RunState } | null {
  const runState = loadHeadlessRunState(sourceChatId)
  if (!runState) return null
  const forkedChatId = saveHeadlessRunState(runState, { forkedFrom: sourceChatId })
  if (!forkedChatId) return null
  return { forkedChatId, runState }
}
