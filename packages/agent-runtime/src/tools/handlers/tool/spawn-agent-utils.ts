import { MAX_AGENT_STEPS_DEFAULT } from '@levelcode/common/constants/agents'
import { toolNames } from '@levelcode/common/tools/constants'
import { parseAgentId } from '@levelcode/common/util/agent-id-parsing'
import { generateCompactId } from '@levelcode/common/util/string'
import {
  addTeamMember,
  loadTeamConfig,
  sendMessage,
} from '@levelcode/common/utils/team-fs'
import { TEAM_AGENTS } from '../../../../../../agents/team'
// Role hierarchy is no longer used for spawn restrictions -- all roles can spawn all others.
// The spawnableAgents array on each agent definition controls available agent types.

import { loopAgentSteps } from '../../../run-agent-step'
import { generateTeamPromptSection } from '../../../system-prompt/team-prompt'
import { getAgentTemplate } from '../../../templates/agent-registry'
import {
  filterUnfinishedToolCalls,
  withSystemTags,
} from '../../../util/messages'

import type { AgentTemplate } from '@levelcode/common/types/agent-template'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@levelcode/common/types/contracts/agent-runtime'
import type { Logger } from '@levelcode/common/types/contracts/logger'
import type {
  ParamsExcluding,
  OptionalFields,
} from '@levelcode/common/types/function-params'
import type { Message } from '@levelcode/common/types/messages/levelcode-message'
import type { PrintModeEvent } from '@levelcode/common/types/print-mode'
import type {
  AgentState,
  AgentTemplateType,
  Subgoal,
} from '@levelcode/common/types/session-state'
import type { TeamConfig, TeamMember, TeamRole } from '@levelcode/common/types/team-config'
import type { ProjectFileContext } from '@levelcode/common/util/file'
import type { ToolSet } from 'ai'

/**
 * Common context params needed for spawning subagents.
 * These are the params that don't change between different spawn calls
 * and are passed through from the parent agent runtime.
 */
export type SubagentContextParams = AgentRuntimeDeps &
  AgentRuntimeScopedDeps & {
    clientSessionId: string
    fileContext: ProjectFileContext
    localAgentTemplates: Record<string, AgentTemplate>
    repoId: string | undefined
    repoUrl: string | undefined
    signal: AbortSignal
    userId: string | undefined
  }

/**
 * Extracts the common context params needed for spawning subagents.
 * This avoids bugs from spreading all params with `...params` which can
 * accidentally pass through params that should be overridden.
 */
export function extractSubagentContextParams(
  params: SubagentContextParams,
): SubagentContextParams {
  return {
    // AgentRuntimeDeps - Environment
    clientEnv: params.clientEnv,
    ciEnv: params.ciEnv,
    // AgentRuntimeDeps - Database
    getUserInfoFromApiKey: params.getUserInfoFromApiKey,
    fetchAgentFromDatabase: params.fetchAgentFromDatabase,
    startAgentRun: params.startAgentRun,
    finishAgentRun: params.finishAgentRun,
    addAgentStep: params.addAgentStep,
    // AgentRuntimeDeps - Billing
    consumeCreditsWithFallback: params.consumeCreditsWithFallback,
    // AgentRuntimeDeps - LLM
    promptAiSdkStream: params.promptAiSdkStream,
    promptAiSdk: params.promptAiSdk,
    promptAiSdkStructured: params.promptAiSdkStructured,
    // AgentRuntimeDeps - Mutable State
    databaseAgentCache: params.databaseAgentCache,
    // AgentRuntimeDeps - Analytics
    trackEvent: params.trackEvent,
    // AgentRuntimeDeps - Other
    logger: params.logger,
    fetch: params.fetch,

    // AgentRuntimeScopedDeps - Client (WebSocket)
    handleStepsLogChunk: params.handleStepsLogChunk,
    requestToolCall: params.requestToolCall,
    requestMcpToolData: params.requestMcpToolData,
    requestFiles: params.requestFiles,
    requestOptionalFile: params.requestOptionalFile,
    sendAction: params.sendAction,
    sendSubagentChunk: params.sendSubagentChunk,
    apiKey: params.apiKey,

    // Core context params
    clientSessionId: params.clientSessionId,
    fileContext: params.fileContext,
    localAgentTemplates: params.localAgentTemplates,
    repoId: params.repoId,
    repoUrl: params.repoUrl,
    signal: params.signal,
    userId: params.userId,
  }
}

