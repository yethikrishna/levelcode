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

type WizardStep = 'category' | 'provider' | 'baseurl' | 'apikey' | 'models' | 'test' | 'done'

/** Breadcrumb steps shown at the top of every wizard panel */
const WIZARD_STEPS: BreadcrumbStep[] = [
  { key: 'category', label: 'Category' },
  { key: 'provider', label: 'Provider' },
  { key: 'apikey', label: 'Configure' },
  { key: 'test', label: 'Test' },
  { key: 'done', label: 'Done' },
]

/** Step titles with numbering for the Panel header */
const STEP_TITLES: Record<WizardStep, string> = {
  category: 'Step 1/5 \u2014 Select Category',
  provider: 'Step 2/5 \u2014 Select Provider',
  baseurl: 'Step 3/5 \u2014 Base URL',
  apikey: 'Step 3/5 \u2014 Configure',
  models: 'Step 3/5 \u2014 Model IDs',
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

const CATEGORIES = Object.keys(PROVIDER_CATEGORY_LABELS) as ProviderCategory[]

const CUSTOM_PROVIDER_ID = 'custom-openai'

export const ProviderWizard: React.FC<ProviderWizardProps> = ({ onClose }) => {
  const theme = useTheme()

  const [step, setStep] = useState<WizardStep>('category')
  const [selectedCategory, setSelectedCategory] = useState<ProviderCategory>('major-paid')
  const [selectedProvider, setSelectedProvider] = useState<ProviderDefinition | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customDisplayName, setCustomDisplayName] = useState('')
  const [customModelIds, setCustomModelIds] = useState('')
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const isCustomProvider = selectedProvider?.id === CUSTOM_PROVIDER_ID

  const categoryProviders = getProvidersByCategory()[selectedCategory] ?? []

  // ---------------------------------------------------------------------------
  // Back navigation
  // ---------------------------------------------------------------------------
  const goBack = useCallback(() => {
    if (step === 'provider') {
      setStep('category')
    } else if (step === 'baseurl') {
      setStep('provider')
    } else if (step === 'apikey') {
      setStep(isCustomProvider ? 'baseurl' : 'provider')
    } else if (step === 'models') {
      setStep('apikey')
    } else if (step === 'test') {
      setStep(isCustomProvider ? 'models' : 'apikey')
      setTestResult(null)
      setIsTesting(false)
    }
  }, [step, isCustomProvider])

  // ---------------------------------------------------------------------------
  // Auto-test when entering test step
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (step !== 'test' || !selectedProvider || isTesting || testResult) return

    setIsTesting(true)
    const effectiveBaseUrl = selectedProvider.id === CUSTOM_PROVIDER_ID ? customBaseUrl : selectedProvider.baseUrl
    testProvider(selectedProvider.id, apiKey || undefined, effectiveBaseUrl || undefined)
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
  }, [step, selectedProvider, apiKey, customBaseUrl, isTesting, testResult])

  // ---------------------------------------------------------------------------
  // Save provider configuration
  // ---------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!selectedProvider) return
    const isCustom = selectedProvider.id === CUSTOM_PROVIDER_ID
    const models = testResult?.models ?? []
    const manualModels = customModelIds
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)

    let providerId = selectedProvider.id
    let displayName = selectedProvider.name
    if (isCustom) {
      // Multiple custom endpoints are supported: derive a unique, stable id
      // from the user-provided display name.
      const slug =
        customDisplayName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'endpoint'
      providerId = `custom-${slug}`
      displayName = customDisplayName.trim() || selectedProvider.name
    }

    const entryModels = models.length > 0 ? models : manualModels
    await useProviderStore.getState().addProvider(providerId, {
      enabled: true,
      apiKey: apiKey || undefined,
      baseUrl: isCustom ? customBaseUrl.trim() : undefined,
      displayName: isCustom && customDisplayName.trim() ? customDisplayName.trim() : undefined,
      models: entryModels,
      customModelIds: isCustom ? manualModels : [],
    })
    // Auto-set first model as active if no active model is set
    const { activeModel, activeProvider: currentActive } = useProviderStore.getState().config
    if (!activeModel && !currentActive && entryModels.length > 0) {
      await useProviderStore.getState().setActiveModel(providerId, entryModels[0]!)
    }
    setStep('done')
  }, [selectedProvider, apiKey, customBaseUrl, customDisplayName, customModelIds, testResult])

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
        setStep(provider.authType === 'none' ? 'test' : provider.id === CUSTOM_PROVIDER_ID ? 'baseurl' : 'apikey')
      }
    },
    [categoryProviders],
  )

  const handleBaseUrlSubmit = useCallback(() => {
    setStep('apikey')
  }, [])

  const handleModelsSubmit = useCallback(() => {
    setStep('test')
  }, [])

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
    if (step === 'baseurl' && selectedProvider) {
      return `Step 3/5 \u2014 Base URL`
    }
    if (step === 'models' && selectedProvider) {
      return `Step 3/5 \u2014 Model IDs`
    }
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
      case 'baseurl':
        return [
          { key: 'Enter', label: 'Next' },
          { key: 'Esc', label: 'Back' },
        ]
      case 'apikey':
        return [
          { key: 'Enter', label: isCustomProvider ? 'Next' : 'Test' },
          { key: 'Esc', label: 'Back' },
        ]
      case 'models':
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

      {/* ── Step 3a: Custom Base URL ───────────────────────────────── */}
      {step === 'baseurl' && (
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <TextInput
            value={customBaseUrl}
            onChange={setCustomBaseUrl}
            onSubmit={handleBaseUrlSubmit}
            onCancel={goBack}
            label="Base URL"
            placeholder="http://localhost:1234/v1"
          />
          <box style={{ paddingTop: 1 }}>
            <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
              {'Any OpenAI-compatible endpoint: LM Studio, llama.cpp, vLLM, LiteLLM, Ollama /v1...'}
            </text>
          </box>
          <TextInput
            value={customDisplayName}
            onChange={setCustomDisplayName}
            onSubmit={handleBaseUrlSubmit}
            onCancel={goBack}
            label="Display name (optional)"
            placeholder="My local server"
          />
        </box>
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
          {isCustomProvider && (
            <box style={{ paddingTop: 1 }}>
              <text style={{ fg: theme.info }}>
                {'Local servers without auth: leave this empty and press Enter.'}
              </text>
            </box>
          )}
        </box>
      )}

      {/* ── Step 3b: Custom Model IDs ──────────────────────────────── */}
      {step === 'models' && (
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <TextInput
            value={customModelIds}
            onChange={setCustomModelIds}
            onSubmit={handleModelsSubmit}
            onCancel={goBack}
            label="Model IDs (comma-separated)"
            placeholder="e.g. llama-3.3-70b-instruct, qwen2.5-coder-32b"
          />
          <box style={{ paddingTop: 1 }}>
            <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
              {'Used when the endpoint does not expose /models. Comma-separate each id.'}
            </text>
          </box>
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
            {selectedProvider?.id === CUSTOM_PROVIDER_ID && customBaseUrl && (
              <text style={{ fg: theme.foreground }}>
                {'Base URL: '}{customBaseUrl}
              </text>
            )}
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
