import { useKeyboard } from '@opentui/react'
import React, { useState, useCallback } from 'react'

import { useTheme } from '../hooks/use-theme'
import { useProviderStore } from '../state/provider-store'
import { BORDER_CHARS } from '../utils/ui-constants'
import { PROVIDER_DEFINITIONS } from '@levelcode/common/providers/provider-registry'

import type { KeyEvent } from '@opentui/core'
import type {
  UserSettings,
  DuplicateModelStrategy,
} from '@levelcode/common/providers/provider-types'
import { DUPLICATE_MODEL_STRATEGIES } from '@levelcode/common/providers/provider-types'

type SettingId =
  | 'autoDetectLocal'
  | 'catalogRefreshHours'
  | 'preferredProviderOrder'
  | 'duplicateModelStrategy'
  | 'providers'

interface SettingRow {
  id: SettingId
  label: string
  type: 'toggle' | 'number' | 'select' | 'list'
}

const SETTING_ROWS: SettingRow[] = [
  { id: 'autoDetectLocal', label: 'Auto-detect local providers', type: 'toggle' },
  { id: 'catalogRefreshHours', label: 'Catalog refresh (hours)', type: 'number' },
  { id: 'preferredProviderOrder', label: 'Preferred provider order', type: 'list' },
  { id: 'duplicateModelStrategy', label: 'Duplicate model strategy', type: 'select' },
  { id: 'providers', label: 'Configured providers', type: 'list' },
]

interface SettingsPanelProps {
  onClose: () => void
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const theme = useTheme()
  const [selectedIndex, setSelectedIndex] = useState(0)

  const settings = useProviderStore((state) => state.config.settings)
  const providers = useProviderStore((state) => state.config.providers)

  const getProviderName = (id: string): string => {
    const def = PROVIDER_DEFINITIONS[id]
    return def?.name ?? id
  }

  const toggleAutoDetect = useCallback(() => {
    const next = !settings.autoDetectLocal
    useProviderStore.getState().updateSettings({ autoDetectLocal: next })
  }, [settings.autoDetectLocal])

  const adjustRefreshHours = useCallback(
    (delta: number) => {
      const next = Math.max(1, Math.min(24, settings.catalogRefreshHours + delta))
      useProviderStore.getState().updateSettings({ catalogRefreshHours: next })
    },
    [settings.catalogRefreshHours],
  )

  const cycleDuplicateStrategy = useCallback(
    (direction: number) => {
      const strategies = DUPLICATE_MODEL_STRATEGIES as readonly DuplicateModelStrategy[]
      const currentIdx = strategies.indexOf(settings.duplicateModelStrategy)
      const nextIdx =
        (currentIdx + direction + strategies.length) % strategies.length
      const next = strategies[nextIdx]!
      useProviderStore.getState().updateSettings({ duplicateModelStrategy: next })
    },
    [settings.duplicateModelStrategy],
  )

