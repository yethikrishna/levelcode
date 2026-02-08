import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useEffect, useState } from 'react'

import { useTheme } from '../hooks/use-theme'
import { useProviderStore } from '../state/provider-store'
import {
  getProvidersByCategory,
  PROVIDER_CATEGORY_LABELS,
} from '@levelcode/common/providers/provider-registry'
import { testProvider } from '@levelcode/common/providers/provider-test'
import {
  Panel,
  ListNavigator,
  StatusBadge,
  KeyHint,
  BreadcrumbNav,
  TextInput,
  Spinner,
  Divider,
} from './primitives'

import type { KeyEvent } from '@opentui/core'
import type { ListNavigatorItem, BreadcrumbStep } from './primitives'
import type {
  ProviderDefinition,
  ProviderCategory,
  ProviderTestResult,
} from '@levelcode/common/providers/provider-types'

type WizardStep = 'category' | 'provider' | 'apikey' | 'test' | 'done'

/** Breadcrumb steps shown at the top of every wizard panel */
const WIZARD_STEPS: BreadcrumbStep[] = [
  { key: 'category', label: 'Category' },
  { key: 'provider', label: 'Provider' },
  { key: 'apikey', label: 'API Key' },
  { key: 'test', label: 'Test' },
  { key: 'done', label: 'Done' },
]

/** Step titles with numbering for the Panel header */
const STEP_TITLES: Record<WizardStep, string> = {
  category: 'Step 1/5 \u2014 Select Category',
  provider: 'Step 2/5 \u2014 Select Provider',
  apikey: 'Step 3/5 \u2014 Configure',
  test: 'Step 4/5 \u2014 Test Connection',
  done: 'Step 5/5 \u2014 Complete',
}

