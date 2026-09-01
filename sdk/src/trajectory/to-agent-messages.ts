import type { Message } from '@levelcode/common/types/messages/levelcode-message'
import type { AgentState, SessionState } from '@levelcode/common/types/session-state'
import { getInitialAgentState } from '@levelcode/common/types/session-state'
import { getStubProjectFileContext } from '@levelcode/common/util/file'

import type { Trajectory } from './replay'

/**
 * Converts captured trajectory steps into the LevelCode Message history a
 * run() can resume from. This is the bridge between headless
 * `--capture-trajectory` output and interactive continuation: replay a
 * recorded run, then keep chatting from where it left off.
 *
 * Tool semantics follow Anthropic's requirements (the same constraint
 * forkSavedSession's dropUnansweredToolCalls handles): every tool-call part
 * on an assistant message must be answered by a tool message, and every tool
 * message must follow the assistant message carrying its call. A trailing
 * unanswered tool call is dropped rather than replayed — executing stale
 * tool_use blocks on resume is the failure mode the seed-artifact
 * investigation documented.
 *
 * `finalAssistantText` (the branch prompt / continuation instruction) is
 * appended as a trailing user message so the resumed run has a fresh
 * instruction to act on.
 */
export function trajectoryToMessages(
  trajectory: Trajectory,
  upToStepIndex: number,
  finalAssistantText?: string,
): { sessionState: SessionState; droppedToolCallIds: string[] } {
  if (upToStepIndex < 0 || upToStepIndex >= trajectory.steps.length) {
    throw new RangeError(
      `upToStepIndex ${upToStepIndex} out of range [0, ${trajectory.steps.length - 1}]`,
    )
  }

  const messages: Message[] = []
  // id -> tool message pushed for it (Anthropic requires tool results to
  // immediately follow the assistant message with the call, so unanswered
  // calls must be stripped from that message, not just left pending).
  const toolCallIds = new Set<string>()
  const answeredToolCallIds = new Set<string>()

  const steps = trajectory.steps.slice(0, upToStepIndex + 1)

  for (const step of steps) {
    switch (step.type) {
      case 'user_message': {
        messages.push({
          role: 'user',
          content: [{ type: 'text', text: step.content ?? '' }],
          sentAt: step.ts,
        })
        break
      }
      case 'assistant_message':
      case 'delta': {
        const last = messages[messages.length - 1]
        if (last?.role === 'assistant') {
          const textPart = last.content.find((p) => p.type === 'text')
          if (textPart && 'text' in textPart) {
            textPart.text += step.content ?? ''
            break
          }
        }
        messages.push({
          role: 'assistant',
          content: [{ type: 'text', text: step.content ?? '' }],
          sentAt: step.ts,
        })
        break
      }
      case 'tool_call': {
        toolCallIds.add(step.id ?? `call_${step.index}`)
        messages.push({
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: step.id ?? `call_${step.index}`,
              toolName: step.name ?? 'unknown',
              input: (step.data ?? {}) as Record<string, unknown>,
            },
          ],
          sentAt: step.ts,
        })
        break
      }
      case 'tool_result': {
        const id = step.id ?? ''
        answeredToolCallIds.add(id)
        const output = Array.isArray(step.data) ? (step.data as never) : [{ type: 'json', value: step.data ?? null }]
        messages.push({
          role: 'tool',
          toolCallId: id,
          toolName: step.name ?? 'unknown',
          content: output,
          sentAt: step.ts,
        } as Message)
        break
      }
      case 'agent_step':
        // Runtime-internal marker — carries no replayable conversation
        // content; skip it.
        break
    }
  }

  // Strip assistant tool-call parts that never got a result (truncated
  // capture, crash mid-round-trip): the API rejects them on resume.
  const droppedToolCallIds: string[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    if (message.role !== 'assistant' || !Array.isArray(message.content)) continue
    const kept = message.content.filter((part) => {
      if (part.type !== 'tool-call') return true
      if (answeredToolCallIds.has(part.toolCallId)) return true
      droppedToolCallIds.push(part.toolCallId)
      toolCallIds.delete(part.toolCallId)
      return false
    })
    if (kept.length !== message.content.length) {
      // An assistant message left with no content parts is invalid.
      if (kept.length > 0) {
        message.content = kept
      } else {
        messages.splice(i, 1)
      }
    }
  }

  if (finalAssistantText && finalAssistantText.trim().length > 0) {
    messages.push({
      role: 'user',
      content: [{ type: 'text', text: finalAssistantText.trim() }],
      sentAt: Date.now(),
    })
  }

  const agentState: AgentState = {
    ...getInitialAgentState(),
    messageHistory: messages,
  }

  return {
    sessionState: {
      fileContext: getStubProjectFileContext(),
      mainAgentState: agentState,
    },
    droppedToolCallIds,
  }
}
