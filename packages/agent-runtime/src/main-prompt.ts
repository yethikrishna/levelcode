import { trackEvent } from '@levelcode/common/analytics'
import { AnalyticsEvent } from '@levelcode/common/constants/analytics-events'
import { userMessage } from '@levelcode/common/util/messages'
import { AgentTemplateTypes } from '@levelcode/common/types/session-state'

import { drainInbox } from './inbox-poller'
import { loopAgentSteps } from './run-agent-step'
import { findTeamContext } from './team-context'
import {
  assembleLocalAgentTemplates,
  getAgentTemplate,
} from './templates/agent-registry'
import { withSystemTags } from './util/messages'

import type { AgentTemplate } from './templates/types'
import type { ClientAction } from '@levelcode/common/actions'
import type { CostMode } from '@levelcode/common/old-constants'
import type {
  RequestToolCallFn,
  SendActionFn,
} from '@levelcode/common/types/contracts/client'
import type { Logger } from '@levelcode/common/types/contracts/logger'
import type { ParamsExcluding } from '@levelcode/common/types/function-params'
import type { PrintModeEvent } from '@levelcode/common/types/print-mode'
import type {
  SessionState,
  AgentTemplateType,
  AgentOutput,
} from '@levelcode/common/types/session-state'

export async function mainPrompt(
  params: {
    action: ClientAction<'prompt'>

    onResponseChunk: (chunk: string | PrintModeEvent) => void
    localAgentTemplates: Record<string, AgentTemplate>

    requestToolCall: RequestToolCallFn
    logger: Logger
  } & ParamsExcluding<
    typeof loopAgentSteps,
    | 'userInputId'
    | 'spawnParams'
    | 'agentState'
    | 'prompt'
    | 'content'
    | 'agentType'
    | 'fingerprintId'
    | 'fileContext'
    | 'ancestorRunIds'
  > &
    ParamsExcluding<typeof getAgentTemplate, 'agentId'>,
): Promise<{
  sessionState: SessionState
  output: AgentOutput
}> {
  const { action, localAgentTemplates, logger } = params

  const {
    prompt,
    content,
    sessionState: sessionState,
    fingerprintId,
    costMode,
    promptId,
    agentId,
    promptParams,
  } = action
  const { fileContext, mainAgentState } = sessionState

  // Track user input analytics event
  // userId comes from params (passed through from loopAgentSteps)
  const userId = (params as { userId?: string }).userId
  if (typeof userId === 'string' && userId.trim() !== '') {
    trackEvent({
      event: AnalyticsEvent.USER_INPUT,
      userId,
      properties: {
        promptId,
        agentId,
        costMode,
        hasPrompt: !!prompt,
        hasContent: !!content,
        hasPromptParams: !!promptParams && Object.keys(promptParams).length > 0,
        promptParamsCount: promptParams ? Object.keys(promptParams).length : 0,
        fingerprintId,
        promptLength: prompt?.length ?? 0,
        contentLength: content?.length ?? 0,
        messageHistoryLength: mainAgentState.messageHistory.length,
      },
      logger,
    })
  }

  const availableAgents = Object.keys(localAgentTemplates)

  // Determine agent type - prioritize CLI agent selection, then cost mode
  let agentType: AgentTemplateType

  if (agentId) {
    const agentTemplate = await getAgentTemplate({ ...params, agentId })
    if (!agentTemplate) {
      throw new Error(
        `Invalid agent ID: "${agentId}". Available agents: ${availableAgents.join(', ')}`,
      )
    }

    agentType = agentId
  } else {
    agentType = (
      {
        ask: AgentTemplateTypes.ask,
        free: AgentTemplateTypes.base_free,
        normal: AgentTemplateTypes.base,
        max: AgentTemplateTypes.base_max,
        experimental: 'base2',
      } satisfies Record<CostMode, AgentTemplateType>
    )[costMode ?? 'normal'] ?? 'base2'
  }

  mainAgentState.agentType = agentType

  let mainAgentTemplate = await getAgentTemplate({
    ...params,
    agentId: agentType,
  })
  if (!mainAgentTemplate) {
    throw new Error(`Agent template not found for type: ${agentType}`)
  }

  const { agentState, output } = await loopAgentSteps({
    ...params,
    userInputId: promptId,
    spawnParams: promptParams,
    agentState: mainAgentState,
    ancestorRunIds: [],
    prompt,
    content,
    agentType,
    fingerprintId,
    fileContext,
    costMode,
  })

  logger.debug({ output }, 'Main prompt finished')

  return {
    sessionState: {
      fileContext,
      mainAgentState: agentState,
    },
    output: output ?? {
      type: 'error' as const,
      message: 'No output from agent',
    },
  }
}

