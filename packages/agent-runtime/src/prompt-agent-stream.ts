import { globalStopSequence } from './constants'

import type { AgentTemplate } from './templates/types'
import type { TrackEventFn } from '@levelcode/common/types/contracts/analytics'
import type { SendActionFn } from '@levelcode/common/types/contracts/client'
import type { PromptAiSdkStreamFn } from '@levelcode/common/types/contracts/llm'
import type { Logger } from '@levelcode/common/types/contracts/logger'
import type { ParamsOf } from '@levelcode/common/types/function-params'
import type { Message } from '@levelcode/common/types/messages/levelcode-message'
import type { OpenRouterProviderOptions } from '@levelcode/internal/openrouter-ai-sdk'
import type { ToolSet } from 'ai'

export const getAgentStreamFromTemplate = (params: {
  agentId?: string
  apiKey: string
  clientSessionId: string
  costMode?: string
  fingerprintId: string
  includeCacheControl?: boolean
  localAgentTemplates: Record<string, AgentTemplate>
  logger: Logger
  messages: Message[]
  runId: string
  signal: AbortSignal
  template: AgentTemplate
  tools: ToolSet
  userId: string | undefined
  userInputId: string

  onCostCalculated?: (credits: number) => Promise<void>
  promptAiSdkStream: PromptAiSdkStreamFn
  sendAction: SendActionFn
  trackEvent: TrackEventFn
}): ReturnType<PromptAiSdkStreamFn> => {
  const {
    agentId,
    apiKey,
    clientSessionId,
    costMode,
    fingerprintId,
    includeCacheControl,
    localAgentTemplates,
    logger,
    messages,
    runId,
    template,
    tools,
    userId,
    userInputId,

    sendAction,
    onCostCalculated,
    promptAiSdkStream,
    trackEvent,
  } = params

  if (!template) {
    throw new Error('Agent template is null/undefined')
  }

  const { model } = template

  const aiSdkStreamParams: ParamsOf<PromptAiSdkStreamFn> = {
    agentId,
    apiKey,
    clientSessionId,
    costMode,
    fingerprintId,
    includeCacheControl,
    logger,
    localAgentTemplates,
    maxOutputTokens: 32_000,
    maxRetries: 3,
    messages,
    model,
    runId,
    signal: params.signal,
    spawnableAgents: template.spawnableAgents,
    stopSequences: [globalStopSequence],
    tools,
    userId,
    userInputId,

    onCostCalculated,
    sendAction,
    trackEvent,
  }

  if (!aiSdkStreamParams.providerOptions) {
    aiSdkStreamParams.providerOptions = {}
  }
  for (const provider of ['openrouter', 'levelcode'] as const) {
    if (!aiSdkStreamParams.providerOptions[provider]) {
      aiSdkStreamParams.providerOptions[provider] = {}
    }
    ;(
      aiSdkStreamParams.providerOptions[provider] as OpenRouterProviderOptions
    ).reasoning = template.reasoningOptions
  }

  // Pass agent's provider routing options to SDK
  aiSdkStreamParams.agentProviderOptions = template.providerOptions

  return promptAiSdkStream(aiSdkStreamParams)
}
