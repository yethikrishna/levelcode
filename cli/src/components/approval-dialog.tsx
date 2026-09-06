import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useState, useCallback, memo } from 'react'

import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'
import { Button } from './button'
import { DiffViewer } from './tools/diff-viewer'
import { KeyHint } from './primitives/key-hint'

import type { KeyEvent } from '@opentui/core'
import type { ApprovalRequest } from '@levelcode/common/approval/diff-gate'
import { ICON } from '../utils/icons'

interface ApprovalDialogProps {
  request: ApprovalRequest
  onApprove: () => void
  onReject: () => void
  onEdit: () => void
}

type ActionButton = 'approve' | 'reject' | 'edit'

/**
 * Ink/React terminal dialog component for displaying a diff preview
 * and obtaining user approval via Accept/Reject/Edit buttons with
 * Y/N/E keyboard shortcuts.
 *
 * Used by the DiffApprovalGate middleware to pause tool execution
 * when manual approval is required by the active permission profile.
 */
export const ApprovalDialog = memo(function ApprovalDialog({
  request,
  onApprove,
  onReject,
  onEdit,
}: ApprovalDialogProps) {
  const theme = useTheme()
  const [focused, setFocused] = useState<ActionButton>('approve')

  const nextFocus = useCallback(() => {
    setFocused((prev) => {
      if (prev === 'approve') return 'reject'
      if (prev === 'reject') return 'edit'
      return 'approve'
    })
  }, [])

  const prevFocus = useCallback(() => {
    setFocused((prev) => {
      if (prev === 'approve') return 'edit'
      if (prev === 'edit') return 'reject'
      return 'approve'
    })
  }, [])

  const activateFocused = useCallback(() => {
    if (focused === 'approve') onApprove()
    else if (focused === 'reject') onReject()
    else onEdit()
  }, [focused, onApprove, onReject, onEdit])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'left') {
          prevFocus()
          return
        }
        if (key.name === 'right') {
          nextFocus()
          return
        }
        if (key.name === 'return' || key.name === 'enter') {
          activateFocused()
          return
        }
        if (key.name === 'escape') {
          onReject()
          return
        }
        if (key.sequence && !key.ctrl && !key.meta) {
          const ch = key.sequence.toLowerCase()
          if (ch === 'y') {
            onApprove()
            return
          }
          if (ch === 'n') {
            onReject()
            return
          }
          if (ch === 'e') {
            onEdit()
            return
          }
        }
      },
      [nextFocus, prevFocus, activateFocused, onApprove, onReject, onEdit],
    ),
  )

  const borderColor = request.isDestructive ? theme.error : theme.warning || theme.primary
  const titleColor = request.isDestructive ? theme.error : theme.warning || theme.primary

  const buttonStyle = (action: ActionButton) => ({
    flexDirection: 'row' as const,
    paddingLeft: 1,
    paddingRight: 1,
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: focused === action ? (action === 'approve' ? theme.success || '#7ACC35' : action === 'reject' ? theme.error : theme.primary) : 'transparent',
  })

  const buttonTextStyle = (action: ActionButton) => ({
    fg: focused === action ? theme.background : theme.muted,
    attributes: focused === action ? TextAttributes.BOLD : undefined,
  })

  return (
    <box
      style={{
        borderStyle: 'single',
        borderColor,
        customBorderChars: BORDER_CHARS,
        flexDirection: 'column',
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        backgroundColor: theme.surface,
        width: '100%',
        maxHeight: 20,
      }}
    >
      {/* Title bar */}
      <box style={{ flexDirection: 'column', width: '100%' }}>
        <text style={{ fg: titleColor, attributes: TextAttributes.BOLD }}>
          {request.isDestructive ? '⚠︎ Approve Destructive Operation' : 'Approve Change'}
        </text>
        <text style={{ fg: theme.border, attributes: TextAttributes.DIM }}>
          {'─'.repeat(50)}
        </text>
      </box>

      {/* Request metadata */}
      <box style={{ flexDirection: 'column', paddingTop: 0, paddingBottom: 1 }}>
        <text style={{ fg: theme.muted }}>
          Tool: <span fg={theme.foreground}>{request.toolCall.toolName}</span>
          {'  '}Profile: <span fg={theme.foreground}>{request.profile}</span>
        </text>
        <text style={{ fg: theme.muted }}>
          Files: <span fg={theme.foreground}>{request.filesChanged.length} changed</span>
        </text>
        {request.filesChanged.length > 0 && (
          <text style={{ fg: theme.muted, wrapMode: 'none' }}>
            {request.filesChanged.slice(0, 3).join(', ')}
            {request.filesChanged.length > 3 ? ` (+${request.filesChanged.length - 3} more)` : ''}
          </text>
        )}
        <text style={{ fg: theme.muted, wrapMode: 'word' }}>
          {request.reason}
        </text>
      </box>

      {/* Diff preview */}
      {request.diff && (
        <box
          style={{
            flexDirection: 'column',
            borderStyle: 'single',
            borderColor: theme.border,
            customBorderChars: BORDER_CHARS,
            paddingLeft: 1,
            paddingRight: 1,
            paddingTop: 0,
            paddingBottom: 0,
            maxHeight: 8,
            flexGrow: 1,
            overflow: 'hidden',
          }}
        >
          <DiffViewer diffText={request.diff} />
        </box>
      )}

      {/* Separator */}
      <text style={{ fg: theme.border, attributes: TextAttributes.DIM }}>
        {'─'.repeat(50)}
      </text>

      {/* Action buttons */}
      <box style={{ flexDirection: 'row', gap: 2, paddingBottom: 1 }}>
        <Button onClick={onApprove} style={buttonStyle('approve')}>
          <text style={buttonTextStyle('approve')}>
            {'[Y] Accept'}
          </text>
        </Button>
        <Button onClick={onReject} style={buttonStyle('reject')}>
          <text style={buttonTextStyle('reject')}>
            {'[N] Reject'}
          </text>
        </Button>
        <Button onClick={onEdit} style={buttonStyle('edit')}>
          <text style={buttonTextStyle('edit')}>
            {'[E] Edit'}
          </text>
        </Button>
      </box>

      {/* Key hints */}
      <KeyHint
        hints={[
          { key: 'Y', label: 'Accept' },
          { key: 'N', label: 'Reject' },
          { key: 'E', label: 'Edit' },
          { key: '←/→', label: 'Navigate' },
          { key: 'Enter', label: 'Select' },
          { key: 'Esc', label: 'Reject' },
        ]}
      />
    </box>
  )
})
