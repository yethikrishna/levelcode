import { useKeyboard } from '@opentui/react'
import React, { useState, useMemo, useCallback } from 'react'

import { useTheme } from '../hooks/use-theme'
import { useProviderStore } from '../state/provider-store'
import { BORDER_CHARS } from '../utils/ui-constants'
import { PROVIDER_DEFINITIONS } from '@levelcode/common/providers/provider-registry'

import type { KeyEvent } from '@opentui/core'
import type { ModelCatalogEntry } from '@levelcode/common/providers/provider-types'

interface ModelPickerProps {
  onClose: () => void
}

export const ModelPicker: React.FC<ModelPickerProps> = ({ onClose }) => {
  const theme = useTheme()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)

  const catalogModels = useProviderStore((state) => state.catalogModels)
  const activeModel = useProviderStore((state) => state.config.activeModel)
  const activeProvider = useProviderStore((state) => state.config.activeProvider)
  const configuredProviders = useProviderStore(
    (state) => Object.keys(state.config.providers),
  )

  const filteredModels = useMemo(() => {
    let models = catalogModels

    // Filter by selected provider
    if (selectedProviderId) {
      models = models.filter((m) => m.providerId === selectedProviderId)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      models = models.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.id.toLowerCase().includes(query),
      )
    }

    return models
  }, [catalogModels, selectedProviderId, searchQuery])

  const formatCost = (model: ModelCatalogEntry): string => {
    if (!model.cost) return '-'
    return `$${model.cost.input.toFixed(2)}/$${model.cost.output.toFixed(2)}`
  }

  const formatContext = (model: ModelCatalogEntry): string => {
    if (!model.limit?.context) return '-'
    const ctx = model.limit.context
    if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1)}M`
    if (ctx >= 1_000) return `${Math.round(ctx / 1_000)}K`
    return String(ctx)
  }

  const getProviderName = (providerId: string): string => {
    const def = PROVIDER_DEFINITIONS[providerId]
    return def?.name ?? providerId
  }

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape') {
          onClose()
          return
        }

        if (key.name === 'up') {
          setSelectedIndex((prev) => Math.max(0, prev - 1))
          return
        }
        if (key.name === 'down') {
          setSelectedIndex((prev) =>
            Math.min(filteredModels.length - 1, prev + 1),
          )
          return
        }

        if (key.name === 'return' || key.name === 'enter') {
          const model = filteredModels[selectedIndex]
          if (model) {
            useProviderStore
              .getState()
              .setActiveModel(model.providerId, model.id)
            onClose()
          }
          return
        }

        // Tab cycles through provider filters
        if (key.name === 'tab') {
          if (!selectedProviderId) {
            setSelectedProviderId(configuredProviders[0] ?? null)
          } else {
            const currentIdx = configuredProviders.indexOf(selectedProviderId)
            const nextIdx = currentIdx + 1
            if (nextIdx >= configuredProviders.length) {
              setSelectedProviderId(null) // cycle back to "all"
            } else {
              setSelectedProviderId(configuredProviders[nextIdx] ?? null)
            }
          }
          setSelectedIndex(0)
          return
        }

        // Backspace in search
        if (key.name === 'backspace' || key.name === 'delete') {
          setSearchQuery((prev) => prev.slice(0, -1))
          setSelectedIndex(0)
          return
        }

        // Printable character input for search
        if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
          setSearchQuery((prev) => prev + key.sequence)
          setSelectedIndex(0)
          return
        }
      },
      [filteredModels, selectedIndex, selectedProviderId, configuredProviders, onClose],
    ),
  )

  // Determine visible range for scrolling
  const maxVisible = 12
  const scrollOffset = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(maxVisible / 2),
      filteredModels.length - maxVisible,
    ),
  )
  const visibleModels = filteredModels.slice(
    scrollOffset,
    scrollOffset + maxVisible,
  )

  return (
    <box
      title=" Model Picker "
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
      {/* Search bar */}
      <box style={{ flexDirection: 'row', height: 1 }}>
        <text style={{ fg: theme.primary }}>Search: </text>
        <text style={{ fg: theme.foreground }}>
          {searchQuery || ''}
        </text>
        <text style={{ fg: theme.muted }}>
          {searchQuery ? '' : '(type to filter)'}
        </text>
      </box>

      {/* Provider filter indicator */}
      <box style={{ flexDirection: 'row', height: 1 }}>
        <text style={{ fg: theme.muted }}>
          Filter:{' '}
        </text>
        <text
          style={{
            fg: selectedProviderId ? theme.info : theme.muted,
          }}
        >
          {selectedProviderId
            ? getProviderName(selectedProviderId)
            : 'All providers'}
        </text>
        <text style={{ fg: theme.muted }}>
          {'  '}({filteredModels.length} models)
        </text>
      </box>

      {/* Column header */}
      <text style={{ fg: theme.muted }}>
        {'  '}{'Name'.padEnd(32)}{'Provider'.padEnd(16)}{'Cost'.padEnd(16)}{'Context'}
      </text>

      {/* Model list */}
      {visibleModels.map((model, visibleIdx) => {
        const realIndex = scrollOffset + visibleIdx
        const isSelected = realIndex === selectedIndex
        const isActive =
          model.id === activeModel && model.providerId === activeProvider

        return (
          <box key={`${model.providerId}-${model.id}`} style={{ flexDirection: 'row', height: 1 }}>
            <text
              style={{
                fg: isActive
                  ? theme.success
                  : isSelected
                    ? theme.primary
                    : theme.foreground,
                bg: isSelected ? theme.surface : undefined,
              }}
            >
              {isSelected ? '> ' : '  '}
              {model.name.slice(0, 30).padEnd(30)}
              {'  '}
              {getProviderName(model.providerId).slice(0, 14).padEnd(14)}
              {'  '}
              {formatCost(model).padEnd(14)}
              {'  '}
              {formatContext(model)}
              {isActive ? ' *' : ''}
            </text>
          </box>
        )
      })}

      {filteredModels.length === 0 && (
        <text style={{ fg: theme.muted }}>
          {'  '}No models found.
        </text>
      )}

      {/* Help text */}
      <text style={{ fg: theme.muted }}>
        {'\u2191\u2193 navigate \u00B7 Enter select \u00B7 Tab filter provider \u00B7 Esc close'}
      </text>
    </box>
  )
}
