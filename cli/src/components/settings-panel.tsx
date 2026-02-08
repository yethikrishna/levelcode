import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useState, useCallback } from 'react'

import { useTheme } from '../hooks/use-theme'
import { useProviderStore } from '../state/provider-store'
import { getProviderDefinition } from '@levelcode/common/providers/provider-registry'
import {
  Panel,
  TabView,
  ListNavigator,
  KeyHint,
  StatusBadge,
  Switch,
} from './primitives'
import { useOAuthStore } from '../state/oauth-store'
import { OAUTH_CONFIGS } from '@levelcode/common/providers/oauth-configs'

import type { KeyEvent } from '@opentui/core'
import type { TabDefinition, ListNavigatorItem } from './primitives'

interface SettingsPanelProps {
  onClose: () => void
}

const TABS: TabDefinition[] = [
  { key: 'general', label: 'General' },
  { key: 'providers', label: 'Providers' },
  { key: 'oauth', label: 'OAuth' },
  { key: 'theme', label: 'Theme' },
]

// ── OAuth env-var hints per provider ────────────────────────────────

const OAUTH_ENV_HINTS: Record<string, string> = {
  'google-gemini': 'Set GOOGLE_OAUTH_CLIENT_ID',
  'github-models': 'Set GITHUB_OAUTH_CLIENT_ID',
  'azure': 'Set AZURE_OAUTH_CLIENT_ID',
  'openrouter': 'Set OPENROUTER_OAUTH_CLIENT_ID',
  'anthropic': 'Set CLAUDE_OAUTH_CLIENT_ID',
}