/**
 * Checks if a parent agent is allowed to spawn a child agent
 */
export function getMatchingSpawn(
  spawnableAgents: AgentTemplateType[],
  childFullAgentId: string,
) {
  const {
    publisherId: childPublisherId,
    agentId: childAgentId,
    version: childVersion,
  } = parseAgentId(childFullAgentId)

  if (!childAgentId) {
    return null
  }

  for (const spawnableAgent of spawnableAgents) {
    const {
      publisherId: spawnablePublisherId,
      agentId: spawnableAgentId,
      version: spawnableVersion,
    } = parseAgentId(spawnableAgent)

    if (!spawnableAgentId) {
      continue
    }

    if (
      spawnableAgentId === childAgentId &&
      spawnablePublisherId === childPublisherId &&
      spawnableVersion === childVersion
    ) {
      return spawnableAgent
    }
    if (!childVersion && childPublisherId) {
      if (
        spawnablePublisherId === childPublisherId &&
        spawnableAgentId === childAgentId
      ) {
        return spawnableAgent
      }
    }
    if (!childPublisherId && childVersion) {
      if (
        spawnableAgentId === childAgentId &&
        spawnableVersion === childVersion
      ) {
        return spawnableAgent
      }
    }

    if (!childVersion && !childPublisherId) {
      if (spawnableAgentId === childAgentId) {
        return spawnableAgent
      }
    }
  }
  return null
}

/**
 * Synchronously transforms spawn_agents input to use 'commander-lite' instead of 'commander'
 * when the parent agent doesn't have access to 'commander' but does have access to 'commander-lite'.
 * This should be called BEFORE the tool call is streamed to the UI.
 */
export function transformSpawnAgentsInput(
  input: Record<string, unknown>,
  spawnableAgents: AgentTemplateType[],
): Record<string, unknown> {
  const agents = input.agents
  if (!Array.isArray(agents)) {
    return input
  }

  let hasTransformation = false
  const transformedAgents = agents.map((agent) => {
    if (typeof agent !== 'object' || agent === null) {
      return agent
    }

    const agentEntry = agent as Record<string, unknown>
    const agentTypeStr = agentEntry.agent_type
    if (typeof agentTypeStr !== 'string') {
      return agent
    }

    // Check if this is 'commander'
    const { agentId } = parseAgentId(agentTypeStr)
    if (agentId !== 'commander') {
      return agent
    }

    // Check if 'commander' is available in spawnableAgents
    const commanderType = getMatchingSpawn(spawnableAgents, agentTypeStr)
    if (commanderType) {
      // Commander is available, no transformation needed
      return agent
    }

    // Check if 'commander-lite' is available as a fallback
    const commanderLiteType = getMatchingSpawn(spawnableAgents, 'commander-lite')
    if (!commanderLiteType) {
      // Neither available, let validation handle the error
      return agent
    }

    // Transform commander -> commander-lite
    hasTransformation = true
    return {
      ...agentEntry,
      agent_type: commanderLiteType,
    }
  })

  if (!hasTransformation) {
    return input
  }

  return {
    ...input,
    agents: transformedAgents,
  }
}

/**
 * Validates agent template and permissions
 */
export async function validateAndGetAgentTemplate(
  params: {
    agentTypeStr: string
    parentAgentTemplate: AgentTemplate
    localAgentTemplates: Record<string, AgentTemplate>
    logger: Logger
  } & ParamsExcluding<typeof getAgentTemplate, 'agentId'>,
): Promise<{ agentTemplate: AgentTemplate; agentType: string }> {
  const { agentTypeStr, parentAgentTemplate } = params
  const agentTemplate = await getAgentTemplate({
    ...params,
    agentId: agentTypeStr,
  })

  if (!agentTemplate) {
    if (toolNames.includes(agentTypeStr as any)) {
      throw new Error(
        `"${agentTypeStr}" is a tool, not an agent. Call it directly as a tool instead of wrapping it in spawn_agents.`,
      )
    }
    throw new Error(`Agent type ${agentTypeStr} not found.`)
  }
  const BASE_AGENTS = ['base', 'base-free', 'base-max', 'base-experimental']
  // Base agent can spawn any agent
  if (BASE_AGENTS.includes(parentAgentTemplate.id)) {
    return { agentTemplate, agentType: agentTypeStr }
  }

  const agentType = getMatchingSpawn(
    parentAgentTemplate.spawnableAgents,
    agentTypeStr,
  )
  if (!agentType) {
    throw new Error(
      `Agent type ${parentAgentTemplate.id} is not allowed to spawn child agent type ${agentTypeStr}.`,
    )
  }

  return { agentTemplate, agentType }
}

