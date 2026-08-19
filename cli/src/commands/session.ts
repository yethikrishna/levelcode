import { SharedSessionManager, startRelayServer } from '@levelcode/sdk'
import type { SessionRelayServer } from '@levelcode/sdk'

const sessionManager = SharedSessionManager.getInstance()
let relayServer: SessionRelayServer | null = null

/**
 * Handle /session:create - create a new shared session and return its ID.
 */
export function handleSessionCreate(hostId?: string): string {
  const host = hostId ?? `user-${Date.now().toString(36)}`
  const info = sessionManager.createSession(host)
  return [
    `🔗 Shared session created`,
    `  Session ID: ${info.sessionId}`,
    `  Host: ${info.hostId}`,
    `  Created: ${new Date(info.createdAt).toLocaleTimeString()}`,
    ``,
    `Share the session ID with teammates so they can join with /session:join ${info.sessionId}`,
  ].join('\n')
}

/**
 * Handle /session:join <sessionId> [name]
 */
export function handleSessionJoin(args: string, participantId?: string): string {
  const parts = args.trim().split(/\s+/)
  const sessionId = parts[0]
  const name = parts.slice(1).join(' ')

  if (!sessionId) {
    return 'Usage: /session:join <sessionId> [display-name]'
  }

  const pid = participantId ?? `guest-${Date.now().toString(36)}`
  try {
    const state = sessionManager.joinSession(sessionId, pid, name || undefined)
    return [
      `✅ Joined session ${sessionId}`,
      `  Participants: ${state.participants.length}`,
      `  Host: ${state.hostId}`,
      `  Shared files: ${Object.keys(state.fileStates).length}`,
      `  Active agents: ${state.activeAgents.length}`,
    ].join('\n')
  } catch (error) {
    return `❌ Failed to join: ${error instanceof Error ? error.message : String(error)}`
  }
}

/**
 * Handle /session:leave
 */
export function handleSessionLeave(sessionId: string, participantId?: string): string {
  if (!sessionId) {
    return 'Usage: /session:leave <sessionId>'
  }
  const pid = participantId ?? 'user'
  try {
    sessionManager.leaveSession(sessionId, pid)
    return `👋 Left session ${sessionId}`
  } catch (error) {
    return `❌ ${error instanceof Error ? error.message : String(error)}`
  }
}

/**
 * Handle /session:list
 */
export function handleSessionList(): string {
  const sessions = sessionManager.listSessions()
  if (sessions.length === 0) {
    return 'No active shared sessions. Create one with /session:create'
  }
  const lines = [`Active shared sessions (${sessions.length}):`, '']
  for (const s of sessions) {
    lines.push(`  • ${s.sessionId}  (host: ${s.hostId}, participants: ${s.participantCount})`)
  }
  return lines.join('\n')
}

/**
 * Handle /collab:relay [port] - start the WebSocket relay server for multi-machine sessions.
 */
export async function handleCollabRelay(args: string): Promise<string> {
  if (relayServer) {
    const stats = relayServer.getSessionStats()
    return `Relay server is already running. Active sessions: ${stats.length}, connected clients: ${relayServer.clientCount}`
  }

  const port = args.trim() ? parseInt(args.trim(), 10) : 9301
  try {
    relayServer = await startRelayServer({ port })
    return `🔌 Collab relay server started on ws://127.0.0.1:${port}`
  } catch (error) {
    relayServer = null
    return `❌ Failed to start relay: ${error instanceof Error ? error.message : String(error)}`
  }
}

/**
 * Handle /collab:relay:stop
 */
export function handleCollabRelayStop(): string {
  if (!relayServer) {
    return 'No relay server is running.'
  }
  relayServer.stop().catch(() => {})
  relayServer = null
  return '🛑 Relay server stopped.'
}
