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
export function saveHeadlessRunState(runState: RunState): string | null {
  try {
    const chatId = crypto.randomUUID()
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