/** Icons for each provider category */
const CATEGORY_ICONS: Record<string, string> = {
  'major-paid': '$',
  aggregators: '\u2295',
  specialized: '\u25C6',
  chinese: '\u2605',
  enterprise: '\u2302',
  'free-local': '\u2302',
  'gpu-cloud': '\u2601',
  'coding-tools': '\u276F',
  custom: '\u2699',
}

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
  const [isTesting, setIsTesting] = useState(false)

  const categoryProviders = getProvidersByCategory()[selectedCategory] ?? []

  // ---------------------------------------------------------------------------
  // Back navigation
  // ---------------------------------------------------------------------------
  const goBack = useCallback(() => {
    if (step === 'provider') {
      setStep('category')
    } else if (step === 'apikey') {
      setStep('provider')
    } else if (step === 'test') {
      setStep('apikey')
      setTestResult(null)
      setIsTesting(false)
    }
  }, [step])

  // ---------------------------------------------------------------------------
  // Auto-test when entering test step
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (step !== 'test' || !selectedProvider || isTesting || testResult) return

    setIsTesting(true)
    testProvider(selectedProvider.id, apiKey || undefined)
      .then((result) => {
        setTestResult(result)
        setIsTesting(false)
      })
      .catch(() => {
        setTestResult({
          success: false,
          latencyMs: 0,
          error: 'Test failed',
          providerName: selectedProvider.name,
        })
        setIsTesting(false)
      })
  }, [step, selectedProvider, apiKey, isTesting, testResult])

  // ---------------------------------------------------------------------------
  // Save provider configuration
  // ---------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!selectedProvider) return
    const models = testResult?.models ?? []
    await useProviderStore.getState().addProvider(selectedProvider.id, {
      enabled: true,
      apiKey: apiKey || undefined,
      models,
      customModelIds: [],
    })
    // Auto-set first model as active if no active model is set
    const { activeModel, activeProvider: currentActive } = useProviderStore.getState().config
    if (!activeModel && !currentActive && models.length > 0) {
      await useProviderStore.getState().setActiveModel(selectedProvider.id, models[0]!)
    }
    setStep('done')
  }, [selectedProvider, apiKey, testResult])

  // ---------------------------------------------------------------------------
  // List items
  // ---------------------------------------------------------------------------
  const categoryItems: ListNavigatorItem[] = CATEGORIES.map((cat) => ({
    key: cat,
    label: PROVIDER_CATEGORY_LABELS[cat],
    icon: CATEGORY_ICONS[cat] ?? '\u25CB',
  }))

  const providerItems: ListNavigatorItem[] = categoryProviders.map((p) => ({
    key: p.id,
    label: p.name,
    secondary: p.authType === 'none' ? 'No auth required' : undefined,
  }))

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------
  const handleCategorySelect = useCallback(
    (item: ListNavigatorItem) => {
      setSelectedCategory(item.key as ProviderCategory)
      setStep('provider')
    },
    [],
  )

  const handleProviderSelect = useCallback(
    (item: ListNavigatorItem) => {
      const provider = categoryProviders.find((p) => p.id === item.key)
      if (provider) {
        setSelectedProvider(provider)
        setStep(provider.authType === 'none' ? 'test' : 'apikey')
      }
    },
    [categoryProviders],
  )

  // ---------------------------------------------------------------------------
  // API key input callbacks (used by TextInput primitive)
  // ---------------------------------------------------------------------------
  const handleApiKeySubmit = useCallback(() => {
    setStep('test')
  }, [])

  const handleApiKeyCancel = useCallback(() => {
    goBack()
  }, [goBack])

  // ---------------------------------------------------------------------------
  // Keyboard handler for test, done, and back-navigation via Left arrow
  // Note: apikey step keyboard is handled entirely by TextInput.
  //       category/provider keyboard is handled by ListNavigator.
  // ---------------------------------------------------------------------------
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        // Global escape to close the wizard (unless in apikey step -- TextInput handles that)
        if (key.name === 'escape' && step !== 'apikey') {
          onClose()
          return
        }

        // Left arrow for back navigation (not during apikey -- TextInput is active)
        if (key.name === 'left' && step !== 'apikey' && step !== 'done') {
          goBack()
          return
        }

        // Test step: Enter saves, Backspace goes back
        if (step === 'test') {
          if (testResult && (key.name === 'return' || key.name === 'enter')) {
            handleSave()
            return
          }
          if (key.name === 'backspace' || key.name === 'delete') {
            goBack()
            return
          }
          return
        }

        // Done step: Enter closes
        if (step === 'done') {
          if (key.name === 'return' || key.name === 'enter') {
            onClose()
          }
          return
        }
      },
      [step, testResult, onClose, handleSave, goBack],
    ),
  )

  // ---------------------------------------------------------------------------
  // Dynamic step title (appends provider name where relevant)
  // ---------------------------------------------------------------------------
  const getPanelTitle = (): string => {
    if (step === 'apikey' && selectedProvider) {
      return `Step 3/5 \u2014 Configure ${selectedProvider.name}`
    }
    if (step === 'test' && selectedProvider) {
      return `Step 4/5 \u2014 Test ${selectedProvider.name}`
    }
    return STEP_TITLES[step]
  }

  // ---------------------------------------------------------------------------
  // Key hints per step
  // ---------------------------------------------------------------------------
  const getStepHints = () => {
    switch (step) {
      case 'category':
        return [
          { key: 'Up/Down', label: 'Navigate' },
          { key: 'Enter', label: 'Select' },
          { key: 'Esc', label: 'Cancel' },
        ]
      case 'provider':
        return [
          { key: 'Up/Down', label: 'Navigate' },
          { key: 'Enter', label: 'Select' },
          { key: 'Backspace', label: 'Back' },
          { key: 'Esc', label: 'Cancel' },
        ]
      case 'apikey':
        return [
          { key: 'Enter', label: 'Test' },
          { key: 'Esc', label: 'Back' },
        ]
      case 'test':
        if (isTesting) {
          return [
            { key: 'Backspace', label: 'Back' },
          ]
        }
        return testResult?.success
          ? [
              { key: 'Enter', label: 'Save' },
              { key: 'Backspace', label: 'Back' },
            ]
          : [
              { key: 'Backspace', label: 'Back' },
              { key: 'Esc', label: 'Cancel' },
            ]
      case 'done':
        return [{ key: 'Enter', label: 'Close' }]
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Panel title={getPanelTitle()} borderColor={theme.primary}>
      {/* Breadcrumb trail at the top of every step */}
      <BreadcrumbNav steps={WIZARD_STEPS} currentStep={step} />
      <Divider />

      {/* ── Step 1: Category Selection ─────────────────────────────── */}
      {step === 'category' && (
        <ListNavigator
          items={categoryItems}
          onSelect={handleCategorySelect}
          onCancel={onClose}
          maxHeight={10}
        />
      )}

      {/* ── Step 2: Provider Selection ─────────────────────────────── */}
      {step === 'provider' && (
        <ListNavigator
          items={providerItems}
          onSelect={handleProviderSelect}
          onCancel={goBack}
          searchable
          maxHeight={10}
        />
      )}

      {/* ── Step 3: API Key Entry ──────────────────────────────────── */}
      {step === 'apikey' && (
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <TextInput
            value={apiKey}
            onChange={setApiKey}
            onSubmit={handleApiKeySubmit}
            onCancel={handleApiKeyCancel}
            label="API Key"
            mask={true}
            placeholder="Paste your API key here..."
          />
          {selectedProvider?.envVars && selectedProvider.envVars.length > 0 && (
            <box style={{ paddingTop: 1 }}>
              <text style={{ fg: theme.info }}>
                {'Tip: Set '}{selectedProvider.envVars.join(' or ')}{' environment variable instead'}
              </text>
            </box>
          )}
          {selectedProvider?.authType === 'oauth' && (
            <box style={{ flexDirection: 'column', paddingTop: 1 }}>
              <text style={{ fg: theme.muted }}>
                {'This provider also supports OAuth. Use /connect after setup.'}
              </text>
            </box>
          )}
        </box>
      )}

      {/* ── Step 4: Connection Test ────────────────────────────────── */}
      {step === 'test' && (
        <box style={{ flexDirection: 'column', gap: 0 }}>
          {isTesting && <Spinner text="Testing connection..." />}
          {testResult && testResult.success && (
            <box style={{ flexDirection: 'column', gap: 0 }}>
              <StatusBadge
                variant="success"
                label={`Connected! ${Math.round(testResult.latencyMs)}ms`}
              />
              {testResult.models && (
                <text style={{ fg: theme.muted }}>
                  {testResult.models.length}{' models available'}
                </text>
              )}
            </box>
          )}
          {testResult && !testResult.success && (
            <box style={{ flexDirection: 'column', gap: 0 }}>
              <StatusBadge
                variant="error"
                label={`Failed: ${testResult.error ?? 'Unknown error'}`}
              />
              <box style={{ paddingTop: 1 }}>
                <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
                  {'Press \u2039Backspace\u203A to go back and update your API key.'}
                </text>
              </box>
            </box>
          )}
        </box>
      )}

      {/* ── Step 5: Summary / Done ─────────────────────────────────── */}
      {step === 'done' && (
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <StatusBadge
            variant="success"
            label={`${selectedProvider?.name ?? 'Provider'} added successfully`}
          />
          <box style={{ flexDirection: 'column', paddingTop: 1 }}>
            <text style={{ fg: theme.foreground }}>
              {'Provider: '}{selectedProvider?.name ?? ''}
            </text>
            <text style={{ fg: theme.foreground }}>
              {'Category: '}{PROVIDER_CATEGORY_LABELS[selectedCategory]}
            </text>
            {testResult?.models && (
              <text style={{ fg: theme.foreground }}>
                {'Models:   '}{testResult.models.length}{' available'}
              </text>
            )}
            {testResult?.latencyMs !== undefined && testResult.latencyMs > 0 && (
              <text style={{ fg: theme.foreground }}>
                {'Latency:  '}{Math.round(testResult.latencyMs)}{'ms'}
              </text>
            )}
          </box>
          <box style={{ paddingTop: 1 }}>
            <text style={{ fg: theme.muted }}>
              {'Use /models to browse and select a model.'}
            </text>
          </box>
        </box>
      )}

      {/* Key hints always at the bottom */}
      <KeyHint hints={getStepHints()} />
    </Panel>
  )
}
