import React from 'react'
import { Panel, ListNavigator, KeyHint } from './primitives'
import { useTheme } from '../hooks/use-theme'
import { OAUTH_CONFIGS } from '@levelcode/common/providers/oauth-configs'
import { getProviderDefinition } from '@levelcode/common/providers/provider-registry'
import { useOAuthStore } from '../state/oauth-store'

import type { ListNavigatorItem } from './primitives'

interface ProviderStatusListProps {
  onConnect: (providerId: string) => void
  onClose: () => void
}

export const ProviderStatusList: React.FC<ProviderStatusListProps> = ({ onConnect, onClose }) => {
  const theme = useTheme()
  const connectionStatuses = useOAuthStore((s) => s.connectionStatuses)

  // Filter to only show providers with clientId configured
  const oauthProviderIds = Object.entries(OAUTH_CONFIGS)
    .filter(([_, config]) => Boolean(config.clientId))
    .map(([id]) => id)

  // If none configured, show helper text
  if (oauthProviderIds.length === 0) {
    return (
      <Panel title="OAuth Providers" borderColor={theme.primary}>
        <text style={{ fg: theme.muted }}>
          No OAuth providers configured. Set environment variables to enable:
        </text>
        <text style={{ fg: theme.foreground }}>  GOOGLE_OAUTH_CLIENT_ID</text>
        <text style={{ fg: theme.foreground }}>  GITHUB_OAUTH_CLIENT_ID</text>
        <text style={{ fg: theme.foreground }}>  AZURE_OAUTH_CLIENT_ID</text>
        <text style={{ fg: theme.foreground }}>  OPENROUTER_OAUTH_CLIENT_ID</text>
        <text style={{ fg: theme.muted }}>Claude OAuth is always available via /connect:claude</text>
        <KeyHint hints={[{ key: 'Esc', label: 'Close' }]} />
      </Panel>
    )
  }

  const items: ListNavigatorItem[] = oauthProviderIds.map((id) => {
    const def = getProviderDefinition(id)
    const status = connectionStatuses[id] ?? 'disconnected'
    const statusIcon = status === 'connected' ? '\u25CF' : status === 'expired' ? '\u25D0' : '\u25CB'
    return {
      key: id,
      label: def?.name ?? id,
      secondary: `${statusIcon} ${status}`,
      icon: status === 'connected' ? '\u2713' : '\u2192',
    }
  })

  return (
    <Panel title="OAuth Providers" borderColor={theme.primary}>
      <ListNavigator
        items={items}
        onSelect={(item) => onConnect(item.key)}
        onCancel={onClose}
        maxHeight={10}
      />
      <KeyHint hints={[
        { key: 'Enter', label: 'Connect' },
        { key: 'Esc', label: 'Close' },
      ]} />
    </Panel>
  )
}
