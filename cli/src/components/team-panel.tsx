import React, { useMemo } from 'react'

import { useTheme } from '../hooks/use-theme'
import { useTeamStore } from '../state/team-store'

import type { TeamMember } from '@levelcode/common/types/team-config'

/**
 * Map member status to a display label and theme color key.
 */
function getStatusStyle(
  member: TeamMember,
  theme: ReturnType<typeof useTheme>,
): { label: string; color: string } {
  switch (member.status) {
    case 'active':
      return { label: 'working', color: theme.success }
    case 'idle':
      return { label: 'idle', color: theme.warning }
    case 'failed':
      return { label: 'failed', color: theme.error }
    case 'completed':
      return { label: 'done', color: theme.muted }
  }
}

/**
 * Format a TeamRole string for display by replacing hyphens with spaces
 * and capitalizing each word.
 */
function formatRole(role: string): string {
  return role
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Pad a string to a fixed width, truncating if necessary.
 */
function pad(str: string, width: number): string {
  if (str.length >= width) {
    return str.slice(0, width)
  }
  return str + ' '.repeat(width - str.length)
}

interface TeamPanelProps {
  /** Panel width in characters. If omitted, uses a reasonable default. */
  width?: number
}

export const TeamPanel: React.FC<TeamPanelProps> = ({ width = 50 }) => {
  const theme = useTheme()
  const activeTeam = useTeamStore((s) => s.activeTeam)
  const members = useTeamStore((s) => s.members)
  const currentPhase = useTeamStore((s) => s.currentPhase)

  const phaseLabel = useMemo(
    () => currentPhase.toUpperCase().replace('-', ' '),
    [currentPhase],
  )

  if (!activeTeam) {
    return null
  }

  const maxMembers = activeTeam.settings.maxMembers
  const memberCount = members.length

  // Compute column widths from actual data
  const roleWidth = Math.max(
    ...members.map((m) => formatRole(m.role).length),
    4,
  )
  const statusWidth = 7 // "working" is the longest status label
  const nameWidth = Math.max(...members.map((m) => m.name.length), 4)

  const separatorWidth = Math.max(1, width - 2)

  return (
    <box
      style={{
        flexDirection: 'column',
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      {/* Header line */}
      <box style={{ flexDirection: 'row', gap: 1 }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.foreground}>Team: </span>
          <span fg={theme.primary}>{activeTeam.name}</span>
          <span fg={theme.muted}> [{phaseLabel}]</span>
          <span fg={theme.foreground}>  Members: </span>
          <span fg={theme.foreground}>
            {memberCount}/{maxMembers}
          </span>
        </text>
      </box>

      {/* Separator */}
      <box style={{ height: 1, flexShrink: 0 }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.border}>{'─'.repeat(separatorWidth)}</span>
        </text>
      </box>

      {/* Member list */}
      {members.map((member) => {
        const { label: statusLabel, color: statusColor } = getStatusStyle(
          member,
          theme,
        )

        const taskSuffix = member.currentTaskId
          ? `  [${member.currentTaskId}]`
          : ''

        return (
          <box key={member.agentId} style={{ flexDirection: 'row' }}>
            <text style={{ wrapMode: 'none' }}>
              <span fg={theme.foreground}>
                {' '}
                {pad(formatRole(member.role), roleWidth)}
              </span>
              <span fg={statusColor}>
                {'  '}
                {pad(statusLabel, statusWidth)}
              </span>
              <span fg={theme.secondary}>
                {'  @'}
                {pad(member.name, nameWidth)}
              </span>
              {taskSuffix && <span fg={theme.muted}>{taskSuffix}</span>}
            </text>
          </box>
        )
      })}
    </box>
  )
}
