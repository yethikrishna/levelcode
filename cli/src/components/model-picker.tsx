import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useState, useMemo, useCallback } from 'react'

import { useTheme } from '../hooks/use-theme'
import { useProviderStore } from '../state/provider-store'
import { getProviderDefinition } from '@levelcode/common/providers/provider-registry'
import {
  Panel,
  ListNavigator,
  SearchInput,
  KeyHint,
} from './primitives'

import type { KeyEvent } from '@opentui/core'
import type { ListNavigatorItem } from './primitives'
import type { ModelCatalogEntry } from '@levelcode/common/providers/provider-types'

interface ModelPickerProps {
  onClose: () => void
}

/** Build the plain-text secondary string for search filtering (kept in item.secondary) */
function formatModelSecondary(model: ModelCatalogEntry): string {
  const parts: string[] = []

  const caps: string[] = []
  if (model.capabilities?.reasoning) caps.push('[R]')
  if (model.capabilities?.vision) caps.push('[V]')
  if (model.capabilities?.tool_call || model.capabilities?.function_calling) caps.push('[T]')
  if (caps.length > 0) parts.push(caps.join(' '))

  if (model.cost) {
    const inputCost = model.cost.input.toFixed(3)
    const outputCost = model.cost.output.toFixed(3)
    parts.push(`$${inputCost} \u2192 $${outputCost}`)
  }

  return parts.join('  ')
}

