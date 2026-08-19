import { memo, useMemo } from 'react'

import { useTheme } from '../hooks/use-theme'

import type { ReactNode } from 'react'

export type AgentStatus = 'active' | 'thinking' | 'idle' | 'error'

export interface AgentAvatarProps {
  name: string
  role?: string
  status?: AgentStatus
  isUser?: boolean
  showStatus?: boolean
}

const ROLE_COLORS: Record<string, string> = {
  cto: 'secondary',
  architect: 'secondary',
  lead: 'secondary',
  editor: 'primary',
  writer: 'primary',
  reviewer: 'success',
  qa: 'success',
  tester: 'success',
  intern: 'muted',
  junior: 'muted',
  agent: 'primary',
}

const STATUS_CHARS: Record<AgentStatus, string> = {
  active: '●',
  thinking: '◐',
  idle: '○',
  error: '✕',
}

function getInitials(name: string, isUser: boolean): string {
  if (isUser) return 'You'
  const words = name.trim().split(/[\s_-]+/)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function getRoleColorKey(role: string | undefined): 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'muted' {
  if (!role) return 'primary'
  const normalized = role.toLowerCase()
  for (const [key, colorKey] of Object.entries(ROLE_COLORS)) {
    if (normalized.includes(key)) {
      return colorKey as 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'muted'
    }
  }
  return 'primary'
}

function getColorByKey(theme: ReturnType<typeof useTheme>, key: string): string {
  switch (key) {
    case 'secondary': return theme.secondary
    case 'success': return theme.success
    case 'warning': return theme.warning
    case 'error': return theme.error
    case 'info': return theme.info
    case 'muted': return typeof theme.muted === 'string' ? theme.muted : theme.foregroundMuted
    case 'primary':
    default: return theme.primary
  }
}

export const AgentAvatar = memo(function AgentAvatar({
  name,
  role,
  status = 'idle',
  isUser = false,
  showStatus = true,
}: AgentAvatarProps): ReactNode {
  const theme = useTheme()

  const initials = useMemo(() => getInitials(name, isUser), [name, isUser])
  const colorKey = useMemo(() => getRoleColorKey(role), [role])
  const bgColor = isUser ? theme.primary : getColorByKey(theme, colorKey)
  const statusChar = STATUS_CHARS[status]

  const statusFg = {
    active: theme.success,
    thinking: theme.warning,
    idle: theme.foregroundSubtle ?? theme.muted,
    error: theme.error,
  }[status]

  return (
    <box style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
      <box
        style={{
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
          paddingBottom: 0,
          backgroundColor: bgColor,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 5,
        }}
      >
        <text style={{ wrapMode: 'none', fg: '#ffffff' }} attributes={1}>
          {initials}
        </text>
      </box>
      {showStatus && (
        <text style={{ wrapMode: 'none', fg: statusFg }}>
          {statusChar}
        </text>
      )}
    </box>
  )
})
