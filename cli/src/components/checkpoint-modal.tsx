import React, { useCallback, useEffect, useState } from 'react'
import { useKeyboard } from '@opentui/react'

import { useTheme } from '../hooks/use-theme'
import { Panel, KeyHint, BreadcrumbNav } from './primitives'
import type { KeyEvent, BreadcrumbStep } from './primitives'
import type { DevPhase } from '@levelcode/common/types/team-config'

interface CheckpointModalProps {
  fromPhase: DevPhase
  toPhase: DevPhase
  tasksCompleted: number
  tasksPending: number
  tasksBlocked: number
  onApprove: (summary?: string) => void
  onReject: () => void
  onPause: () => void
}

const CHECKPOINT_STEPS: BreadcrumbStep[] = [
  { key: 'review', label: 'Review' },
  { key: 'approve', label: 'Approve' },
]

export const CheckpointModal: React.FC<CheckpointModalProps> = ({
  fromPhase,
  toPhase,
  tasksCompleted,
  tasksPending,
  tasksBlocked,
  onApprove,
  onReject,
  onPause,
}) => {
  const theme = useTheme()
  const [summary, setSummary] = useState('')
  const [showSummary, setShowSummary] = useState(false)

  const handleApprove = useCallback(() => {
    onApprove(showSummary ? summary : undefined)
  }, [onApprove, showSummary, summary])

  const handleReject = useCallback(() => {
    onReject()
  }, [onReject])

  const handlePause = useCallback(() => {
    onPause()
  }, [onPause])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape') {
          onReject()
          return
        }
        if (key.name === 'enter' || key.name === 'return') {
          handleApprove()
          return
        }
        if (key.name === 'p' || key.name === 'P') {
          handlePause()
        }
      },
      [handleApprove, handleReject, handlePause],
    ),
  )

  // Color based on target phase
  const phaseColor =
    toPhase === 'beta'
      ? theme.info
      : toPhase === 'production'
        ? theme.warning
        : theme.error // mature

  return (
    <Panel title={`Phase Transition: ${fromPhase} → ${toPhase}`} borderColor={phaseColor}>
      <BreadcrumbNav steps={CHECKPOINT_STEPS} currentStep="review" />

      <box style={{ flexDirection: 'column', gap: 0 }}>
        <text style={{ fg: theme.foreground, bold: true }}>
          {`Transition to "${toPhase}" phase requires approval.`}
        </text>
        <text style={{ fg: theme.muted }}>{`Current: ${fromPhase}`}</text>
        <text style={{ fg: theme.muted }}>{`Target:  ${toPhase}`}</text>
      </box>

      <box style={{ paddingTop: 1 }}>
        <text style={{ fg: theme.info }}>{`Tasks completed:   ${tasksCompleted}`}</text>
        <text style={{ fg: theme.warning }}>{`Tasks pending:    ${tasksPending}`}</text>
        <text style={{ fg: theme.error }}>{`Tasks blocked:    ${tasksBlocked}`}</text>
      </box>

      <box style={{ paddingTop: 1, flexDirection: 'column', gap: 0 }}>
        <text style={{ fg: theme.muted }}>{
          toPhase === 'production' || toPhase === 'mature'
            ? 'WARNING: This transition makes features available to users!'
            : 'Review the team output before proceeding.'
        }</text>
        <text style={{ fg: theme.muted }}>{
          toPhase === 'production' || toPhase === 'mature'
            ? 'Ensure all tests pass and review is complete.'
            : 'Check that the team has met all requirements for this phase.'
        }</text>
      </box>

      <box style={{ paddingTop: 1 }}>
        <text style={{ fg: theme.muted }}>{
          showSummary ? 'Enter summary (optional):' : ''
        }</text>
        {showSummary && (
          <text style={{ fg: theme.foreground }}>{summary || '(type here...)'}</text>
        )}
      </box>

      <box style={{ paddingTop: 1 }}>
        <KeyHint
          hints={[
            { key: 'Y/Enter', label: 'Approve transition' },
            { key: 'N/Esc', label: 'Reject' },
            { key: 'P', label: 'Pause swarm' },
          ]}
        />
      </box>
    </Panel>
  )
}
