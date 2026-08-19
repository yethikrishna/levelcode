import { TextAttributes } from '@opentui/core'
import React, { memo, useMemo, useState } from 'react'

import { AgentAvatar } from './agent-avatar'
import { Clickable } from './clickable'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { ReactNode } from 'react'

export type MessageRole = 'user' | 'agent' | 'system' | 'tool'

export interface MessageBubbleProps {
  role: MessageRole
  content: string
  timestamp?: Date
  agentName?: string
  agentRole?: string
  isThinking?: boolean
  isStreaming?: boolean
  toolName?: string
  toolStatus?: 'running' | 'success' | 'error'
  availableWidth?: number
}

function formatTime(date?: Date): string {
  if (!date) return ''
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function renderLines(content: string, fg: string): ReactNode[] {
  if (!content) return []
  const lines = content.split('\n')
  const nodes: ReactNode[] = []
  for (let i = 0; i < lines.length; i++) {
    nodes.push(
      <text key={`l${i}`} style={{ fg, wrapMode: 'word' }}>
        {lines[i] || ' '}
      </text>,
    )
  }
  return nodes
}

export const MessageBubble = memo(function MessageBubble({
  role,
  content,
  timestamp,
  agentName,
  agentRole: agentRoleProp,
  isThinking = false,
  isStreaming = false,
  toolName,
  toolStatus,
  availableWidth,
}: MessageBubbleProps) {
  const theme = useTheme()
  const [toolExpanded, setToolExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)

  const displayName = agentName ?? (role === 'user' ? 'You' : role === 'system' ? 'System' : 'Agent')
  const roleForAvatar = agentRoleProp ?? (role === 'user' ? 'user' : 'agent')

  const bubbleWidth = useMemo(() => {
    const w = availableWidth ?? 80
    return Math.max(40, Math.min(w - 12, Math.floor(w * 0.85)))
  }, [availableWidth])

  if (role === 'tool') {
    const statusColor =
      toolStatus === 'error'
        ? theme.error
        : toolStatus === 'running'
          ? theme.warning
          : theme.success
    const statusIcon =
      toolStatus === 'error' ? '\u2715' : toolStatus === 'running' ? '\u25D0' : '\u2713'

    return (
      <box
        style={{
          flexDirection: 'column',
          marginLeft: 2,
          marginRight: 2,
          marginTop: 0,
          marginBottom: 0,
        }}
      >
        <Clickable
          onMouseDown={() => setToolExpanded(!toolExpanded)}
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => setHovered(false)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 1,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: hovered ? (theme.surfaceHover ?? theme.surface) : 'transparent',
          }}
        >
          <text style={{ fg: statusColor, wrapMode: 'none' }}>{statusIcon}</text>
          <text style={{ fg: theme.foregroundSubtle ?? theme.muted, attributes: TextAttributes.DIM, wrapMode: 'none' }}>
            {toolExpanded ? '\u25BE' : '\u25B8'}
          </text>
          <text style={{ fg: theme.foregroundMuted ?? theme.muted, attributes: TextAttributes.BOLD }}>
            {toolName ?? 'Tool'}
          </text>
          {timestamp && hovered && (
            <text style={{ fg: theme.foregroundSubtle ?? theme.muted, attributes: TextAttributes.DIM }}>
              {'  '}{formatTime(timestamp)}
            </text>
          )}
        </Clickable>
        {toolExpanded && (
          <box
            style={{
              flexDirection: 'column',
              paddingLeft: 2,
              border: ['left'],
              borderColor: theme.borderSubtle ?? theme.border,
              marginLeft: 1,
            }}
          >
            {renderLines(content, theme.foregroundMuted ?? theme.muted)}
          </box>
        )}
      </box>
    )
  }

  const isUser = role === 'user'
  const isSystem = role === 'system'

  const avatarStatus = isThinking ? 'thinking' : isStreaming ? 'active' : 'idle'

  const bubbleBg = isUser
    ? (theme.userMessageBg ?? theme.surface)
    : isSystem
      ? (theme.surfaceSunken ?? theme.surface)
      : (theme.aiMessageBg ?? theme.surface)
  const bubbleBorder = isUser
    ? (theme.userMessageBorder ?? theme.primary)
    : isSystem
      ? (theme.borderSubtle ?? theme.border)
      : (theme.aiMessageBorder ?? theme.border)
  const nameFg = isUser ? (theme.userLine ?? theme.primary) : theme.primary
  const headerName = isUser ? 'You' : displayName

  return (
    <box
      style={{
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
        gap: 1,
        marginLeft: 1,
        marginRight: 1,
        marginTop: 0,
        marginBottom: 1,
      }}
    >
      <AgentAvatar
        name={isUser ? 'You' : displayName}
        role={roleForAvatar}
        status={avatarStatus}
        isUser={isUser}
        showStatus={!isUser && (isThinking || isStreaming)}
      />

      <box
        style={{
          flexDirection: 'column',
          flexGrow: 1,
          alignItems: isUser ? 'flex-end' : 'flex-start',
          maxWidth: bubbleWidth,
        }}
      >
        <box style={{ flexDirection: 'row', gap: 1, alignItems: 'center' }}>
          <text style={{ fg: nameFg, attributes: TextAttributes.BOLD }}>
            {headerName}
          </text>
          {isThinking && (
            <text style={{ fg: theme.warning, attributes: TextAttributes.DIM }}>
              thinking...
            </text>
          )}
          {timestamp && hovered && (
            <text style={{ fg: theme.foregroundSubtle ?? theme.muted, attributes: TextAttributes.DIM }}>
              {formatTime(timestamp)}
            </text>
          )}
        </box>

        <box
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => setHovered(false)}
          style={{
            flexDirection: 'column',
            borderStyle: 'single',
            borderColor: bubbleBorder,
            customBorderChars: BORDER_CHARS,
            backgroundColor: bubbleBg,
            paddingLeft: 1,
            paddingRight: 1,
            paddingTop: 0,
            paddingBottom: 0,
            maxWidth: bubbleWidth,
          }}
        >
          {isSystem ? (
            <text style={{ fg: theme.foregroundSubtle ?? theme.muted, attributes: TextAttributes.ITALIC | TextAttributes.DIM }}>
              {content}
            </text>
          ) : (
            renderLines(content, theme.foreground)
          )}
        </box>
      </box>
    </box>
  )
})
