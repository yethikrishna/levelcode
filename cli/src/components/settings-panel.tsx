import { useKeyboard } from '@opentui/react'
import React, { useState, useCallback } from 'react'

import { useTheme } from '../hooks/use-theme'
import { useProviderStore } from '../state/provider-store'
import { BORDER_CHARS } from '../utils/ui-constants'
import { getProviderDefinition } from '@levelcode/common/providers/provider-registry'

import type { KeyEvent } from '@opentui/core'

interface SettingsPanelProps {
  onClose: () => void
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const theme = useTheme()

  const settings = useProviderStore((state) => state.config.settings)
  const providers = useProviderStore((state) => state.config.providers)
  const activeProvider = useProviderStore((state) => state.config.activeProvider)
  const activeModel = useProviderStore((state) => state.config.activeModel)

  const providerEntries = Object.entries(providers)

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape') {
          onClose()
          return
        }
      },
      [onClose],
    ),
  )

  return (
    <box
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.primary,
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
      }}
    >
      <text style={{ fg: theme.primary }}>{'Provider Settings'}</text>

      <text style={{ fg: theme.foreground }}>
        {'Active: '}{activeProvider && activeModel ? `${activeProvider}/${activeModel}` : 'None set'}
      </text>
      <text style={{ fg: theme.foreground }}>
        {'Auto-detect local: '}{settings.autoDetectLocal ? 'ON' : 'OFF'}
      </text>
      <text style={{ fg: theme.foreground }}>
        {'Catalog refresh: '}{settings.catalogRefreshHours}{'h'}
      </text>
      <text style={{ fg: theme.foreground }}>
        {'Duplicate strategy: '}{settings.duplicateModelStrategy}
      </text>
      <text style={{ fg: theme.foreground }}>
        {'Preferred order: '}{settings.preferredProviderOrder.join(', ')}
      </text>

      {providerEntries.length > 0 && (
        <>
          <text style={{ fg: theme.primary }}>{'Configured Providers'}</text>
          {providerEntries.map(([id, entry]) => {
            const name = getProviderDefinition(id)?.name ?? id
            return (
              <text
                key={id}
                style={{ fg: entry.enabled ? theme.success : theme.muted }}
              >
                {'  '}{entry.enabled ? '●' : '○'}{' '}{name}
                {entry.models.length > 0 ? ` (${entry.models.length} models)` : ''}
                {entry.autoDetected ? ' [auto]' : ''}
              </text>
            )
          })}
        </>
      )}

      {providerEntries.length === 0 && (
        <text style={{ fg: theme.muted }}>{'No providers configured. Use /provider:add to add one.'}</text>
      )}

      <text style={{ fg: theme.muted }}>{'Esc close'}</text>
    </box>
  )
}
