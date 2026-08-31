import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useMemo, useState, useRef } from 'react'

import { Clickable } from '../components/clickable'
import { useTheme } from '../hooks/use-theme'
import { useSideChats, SIDE_CHAT_KEYBINDING } from './side-chat-manager'
import { useEvent } from '../hooks/use-event'

import type { SideChat, SideChatMessage } from './side-chat-manager'
import type { KeyEvent } from '@opentui/core'

interface SideChatPanelProps {
  width?: number
  height?: number
  onSendMessage?: (chatId: string, content: string) => void
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + '\u2026'
}

function MessageLine({
  msg,
  theme,
  panelWidth,
}: {
  msg: SideChatMessage
  theme: ReturnType<typeof useTheme>
  panelWidth: number
}) {
  const roleColor =
    msg.role === 'user'
      ? theme.primary
      : msg.role === 'assistant'
        ? theme.secondary
        : theme.muted
  const roleLabel =
    msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'AI' : 'Sys'
  const contentWidth = panelWidth - roleLabel.length - 8
  const lines = msg.content.split('\n').flatMap((line) => {
    const wrapped: string[] = []
    for (let i = 0; i < line.length; i += Math.max(1, contentWidth)) {
      wrapped.push(line.slice(i, i + Math.max(1, contentWidth)))
    }
    return wrapped.length > 0 ? wrapped : ['']
  })

  const streamingIndicator = msg.isStreaming ? ' \u258b' : ''

  return (
    <box style={{ flexDirection: 'column', flexShrink: 0 }}>
      <text style={{ wrapMode: 'none' }}>
        <span fg={roleColor} attributes={TextAttributes.BOLD}>
          {roleLabel}
        </span>
        <span fg={theme.muted}>
          {' '}
          {formatTimestamp(msg.timestamp)}
          {streamingIndicator}
        </span>
      </text>
      {lines.map((line, i) => (
        <text key={i} style={{ wrapMode: 'none' }}>
          <span fg={theme.foreground}>{truncate(line, panelWidth - 4)}</span>
        </text>
      ))}
      <box style={{ height: 1, flexShrink: 0 }} />
    </box>
  )
}

function ChatListItem({
  chat,
  isActive,
  theme,
  width,
  onClick,
  onClose,
}: {
  chat: SideChat
  isActive: boolean
  theme: ReturnType<typeof useTheme>
  width: number
  onClick: () => void
  onClose: () => void
}) {
  const statusColor = chat.isStreaming ? theme.success : theme.muted
  const statusChar = chat.isStreaming ? '\u25cf' : ' '
  const titleWidth = width - 10
  const title = truncate(chat.title, titleWidth)
  const bgColor = isActive ? theme.primary : undefined
  const fgColor = isActive ? theme.background : theme.foreground

  return (
    <box style={{ flexDirection: 'row', flexShrink: 0 }}>
      <Clickable
        onMouseDown={onClick}
        style={{
          wrapMode: 'none',
          backgroundColor: bgColor,
        }}
      >
        <span fg={statusColor}>{statusChar}</span>
        <span fg={fgColor}> {title} </span>
      </Clickable>
      <Clickable onMouseDown={onClose} style={{ wrapMode: 'none' }}>
        <span fg={theme.error}> x</span>
      </Clickable>
    </box>
  )
}

