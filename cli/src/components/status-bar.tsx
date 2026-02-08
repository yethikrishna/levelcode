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

export const StatusBar = ({
  timerStartTime,
  isAtBottom,
  scrollToLatest,
  statusIndicatorState,
}: StatusBarProps) => {
  const theme = useTheme()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Show timer when actively working (streaming or waiting for response) or paused (ask_user)
  // This uses statusIndicatorState as the single source of truth for "is the LLM working?"
  const shouldShowTimer =
    statusIndicatorState?.kind === 'waiting' ||
    statusIndicatorState?.kind === 'streaming' ||
    statusIndicatorState?.kind === 'paused'

  useEffect(() => {
    if (!timerStartTime || !shouldShowTimer) {
      setElapsedSeconds(0)
      return
    }

    // When paused, don't update the timer - just keep the frozen value
    if (statusIndicatorState?.kind === 'paused') {
      // Calculate current elapsed time once and freeze it
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

  const renderStatusIndicator = () => {
    switch (statusIndicatorState.kind) {
      case 'ctrlC':
        return <span fg={theme.secondary}>Press Ctrl-C again to exit</span>
      
      case 'clipboard':
        // Use green color for feedback success messages
        const isFeedbackSuccess = statusIndicatorState.message.includes('Feedback sent')
        return (
          <span fg={isFeedbackSuccess ? theme.success : theme.primary}>
            {statusIndicatorState.message}
          </span>
        )
      
      case 'reconnected':
        return <span fg={theme.success}>Reconnected</span>
      
      case 'retrying':
        return (
          <ShimmerText
            text="retrying..."
            primaryColor={theme.warning}
          />
        )
      
      case 'connecting':
        return <ShimmerText text="connecting..." />
      
      case 'waiting':
        return (
          <ShimmerText
            text="thinking..."
            interval={SHIMMER_INTERVAL_MS}
            primaryColor={theme.secondary}
          />
        )
      
      case 'streaming':
        return (
          <ShimmerText
            text="working..."
            interval={SHIMMER_INTERVAL_MS}
            primaryColor={theme.secondary}
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

    return <span fg={theme.secondary}>{formatElapsedTime(elapsedSeconds)}</span>
  }

  const swarmEnabled = useTeamStore((s) => s.swarmEnabled)
  const activeTeam = useTeamStore((s) => s.activeTeam)
  const currentPhase = useTeamStore((s) => s.currentPhase)

  const renderTeamIndicator = () => {
    if (!swarmEnabled || !activeTeam) return null
    const phaseLabel = currentPhase.toUpperCase().replace('-', ' ')
    return (
      <span fg={theme.primary}>
        {activeTeam.name} [{phaseLabel}]
      </span>
    )
  }

  const activeProvider = useProviderStore((s) => s.config.activeProvider)
  const activeModel = useProviderStore((s) => s.config.activeModel)

  const renderProviderIndicator = () => {
    if (!activeProvider || !activeModel) return null
    return (
      <span fg={theme.muted}>
        {activeProvider}/{activeModel}
      </span>
    )
  }

  const statusIndicatorContent = renderStatusIndicator()
  const elapsedTimeContent = renderElapsedTime()
  const teamIndicatorContent = renderTeamIndicator()
  const providerIndicatorContent = renderProviderIndicator()

  // Only show gray background when there's status indicator or timer
  const hasContent = statusIndicatorContent || elapsedTimeContent || teamIndicatorContent || providerIndicatorContent

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 1,
        paddingRight: 1,
        gap: 1,
        backgroundColor: hasContent ? theme.surface : 'transparent',
      }}
    >
      <box
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
        }}
      >
        <text style={{ wrapMode: 'none' }}>{statusIndicatorContent}</text>
      </box>

      <box style={{ flexShrink: 0 }}>
        {!isAtBottom && <ScrollToBottomButton onClick={scrollToLatest} />}
      </box>

      {teamIndicatorContent && (
        <box style={{ flexShrink: 0 }}>
          <text style={{ wrapMode: 'none' }}>{teamIndicatorContent}</text>
        </box>
      )}

      {providerIndicatorContent && (
        <box style={{ flexShrink: 0 }}>
          <text style={{ wrapMode: 'none' }}>{providerIndicatorContent}</text>
        </box>
      )}

      <box
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          flexDirection: 'row',
          justifyContent: 'flex-end',
        }}
      >
        <text style={{ wrapMode: 'none' }}>{elapsedTimeContent}</text>
      </box>
    </box>
  )
}
