import { useKeyboard } from '@opentui/react'
import React, { useCallback, useEffect, useState } from 'react'

import { useTheme } from '../hooks/use-theme'
import { useProviderStore } from '../state/provider-store'
import { BORDER_CHARS } from '../utils/ui-constants'
import {
  getProvidersByCategory,
  PROVIDER_CATEGORY_LABELS,
  PROVIDER_DEFINITIONS,
} from '@levelcode/common/providers/provider-registry'
import { testProvider } from '@levelcode/common/providers/provider-test'

import type { KeyEvent } from '@opentui/core'
import type {
  ProviderDefinition,
  ProviderCategory,
  ProviderTestResult,
} from '@levelcode/common/providers/provider-types'

type WizardStep = 'category' | 'provider' | 'config' | 'test' | 'done'

interface ProviderWizardProps {
  onClose: () => void
}

const CATEGORIES = Object.keys(PROVIDER_CATEGORY_LABELS) as ProviderCategory[]

export const ProviderWizard: React.FC<ProviderWizardProps> = ({ onClose }) => {
  const theme = useTheme()

  const [step, setStep] = useState<WizardStep>('category')
  const [selectedCategory, setSelectedCategory] = useState<ProviderCategory | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<ProviderDefinition | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null)
  const [customModelIds, setCustomModelIds] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isTesting, setIsTesting] = useState(false)
  const [configField, setConfigField] = useState<'apiKey' | 'baseUrl'>('apiKey')

  // Get providers for the selected category
  const categoryProviders = selectedCategory
    ? getProvidersByCategory()[selectedCategory] ?? []
    : []

  // Run test automatically when entering the test step
  useEffect(() => {
    if (step !== 'test' || !selectedProvider) return
    if (isTesting || testResult) return

    let cancelled = false
    setIsTesting(true)

    testProvider(
      selectedProvider.id,
      apiKey || undefined,
      baseUrl || undefined,
    ).then((result) => {
      if (!cancelled) {
        setTestResult(result)
        setIsTesting(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [step, selectedProvider, apiKey, baseUrl, isTesting, testResult])

  const handleSaveProvider = useCallback(async () => {
    if (!selectedProvider) return

    await useProviderStore.getState().addProvider(selectedProvider.id, {
      enabled: true,
      apiKey: apiKey || undefined,
      baseUrl: baseUrl || undefined,
      models: testResult?.models ?? [],
      customModelIds,
    })
  }, [selectedProvider, apiKey, baseUrl, testResult, customModelIds])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          onClose()
          return
        }

        // ── Category step ──────────────────────────────────────────
        if (step === 'category') {
          if (key.name === 'up') {
            setSelectedIndex((prev) => Math.max(0, prev - 1))
            return
          }
          if (key.name === 'down') {
            setSelectedIndex((prev) => Math.min(CATEGORIES.length - 1, prev + 1))
            return
          }
          if (key.name === 'return' || key.name === 'enter') {
            const cat = CATEGORIES[selectedIndex]
            if (cat) {
              setSelectedCategory(cat)
              setSelectedIndex(0)
              setStep('provider')
            }
            return
          }
        }

        // ── Provider step ──────────────────────────────────────────
        if (step === 'provider') {
          if (key.name === 'up') {
            setSelectedIndex((prev) => Math.max(0, prev - 1))
            return
          }
          if (key.name === 'down') {
            setSelectedIndex((prev) =>
              Math.min(categoryProviders.length - 1, prev + 1),
            )
            return
          }
          if (key.name === 'return' || key.name === 'enter') {
            const provider = categoryProviders[selectedIndex]
            if (provider) {
              setSelectedProvider(provider)
              setBaseUrl(provider.baseUrl)
              setStep('config')
              setConfigField('apiKey')
            }
            return
          }
        }

        // ── Config step ────────────────────────────────────────────
        if (step === 'config') {
          if (key.name === 'tab') {
            setConfigField((prev) => (prev === 'apiKey' ? 'baseUrl' : 'apiKey'))
            return
          }
          if (key.name === 'return' || key.name === 'enter') {
            setStep('test')
            return
          }
          if (key.name === 'backspace' || key.name === 'delete') {
            if (configField === 'apiKey') {
              setApiKey((prev) => prev.slice(0, -1))
            } else {
              setBaseUrl((prev) => prev.slice(0, -1))
            }
            return
          }
          // Printable character input
          if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
            if (configField === 'apiKey') {
              setApiKey((prev) => prev + key.sequence)
            } else {
              setBaseUrl((prev) => prev + key.sequence)
            }
            return
          }
        }

        // ── Test step ──────────────────────────────────────────────
        if (step === 'test') {
          if ((key.name === 'return' || key.name === 'enter') && testResult) {
            handleSaveProvider().then(() => {
              setStep('done')
            })
            return
          }
        }

        // ── Done step ──────────────────────────────────────────────
        if (step === 'done') {
          if (key.name === 'return' || key.name === 'enter') {
            onClose()
            return
          }
        }
      },
      [
        step,
        selectedIndex,
        categoryProviders,
        configField,
        testResult,
        onClose,
        handleSaveProvider,
      ],
    ),
  )

  // ── Render: Category step ──────────────────────────────────────────
  if (step === 'category') {
    return (
      <box
        title=" Add Provider - Select Category "
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
        {CATEGORIES.map((cat, index) => {
          const isSelected = index === selectedIndex
          return (
            <text
              key={cat}
              style={{
                fg: isSelected ? theme.primary : theme.foreground,
                bg: isSelected ? theme.surface : undefined,
              }}
            >
              {isSelected ? '> ' : '  '}
              {PROVIDER_CATEGORY_LABELS[cat]}
            </text>
          )
        })}
        <text style={{ fg: theme.muted }}>
          {'\u2191\u2193 navigate \u00B7 Enter select \u00B7 Esc cancel'}
        </text>
      </box>
    )
  }

  // ── Render: Provider step ──────────────────────────────────────────
  if (step === 'provider') {
    return (
      <box
        title={` Add Provider - ${PROVIDER_CATEGORY_LABELS[selectedCategory!]} `}
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
        {categoryProviders.map((provider, index) => {
          const isSelected = index === selectedIndex
          return (
            <box key={provider.id} style={{ flexDirection: 'row', height: 1 }}>
              <text
                style={{
                  fg: isSelected ? theme.primary : theme.foreground,
                  bg: isSelected ? theme.surface : undefined,
                }}
              >
                {isSelected ? '> ' : '  '}
                {provider.name}
              </text>
              <text style={{ fg: theme.muted }}>
                {'  '}{provider.baseUrl}
              </text>
            </box>
          )
        })}
        <text style={{ fg: theme.muted }}>
          {'\u2191\u2193 navigate \u00B7 Enter select \u00B7 Esc cancel'}
        </text>
      </box>
    )
  }

  // ── Render: Config step ────────────────────────────────────────────
  if (step === 'config') {
    const maskedKey = apiKey.length > 0
      ? '*'.repeat(Math.max(0, apiKey.length - 4)) + apiKey.slice(-4)
      : ''

    return (
      <box
        title={` Configure ${selectedProvider?.name ?? ''} `}
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
        <box style={{ flexDirection: 'row', height: 1 }}>
          <text
            style={{
              fg: configField === 'apiKey' ? theme.primary : theme.foreground,
            }}
          >
            {configField === 'apiKey' ? '> ' : '  '}
            API Key:{' '}
          </text>
          <text style={{ fg: theme.muted }}>
            {maskedKey || '(type to enter)'}
          </text>
        </box>
        <box style={{ flexDirection: 'row', height: 1 }}>
          <text
            style={{
              fg: configField === 'baseUrl' ? theme.primary : theme.foreground,
            }}
          >
            {configField === 'baseUrl' ? '> ' : '  '}
            Base URL:{' '}
          </text>
          <text style={{ fg: theme.muted }}>
            {baseUrl || '(empty)'}
          </text>
        </box>
        {selectedProvider?.envVars && selectedProvider.envVars.length > 0 && (
          <text style={{ fg: theme.info }}>
            {'  '}Env var: {selectedProvider.envVars.join(', ')}
          </text>
        )}
        <text style={{ fg: theme.muted }}>
          {'Tab switch field \u00B7 Enter test connection \u00B7 Esc cancel'}
        </text>
      </box>
    )
  }

  // ── Render: Test step ──────────────────────────────────────────────
  if (step === 'test') {
    return (
      <box
        title={` Testing ${selectedProvider?.name ?? ''} `}
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
        {isTesting && (
          <text style={{ fg: theme.warning }}>
            {'  '}Testing connection...
          </text>
        )}
        {testResult && testResult.success && (
          <box style={{ flexDirection: 'column' }}>
            <text style={{ fg: theme.success }}>
              {'  '}Connection successful!
            </text>
            <text style={{ fg: theme.muted }}>
              {'  '}Latency: {Math.round(testResult.latencyMs)}ms
            </text>
            {testResult.models && testResult.models.length > 0 && (
              <text style={{ fg: theme.muted }}>
                {'  '}Models found: {testResult.models.length}
              </text>
            )}
          </box>
        )}
        {testResult && !testResult.success && (
          <box style={{ flexDirection: 'column' }}>
            <text style={{ fg: theme.error }}>
              {'  '}Connection failed
            </text>
            <text style={{ fg: theme.muted }}>
              {'  '}{testResult.error ?? 'Unknown error'}
            </text>
          </box>
        )}
        {testResult && (
          <text style={{ fg: theme.muted }}>
            {'Enter save provider \u00B7 Esc cancel'}
          </text>
        )}
      </box>
    )
  }

  // ── Render: Done step ──────────────────────────────────────────────
  return (
    <box
      title=" Provider Added "
      titleAlignment="center"
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.success,
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
      }}
    >
      <text style={{ fg: theme.success }}>
        {'  '}Provider added!
      </text>
      <text style={{ fg: theme.foreground }}>
        {'  '}{selectedProvider?.name ?? 'Unknown'} is now configured.
      </text>
      <text style={{ fg: theme.muted }}>
        {'Enter close \u00B7 Esc close'}
      </text>
    </box>
  )
}