const OAUTH_DISPLAY_NAMES: Record<string, string> = {
  'google-gemini': 'Google Gemini',
  'github-models': 'GitHub Models',
  'azure': 'Azure OpenAI',
  'openrouter': 'OpenRouter',
  'anthropic': 'Claude',
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const theme = useTheme()
  const [activeTab, setActiveTab] = useState('general')

  const connectionStatuses = useOAuthStore((s) => s.connectionStatuses)
  const settings = useProviderStore((state) => state.config.settings)
  const providers = useProviderStore((state) => state.config.providers)
  const activeProvider = useProviderStore((state) => state.config.activeProvider)
  const activeModel = useProviderStore((state) => state.config.activeModel)

  const providerEntries = Object.entries(providers)

  const providerItems: ListNavigatorItem[] = providerEntries.map(([id, entry]) => {
    const name = getProviderDefinition(id)?.name ?? id
    const modelCount = entry.models.length > 0 ? `${entry.models.length} models` : ''
    const autoTag = entry.autoDetected ? ' [auto]' : ''
    return {
      key: id,
      label: name,
      secondary: [modelCount, autoTag].filter(Boolean).join(''),
      icon: entry.enabled ? '\u25CF' : '\u25CB',
    }
  })

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)

  const handleProviderSelect = useCallback((item: ListNavigatorItem) => {
    setSelectedProviderId(item.key)
    const entry = providers[item.key]
    if (entry) {
      useProviderStore.getState().addProvider(item.key, {
        ...entry,
        enabled: !entry.enabled,
      })
    }
  }, [providers])

  // Keyboard handling: escape to close, +/- to adjust catalog refresh hours on General tab
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape') {
          onClose()
          return
        }
        // Adjust catalog refresh hours with +/-
        if (activeTab === 'general') {
          if (key.sequence === '+' || key.sequence === '=') {
            const newHours = Math.min(24, settings.catalogRefreshHours + 1)
            useProviderStore.getState().updateSettings({ catalogRefreshHours: newHours })
            return
          }
          if (key.sequence === '-' || key.sequence === '_') {
            const newHours = Math.max(1, settings.catalogRefreshHours - 1)
            useProviderStore.getState().updateSettings({ catalogRefreshHours: newHours })
            return
          }
        }
      },
      [onClose, activeTab, settings.catalogRefreshHours],
    ),
  )

  return (
    <Panel title="Settings" borderColor={theme.primary}>
      <TabView tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
        {/* ── General Tab ─────────────────────────────────────── */}
        {activeTab === 'general' && (
          <box style={{ flexDirection: 'column', gap: 0, paddingTop: 1 }}>
            {/* Active model display */}
            <text
              style={{
                fg: theme.foreground,
                attributes: TextAttributes.BOLD,
                paddingLeft: 1,
              }}
            >
              Active Model
            </text>
            <box style={{ flexDirection: 'row', gap: 2, paddingLeft: 3 }}>
              {activeProvider && activeModel ? (
                <StatusBadge variant="connected" label={`${activeProvider}/${activeModel}`} />
              ) : (
                <StatusBadge variant="disconnected" label="None set" />
              )}
            </box>

            <text>{''}</text>

            {/* Settings section */}
            <text
              style={{
                fg: theme.foreground,
                attributes: TextAttributes.BOLD,
                paddingLeft: 1,
              }}
            >
              Settings
            </text>

            {/* Auto-detect local toggle */}
            <box style={{ flexDirection: 'row', gap: 2, alignItems: 'center', paddingLeft: 3 }}>
              <Switch
                checked={settings.autoDetectLocal}
                onChange={(checked) => useProviderStore.getState().updateSettings({ autoDetectLocal: checked })}
                label="Auto-detect local providers"
              />
            </box>

            {/* Catalog refresh hours */}
            <box style={{ flexDirection: 'row', gap: 1, paddingLeft: 3 }}>
              <text style={{ fg: theme.foreground }}>Catalog refresh: </text>
              <text style={{ fg: theme.primary, attributes: TextAttributes.BOLD }}>{settings.catalogRefreshHours}h</text>
              <text style={{ fg: theme.muted }}> (1-24h, change with +/-)</text>
            </box>

            <text>{''}</text>

            {/* Duplicate strategy selector */}
            <box style={{ flexDirection: 'column', paddingLeft: 3 }}>
              <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>Duplicate strategy</text>
              {(['cheapest', 'fastest', 'preferred-order'] as const).map((s) => (
                <text key={s} style={{
                  fg: settings.duplicateModelStrategy === s ? theme.primary : theme.muted,
                  attributes: settings.duplicateModelStrategy === s ? TextAttributes.BOLD : TextAttributes.DIM,
                }}>
                  {settings.duplicateModelStrategy === s ? '  \u25B8 ' : '    '}{s}
                </text>
              ))}
            </box>

            <text>{''}</text>

            {/* Preferred order */}
            <box style={{ flexDirection: 'row', gap: 0, paddingLeft: 3 }}>
              <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
                {'Preferred order'.padEnd(24)}
              </text>
              <text style={{ fg: theme.muted }}>
                {settings.preferredProviderOrder.join(', ')}
              </text>
            </box>
          </box>
        )}

        {/* ── Providers Tab ───────────────────────────────────── */}
        {activeTab === 'providers' && (
          <box style={{ flexDirection: 'column', paddingTop: 1 }}>
            {providerEntries.length > 0 ? (
              <>
                <ListNavigator
                  items={providerItems}
                  onSelect={handleProviderSelect}
                  onCancel={onClose}
                  maxHeight={10}
                />

                {/* Provider detail section */}
                {selectedProviderId && providers[selectedProviderId] && (() => {
                  const entry = providers[selectedProviderId]!
                  const def = getProviderDefinition(selectedProviderId)
                  return (
                    <box style={{ flexDirection: 'column', paddingTop: 1, paddingLeft: 1 }}>
                      <box style={{ flexDirection: 'row', gap: 2 }}>
                        <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
                          {def?.name ?? selectedProviderId}
                        </text>
                        <StatusBadge
                          variant={entry.enabled ? 'connected' : 'disconnected'}
                          label={entry.enabled ? 'Enabled' : 'Disabled'}
                        />
                      </box>
                      {def?.category && (
                        <text style={{ fg: theme.muted, paddingLeft: 2 }}>
                          Category: {def.category}
                        </text>
                      )}
                      {def?.apiFormat && (
                        <text style={{ fg: theme.muted, paddingLeft: 2 }}>
                          API format: {def.apiFormat}
                        </text>
                      )}
                      {entry.models.length > 0 && (
                        <text style={{ fg: theme.muted, paddingLeft: 2 }}>
                          Models: {entry.models.join(', ')}
                        </text>
                      )}
                      {entry.autoDetected && (
                        <text style={{ fg: theme.info, paddingLeft: 2, attributes: TextAttributes.DIM }}>
                          Auto-detected
                        </text>
                      )}
                    </box>
                  )
                })()}

                <text
                  style={{
                    fg: theme.muted,
                    attributes: TextAttributes.DIM,
                    paddingTop: 1,
                    paddingLeft: 1,
                  }}
                >
                  {'Enter to toggle enable/disable \u00B7 '}
                  {'\u25CF enabled  \u25CB disabled'}
                </text>
              </>
            ) : (
              <box style={{ flexDirection: 'column', paddingLeft: 1 }}>
                <text style={{ fg: theme.muted }}>
                  {'No providers configured.'}
                </text>
                <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
                  {'Use /provider:add to add one.'}
                </text>
              </box>
            )}
          </box>
        )}

        {/* ── OAuth Tab ───────────────────────────────────────── */}
        {activeTab === 'oauth' && (
          <box style={{ flexDirection: 'column', paddingTop: 1 }}>
            <text
              style={{
                fg: theme.foreground,
                attributes: TextAttributes.BOLD,
                paddingLeft: 1,
              }}
            >
              OAuth Connections
            </text>

            <text>{''}</text>

            {/* Iterate all known OAuth providers */}
            {Object.entries(OAUTH_CONFIGS).map(([id, config]) => {
              const name = OAUTH_DISPLAY_NAMES[id] ?? getProviderDefinition(id)?.name ?? id
              const isConfigured = Boolean(config.clientId)
              const status = connectionStatuses[id] ?? 'disconnected'
              const isConnected = isConfigured && status === 'connected'
              const isExpired = isConfigured && status === 'expired'

              return (
                <box
                  key={id}
                  style={{ flexDirection: 'row', gap: 2, paddingLeft: 3 }}
                >
                  <StatusBadge
                    variant={
                      isConnected
                        ? 'connected'
                        : isExpired
                          ? 'warning'
                          : 'disconnected'
                    }
                    compact
                  />
                  <text
                    style={{
                      fg: isConnected ? theme.foreground : theme.muted,
                      attributes: isConnected ? TextAttributes.BOLD : undefined,
                    }}
                  >
                    {name.padEnd(18)}
                  </text>
                  {isConnected && (
                    <text style={{ fg: theme.success }}>
                      Connected
                    </text>
                  )}
                  {isExpired && (
                    <text style={{ fg: theme.warning }}>
                      Expired
                    </text>
                  )}
                  {!isConfigured && (
                    <text
                      style={{
                        fg: theme.muted,
                        attributes: TextAttributes.DIM,
                      }}
                    >
                      {'Not configured  '}
                      {OAUTH_ENV_HINTS[id] ?? ''}
                    </text>
                  )}
                  {isConfigured && !isConnected && !isExpired && (
                    <text style={{ fg: theme.muted }}>
                      Disconnected
                    </text>
                  )}
                </box>
              )
            })}

            <text>{''}</text>

            {/* Hint commands */}
            <text
              style={{
                fg: theme.muted,
                attributes: TextAttributes.DIM,
                paddingLeft: 1,
              }}
            >
              {'Use '}
              <span fg={theme.info}>/connect &lt;provider&gt;</span>
              {' to initiate OAuth flow'}
            </text>
            <text
              style={{
                fg: theme.muted,
                attributes: TextAttributes.DIM,
                paddingLeft: 1,
              }}
            >
              {'Use '}
              <span fg={theme.info}>/disconnect &lt;provider&gt;</span>
              {' to remove connection'}
            </text>
          </box>
        )}

        {/* ── Theme Tab ───────────────────────────────────────── */}
        {activeTab === 'theme' && (
          <box style={{ flexDirection: 'column', gap: 0, paddingTop: 1 }}>
            {/* Current theme */}
            <box style={{ flexDirection: 'row', gap: 1, paddingLeft: 1 }}>
              <text
                style={{
                  fg: theme.foreground,
                  attributes: TextAttributes.BOLD,
                }}
              >
                Current Theme:
              </text>
              <text style={{ fg: theme.primary }}>dark</text>
            </box>

            <text>{''}</text>

            {/* Detection priority */}
            <text
              style={{
                fg: theme.foreground,
                attributes: TextAttributes.BOLD,
                paddingLeft: 1,
              }}
            >
              Detection Priority
            </text>
            {[
              { num: '1', label: 'Terminal override', detail: '(OPENAI_THEME)' },
              { num: '2', label: 'IDE configuration', detail: '' },
              { num: '3', label: 'OS system theme', detail: '' },
            ].map((item) => (
              <box
                key={item.num}
                style={{ flexDirection: 'row', gap: 1, paddingLeft: 3 }}
              >
                <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
                  {item.num}.
                </text>
                <text style={{ fg: theme.foreground }}>
                  {item.label}
                </text>
                {item.detail && (
                  <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
                    {item.detail}
                  </text>
                )}
              </box>
            ))}

            <text>{''}</text>

            {/* Color palette preview */}
            <text
              style={{
                fg: theme.foreground,
                attributes: TextAttributes.BOLD,
                paddingLeft: 1,
              }}
            >
              Palette Preview
            </text>
            <box style={{ flexDirection: 'row', gap: 2, paddingLeft: 3 }}>
              <text style={{ fg: theme.primary }}>{'\u25A0 primary'}</text>
              <text style={{ fg: theme.secondary }}>{'\u25A0 secondary'}</text>
              <text style={{ fg: theme.success }}>{'\u25A0 success'}</text>
              <text style={{ fg: theme.error }}>{'\u25A0 error'}</text>
              <text style={{ fg: theme.warning }}>{'\u25A0 warning'}</text>
              <text style={{ fg: theme.info }}>{'\u25A0 info'}</text>
            </box>
            <box style={{ flexDirection: 'row', gap: 2, paddingLeft: 3 }}>
              <text style={{ fg: theme.muted }}>{'\u25A0 muted'}</text>
              <text style={{ fg: theme.border }}>{'\u25A0 border'}</text>
              <text style={{ bg: theme.surface, fg: theme.foreground }}>
                {' surface '}
              </text>
              <text style={{ bg: theme.surfaceHover, fg: theme.foreground }}>
                {' hover '}
              </text>
            </box>

            <text>{''}</text>

            <text
              style={{
                fg: theme.muted,
                attributes: TextAttributes.DIM,
                paddingLeft: 1,
              }}
            >
              {'Use '}
              <span fg={theme.info}>/theme:toggle</span>
              {' to switch themes'}
            </text>
          </box>
        )}
      </TabView>
      <KeyHint
        hints={
          activeTab === 'general'
            ? [
                { key: '+/-', label: 'Adjust hours' },
                { key: 'Left/Right', label: 'Switch tab' },
                { key: 'Esc', label: 'Close' },
              ]
            : activeTab === 'providers'
              ? [
                  { key: 'Enter', label: 'Toggle' },
                  { key: 'Left/Right', label: 'Switch tab' },
                  { key: 'Esc', label: 'Close' },
                ]
              : [
                  { key: 'Left/Right', label: 'Switch tab' },
                  { key: '1-4', label: 'Jump to tab' },
                  { key: 'Esc', label: 'Close' },
                ]
        }
      />
    </Panel>
  )
}
