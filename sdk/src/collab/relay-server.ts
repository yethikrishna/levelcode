import { WebSocketServer, WebSocket } from 'ws'
import { EventEmitter } from 'events'
import type { SessionMessage } from '@levelcode/common/collab/session-sync'

/**
 * Lightweight WebSocket relay server for multi-machine shared sessions.
 *
 * Protocol:
 *   Client → Server: JSON messages
 *     { type: 'join', sessionId, participantId, name? }
 *     { type: 'leave', sessionId, participantId }
 *     { type: 'broadcast', sessionId, participantId, messageType, payload }
 *     { type: 'ping' }
 *
 *   Server → Client: JSON messages
 *     { type: 'session-message', message: SessionMessage }
 *     { type: 'joined', sessionId, participants }
 *     { type: 'error', message }
 *     { type: 'pong' }
 *     { type: 'session-list', sessions: [{sessionId, participantCount}] }
 */

interface RelayClient {
  ws: WebSocket
  sessions: Set<string>
  participantId?: string
  name?: string
  lastSeen: number
}

export interface RelayServerOptions {
  /** Port to listen on (default: 9301) */
  port?: number
  /** Host to bind to (default: 127.0.0.1) */
  host?: string
}

interface RelayMessageIn {
  type: 'join' | 'leave' | 'broadcast' | 'ping' | 'list-sessions'
  sessionId?: string
  participantId?: string
  name?: string
  messageType?: string
  payload?: Record<string, unknown>
}

/**
 * A WebSocket relay that routes SessionMessages between connected clients
 * subscribed to the same session. The relay is session-aware but session-state
 * agnostic — it does not hold SharedState; the SharedSessionManager on each
 * client owns the canonical state and the relay simply fans messages out.
 */
export class SessionRelayServer extends EventEmitter {
  private wss: WebSocketServer | null = null
  private clients = new Set<RelayClient>()
  private sessionParticipants = new Map<string, Set<RelayClient>>()
  private port: number
  private host: string

  constructor(options: RelayServerOptions = {}) {
    super()
    this.port = options.port ?? 9301
    this.host = options.host ?? '127.0.0.1'
  }

  /**
   * Start the relay server.
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.port, host: this.host })

        this.wss.on('connection', (ws) => {
          const client: RelayClient = {
            ws,
            sessions: new Set(),
            lastSeen: Date.now(),
          }
          this.clients.add(client)
          this.emit('client-connected', { totalClients: this.clients.size })

          ws.on('message', (raw) => {
            client.lastSeen = Date.now()
            try {
              const msg = JSON.parse(raw.toString()) as RelayMessageIn
              this.handleMessage(client, msg)
            } catch (error) {
              this.send(client, { type: 'error', message: 'Invalid JSON' })
            }
          })

          ws.on('close', () => {
            this.handleDisconnect(client)
          })

          ws.on('error', () => {
            this.handleDisconnect(client)
          })
        })

        this.wss.on('listening', () => {
          this.emit('listening', { port: this.port, host: this.host })
          resolve()
        })

        this.wss.on('error', (error) => {
          reject(error)
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Stop the relay server.
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) {
        resolve()
        return
      }
      for (const client of this.clients) {
        try {
          client.ws.close()
        } catch {}
      }
      this.wss.close(() => resolve())
      this.wss = null
      this.clients.clear()
      this.sessionParticipants.clear()
    })
  }

  /**
   * Get the number of currently connected clients.
   */
  get clientCount(): number {
    return this.clients.size
  }

  /**
   * Get stats about active sessions.
   */
  getSessionStats(): Array<{ sessionId: string; participantCount: number }> {
    const results: Array<{ sessionId: string; participantCount: number }> = []
    for (const [sessionId, set] of this.sessionParticipants) {
      results.push({ sessionId, participantCount: set.size })
    }
    return results
  }