/**
 * Validates prompt and params against agent schema
 */
export function validateAgentInput(
  agentTemplate: AgentTemplate,
  agentType: string,
  prompt?: string,
  params?: any,
): void {
  const { inputSchema } = agentTemplate

  // Validate prompt requirement
  if (inputSchema.prompt) {
    const result = inputSchema.prompt.safeParse(prompt ?? '')
    if (!result.success) {
      throw new Error(
        `Invalid prompt for agent ${agentType}: ${JSON.stringify(result.error.issues, null, 2)}`,
      )
    }
  }

  // Validate params if schema exists
  if (inputSchema.params) {
    const result = inputSchema.params.safeParse(params ?? {})
    if (!result.success) {
      throw new Error(
        `Invalid params for agent ${agentType}: ${JSON.stringify(result.error.issues, null, 2)}`,
      )
    }
  }
}

/**
 * Creates a new agent state for spawned agents
 */
export function createAgentState(
  agentType: string,
  agentTemplate: AgentTemplate,
  parentAgentState: AgentState,
  agentContext: Record<string, Subgoal>,
): AgentState {
  const agentId = generateCompactId()

  // When including message history, filter out any tool calls that don't have
  // corresponding tool responses. This prevents the spawned agent from seeing
  // unfinished tool calls which throw errors in the Anthropic API.
  let messageHistory: Message[] = []

  if (agentTemplate.includeMessageHistory) {
    messageHistory = filterUnfinishedToolCalls(parentAgentState.messageHistory)
    messageHistory.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: withSystemTags(`Subagent ${agentType} has been spawned.`),
        },
      ],
      tags: ['SUBAGENT_SPAWN'],
    })
  }

  return {
    agentId,
    agentType,
    agentContext,
    ancestorRunIds: [
      ...parentAgentState.ancestorRunIds,
      parentAgentState.runId ?? 'NULL',
    ],
    subagents: [],
    childRunIds: [],
    messageHistory,
    stepsRemaining: MAX_AGENT_STEPS_DEFAULT,
    creditsUsed: 0,
    directCreditsUsed: 0,
    output: undefined,
    parentId: parentAgentState.agentId,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: parentAgentState.contextTokenCount,
  }
}

/**
 * Logs agent spawn information
 */
export function logAgentSpawn(params: {
  agentTemplate: AgentTemplate
  agentType: string
  agentId: string
  parentId: string | undefined
  prompt?: string
  spawnParams?: any
  inline?: boolean
  logger: Logger
}): void {
  const {
    agentTemplate,
    agentType,
    agentId,
    parentId,
    prompt,
    spawnParams,
    inline = false,
    logger,
  } = params
  logger.debug(
    {
      agentTemplate,
      prompt,
      params: spawnParams,
      agentId,
      parentId,
    },
    `Spawning agent${inline ? ' inline' : ''} — ${agentType} (${agentId})`,
  )
}

/**
 * Executes a subagent using loopAgentSteps
 */
export async function executeSubagent(
  options: OptionalFields<
    {
      agentTemplate: AgentTemplate
      parentAgentState: AgentState
      parentTools?: ToolSet
      onResponseChunk: (chunk: string | PrintModeEvent) => void
      isOnlyChild?: boolean
      ancestorRunIds: string[]
    } & ParamsExcluding<typeof loopAgentSteps, 'agentType' | 'ancestorRunIds'>,
    'isOnlyChild' | 'clearUserPromptMessagesAfterResponse'
  >,
) {
  const withDefaults = {
    isOnlyChild: false,
    clearUserPromptMessagesAfterResponse: true,
    ...options,
  }
  const {
    onResponseChunk,
    agentTemplate,
    parentAgentState,
    isOnlyChild,
    ancestorRunIds,
    prompt,
    spawnParams,
  } = withDefaults

  const startEvent = {
    type: 'subagent_start' as const,
    agentId: withDefaults.agentState.agentId,
    agentType: agentTemplate.id,
    displayName: agentTemplate.displayName,
    onlyChild: isOnlyChild,
    parentAgentId: parentAgentState.agentId,
    prompt,
    params: spawnParams,
  }
  onResponseChunk(startEvent)

  const result = await loopAgentSteps({
    ...withDefaults,
    // Don't propagate parent's image content to subagents.
    // If subagents need to see images, they get them through includeMessageHistory,
    // not by creating new image-containing messages for their prompts.
    content: undefined,
    ancestorRunIds: [...ancestorRunIds, parentAgentState.runId ?? ''],
    agentType: agentTemplate.id,
  })

  onResponseChunk({
    type: 'subagent_finish',
    agentId: result.agentState.agentId,
    agentType: agentTemplate.id,
    displayName: agentTemplate.displayName,
    onlyChild: isOnlyChild,
    parentAgentId: parentAgentState.agentId,
    prompt,
    params: spawnParams,
  })

  if (result.agentState.runId) {
    parentAgentState.childRunIds.push(result.agentState.runId)
  }

  return result
}

