import { useKeyboard } from '@opentui/react'
import React, { useState, useMemo, useCallback } from 'react'

import { useTheme } from '../hooks/use-theme'
import { useProviderStore } from '../state/provider-store'
import { BORDER_CHARS } from '../utils/ui-constants'
import { getProviderDefinition } from '@levelcode/common/providers/provider-registry'

import type { KeyEvent } from '@opentui/core'

interface ModelPickerProps {
  onClose: () => void
}

export const ModelPicker: React.FC<ModelPickerProps> = ({ onClose }) => {
  const theme = useTheme()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const catalogModels = useProviderStore((state) => state.catalogModels)
  const activeModel = useProviderStore((state) => state.config.activeModel)
  const activeProvider = useProviderStore((state) => state.config.activeProvider)

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return catalogModels
    const query = searchQuery.toLowerCase()
    return catalogModels.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query),
    )
  }, [catalogModels, searchQuery])

  // Clamp selectedIndex
  const clampedIndex = Math.min(selectedIndex, Math.max(0, filteredModels.length - 1))

  // Visible window
  const maxVisible = 10
  const scrollOffset = Math.max(
    0,
    Math.min(clampedIndex - Math.floor(maxVisible / 2), filteredModels.length - maxVisible),
  )
  const visibleModels = filteredModels.slice(
    Math.max(0, scrollOffset),
    Math.max(0, scrollOffset) + maxVisible,
  )

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
          setSelectedIndex((prev) => Math.min(filteredModels.length - 1, prev + 1))
          return
        }
        if (key.name === 'return' || key.name === 'enter') {
          const model = filteredModels[clampedIndex]
          if (model) {
            useProviderStore.getState().setActiveModel(model.providerId, model.id)
          }
          onClose()
          return
        }
        if (key.name === 'backspace' || key.name === 'delete') {
          setSearchQuery((prev) => prev.slice(0, -1))
          setSelectedIndex(0)
          return
        }
        if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
          setSearchQuery((prev) => prev + key.sequence)
          setSelectedIndex(0)
          return
        }
      },
      [filteredModels, clampedIndex, onClose],
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
      <text style={{ fg: theme.primary }}>
        {'Model Picker'}
      </text>
      <text style={{ fg: theme.muted }}>
        {'Search: '}{searchQuery || '(type to filter)'}
      </text>
      <text style={{ fg: theme.muted }}>
        {filteredModels.length}{' models available'}
      </text>
      {visibleModels.map((model, visibleIdx) => {
        const realIndex = Math.max(0, scrollOffset) + visibleIdx
        const isSelected = realIndex === clampedIndex
        const isActive = model.id === activeModel && model.providerId === activeProvider
        const providerName = getProviderDefinition(model.providerId)?.name ?? model.providerId

        return (
          <text
            key={`${model.providerId}-${model.id}-${visibleIdx}`}
            style={{
              fg: isActive ? theme.success : isSelected ? theme.primary : theme.foreground,
            }}
          >
            {isSelected ? '> ' : '  '}
            {model.name.slice(0, 30).padEnd(32)}
            {providerName.slice(0, 14).padEnd(16)}
            {isActive ? '*' : ''}
          </text>
        )
      })}
      {filteredModels.length === 0 && (
        <text style={{ fg: theme.muted }}>
          {'  No models found. Run /provider:add first.'}
        </text>
      )}
      <text style={{ fg: theme.muted }}>
        {'Up/Down navigate | Enter select | Esc close'}
      </text>
    </box>
  )
}
