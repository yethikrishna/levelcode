import { validateAgents } from '@levelcode/common/templates/agent-validation'
import { parsePublishedAgentId } from '@levelcode/common/util/agent-id-parsing'
import { DEFAULT_ORG_PREFIX } from '@levelcode/common/util/agent-name-normalization'

import { getAllTeamAgents } from '../../../../agents/team'

import type { DynamicAgentValidationError } from '@levelcode/common/templates/agent-validation'
import type { AgentTemplate } from '@levelcode/common/types/agent-template'
import type { FetchAgentFromDatabaseFn } from '@levelcode/common/types/contracts/database'
import type { Logger } from '@levelcode/common/types/contracts/logger'
import type { ParamsExcluding } from '@levelcode/common/types/function-params'
import type { ProjectFileContext } from '@levelcode/common/util/file'

/**
 * Single function to look up an agent template with clear priority order:
 * 1. localAgentTemplates (dynamic agents + static templates)
 * 2. Database cache
 * 3. Database query
 */
export async function getAgentTemplate(
  params: {
    agentId: string
    localAgentTemplates: Record<string, AgentTemplate>
    fetchAgentFromDatabase: FetchAgentFromDatabaseFn
    databaseAgentCache: Map<string, AgentTemplate | null>
    logger: Logger
  } & ParamsExcluding<FetchAgentFromDatabaseFn, 'parsedAgentId'>,
): Promise<AgentTemplate | null> {
  const {
    agentId,
    localAgentTemplates,
    fetchAgentFromDatabase,
    databaseAgentCache,
    logger,
  } = params
  // 1. Check localAgentTemplates first (dynamic agents + static templates)
  if (localAgentTemplates[agentId]) {
    return localAgentTemplates[agentId]
  }
  // 2. Check database cache
  if (databaseAgentCache.has(agentId)) {
    return databaseAgentCache.get(agentId) || null
  }

  const parsed = parsePublishedAgentId(agentId)
  if (!parsed) {
    // If agentId doesn't parse as publisher/agent format, try as levelcode/agentId
    const levelcodeParsed = parsePublishedAgentId(
      `${DEFAULT_ORG_PREFIX}${agentId}`,
    )
    if (levelcodeParsed) {
      const dbAgent = await fetchAgentFromDatabase({
        ...params,
        parsedAgentId: levelcodeParsed,
      })
      if (dbAgent) {
        databaseAgentCache.set(dbAgent.id, dbAgent)
        return dbAgent
      }
    }
    logger.debug({ agentId }, 'getAgentTemplate: Failed to parse agent ID')
    return null
  }

  // 3. Query database (only for publisher/agent-id format)
  const dbAgent = await fetchAgentFromDatabase({
    ...params,
    parsedAgentId: parsed,
  })
  if (dbAgent && parsed.version && parsed.version !== 'latest') {
    // Cache only specific versions to avoid stale 'latest' results
    databaseAgentCache.set(dbAgent.id, dbAgent)
  }
  return dbAgent
}

/**
 * Build a map of team agent definitions keyed by their ID.
 * Each entry is the raw AgentDefinition object from agents/team/.
 */
function buildTeamAgentMap(): Record<string, any> {
  const map: Record<string, any> = {}
  for (const agent of getAllTeamAgents()) {
    map[agent.id] = agent
  }
  return map
}

/**
 * Assemble local agent templates from fileContext + static templates + team agents
 */
export function assembleLocalAgentTemplates(params: {
  fileContext: ProjectFileContext
  logger: Logger
}): {
  agentTemplates: Record<string, AgentTemplate>
  validationErrors: DynamicAgentValidationError[]
} {
  const { fileContext, logger } = params
  // Load dynamic agents using the service
  const { templates: dynamicTemplates, validationErrors } = validateAgents({
    agentTemplates: fileContext.agentTemplates,
    logger,
  })

  // Load team agent templates through the same validation pipeline
  const { templates: teamTemplates, validationErrors: teamErrors } =
    validateAgents({
      agentTemplates: buildTeamAgentMap(),
      logger,
    })

  // Merge: dynamic (user-defined) agents take priority over team agents
  const agentTemplates = { ...teamTemplates, ...dynamicTemplates }
  const allErrors = [...validationErrors, ...teamErrors]
  return { agentTemplates, validationErrors: allErrors }
}

/**
 * Clear the database agent cache (useful for testing)
 */
export function clearDatabaseCache(params: {
  databaseAgentCache: Map<string, AgentTemplate | null>
}): void {
  const { databaseAgentCache } = params

  databaseAgentCache.clear()
}