/**
 * Options for registering a spawned agent as a team member.
 */
export interface TeamSpawnOptions {
  teamName: string
  teamRole?: string
}

/**
 * Resolves a team_role to the corresponding agent template ID from agents/team/.
 * For example, 'coordinator' maps to the coordinator agent template,
 * 'manager' maps to the manager agent template, etc.
 *
 * Returns the agent template ID (which is the same as the role string for
 * roles that have a dedicated template), or null if no template exists for
 * the given role.
 */
export function resolveTeamRoleAgentType(
  teamRole: string,
): string | null {
  const role = teamRole as TeamRole
  const agentDef = TEAM_AGENTS[role]
  if (!agentDef) {
    return null
  }
  return agentDef.id
}

/**
 * Validates that the spawning agent has authority to spawn an agent
 * with the requested team role.
 *
 * All team members can spawn any role -- no restrictions.
 * The spawnableAgents list on each agent definition controls what
 * agent types are available.
 *
 * @param spawnerRole - The team role of the agent performing the spawn
 * @param targetRole - The team role being requested for the new agent
 */
export function validateSpawnAuthority(
  _spawnerRole: TeamRole,
  _targetRole: TeamRole,
): void {
  // All team members can spawn any role — no restrictions.
  // Any member can call for help from higher-ranked roles or delegate to lower-ranked ones.
  // The spawnableAgents list on each agent definition controls what agent types are available.
}

/**
 * Sends a notification to the team lead when a new agent joins the team.
 * This is a fire-and-forget operation; errors are logged but not thrown.
 */
export async function notifyTeamLead(
  teamName: string,
  teamConfig: TeamConfig,
  memberName: string,
  role: TeamRole,
  logger: Logger,
): Promise<void> {
  try {
    // Find the team lead member to get their inbox name
    const leadMember = teamConfig.members.find(
      (m) => m.agentId === teamConfig.leadAgentId,
    )
    const leadInboxName = leadMember?.name ?? teamConfig.leadAgentId

    await sendMessage(teamName, leadInboxName, {
      type: 'message',
      from: 'system',
      to: leadInboxName,
      text: `New team member joined: "${memberName}" with role "${role}".`,
      summary: `New ${role} agent joined`,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.debug(
      { teamName, error },
      `Failed to notify team lead about new member`,
    )
  }
}

/**
 * Registers a spawned agent as a member of an existing team.
 * Returns the team context string to prepend to the agent's prompt,
 * or null if the team does not exist.
 */
export async function registerAgentAsTeamMember(
  agentId: string,
  agentType: string,
  options: TeamSpawnOptions,
  logger: Logger,
): Promise<string | null> {
  const { teamName, teamRole } = options

  const teamConfig = loadTeamConfig(teamName)
  if (!teamConfig) {
    logger.debug(
      { teamName, agentId },
      `Team "${teamName}" not found; skipping team registration`,
    )
    return null
  }

  const role: TeamRole = (teamRole as TeamRole) || 'mid-level-engineer'
  const memberName = `${agentType}-${agentId}`

  const member: TeamMember = {
    agentId,
    name: memberName,
    role,
    agentType,
    model: '',
    joinedAt: Date.now(),
    status: 'active',
    cwd: process.cwd(),
  }

  try {
    await addTeamMember(teamName, member)
  } catch (error) {
    logger.debug(
      { teamName, agentId, error },
      `Failed to register agent as team member`,
    )
    return null
  }

  // Notify the team lead about the new member (fire-and-forget)
  await notifyTeamLead(teamName, teamConfig, memberName, role, logger)

  return generateTeamPromptSection(teamName, memberName, role, teamConfig.phase)
}