  private handleMessage(client: RelayClient, msg: RelayMessageIn): void {
    switch (msg.type) {
      case 'ping':
        this.send(client, { type: 'pong' })
        break

      case 'join': {
        if (!msg.sessionId || !msg.participantId) {
          this.send(client, { type: 'error', message: 'join requires sessionId and participantId' })
          return
        }
        client.participantId = msg.participantId
        if (msg.name) client.name = msg.name
        client.sessions.add(msg.sessionId)

        let participants = this.sessionParticipants.get(msg.sessionId)
        if (!participants) {
          participants = new Set()
          this.sessionParticipants.set(msg.sessionId, participants)
        }
        participants.add(client)

        const participantList = Array.from(participants).map(c => ({
          participantId: c.participantId,
          name: c.name,
        }))

        this.send(client, { type: 'joined', sessionId: msg.sessionId, participants: participantList })
        this.broadcastToSession(msg.sessionId, client, {
          type: 'session-message',
          message: {
            id: `relay-${Date.now()}`,
            type: 'join',
            sessionId: msg.sessionId,
            participantId: msg.participantId,
            timestamp: Date.now(),
            payload: { name: msg.name },
          } satisfies SessionMessage,
        })
        break
      }

      case 'leave': {
        if (!msg.sessionId || !msg.participantId) return
        client.sessions.delete(msg.sessionId)
        const participants = this.sessionParticipants.get(msg.sessionId)
        if (participants) {
          participants.delete(client)
          if (participants.size === 0) {
            this.sessionParticipants.delete(msg.sessionId)
          } else {
            this.broadcastToSession(msg.sessionId, client, {
              type: 'session-message',
              message: {
                id: `relay-${Date.now()}`,
                type: 'leave',
                sessionId: msg.sessionId,
                participantId: msg.participantId,
                timestamp: Date.now(),
                payload: {},
              } satisfies SessionMessage,
            })
          }
        }
        break
      }

      case 'broadcast': {
        if (!msg.sessionId || !msg.participantId || !msg.messageType) {
          this.send(client, { type: 'error', message: 'broadcast requires sessionId, participantId, messageType' })
          return
        }
        const sessionMsg: SessionMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: msg.messageType as SessionMessage['type'],
          sessionId: msg.sessionId,
          participantId: msg.participantId,
          timestamp: Date.now(),
          payload: msg.payload ?? {},
        }
        this.broadcastToSession(msg.sessionId, client, { type: 'session-message', message: sessionMsg })
        break
      }

      case 'list-sessions': {
        this.send(client, { type: 'session-list', sessions: this.getSessionStats() })
        break
      }
    }
  }

  private handleDisconnect(client: RelayClient): void {
    this.clients.delete(client)
    for (const sessionId of client.sessions) {
      const participants = this.sessionParticipants.get(sessionId)
      if (participants) {
        participants.delete(client)
        if (participants.size === 0) {
          this.sessionParticipants.delete(sessionId)
        } else if (client.participantId) {
          this.broadcastToSession(sessionId, client, {
            type: 'session-message',
            message: {
              id: `relay-${Date.now()}`,
              type: 'leave',
              sessionId,
              participantId: client.participantId,
              timestamp: Date.now(),
              payload: { disconnected: true },
            } satisfies SessionMessage,
          })
        }
      }
    }
    client.sessions.clear()
    try { client.ws.close() } catch {}
    this.emit('client-disconnected', { totalClients: this.clients.size })
  }

  private broadcastToSession(sessionId: string, sender: RelayClient, payload: Record<string, unknown>): void {
    const participants = this.sessionParticipants.get(sessionId)
    if (!participants) return
    const data = JSON.stringify(payload)
    for (const client of participants) {
      if (client === sender) continue
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data)
      }
    }
  }

  private send(client: RelayClient, payload: Record<string, unknown>): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(payload))
    }
  }
}

/**
 * Convenience: start a relay server from CLI and log the listening address.
 */
export async function startRelayServer(options: RelayServerOptions = {}): Promise<SessionRelayServer> {
  const server = new SessionRelayServer(options)
  server.on('listening', ({ port, host }) => {
    console.log(`[collab-relay] Listening on ws://${host}:${port}`)
  })
  await server.start()
  return server
}
