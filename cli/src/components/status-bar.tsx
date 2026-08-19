import React, { useEffect, useState } from 'react'

import { ScrollToBottomButton } from './scroll-to-bottom-button'
import { ShimmerText } from './shimmer-text'
import { useTheme } from '../hooks/use-theme'
import { useProviderStore } from '../state/provider-store'
import { useTeamStore } from '../state/team-store'
import { formatElapsedTime } from '../utils/format-elapsed-time'

import type { StatusIndicatorState } from '../utils/status-indicator-state'

const SHIMMER_INTERVAL_MS = 160

interface StatusBarProps {
  timerStartTime: number | null
  isAtBottom: boolean
  scrollToLatest: () => void
  statusIndicatorState: StatusIndicatorState
}

function StatusSegment({
  children,
  bg,
  fg,
  style,
}: {
  children: React.ReactNode
  bg?: string
  fg?: string
  style?: Record<string, unknown>
}) {
  if (!children) return null
  return (
    <box
      style={{
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: bg,
        flexShrink: 0,
        ...style,
      }}
    >
      <text style={{ wrapMode: 'none', fg }}>{children}</text>
    </box>
  )
}

export const StatusBar = ({
  timerStartTime,
  isAtBottom,
  scrollToLatest,
  statusIndicatorState,
}: StatusBarProps) => {
  const theme = useTheme()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const shouldShowTimer =
    statusIndicatorState?.kind === 'waiting' ||
    statusIndicatorState?.kind === 'streaming' ||
    statusIndicatorState?.kind === 'paused'

  useEffect(() => {
    if (!timerStartTime || !shouldShowTimer) {
      setElapsedSeconds(0)
      return
    }

    if (statusIndicatorState?.kind === 'paused') {
      const now = Date.now()
      const elapsed = Math.floor((now - timerStartTime) / 1000)
      setElapsedSeconds(elapsed)
      return
    }

    const updateElapsed = () => {
      const now = Date.now()
      const elapsed = Math.floor((now - timerStartTime) / 1000)
      setElapsedSeconds(elapsed)
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)

    return () => clearInterval(interval)
  }, [timerStartTime, shouldShowTimer, statusIndicatorState?.kind])

  const mutedFg = theme.foregroundMuted ?? (typeof theme.muted === 'string' ? theme.muted : theme.foreground)
  const isError = statusIndicatorState?.kind === 'ctrlC'
  const isWorking =
    statusIndicatorState?.kind === 'waiting' ||
    statusIndicatorState?.kind === 'streaming' ||
    statusIndicatorState?.kind === 'retrying' ||
    statusIndicatorState?.kind === 'connecting'

  const renderStatusIndicator = () => {
    switch (statusIndicatorState.kind) {
      case 'ctrlC':
        return <span fg="#ffffff">Press Ctrl-C again to exit</span>
      
      case 'clipboard':
        const isFeedbackSuccess = statusIndicatorState.message.includes('Feedback sent')
        return (
          <span fg={isFeedbackSuccess ? '#ffffff' : '#ffffff'}>
            {statusIndicatorState.message}
          </span>
        )
      
      case 'reconnected':
        return <span fg="#ffffff">Reconnected</span>
      
      case 'retrying':
        return (
          <ShimmerText
            text="retrying..."
            primaryColor="#ffffff"
          />
        )
      
      case 'connecting':
        return <ShimmerText text="connecting..." primaryColor="#ffffff" />
      
      case 'waiting':
        return (
          <ShimmerText
            text="thinking..."
            interval={SHIMMER_INTERVAL_MS}
            primaryColor="#ffffff"
          />
        )
      
      case 'streaming':
        return (
          <ShimmerText
            text="working..."
            interval={SHIMMER_INTERVAL_MS}
            primaryColor="#ffffff"
          />
        )
      
      case 'paused':
        return null
      
      case 'idle':
        return null
    }
  }

  const renderElapsedTime = () => {
    if (!shouldShowTimer || elapsedSeconds === 0) {
      return null
    }
    return formatElapsedTime(elapsedSeconds)
  }

  const swarmEnabled = useTeamStore((s) => s.swarmEnabled)
  const activeTeam = useTeamStore((s) => s.activeTeam)
  const currentPhase = useTeamStore((s) => s.currentPhase)

  const renderTeamIndicator = () => {
    if (!swarmEnabled || !activeTeam) return null
    const phaseLabel = currentPhase.toUpperCase().replace('-', ' ')
    return `${activeTeam.name} [${phaseLabel}]`
  }

  const activeProvider = useProviderStore((s) => s.config.activeProvider)
  const activeModel = useProviderStore((s) => s.config.activeModel)

  const renderProviderIndicator = () => {
    if (!activeProvider || !activeModel) return null
    return `${activeProvider}/${activeModel}`
  }

  const statusIndicatorContent = renderStatusIndicator()
  const elapsedTimeContent = renderElapsedTime()
  const teamIndicatorContent = renderTeamIndicator()
  const providerIndicatorContent = renderProviderIndicator()

  const leftBg = isError
    ? theme.statusBarErrorBg ?? theme.error
    : isWorking
      ? theme.statusBarRemoteBg ?? theme.primary
      : theme.statusBarBg ?? theme.surface

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0,
        backgroundColor: theme.statusBarBg ?? theme.surface,
        minHeight: 1,
        borderStyle: 'single',
        borderColor: theme.borderSubtle ?? theme.border,
      }}
    >
      <StatusSegment bg={leftBg} fg="#ffffff">
        {statusIndicatorContent ?? (swarmEnabled ? 'TEAM' : 'AGENT')}
      </StatusSegment>

      <box
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          paddingRight: 1,
          gap: 0,
        }}
      >
        {!isAtBottom && <ScrollToBottomButton onClick={scrollToLatest} />}
      </box>

      <StatusSegment bg={theme.statusBarBg ?? theme.surface} fg={mutedFg}>
        {teamIndicatorContent}
      </StatusSegment>

      <StatusSegment bg={theme.surfaceRaised ?? theme.surface} fg={mutedFg}>
        {providerIndicatorContent}
      </StatusSegment>

      {elapsedTimeContent && (
        <StatusSegment bg={theme.statusBarRemoteBg ?? theme.primary} fg="#ffffff">
          {elapsedTimeContent}
        </StatusSegment>
      )}
    </box>
  )
}