export async function callMainPrompt(
  params: {
    action: ClientAction<'prompt'>
    promptId: string
    sendAction: SendActionFn
    logger: Logger
    signal: AbortSignal
  } & ParamsExcluding<
    typeof mainPrompt,
    'localAgentTemplates' | 'onResponseChunk'
  >,
) {
  const { action, promptId, sendAction, logger } = params
  const { fileContext } = action.sessionState

  // Enforce server-side state authority: reset creditsUsed to 0
  // The server controls cost tracking, clients cannot manipulate this value
  action.sessionState.mainAgentState.creditsUsed = 0
  action.sessionState.mainAgentState.directCreditsUsed = 0

  // Add any extra tool results (e.g. from user-executed terminal commands) to message history
  // This allows the AI to see context from commands run between prompts
  if (action.toolResults && action.toolResults.length > 0) {
    action.sessionState.mainAgentState.messageHistory.push(
      ...action.toolResults,
    )
  }

  // Deliver any pending teammate messages before processing the new prompt
  const teamContext = findTeamContext(promptId)
  if (teamContext) {
    const inboxResult = drainInbox({
      teamName: teamContext.teamName,
      agentName: teamContext.agentName,
      logger,
    })
    if (inboxResult.formattedContent) {
      action.sessionState.mainAgentState.messageHistory.push(
        userMessage(withSystemTags(inboxResult.formattedContent)),
      )
      logger.debug(
        {
          teamName: teamContext.teamName,
          agentName: teamContext.agentName,
          messageCount: inboxResult.messages.length,
        },
        'Delivered teammate messages at prompt start',
      )
    }
  }

  // Assemble local agent templates from fileContext
  const { agentTemplates: localAgentTemplates, validationErrors } =
    assembleLocalAgentTemplates({ fileContext, logger })

  if (validationErrors.length > 0) {
    sendAction({
      action: {
        type: 'prompt-error',
        message: `Invalid agent config: ${validationErrors.map((err) => err.message).join('\n')}`,
        userInputId: promptId,
      },
    })
  }

  sendAction({
    action: {
      type: 'response-chunk',
      userInputId: promptId,
      chunk: {
        type: 'start',
        agentId: action.sessionState.mainAgentState.agentType ?? undefined,
        messageHistoryLength:
          action.sessionState.mainAgentState.messageHistory.length,
      },
    },
  })

  const result = await mainPrompt({
    ...params,
    localAgentTemplates,
    onResponseChunk: (chunk) => {
      if (!params.signal.aborted) {
        sendAction({
          action: {
            type: 'response-chunk',
            userInputId: promptId,
            chunk,
          },
        })
      }
    },
  })

  const { sessionState, output } = result

  sendAction({
    action: {
      type: 'response-chunk',
      userInputId: promptId,
      chunk: {
        type: 'finish',
        agentId: sessionState.mainAgentState.agentType ?? undefined,
        totalCost: sessionState.mainAgentState.creditsUsed,
      },
    },
  })

  // Send prompt data back
  sendAction({
    action: {
      type: 'prompt-response',
      promptId,
      sessionState,
      toolCalls: [],
      toolResults: [],
      output,
    },
  })

  return result
}
