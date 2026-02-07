import { readInbox, clearInbox } from '@levelcode/common/utils/team-fs'

import { formatInboxMessages } from './message-formatter'

import type { TeamProtocolMessage } from '@levelcode/common/types/team-protocol'
import type { Logger } from '@levelcode/common/types/contracts/logger'

const DEFAULT_POLL_INTERVAL_MS = 2000

export interface InboxPollerConfig {
  teamName: string
  agentName: string
  pollIntervalMs?: number
  logger: Logger
}

export interface InboxPollResult {
  messages: TeamProtocolMessage[]
  formattedContent: string | null
}

/**
 * InboxPoller continuously polls an agent's inbox file for new messages
 * and provides them in a format suitable for injection into the agent's
 * next prompt turn.
 *
 * Usage:
 *   const poller = new InboxPoller({ teamName, agentName, logger })
 *   poller.start()
 *   // Between agent turns:
 *   const result = poller.drain()
 *   if (result.formattedContent) {
 *     // inject into message history
 *   }
 *   // When agent shuts down:
 *   poller.stop()
 */
export class InboxPoller {
  private teamName: string
  private agentName: string
  private pollIntervalMs: number
  private logger: Logger

  private timer: ReturnType<typeof setInterval> | null = null
  private pendingMessages: TeamProtocolMessage[] = []
  private running = false

  constructor(config: InboxPollerConfig) {
    this.teamName = config.teamName
    this.agentName = config.agentName
    this.pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    this.logger = config.logger
  }

  /**
   * Start polling the inbox file at the configured interval.
   */
  start(): void {
    if (this.running) {
      return
    }
    this.running = true
    this.timer = setInterval(() => {
      this.poll()
    }, this.pollIntervalMs)

    // Also do an immediate poll on start
    this.poll()
  }

  /**
   * Stop polling.
   */
  stop(): void {
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /**
   * Poll the inbox once and accumulate any new messages.
   * Messages are read from the filesystem and the inbox is cleared
   * after reading to prevent duplicate delivery.
   */
  private poll(): void {
    try {
      const messages = readInbox(this.teamName, this.agentName)
      if (messages.length > 0) {
        this.logger.debug(
          {
            teamName: this.teamName,
            agentName: this.agentName,
            messageCount: messages.length,
          },
          'InboxPoller: received new messages',
        )
        this.pendingMessages.push(...messages)
        clearInbox(this.teamName, this.agentName)
      }
    } catch (error) {
      // Inbox file may not exist yet, which is fine
      this.logger.debug(
        {
          teamName: this.teamName,
          agentName: this.agentName,
          error,
        },
        'InboxPoller: error reading inbox (may not exist yet)',
      )
    }
  }

  /**
   * Drain all accumulated pending messages and return them.
   * After calling drain(), the internal buffer is cleared.
   * Returns both the raw messages and a formatted string suitable
   * for injection into the agent's message history.
   */
  drain(): InboxPollResult {
    if (this.pendingMessages.length === 0) {
      return { messages: [], formattedContent: null }
    }

    const messages = [...this.pendingMessages]
    this.pendingMessages = []

    const formattedContent = formatInboxMessages(messages)

    this.logger.debug(
      {
        teamName: this.teamName,
        agentName: this.agentName,
        drainedCount: messages.length,
      },
      'InboxPoller: drained messages',
    )

    return { messages, formattedContent }
  }

  /**
   * Check if there are any pending messages without draining them.
   */
  hasPendingMessages(): boolean {
    return this.pendingMessages.length > 0
  }

  /**
   * Force an immediate poll (useful before draining between turns).
   */
  pollNow(): void {
    this.poll()
  }

  /**
   * Returns whether the poller is currently running.
   */
  isRunning(): boolean {
    return this.running
  }
}

/**
 * One-shot convenience function: reads the inbox, formats messages,
 * clears the inbox, and returns the result. Useful when you don't need
 * continuous background polling and just want to check between turns.
 */
export function drainInbox(params: {
  teamName: string
  agentName: string
  logger: Logger
}): InboxPollResult {
  const { teamName, agentName, logger } = params

  try {
    const messages = readInbox(teamName, agentName)
    if (messages.length === 0) {
      return { messages: [], formattedContent: null }
    }

    clearInbox(teamName, agentName)
    const formattedContent = formatInboxMessages(messages)

    logger.debug(
      { teamName, agentName, messageCount: messages.length },
      'drainInbox: delivered messages',
    )

    return { messages, formattedContent }
  } catch (error) {
    logger.debug(
      { teamName, agentName, error },
      'drainInbox: error reading inbox',
    )
    return { messages: [], formattedContent: null }
  }
}
