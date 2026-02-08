import { useKeyboard } from '@opentui/react'
import React, { useCallback, useEffect, useState } from 'react'

import { useTheme } from '../hooks/use-theme'
import { useProviderStore } from '../state/provider-store'
import { BORDER_CHARS } from '../utils/ui-constants'
import {
  getProvidersByCategory,
  PROVIDER_CATEGORY_LABELS,
} from '@levelcode/common/providers/provider-registry'
import { testProvider } from '@levelcode/common/providers/provider-test'

import type { KeyEvent } from '@opentui/core'
import type {
  ProviderDefinition,
  ProviderCategory,
  ProviderTestResult,
} from '@levelcode/common/providers/provider-types'

type WizardStep = 'category' | 'provider' | 'apikey' | 'test' | 'done'

interface ProviderWizardProps {
  onClose: () => void
}

const CATEGORIES = Object.keys(PROVIDER_CATEGORY_LABELS).filter(
  (c) => c !== 'custom',
) as ProviderCategory[]

export const ProviderWizard: React.FC<ProviderWizardProps> = ({ onClose }) => {
  const theme = useTheme()

  const [step, setStep] = useState<WizardStep>('category')
  const [selectedCategory, setSelectedCategory] = useState<ProviderCategory>('major-paid')
  const [selectedProvider, setSelectedProvider] = useState<ProviderDefinition | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isTesting, setIsTesting] = useState(false)

  const categoryProviders = getProvidersByCategory()[selectedCategory] ?? []

  // Auto-test when entering test step
  useEffect(() => {
    if (step !== 'test' || !selectedProvider || isTesting || testResult) return

    setIsTesting(true)
    testProvider(selectedProvider.id, apiKey || undefined)
      .then((result) => {
        setTestResult(result)
        setIsTesting(false)
      })
      .catch(() => {
        setTestResult({ success: false, latencyMs: 0, error: 'Test failed', providerName: selectedProvider.name })
        setIsTesting(false)
      })
  }, [step, selectedProvider, apiKey, isTesting, testResult])

  const handleSave = useCallback(async () => {
    if (!selectedProvider) return
    await useProviderStore.getState().addProvider(selectedProvider.id, {
      enabled: true,
      apiKey: apiKey || undefined,
      models: testResult?.models ?? [],
      customModelIds: [],
    })
    setStep('done')
  }, [selectedProvider, apiKey, testResult])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape') {
          onClose()
          return
        }

        if (step === 'category') {
          if (key.name === 'up') setSelectedIndex((p) => Math.max(0, p - 1))
          else if (key.name === 'down') setSelectedIndex((p) => Math.min(CATEGORIES.length - 1, p + 1))
          else if (key.name === 'return' || key.name === 'enter') {
            setSelectedCategory(CATEGORIES[selectedIndex]!)
            setSelectedIndex(0)
            setStep('provider')
          }
          return
        }

        if (step === 'provider') {
          if (key.name === 'up') setSelectedIndex((p) => Math.max(0, p - 1))
          else if (key.name === 'down') setSelectedIndex((p) => Math.min(categoryProviders.length - 1, p + 1))
          else if (key.name === 'return' || key.name === 'enter') {
            const provider = categoryProviders[selectedIndex]
            if (provider) {
              setSelectedProvider(provider)
              setStep(provider.authType === 'none' ? 'test' : 'apikey')
            }
          }
          return
        }

        if (step === 'apikey') {
          if (key.name === 'return' || key.name === 'enter') {
            setStep('test')
          } else if (key.name === 'backspace' || key.name === 'delete') {
            setApiKey((p) => p.slice(0, -1))
          } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
            setApiKey((p) => p + key.sequence)
          }
          return
        }

        if (step === 'test' && testResult) {
          if (key.name === 'return' || key.name === 'enter') {
            handleSave()
          }
          return
        }

        if (step === 'done') {
          if (key.name === 'return' || key.name === 'enter') {
            onClose()
          }
          return
        }
      },
      [step, selectedIndex, categoryProviders, testResult, onClose, handleSave],
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
      {step === 'category' && (
        <>
          <text style={{ fg: theme.primary }}>{'Add Provider - Select Category'}</text>
          {CATEGORIES.map((cat, i) => (
            <text
              key={cat}
              style={{ fg: i === selectedIndex ? theme.primary : theme.foreground }}
            >
              {i === selectedIndex ? '> ' : '  '}{PROVIDER_CATEGORY_LABELS[cat]}
            </text>
          ))}
        </>
      )}
      {step === 'provider' && (
        <>
          <text style={{ fg: theme.primary }}>
            {'Add Provider - '}{PROVIDER_CATEGORY_LABELS[selectedCategory]}
          </text>
          {categoryProviders.map((p, i) => (
            <text
              key={p.id}
              style={{ fg: i === selectedIndex ? theme.primary : theme.foreground }}
            >
              {i === selectedIndex ? '> ' : '  '}{p.name}
            </text>
          ))}
        </>
      )}
      {step === 'apikey' && (
        <>
          <text style={{ fg: theme.primary }}>
            {'Configure '}{selectedProvider?.name ?? ''}
          </text>
          <text style={{ fg: theme.foreground }}>
            {'API Key: '}{apiKey.length > 0
              ? '*'.repeat(Math.max(0, apiKey.length - 4)) + apiKey.slice(-4)
              : '(type your API key)'}
          </text>
          {selectedProvider?.envVars && selectedProvider.envVars.length > 0 && (
            <text style={{ fg: theme.info }}>
              {'Env var: '}{selectedProvider.envVars.join(', ')}
            </text>
          )}
          <text style={{ fg: theme.muted }}>{'Enter to test connection'}</text>
        </>
      )}
      {step === 'test' && (
        <>
          <text style={{ fg: theme.primary }}>
            {'Testing '}{selectedProvider?.name ?? ''}
          </text>
          {isTesting && <text style={{ fg: theme.warning }}>{'Testing connection...'}</text>}
          {testResult && testResult.success && (
            <text style={{ fg: theme.success }}>
              {'Connected! '}{Math.round(testResult.latencyMs)}{'ms'}
              {testResult.models ? ` (${testResult.models.length} models)` : ''}
            </text>
          )}
          {testResult && !testResult.success && (
            <text style={{ fg: theme.error }}>{'Failed: '}{testResult.error ?? 'Unknown error'}</text>
          )}
          {testResult && <text style={{ fg: theme.muted }}>{'Enter to save'}</text>}
        </>
      )}
      {step === 'done' && (
        <>
          <text style={{ fg: theme.success }}>{'Provider added!'}</text>
          <text style={{ fg: theme.foreground }}>{selectedProvider?.name ?? ''}{' is now configured.'}</text>
        </>
      )}
      <text style={{ fg: theme.muted }}>{'Esc cancel'}</text>
    </box>
  )
}
