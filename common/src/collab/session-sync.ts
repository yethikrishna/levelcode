import { EventEmitter } from 'events'

/**
 * Types of messages that can be broadcast in a shared session.
 */
export type SessionMessageType =
  | 'prompt'
  | 'agent-event'
  | 'file-edit'
  | 'join'
  | 'leave'
  | 'cursor'
  | 'state-sync'
  | 'chat-message'
  | 'error'

/**
 * A participant in a shared session.
 */
export interface SessionParticipant {
  id: string
  name?: string
  joinedAt: number
  lastSeen: number
  color?: string
}

/**
 * Shared file state tracked across the session.
 */
export interface SharedFileState {
  path: string
  content: string
  lastEditedBy?: string
  lastEditedAt?: number
  revision: number
}

/**
 * Snapshot of an active agent in the session.
 */
export interface ActiveAgent {
  id: string
  name: string
  participantId: string
  status: 'idle' | 'thinking' | 'running-tool' | 'waiting' | 'done' | 'error'
  model?: string
  startedAt: number
  lastActivityAt: number
}

/**
 * A shared prompt/chat history entry.
 */
export interface SharedPromptEntry {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  participantId?: string
  agentId?: string
  timestamp: number
}

/**
 * Shared session state visible to all participants.
 */
export interface SharedState {
  sessionId: string
  hostId: string
  createdAt: number
  participants: SessionParticipant[]
  promptHistory: SharedPromptEntry[]
  fileStates: Record<string, SharedFileState>
  activeAgents: ActiveAgent[]
}

/**
 * A message broadcast to session participants.
 */
export interface SessionMessage {
  id: string
  type: SessionMessageType
  sessionId: string
  participantId: string
  timestamp: number
  payload: Record<string, unknown>
}

/**
 * Metadata returned when a session is created.
 */
export interface SessionInfo {
  sessionId: string
  hostId: string
  createdAt: number
  participantCount: number
  wsUrl?: string
}

/**
 * Handler type for incoming session messages.
 */
export type SessionMessageHandler = (message: SessionMessage) => void

/**
 * Manages shared collaborative sessions where multiple participants
 * (humans and agents) can see the same prompt history, file states,
 * and agent activity in real time.
 *
 * Uses an in-memory EventEmitter for local-process sessions, with
 * an optional WebSocket transport for multi-machine sessions via
 * the relay server (see sdk/src/collab/relay-server.ts).
 */
export class SharedSessionManager extends EventEmitter {
  private sessions = new Map<string, SharedState>()
  private handlers = new Map<string, Set<SessionMessageHandler>>()
  private static instance: SharedSessionManager | null = null

  constructor() {
    super()
    this.setMaxListeners(100)
  }

  /**
   * Get or create the singleton manager instance.
   */
  static getInstance(): SharedSessionManager {
    if (!SharedSessionManager.instance) {
      SharedSessionManager.instance = new SharedSessionManager()
    }
    return SharedSessionManager.instance
  }

  /**
   * Reset the singleton (useful for testing).
   */
  static resetInstance(): void {
    if (SharedSessionManager.instance) {
      SharedSessionManager.instance.removeAllListeners()
      SharedSessionManager.instance.sessions.clear()
      SharedSessionManager.instance.handlers.clear()
      SharedSessionManager.instance = null
    }
  }

  /**
   * Create a new shared session hosted by the given participant.
   */
  createSession(hostId: string): SessionInfo {
    const sessionId = this.generateSessionId()
    const now = Date.now()

    const state: SharedState = {
      sessionId,
      hostId,
      createdAt: now,
      participants: [
        {
          id: hostId,
          name: 'Host',
          joinedAt: now,
          lastSeen: now,
        },
      ],
      promptHistory: [],
      fileStates: {},
      activeAgents: [],
    }

    this.sessions.set(sessionId, state)
    this.handlers.set(sessionId, new Set())

    this.emit('session-created', { sessionId, hostId } satisfies Partial<SessionInfo>)
    this.broadcastInternal(sessionId, hostId, 'join', { participantId: hostId })

    return {
      sessionId,
      hostId,
      createdAt: now,
      participantCount: 1,
    }
  }

  /**
   * Join an existing session. Returns the current shared state snapshot.
   */
  joinSession(sessionId: string, participantId: string, name?: string): SharedState {
    const state = this.sessions.get(sessionId)
    if (!state) {
      throw new Error(`Session "${sessionId}" not found`)
    }

    const now = Date.now()
    const existing = state.participants.find(p => p.id === participantId)
    if (existing) {
      existing.lastSeen = now
      if (name) existing.name = name
    } else {
      state.participants.push({
        id: participantId,
        name: name ?? `Guest-${participantId.slice(0, 6)}`,
        joinedAt: now,
        lastSeen: now,
      })
    }

    this.broadcastInternal(sessionId, participantId, 'join', { participantId, name })
    return state
  }