export const SideChatPanel: React.FC<SideChatPanelProps> = ({
  width = 60,
  height = 30,
  onSendMessage,
}) => {
  const theme = useTheme()
  const {
    sideChats,
    activeChat,
    activeChatId,
    selectedChatIndex,
    setActiveChat,
    closeSideChat,
    sendMessage,
    setSelectedChatIndex,
  } = useSideChats()

  const [inputValue, setInputValue] = useState('')
  const [focusedPane, setFocusedPane] = useState<'list' | 'messages' | 'input'>('messages')
  const messagesEndRef = useRef<any>(null)

  const handleSend = useEvent(() => {
    if (!activeChatId || !inputValue.trim()) return
    if (onSendMessage) {
      onSendMessage(activeChatId, inputValue.trim())
    } else {
      sendMessage(activeChatId, inputValue.trim())
    }
    setInputValue('')
  })

  const handleKey = useEvent((key: KeyEvent) => {
    if (key.name === 'escape') {
      setFocusedPane('messages')
      return
    }
    if (key.ctrl && key.name === 'w' && activeChatId) {
      closeSideChat(activeChatId)
      return
    }
    if (key.name === 'tab') {
      setFocusedPane((p) =>
        p === 'list' ? 'messages' : p === 'messages' ? 'input' : 'list',
      )
      return
    }
    if (key.name === 'up' && focusedPane === 'list') {
      setSelectedChatIndex(selectedChatIndex - 1)
      return
    }
    if (key.name === 'down' && focusedPane === 'list') {
      setSelectedChatIndex(selectedChatIndex + 1)
      return
    }
    if (key.name === 'return' && focusedPane === 'input') {
      handleSend()
      return
    }
  })

  useKeyboard(handleKey)

  const listWidth = Math.min(20, Math.floor(width / 3))
  const messagesWidth = width - listWidth - 3

  const headerBar = useMemo(() => {
    const count = sideChats.length
    return `Side Chats (${count}) [${SIDE_CHAT_KEYBINDING}] [Tab] focus [Ctrl+W] close`
  }, [sideChats.length])

  if (sideChats.length === 0) {
    return (
      <box
        style={{
          flexDirection: 'column',
          width,
          height,
          borderStyle: 'rounded',
          borderColor: theme.border,
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 1,
        }}
      >
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.muted} attributes={TextAttributes.BOLD}>Side Chats</span>
        </text>
        <box style={{ height: 1, flexShrink: 0 }} />
        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.muted}>
            No active side chats. Side chats let you run parallel conversations
            while the main agent works. Create one from a slash command or agent tool.
          </span>
        </text>
        <box style={{ height: 1, flexShrink: 0 }} />
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.muted}>{'  '}{SIDE_CHAT_KEYBINDING} toggle panel</span>
        </text>
      </box>
    )
  }

  return (
    <box
      style={{
        flexDirection: 'column',
        width,
        height,
        borderStyle: 'rounded',
        borderColor: focusedPane === 'list' ? theme.primary : theme.border,
      }}
    >
      {/* Header */}
      <box style={{ flexDirection: 'row', paddingLeft: 1, paddingRight: 1, flexShrink: 0 }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.primary} attributes={TextAttributes.BOLD}>{truncate(headerBar, width - 4)}</span>
        </text>
      </box>
      <box style={{ height: 1, flexShrink: 0 }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.border}>{'\u2500'.repeat(Math.max(1, width - 2))}</span>
        </text>
      </box>

      {/* Body: chat list + messages */}
      <box style={{ flexDirection: 'row', flexGrow: 1 }}>
        {/* Chat list sidebar */}
        <box
          style={{
            width: listWidth,
            flexDirection: 'column',
            borderStyle: 'single',
            border: ['right'],
            borderColor: focusedPane === 'list' ? theme.primary : theme.border,
            paddingLeft: 1,
          }}
        >
          <text style={{ wrapMode: 'none', flexShrink: 0 }}>
            <span fg={theme.muted} attributes={TextAttributes.DIM}>chats</span>
          </text>
          <box style={{ height: 1, flexShrink: 0 }} />
          {sideChats.map((chat) => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              isActive={chat.id === activeChatId}
              theme={theme}
              width={listWidth - 2}
              onClick={() => setActiveChat(chat.id)}
              onClose={() => closeSideChat(chat.id)}
            />
          ))}
        </box>

        {/* Messages pane */}
        <box
          style={{
            width: messagesWidth,
            flexDirection: 'column',
            flexGrow: 1,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          {activeChat ? (
            <>
              <text style={{ wrapMode: 'none', flexShrink: 0 }}>
                <span fg={theme.secondary} attributes={TextAttributes.BOLD}>
                  {truncate(activeChat.title, messagesWidth - 2)}
                </span>
              </text>
              <box style={{ height: 1, flexShrink: 0 }}>
                <text style={{ wrapMode: 'none' }}>
                  <span fg={theme.border}>
                    {'\u2500'.repeat(Math.max(1, messagesWidth - 2))}
                  </span>
                </text>
              </box>
              <box style={{ flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
                {activeChat.messages.map((msg) => (
                  <MessageLine
                    key={msg.id}
                    msg={msg}
                    theme={theme}
                    panelWidth={messagesWidth}
                  />
                ))}
                <box ref={messagesEndRef} style={{ flexShrink: 0 }} />
              </box>
            </>
          ) : (
            <text style={{ wrapMode: 'word' }}>
              <span fg={theme.muted}>
                Select a side chat from the list to view the conversation.
              </span>
            </text>
          )}
        </box>
      </box>

      {/* Input bar */}
      <box style={{ height: 1, flexShrink: 0 }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.border}>{'\u2500'.repeat(Math.max(1, width - 2))}</span>
        </text>
      </box>
      <box
        style={{
          flexDirection: 'row',
          paddingLeft: 1,
          paddingRight: 1,
          flexShrink: 0,
          height: 3,
        }}
      >
        <text style={{ wrapMode: 'none' }}>
          <span fg={focusedPane === 'input' ? theme.primary : theme.muted}>{'> '}</span>
        </text>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.foreground}>
            {inputValue}
            {focusedPane === 'input' ? '\u2588' : ' '}
          </span>
          <span fg={theme.muted}>
            {' '.repeat(
              Math.max(0, width - inputValue.length - 6),
            )}
          </span>
        </text>
      </box>
    </box>
  )
}