export const ModelPicker: React.FC<ModelPickerProps> = ({ onClose }) => {
  const theme = useTheme()

  const [searchQuery, setSearchQuery] = useState('')

  const catalogModels = useProviderStore((state) => state.catalogModels)
  const configuredProviders = useProviderStore((state) => state.config.providers)
  const activeModel = useProviderStore((state) => state.config.activeModel)
  const activeProvider = useProviderStore((state) => state.config.activeProvider)

  // Build set of provider IDs that are configured and enabled
  const availableProviderIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [id, entry] of Object.entries(configuredProviders)) {
      if (entry.enabled) ids.add(id)
    }
    return ids
  }, [configuredProviders])

  // Merge catalog models with provider-specific models that aren't in the catalog
  // This ensures models from configured providers (like OpenRouter's 345 models) always show up
  const allModels: ModelCatalogEntry[] = useMemo(() => {
    const catalogModelIds = new Set(catalogModels.map((m) => `${m.providerId}/${m.id}`))
    const providerModels: ModelCatalogEntry[] = []

    for (const [providerId, entry] of Object.entries(configuredProviders)) {
      if (!entry.enabled) continue
      for (const modelId of [...entry.models, ...entry.customModelIds]) {
        const key = `${providerId}/${modelId}`
        if (!catalogModelIds.has(key)) {
          providerModels.push({
            id: modelId,
            name: modelId,
            providerId,
          })
        }
      }
    }

    return [...catalogModels, ...providerModels]
  }, [catalogModels, configuredProviders])

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return allModels
    const query = searchQuery.toLowerCase()
    return allModels.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query) ||
        (getProviderDefinition(m.providerId)?.name ?? m.providerId)
          .toLowerCase()
          .includes(query),
    )
  }, [allModels, searchQuery])

  // Build a lookup from item key -> model for the secondary renderer
  const modelByKey = useMemo(() => {
    const map = new Map<string, ModelCatalogEntry>()
    for (const m of allModels) {
      map.set(`${m.providerId}/${m.id}`, m)
    }
    return map
  }, [allModels])

  // Sort: available (configured) providers first, then unconfigured
  const sortedModels = useMemo(() => {
    const available = filteredModels.filter((m) => availableProviderIds.has(m.providerId))
    const unavailable = filteredModels.filter((m) => !availableProviderIds.has(m.providerId))
    return [...available, ...unavailable]
  }, [filteredModels, availableProviderIds])

  const items: ListNavigatorItem[] = useMemo(
    () =>
      sortedModels.map((m) => {
        const isAvailable = availableProviderIds.has(m.providerId)
        const providerName = getProviderDefinition(m.providerId)?.name ?? m.providerId
        return {
          key: `${m.providerId}/${m.id}`,
          label: isAvailable ? m.name : `${m.name}`,
          secondary: isAvailable
            ? formatModelSecondary(m)
            : `${formatModelSecondary(m)}  (not configured)`,
          group: isAvailable ? `${providerName} ✓` : `${providerName} (add with /provider:add)`,
          accent: isAvailable,
        }
      }),
    [sortedModels, availableProviderIds],
  )

  // Compute unique provider count
  const providerCount = useMemo(() => {
    const providers = new Set<string>()
    for (const m of allModels) {
      providers.add(m.providerId)
    }
    return providers.size
  }, [allModels])

  const activeKey =
    activeProvider && activeModel ? `${activeProvider}/${activeModel}` : undefined

  const handleSelect = useCallback(
    (item: ListNavigatorItem) => {
      const slashIdx = item.key.indexOf('/')
      const providerId = item.key.slice(0, slashIdx)
      const modelId = item.key.slice(slashIdx + 1)
      useProviderStore.getState().setActiveModel(providerId, modelId)
      onClose()
    },
    [onClose],
  )

  // Handle search typing (ListNavigator handles nav + escape via onCancel)
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'backspace' || key.name === 'delete') {
          setSearchQuery((prev) => prev.slice(0, -1))
          return
        }
        if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
          setSearchQuery((prev) => prev + key.sequence)
        }
      },
      [],
    ),
  )

  const availableModelCount = useMemo(
    () => allModels.filter((m) => availableProviderIds.has(m.providerId)).length,
    [allModels, availableProviderIds],
  )

  const subtitleText = searchQuery.trim()
    ? `${filteredModels.length}/${allModels.length} models from ${providerCount} providers`
    : `${availableModelCount} available · ${allModels.length} total from ${providerCount} providers`

  /** Render colored capability badges + formatted cost for each model row */
  const secondaryRenderer = useCallback(
    (item: ListNavigatorItem) => {
      const model = modelByKey.get(item.key)
      if (!model) return null

      const hasReasoning = model.capabilities?.reasoning
      const hasVision = model.capabilities?.vision
      const hasTool = model.capabilities?.tool_call || model.capabilities?.function_calling

      const hasCost = model.cost != null

      // Build plain text string — spans inside fragments crash @opentui
      const parts: string[] = []
      if (hasReasoning) parts.push('[R]')
      if (hasVision) parts.push('[V]')
      if (hasTool) parts.push('[T]')
      if (hasCost) parts.push(`$${model.cost!.input.toFixed(3)} → $${model.cost!.output.toFixed(3)}`)
      return parts.join(' ') || null
    },
    [modelByKey, theme],
  )

  /** Render provider group headers with BOLD name + model count + decorative line */
  const groupHeaderRenderer = useCallback(
    (group: string, count: number) => (
      <box style={{ paddingLeft: 1, paddingTop: 1, flexDirection: 'row', gap: 0 }}>
        <text style={{ fg: theme.border, attributes: TextAttributes.DIM }}>{'\u2500\u2500 '}</text>
        <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>{group}</text>
        <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>{` (${count} model${count !== 1 ? 's' : ''}) `}</text>
        <text style={{ fg: theme.border, attributes: TextAttributes.DIM }}>{'\u2500'.repeat(20)}</text>
      </box>
    ),
    [theme],
  )

  /** Empty state with helpful guidance */
  const emptyRenderer = useCallback(
    () => (
      <box style={{ flexDirection: 'column', paddingLeft: 2, paddingTop: 1, gap: 1 }}>
        <text style={{ fg: theme.muted }}>
          {'\u25CB No models found'}
        </text>
        <text style={{ fg: theme.info, attributes: TextAttributes.DIM }}>
          {'Run /provider:add to configure a provider first.'}
        </text>
      </box>
    ),
    [theme],
  )

  return (
    <Panel
      title="Model Picker"
      borderColor={theme.primary}
    >
      {/* Header area: subtitle with counts + active model */}
      <box style={{ flexDirection: 'column', gap: 0 }}>
        <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
          {subtitleText}
        </text>
        {activeProvider && activeModel ? (
          <text style={{ fg: theme.success }}>
            {'Active: '}{activeProvider}{'/'}{activeModel}{' \u2726'}
          </text>
        ) : (
          <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
            {'No active model selected'}
          </text>
        )}
      </box>
      <box style={{ flexDirection: 'row', gap: 2, paddingTop: 1 }}>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Type to search..."
          resultCount={searchQuery.trim() ? filteredModels.length : undefined}
        />
      </box>
      <ListNavigator
        items={items}
        onSelect={handleSelect}
        onCancel={onClose}
        activeKey={activeKey}
        searchable={false}
        maxHeight={12}
        secondaryRenderer={secondaryRenderer}
        groupHeaderRenderer={groupHeaderRenderer}
        emptyRenderer={emptyRenderer}
      />
      <KeyHint
        hints={[
          { key: 'Esc', label: 'Close' },
          { key: 'Enter', label: 'Select' },
          { key: '/', label: 'Search' },
        ]}
      />
    </Panel>
  )
}