  /**
   * Broadcast a message to all participants in a session.
   * Local listeners and (if connected) WebSocket relay peers receive it.
   */
  broadcast(sessionId: string, participantId: string, type: SessionMessageType, payload: Record<string, unknown> = {}): SessionMessage {
    const state = this.sessions.get(sessionId)
    if (!state) {
      throw new Error(`Session "${sessionId}" not found`)
    }

    return this.broadcastInternal(sessionId, participantId, type, payload)
  }

  /**
   * Append a prompt/message to the shared prompt history.
   */
  addPromptEntry(sessionId: string, entry: Omit<SharedPromptEntry, 'id' | 'timestamp'>): SharedPromptEntry {
    const state = this.sessions.get(sessionId)
    if (!state) {
      throw new Error(`Session "${sessionId}" not found`)
    }

    const full: SharedPromptEntry = {
      ...entry,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    }
    state.promptHistory.push(full)
    this.broadcastInternal(sessionId, entry.participantId ?? 'system', 'chat-message', { entry: full })
    return full
  }

  /**
   * Update a file's shared state (after an edit).
   */
  updateFileState(sessionId: string, filePath: string, content: string, editedBy: string): SharedFileState {
    const state = this.sessions.get(sessionId)
    if (!state) {
      throw new Error(`Session "${sessionId}" not found`)
    }

    const now = Date.now()
    const existing = state.fileStates[filePath]
    const fileState: SharedFileState = {
      path: filePath,
      content,
      lastEditedBy: editedBy,
      lastEditedAt: now,
      revision: (existing?.revision ?? 0) + 1,
    }
    state.fileStates[filePath] = fileState
    this.broadcastInternal(sessionId, editedBy, 'file-edit', { file: fileState })
    return fileState
  }

  /**
   * Register an active agent in the session.
   */
  registerAgent(sessionId: string, agent: Omit<ActiveAgent, 'startedAt' | 'lastActivityAt'>): ActiveAgent {
    const state = this.sessions.get(sessionId)
    if (!state) {
      throw new Error(`Session "${sessionId}" not found`)
    }

    const now = Date.now()
    const full: ActiveAgent = {
      ...agent,
      startedAt: now,
      lastActivityAt: now,
    }
    state.activeAgents.push(full)
    this.broadcastInternal(sessionId, agent.participantId, 'agent-event', { event: 'agent-registered', agent: full })
    return full
  }

  /**
   * Update an agent's status in the session.
   */
  updateAgentStatus(sessionId: string, agentId: string, status: ActiveAgent['status']): void {
    const state = this.sessions.get(sessionId)
    if (!state) return
    const agent = state.activeAgents.find(a => a.id === agentId)
    if (agent) {
      agent.status = status
      agent.lastActivityAt = Date.now()
      this.broadcastInternal(sessionId, agent.participantId, 'agent-event', { event: 'agent-status', agentId, status })
    }
  }

  /**
   * Get the current shared state for a session.
   */
  getState(sessionId: string): SharedState {
    const state = this.sessions.get(sessionId)
    if (!state) {
      throw new Error(`Session "${sessionId}" not found`)
    }
    return state
  }

  /**
   * Leave a session. If the host leaves, the session is destroyed.
   */
  leaveSession(sessionId: string, participantId: string): void {
    const state = this.sessions.get(sessionId)
    if (!state) return

    state.participants = state.participants.filter(p => p.id !== participantId)
    this.broadcastInternal(sessionId, participantId, 'leave', { participantId })

    if (participantId === state.hostId || state.participants.length === 0) {
      this.destroySession(sessionId)
    }
  }

  /**
   * Subscribe a handler to session messages. Returns an unsubscribe function.
   */
  subscribe(sessionId: string, handler: SessionMessageHandler): () => void {
    let set = this.handlers.get(sessionId)
    if (!set) {
      set = new Set()
      this.handlers.set(sessionId, set)
    }
    set.add(handler)
    return () => set!.delete(handler)
  }

  /**
   * List all active sessions.
   */
  listSessions(): SessionInfo[] {
    const results: SessionInfo[] = []
    for (const state of this.sessions.values()) {
      results.push({
        sessionId: state.sessionId,
        hostId: state.hostId,
        createdAt: state.createdAt,
        participantCount: state.participants.length,
      })
    }
    return results
  }

  /**
   * Destroy a session and remove all state.
   */
  destroySession(sessionId: string): void {
    this.emit('session-destroyed', { sessionId })
    this.sessions.delete(sessionId)
    this.handlers.delete(sessionId)
  }

  // ── Internal ───────────────────────────────────────────────────────

  private broadcastInternal(
    sessionId: string,
    participantId: string,
    type: SessionMessageType,
    payload: Record<string, unknown>,
  ): SessionMessage {
    const message: SessionMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      sessionId,
      participantId,
      timestamp: Date.now(),
      payload,
    }

    const handlers = this.handlers.get(sessionId)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(message)
        } catch {
          // Swallow handler errors so one bad subscriber can't break others.
        }
      }
    }

    this.emit('message', message)
    return message
  }

  private generateSessionId(): string {
    return `ss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }
}