  const handleAction = useCallback(() => {
    const row = SETTING_ROWS[selectedIndex]
    if (!row) return

    switch (row.id) {
      case 'autoDetectLocal':
        toggleAutoDetect()
        break
      case 'catalogRefreshHours':
        adjustRefreshHours(1)
        break
      case 'duplicateModelStrategy':
        cycleDuplicateStrategy(1)
        break
    }
  }, [selectedIndex, toggleAutoDetect, adjustRefreshHours, cycleDuplicateStrategy])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          onClose()
          return
        }
        if (key.name === 'up') {
          setSelectedIndex((prev) => Math.max(0, prev - 1))
          return
        }
        if (key.name === 'down') {
          setSelectedIndex((prev) =>
            Math.min(SETTING_ROWS.length - 1, prev + 1),
          )
          return
        }
        if (key.name === 'return' || key.name === 'enter' || key.name === 'space') {
          handleAction()
          return
        }

        const row = SETTING_ROWS[selectedIndex]
        if (!row) return

        if (key.name === 'left') {
          if (row.id === 'catalogRefreshHours') {
            adjustRefreshHours(-1)
          } else if (row.id === 'duplicateModelStrategy') {
            cycleDuplicateStrategy(-1)
          } else if (row.type === 'toggle') {
            handleAction()
          }
          return
        }
        if (key.name === 'right') {
          if (row.id === 'catalogRefreshHours') {
            adjustRefreshHours(1)
          } else if (row.id === 'duplicateModelStrategy') {
            cycleDuplicateStrategy(1)
          } else if (row.type === 'toggle') {
            handleAction()
          }
          return
        }
      },
      [onClose, selectedIndex, handleAction, adjustRefreshHours, cycleDuplicateStrategy],
    ),
  )

  const getValueDisplay = (row: SettingRow): string => {
    switch (row.id) {
      case 'autoDetectLocal':
        return settings.autoDetectLocal ? 'ON' : 'OFF'
      case 'catalogRefreshHours':
        return `< ${settings.catalogRefreshHours}h >`
      case 'duplicateModelStrategy':
        return `< ${settings.duplicateModelStrategy} >`
      case 'preferredProviderOrder':
        return settings.preferredProviderOrder
          .map((id) => getProviderName(id))
          .join(', ')
      case 'providers':
        return ''
      default:
        return ''
    }
  }

  const getValueColor = (row: SettingRow): string => {
    switch (row.id) {
      case 'autoDetectLocal':
        return settings.autoDetectLocal ? theme.success : theme.muted
      default:
        return theme.primary
    }
  }

  const providerEntries = Object.entries(providers)

  return (
    <box
      title=" Settings "
      titleAlignment="center"
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
      {SETTING_ROWS.map((row, index) => {
        const isSelected = index === selectedIndex
        const valueDisplay = getValueDisplay(row)
        const valueColor = getValueColor(row)

        return (
          <box key={row.id} style={{ flexDirection: 'row', height: 1 }}>
            <text
              style={{
                fg: isSelected ? theme.primary : theme.foreground,
                bg: isSelected ? theme.surface : undefined,
              }}
            >
              {isSelected ? '> ' : '  '}
              {row.label}
            </text>
            {valueDisplay && (
              <box style={{ flexDirection: 'row' }}>
                <text style={{ fg: theme.muted }}>{'  '}</text>
                <text
                  style={{
                    fg: isSelected ? valueColor : theme.muted,
                  }}
                >
                  {valueDisplay}
                </text>
              </box>
            )}
          </box>
        )
      })}

      {/* Configured providers detail section */}
      {providerEntries.length > 0 && (
        <box style={{ flexDirection: 'column' }}>
          <text style={{ fg: theme.muted }}>{'  '}---</text>
          {providerEntries.map(([id, entry]) => (
            <box key={id} style={{ flexDirection: 'row', height: 1 }}>
              <text style={{ fg: theme.foreground }}>
                {'    '}{getProviderName(id)}
              </text>
              <text style={{ fg: theme.muted }}>{'  '}</text>
              <text
                style={{
                  fg: entry.enabled ? theme.success : theme.muted,
                }}
              >
                {entry.enabled ? 'enabled' : 'disabled'}
              </text>
              {entry.models.length > 0 && (
                <text style={{ fg: theme.muted }}>
                  {'  '}{entry.models.length} models
                </text>
              )}
            </box>
          ))}
        </box>
      )}

      {providerEntries.length === 0 && (
        <text style={{ fg: theme.muted }}>
          {'  '}No providers configured. Use /provider:add to add one.
        </text>
      )}

      {/* Help text */}
      <text style={{ fg: theme.muted }}>
        {'\u2191\u2193 navigate \u00B7 Enter/Space toggle \u00B7 \u2190\u2192 adjust \u00B7 Esc close'}
      </text>
    </box>
  )
}
