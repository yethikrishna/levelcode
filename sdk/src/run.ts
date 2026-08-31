import path from 'path'

import { callMainPrompt } from '@levelcode/agent-runtime/main-prompt'
import {
  buildUserMessageContent,
  withSystemTags,
} from '@levelcode/agent-runtime/util/messages'
import { MAX_AGENT_STEPS_DEFAULT } from '@levelcode/common/constants/agents'
import { toOptionalFile } from '@levelcode/common/constants/paths'
import { getMCPClient, listMCPTools, callMCPTool } from '@levelcode/common/mcp/client'
import { toolNames } from '@levelcode/common/tools/constants'
import { clientToolCallSchema } from '@levelcode/common/tools/list'
import { AgentOutputSchema } from '@levelcode/common/types/session-state'
import { cloneDeep } from 'lodash'

import { CostGuard, createCostGuard } from './cost-guard'
import { redactSecrets } from '@levelcode/common/utils/secrets-redact'
import { SemanticMemoryStore } from '@levelcode/common/memory/semantic-memory'
import { AgentScratchpad, getDefaultScratchpad } from '@levelcode/common/memory/scratchpad'
import { ContextBudgetGovernor, getDefaultBudgetGovernor } from '@levelcode/common/context/budget-governor'
import { sandboxCommand } from '@levelcode/common/sandbox/sandbox'
import { isToolAllowed, getProfile, permissionProfiles } from '@levelcode/common/permissions/profiles'
import { createWipCheckpoint } from '@levelcode/common/utils/git-checkpoint'
import { generateRepoMap } from './tools/repo-map'
import { DiffApprovalGate, getDiffApprovalGate } from '@levelcode/common/approval/diff-gate'
import { PolicyEngine, getPolicyEngine } from '@levelcode/common/policy/policy-engine'
import { startSpan, addSpanEvent, endSpan } from '@levelcode/common/telemetry/tracing'
import { SmartModelRouter, getSmartModelRouter } from '@levelcode/common/providers/smart-router'
import { AdaptiveToolSelector, getDefaultAdaptiveToolSelector } from '@levelcode/common/agents/adaptive-tools'

import { getErrorStatusCode } from './error-utils'
import { getSystemProcessEnv } from './env'
import { getAgentRuntimeImpl } from './impl/agent-runtime'
import { getUserInfoFromApiKey } from './impl/database'
import { initialSessionState, applyOverridesToSessionState } from './run-state'
import { changeFile } from './tools/change-file'
import { codeSearch } from './tools/code-search'
import { glob } from './tools/glob'
import { listDirectory } from './tools/list-directory'
import { getFiles } from './tools/read-files'
import { remember } from './tools/remember'
import { repoMap } from './tools/repo-map'
import { runTerminalCommand } from './tools/run-terminal-command'
import { verifyChanges } from './tools/verify-changes'


import type { CustomToolDefinition } from './custom-tool'
import type { RunState } from './run-state'
import type { FileFilter } from './tools/read-files'
import type { ServerAction } from '@levelcode/common/actions'
import type { AgentDefinition } from '@levelcode/common/templates/initial-agents-dir/types/agent-definition'
import type {
  PublishedToolName,
  ToolName,
} from '@levelcode/common/tools/constants'
import type {
  ClientToolCall,
  ClientToolName,
  LevelCodeToolOutput,
  PublishedClientToolName,
} from '@levelcode/common/tools/list'
import type { Logger } from '@levelcode/common/types/contracts/logger'
import type { LevelCodeFileSystem } from '@levelcode/common/types/filesystem'
import type { ToolMessage } from '@levelcode/common/types/messages/levelcode-message'
import type {
  ImagePart,
  TextPart,
  ToolResultOutput,
} from '@levelcode/common/types/messages/content-part'
import type { PrintModeEvent } from '@levelcode/common/types/print-mode'
import type { SessionState } from '@levelcode/common/types/session-state'
import type { Source } from '@levelcode/common/types/source'
import type { LevelCodeSpawn } from '@levelcode/common/types/spawn'

type OverrideTools = Partial<
  {
    [K in ClientToolName & PublishedToolName]: (
      input: Extract<ClientToolCall, { toolName: K }>['input'],
    ) => Promise<LevelCodeToolOutput<K>>
  }
> & {
  // Include read_files separately, since it has a different signature.
  read_files?: (input: {
    filePaths: string[]
  }) => Promise<Record<string, string | null>>
}

/**
 * Wraps content for user messages, ensuring text is wrapped in <user_message> tags.
 * Uses buildUserMessageContent from agent-runtime for consistency.
 */
const wrapContentForUserMessage = (
  content?: (TextPart | ImagePart)[],
): (TextPart | ImagePart)[] | undefined => {
  if (!content || content.length === 0) {
    return content
  }
  // Delegate to the shared utility which handles wrapping correctly
  return buildUserMessageContent(undefined, undefined, content)
}

export type LevelCodeClientOptions = {
  apiKey?: string

  cwd?: string
  projectFiles?: Record<string, string>
  knowledgeFiles?: Record<string, string>
  agentDefinitions?: AgentDefinition[]
  maxAgentSteps?: number
  env?: Record<string, string>

  handleEvent?: (event: PrintModeEvent) => void | Promise<void>
  handleStreamChunk?: (
    chunk:
      | string
      | {
        type: 'subagent_chunk'
        agentId: string
        agentType: string
        chunk: string
      }
      | {
        type: 'reasoning_chunk'
        agentId: string
        ancestorRunIds: string[]
        chunk: string
      },
  ) => void | Promise<void>

  /** Optional filter to classify files before reading (runs before gitignore check) */
  fileFilter?: FileFilter

  overrideTools?: OverrideTools
  customToolDefinitions?: CustomToolDefinition[]

  fsSource?: Source<LevelCodeFileSystem>
  spawnSource?: Source<LevelCodeSpawn>
  logger?: Logger
}

export type ImageContent = {
  type: 'image'
  image: string // base64 encoded
  mediaType: string
}

export type TextContent = {
  type: 'text'
  text: string
}

export type MessageContent = TextContent | ImageContent

export type RunOptions = {
  agent: string | AgentDefinition
  prompt: string
  /** Content array for multimodal messages (text + images) */
  content?: MessageContent[]
  params?: Record<string, any>
  previousRun?: RunState
  extraToolResults?: ToolMessage[]
  signal?: AbortSignal
  costMode?: string
}

const createAbortError = (signal?: AbortSignal) => {
  if (signal?.reason instanceof Error) {
    return signal.reason
  }
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

type RunExecutionOptions = RunOptions &
  LevelCodeClientOptions & {
    apiKey: string
    fingerprintId: string
  }
type RunReturnType = RunState

type MiddlewareContext = {
  costGuard: CostGuard | null
  semanticMemory: SemanticMemoryStore | null
  scratchpad: AgentScratchpad | null
  contextBudget: ContextBudgetGovernor | null
  policyEngine: PolicyEngine | null
  diffGate: DiffApprovalGate | null
  modelRouter: SmartModelRouter | null
  adaptiveTools: AdaptiveToolSelector | null
  checkpointCreated: boolean
  cwd: string
  activePermissionProfile: string
  telemetryEnabled: boolean
}

export async function run(options: RunExecutionOptions): Promise<RunState> {
  const { signal } = options

  if (signal?.aborted) {
    const abortError = createAbortError(signal)
    return {
      sessionState: options.previousRun?.sessionState,
      output: {
        type: 'error',
        message: abortError.message,
      },
    }
  }

  return runOnce(options)
}

async function runOnce({
  apiKey,
  fingerprintId,

  cwd,
  projectFiles,
  knowledgeFiles,
  agentDefinitions,
  maxAgentSteps = MAX_AGENT_STEPS_DEFAULT,
  env,

  handleEvent,
  handleStreamChunk,

  fileFilter,
  overrideTools,
  customToolDefinitions,

  fsSource = () => require('fs').promises,
  spawnSource,
  logger,

  agent,
  prompt,
  content,
  params,
  previousRun,
  extraToolResults,
  signal,
  costMode,
}: RunExecutionOptions): Promise<RunState> {
  const fsSourceValue = typeof fsSource === 'function' ? fsSource() : fsSource
  const fs = await fsSourceValue
  let spawn: LevelCodeSpawn
  if (spawnSource) {
    const spawnSourceValue = await spawnSource
    spawn = spawnSourceValue as LevelCodeSpawn
  } else {
    spawn = require('child_process').spawn as LevelCodeSpawn
  }
  const preparedContent = wrapContentForUserMessage(content)

  // Init session state
  let agentId
  if (typeof agent !== 'string') {
    const clonedDefs = agentDefinitions ? cloneDeep(agentDefinitions) : []
    agentDefinitions = [...clonedDefs, agent]
    agentId = agent.id
  } else {
    agentId = agent
  }
  let sessionState: SessionState
  if (previousRun?.sessionState) {
    // applyOverridesToSessionState handles deep cloning and applying any provided overrides
    sessionState = await applyOverridesToSessionState(
      cwd,
      previousRun.sessionState,
      {
        knowledgeFiles,
        agentDefinitions,
        customToolDefinitions,
        projectFiles,
        maxAgentSteps,
      },
    )
  } else {
    // No previous run, so create a fresh session state
    sessionState = await initialSessionState({
      cwd,
      knowledgeFiles,
      agentDefinitions,
      customToolDefinitions,
      projectFiles,
      maxAgentSteps,
      fs,
      spawn,
      logger,
    })
  }

  // ── Middleware initialization (graceful fallback on failure) ──
  let costGuard: CostGuard | null = null
  let semanticMemory: SemanticMemoryStore | null = null
  let scratchpad: AgentScratchpad | null = null
  let contextBudget: ContextBudgetGovernor | null = null
  let policyEngine: PolicyEngine | null = null
  let diffGate: DiffApprovalGate | null = null
  let modelRouter: SmartModelRouter | null = null
  let adaptiveTools: AdaptiveToolSelector | null = null
  let checkpointCreated = false
  let activePermissionProfile = 'trusted'
  let telemetryEnabled = false

  try {
    costGuard = createCostGuard()
  } catch { /* cost tracking optional */ }
  try {
    semanticMemory = new SemanticMemoryStore(cwd ?? process.cwd())
  } catch { /* semantic memory optional */ }
  try {
    scratchpad = getDefaultScratchpad()
  } catch { /* scratchpad optional */ }
  try {
    contextBudget = getDefaultBudgetGovernor()
  } catch { /* context budget optional */ }
  try {
    policyEngine = getPolicyEngine()
  } catch { /* policy engine optional */ }
  try {
    diffGate = getDiffApprovalGate()
  } catch { /* diff gate optional */ }
  try {
    modelRouter = getSmartModelRouter()
  } catch { /* smart router optional */ }
  try {
    adaptiveTools = getDefaultAdaptiveToolSelector()
  } catch { /* adaptive tools optional */ }

  // Middleware context passed through to tool call handling
  const middlewareCtx = {
    costGuard,
    semanticMemory,
    scratchpad,
    contextBudget,
    policyEngine,
    diffGate,
    modelRouter,
    adaptiveTools,
    get checkpointCreated() { return checkpointCreated },
    set checkpointCreated(v: boolean) { checkpointCreated = v },
    activePermissionProfile,
    telemetryEnabled,
    cwd: cwd ?? process.cwd(),
  }

  let resolve: (value: RunReturnType) => any = () => { }
  let _reject: (error: any) => any = () => { }
  const promise = new Promise<RunReturnType>((res, rej) => {
    resolve = res
    _reject = rej
  })

  async function onError(error: { message: string }) {
    if (handleEvent) {
      await handleEvent({ type: 'error', message: error.message })
    }
  }

  let pendingAgentResponse = ''

  /** Calculates the current session state if cancelled.
   *
   * This is used when callMainPrompt throws an error (the server never processed the request).
   * We need to add the user's message here since the server didn't get a chance to add it.
   */
  function getCancelledSessionState(message: string): SessionState {
    const state = cloneDeep(sessionState)
    
    // Add the user's message since the server never processed it
    if (prompt || preparedContent) {
      state.mainAgentState.messageHistory.push({
        role: 'user' as const,
        content: buildUserMessageContent(prompt, params, preparedContent),
        tags: ['USER_PROMPT'] as string[],
      })
    }
    
    addCancellationContext(state, pendingAgentResponse, message)
    return state
  }
  function getCancelledRunState(message?: string): RunState {
    message = message ?? 'Run cancelled by user.'
    return {
      sessionState: getCancelledSessionState(message),
      output: {
        type: 'error',
        message,
      },
    }
  }

  const onResponseChunk = async (
    action: ServerAction<'response-chunk'>,
  ): Promise<void> => {
    if (signal?.aborted) {
      return
    }
    const { chunk } = action
    addToPendingAssistantMessage: if (typeof chunk === 'string') {
      pendingAgentResponse += chunk
    } else if (
      chunk.type === 'reasoning_delta' &&
      chunk.ancestorRunIds.length === 0
    ) {
      pendingAgentResponse += chunk.text
    }

    if (typeof chunk !== 'string') {
      if (chunk.type === 'reasoning_delta') {
        handleStreamChunk?.({
          type: 'reasoning_chunk',
          chunk: chunk.text,
          agentId: chunk.runId,
          ancestorRunIds: chunk.ancestorRunIds,
        })
      } else {
        await handleEvent?.(chunk)
      }
      return
    }

    if (handleStreamChunk) {
      await handleStreamChunk(chunk)
    }
  }
  const onSubagentResponseChunk = async (
    action: ServerAction<'subagent-response-chunk'>,
  ) => {
    if (signal?.aborted) {
      return
    }
    const { agentId, agentType, chunk } = action

    if (handleStreamChunk && chunk) {
      await handleStreamChunk({
        type: 'subagent_chunk',
        agentId,
        agentType,
        chunk,
      })
    }
  }

  const agentRuntimeImpl = getAgentRuntimeImpl({
    logger,
    apiKey,
    handleStepsLogChunk: () => {
      // Does nothing for now
    },
    requestToolCall: async ({ userInputId, toolName, input, mcpConfig }) => {
      const toolSpan = telemetryEnabled ? startSpan('tool_call', { toolName, agentId }) : null
      try {
        const result = await handleToolCall({
          action: {
            type: 'tool-call-request',
            requestId: crypto.randomUUID(),
            userInputId,
            toolName,
            input,
            timeout: undefined,
            mcpConfig,
          },
          overrides: overrideTools ?? {},
          customToolDefinitions: customToolDefinitions
            ? Object.fromEntries(
              customToolDefinitions.map((def) => [def.toolName, def]),
            )
            : {},
          cwd,
          fs,
          env,
          middleware: middlewareCtx,
        })
        try { adaptiveTools?.recordResult('feature', toolName, true, 0) } catch { /* non-fatal */ }
        if (toolSpan) endSpan(toolSpan, 'ok')
        return result
      } catch (err) {
        try { adaptiveTools?.recordResult('feature', toolName, false, 0) } catch { /* non-fatal */ }
        if (toolSpan) {
          addSpanEvent(toolSpan, 'error', { error: String(err) })
          endSpan(toolSpan, 'error')
        }
        throw err
      }
    },
    requestMcpToolData: async ({ mcpConfig, toolNames }) => {
      const mcpClientId = await getMCPClient(mcpConfig)
      const listToolsResult = await listMCPTools(mcpClientId)
      const tools = listToolsResult.tools
      const filteredTools: typeof tools = []
      for (const tool of tools) {
        if (!toolNames) {
          filteredTools.push(tool)
          continue
        }
        if (tool.name in toolNames) {
          filteredTools.push(tool)
          continue
        }
      }

      return filteredTools
    },
    requestFiles: ({ filePaths }) =>
      readFiles({
        filePaths,
        override: overrideTools?.read_files,
        fileFilter,
        cwd,
        fs,
      }),
    requestOptionalFile: async ({ filePath }) => {
      const files = await readFiles({
        filePaths: [filePath],
        override: overrideTools?.read_files,
        fileFilter,
        cwd,
        fs,
      })
      return toOptionalFile(files[filePath] ?? null)
    },
    sendAction: ({ action }) => {
      if (action.type === 'action-error') {
        onError({ message: action.message })
        return
      }
      if (action.type === 'response-chunk') {
        onResponseChunk(action)
        return
      }
      if (action.type === 'subagent-response-chunk') {
        onSubagentResponseChunk(action)
        return
      }
      if (action.type === 'prompt-response') {
        handlePromptResponse({
          action,
          resolve,
          onError,
          initialSessionState: sessionState,
          signal,
          pendingAgentResponse,
          middleware: middlewareCtx,
          llmSpan,
        })
        return
      }
      if (action.type === 'prompt-error') {
        handlePromptResponse({
          action,
          resolve,
          onError,
          initialSessionState: sessionState,
          signal,
          pendingAgentResponse,
          middleware: middlewareCtx,
          llmSpan,
        })
        return
      }
    },
    sendSubagentChunk: ({
      userInputId,
      agentId,
      agentType,
      chunk,
      prompt,
      forwardToPrompt = true,
    }) => {
      onSubagentResponseChunk({
        type: 'subagent-response-chunk',
        userInputId,
        agentId,
        agentType,
        chunk,
        prompt,
        forwardToPrompt,
      })
    },
  })

  const promptId = Math.random().toString(36).substring(2, 15)

  // Send input
  const userInfo = await getUserInfoFromApiKey({
    ...agentRuntimeImpl,
    apiKey,
    fields: ['id'],
  })
  if (!userInfo) {
    return getCancelledRunState('Invalid API key or user not found')
  }

  const userId = userInfo.id

  if (signal?.aborted) {
    return getCancelledRunState()
  }

  // ── Pre-LLM middleware: semantic memory recall ──
  let augmentedPrompt = prompt
  try {
    if (semanticMemory && prompt) {
      const memories = semanticMemory.recall(prompt, 5)
      if (memories.length > 0) {
        const memoryContext = memories
          .map((m) => `- ${m.fact.fact}`)
          .join('\n')
        augmentedPrompt = `Relevant context from memory:\n${memoryContext}\n\n---\n\n${prompt}`
      }
    }
  } catch { /* memory recall failure is non-fatal */ }

  // ── Pre-LLM middleware: repo map for large projects ──
  try {
    const projectCwd = cwd ?? process.cwd()
    const repoMapResult = await generateRepoMap(projectCwd, { maxChars: 8000 })
    if (repoMapResult && repoMapResult.length > 0) {
      // Inject repo map tag into prompt - the agent runtime handles this
      if (!params) params = {}
      ;(params as any).repoMap = repoMapResult
    }
  } catch { /* repo map generation is optional */ }

  // ── Pre-LLM middleware: context budget check ──
  try {
    if (contextBudget) {
      const msgHistory = sessionState.mainAgentState.messageHistory
      const estimated = Math.ceil(JSON.stringify(msgHistory).length / 3)
      const budgetLimit = 120000
      const budgetStatus = contextBudget.checkBudget(agentId, estimated, budgetLimit)
      if (budgetStatus.status === 'critical' || budgetStatus.status === 'exceeded') {
        const pruned = contextBudget.pruneToBudget(msgHistory as any, budgetLimit)
        sessionState.mainAgentState.messageHistory = pruned.prunedMessages as any
      }
    }
  } catch { /* budget checking is optional */ }

  // ── Pre-LLM middleware: per-agent scratchpad handoff ──
  try {
    if (scratchpad) {
      const summary = scratchpad.getHandoffSummary(agentId)
      if (summary && summary.entries.length > 0) {
        if (!params) params = {}
        ;(params as any).scratchpadContext = summary
      }
    }
  } catch { /* scratchpad handoff is optional */ }

  const llmSpan = telemetryEnabled ? startSpan('llm_call', { agentId }) : null

  callMainPrompt({
    ...agentRuntimeImpl,
    promptId,
    action: {
      type: 'prompt',
      promptId,
      prompt: augmentedPrompt,
      promptParams: params,
      content: preparedContent,
      fingerprintId: fingerprintId,
      costMode: costMode ?? 'normal',
      sessionState,
      toolResults: extraToolResults ?? [],
      agentId,
    },
    repoUrl: undefined,
    repoId: undefined,
    clientSessionId: promptId,
    userId,
    signal: signal ?? new AbortController().signal,
  }).catch((error) => {
    if (llmSpan) {
      addSpanEvent(llmSpan, 'error', { error: String(error) })
      endSpan(llmSpan, 'error')
    }
    const errorMessage =
      error instanceof Error ? error.message : String(error ?? '')
    const statusCode = getErrorStatusCode(error)
    resolve({
      sessionState: getCancelledSessionState(errorMessage),
      output: {
        type: 'error',
        message: errorMessage,
        ...(statusCode !== undefined && { statusCode }),
      },
    })
  })

  return promise
}

function requireCwd(cwd: string | undefined, toolName: string): string {
  if (!cwd) {
    throw new Error(
      `cwd is required for the ${toolName} tool. Please provide cwd in LevelCodeClientOptions or override the ${toolName} tool.`,
    )
  }
  return cwd
}

async function readFiles({
  filePaths,
  override,
  fileFilter,
  cwd,
  fs,
}: {
  filePaths: string[]
  override?: NonNullable<
    Required<LevelCodeClientOptions>['overrideTools']['read_files']
  >
  fileFilter?: FileFilter
  cwd?: string
  fs: LevelCodeFileSystem
}) {
  if (override) {
    return await override({ filePaths })
  }
  return getFiles({ filePaths, cwd: requireCwd(cwd, 'read_files'), fs, fileFilter })
}

async function handleToolCall({
  action,
  overrides,
  customToolDefinitions,
  cwd,
  fs,
  env,
  middleware,
}: {
  action: ServerAction<'tool-call-request'>
  overrides: NonNullable<LevelCodeClientOptions['overrideTools']>
  customToolDefinitions: Record<string, CustomToolDefinition>
  cwd?: string
  fs: LevelCodeFileSystem
  env?: Record<string, string>
  middleware: MiddlewareContext
}): Promise<{ output: ToolResultOutput[] }> {
  const toolName = action.toolName
  const input = action.input

  // ── Permission profile check ──
  try {
    if (middleware.activePermissionProfile !== 'godmode') {
      const profile = getProfile(middleware.activePermissionProfile as any)
      if (profile && !isToolAllowed(profile.name, toolName as any)) {
        return {
          output: [{
            type: 'json',
            value: {
              errorMessage: `Tool "${toolName}" is not allowed by the active permission profile (${middleware.activePermissionProfile}). Use /permissions to change.`,
            },
          }],
        }
      }
    }
  } catch { /* permission check failures are non-fatal */ }

  // ── Policy engine check ──
  try {
    if (middleware.policyEngine) {
      const policyResult = middleware.policyEngine.checkPolicy(
        { toolName, args: input as Record<string, unknown> },
        { cwd: middleware.cwd },
      )
      if (policyResult.decision === 'deny') {
        return {
          output: [{
            type: 'json',
            value: { errorMessage: `Policy violation: ${policyResult.reason ?? 'tool blocked by policy'}` },
          }],
        }
      }
      if (policyResult.decision === 'requireApproval') {
        return {
          output: [{
            type: 'json',
            value: {
              errorMessage: `Policy requires approval: ${policyResult.reason}`,
              requiresApproval: true,
              toolName,
            },
          }],
        }
      }
    }
  } catch { /* policy check failures are non-fatal */ }

  // ── Auto-create git checkpoint on first edit ──
  try {
    const isEditTool = toolName === 'write_file' || toolName === 'str_replace'
    if (isEditTool && !middleware.checkpointCreated && middleware.cwd) {
      await createWipCheckpoint(middleware.cwd, 'auto-checkpoint-before-edit')
      middleware.checkpointCreated = true
    }
  } catch { /* checkpoint creation failures are non-fatal */ }

  // ── Diff approval gate for file edits ──
  try {
    if (middleware.diffGate) {
      const autoApproved = middleware.diffGate.isAutoApproved(
        { toolName, args: input as Record<string, unknown> },
        middleware.activePermissionProfile as any,
      )
      if (!autoApproved) {
        // In non-interactive/SDK context, deny if not auto-approved.
        // TUI layer registers an approver callback for interactive approval.
        return {
          output: [{
            type: 'json',
            value: {
              errorMessage: `Diff gate: "${toolName}" requires approval in ${middleware.activePermissionProfile} mode. Use /approve in TUI or switch to trusted/godmode profile.`,
              requiresApproval: true,
              toolName,
            },
          }],
        }
      }
    }
  } catch { /* diff gate failures are non-fatal */ }

  // Handle MCP tool calls when mcpConfig is present
  if (action.mcpConfig) {
    try {
      const mcpClientId = await getMCPClient(action.mcpConfig)
      const result = await callMCPTool(mcpClientId, {
        name: toolName,
        arguments: input,
      })
      return { output: result }
    } catch (error) {
      return {
        output: [
          {
            type: 'json',
            value: {
              errorMessage:
                error instanceof Error ? error.message : String(error),
            },
          },
        ],
      }
    }
  }

  let result: ToolResultOutput[]
  if (toolNames.includes(toolName as ToolName)) {
    clientToolCallSchema.parse(action)
  } else {
    const customToolHandler = customToolDefinitions[toolName]

    if (!customToolHandler) {
      throw new Error(
        `Custom tool handler not found for user input ID ${action.userInputId}`,
      )
    }
    return {
      output: await customToolHandler.execute(action.input),
    }
  }

  try {
    let override = overrides[toolName as PublishedClientToolName]
    if (!override && toolName === 'str_replace') {
      override = overrides['write_file']
    }
    if (override) {
      result = await override(input as any)
    } else if (toolName === 'end_turn') {
      result = [{ type: 'json', value: { message: 'Turn ended.' } }]
    } else if (toolName === 'write_file' || toolName === 'str_replace') {
      result = await changeFile({
        parameters: input,
        cwd: requireCwd(cwd, toolName),
        fs,
      })
    } else if (toolName === 'run_terminal_command') {
      const resolvedCwd = requireCwd(cwd, 'run_terminal_command')
      const cmdInput = input as Parameters<typeof runTerminalCommand>[0]
      const execCwd = path.resolve(resolvedCwd, cmdInput.cwd ?? '.')
      // ── Sandbox wrapping for terminal commands ──
      if (middleware.activePermissionProfile === 'sandboxed' || middleware.activePermissionProfile === 'readonly') {
        try {
          const sandboxed = sandboxCommand(cmdInput.command, {
            cwd: execCwd,
            timeoutSeconds: cmdInput.timeout_seconds ?? 30,
            allowedEnvVars: Object.keys(env ?? getSystemProcessEnv()),
          })
          result = [{
            type: 'json',
            value: {
              stdout: sandboxed.stdout ?? '',
              stderr: sandboxed.stderr ?? '',
              exitCode: sandboxed.exitCode ?? (sandboxed.blocked ? 1 : 0),
              sandboxMode: sandboxed.sandboxMode,
              blocked: sandboxed.blocked,
              blockReason: sandboxed.blockReason ?? '',
            },
          }]
        } catch {
          // Fallback to normal execution if sandbox fails
          result = await runTerminalCommand({
            ...cmdInput,
            cwd: execCwd,
            env,
          })
        }
      } else {
        result = await runTerminalCommand({
          ...cmdInput,
          cwd: execCwd,
          env,
        })
      }
    } else if (toolName === 'code_search') {
      result = await codeSearch({
        projectPath: requireCwd(cwd, 'code_search'),
        ...input,
      } as Parameters<typeof codeSearch>[0])
    } else if (toolName === 'verify_changes') {
      result = await verifyChanges({
        projectPath: requireCwd(cwd, 'verify_changes'),
        ...(input as { checks?: never; timeout_seconds?: number }),
        env,
      } as Parameters<typeof verifyChanges>[0])
    } else if (toolName === 'repo_map') {
      result = await repoMap({
        projectPath: requireCwd(cwd, 'repo_map'),
        ...(input as { focus_path?: string; max_chars?: number }),
      })
    } else if (toolName === 'remember') {
      result = await remember({
        projectPath: requireCwd(cwd, 'remember'),
        ...(input as { category: never; content: string }),
      } as Parameters<typeof remember>[0])
      // ── Also record to semantic memory ──
      try {
        const memInput = input as { content: string; category?: string }
        if (middleware.semanticMemory && memInput.content) {
          middleware.semanticMemory.remember(memInput.content, {
            tags: [memInput.category ?? 'agent'],
            source: 'remember_tool',
          })
        }
      } catch { /* semantic memory record is optional */ }
    } else if (toolName === 'list_directory') {
      result = await listDirectory({
        directoryPath: (input as { path: string }).path,
        projectPath: requireCwd(cwd, 'list_directory'),
        fs,
      })
    } else if (toolName === 'glob') {
      result = await glob({
        pattern: (input as { pattern: string; cwd?: string }).pattern,
        projectPath: requireCwd(cwd, 'glob'),
        cwd: (input as { pattern: string; cwd?: string }).cwd,
        fs,
      })
    } else if (toolName === 'run_file_change_hooks') {
      result = [
        {
          type: 'json',
          value: {
            message: 'File change hooks are not supported in SDK mode',
          },
        },
      ]
    } else {
      throw new Error(
        `Tool not implemented in SDK. Please provide an override or modify your agent to not use this tool: ${toolName}`,
      )
    }

    // ── Secrets redaction on tool results ──
    try {
      result = result.map((item) => {
        if (item.type === 'json' && item.value && typeof item.value === 'object') {
          const redacted = redactSecrets(JSON.stringify(item.value))
          return { ...item, value: JSON.parse(redacted.redactedText) }
        }
        return item
      })
    } catch { /* redaction failures are non-fatal */ }

  } catch (error) {
    result = [
      {
        type: 'json',
        value: {
          errorMessage:
            error &&
              typeof error === 'object' &&
              'message' in error &&
              typeof error.message === 'string'
              ? error.message
              : typeof error === 'string'
                ? error
                : 'Unknown error',
        },
      },
    ]
  }
  return {
    output: result,
  }
}

/** 
 * Adds cancellation context to a session state (mutates in place).
 * Includes the partial assistant response (if any) and an interruption message.
 */
function addCancellationContext(
  state: SessionState,
  pendingResponse: string,
  systemMessage: string
): void {
  const messageHistory = state.mainAgentState.messageHistory
  
  // Add partial assistant response if there was streaming content
  if (pendingResponse.trim()) {
    messageHistory.push({
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: pendingResponse }],
    })
  }
  
  // Add interruption message
  messageHistory.push({
    role: 'user' as const,
    content: [{ type: 'text' as const, text: withSystemTags(systemMessage) }],
  })
}

/**
 * Extracts an HTTP status code from an error message string.
 * Parses common error patterns to identify the underlying status code.
 * Returns the status code if found, undefined otherwise.
 */
export const extractStatusCodeFromMessage = (
  errorMessage: string,
): number | undefined => {
  const lowerMessage = errorMessage.toLowerCase()

  // AI SDK's built-in retry error (e.g., "Failed after 4 attempts. Last error: Service Unavailable")
  // The AI SDK already retried 4 times, but we still want our SDK wrapper to retry 3 more times
  if (
    lowerMessage.includes('failed after') &&
    lowerMessage.includes('attempts')
  ) {
    // Extract the underlying error type from the message
    if (lowerMessage.includes('service unavailable')) {
      return 503
    }
    if (lowerMessage.includes('timeout')) {
      return 408
    }
    if (lowerMessage.includes('connection refused')) {
      return 503
    }
    // Default to 500 for other AI SDK retry failures
    return 500
  }

  if (
    errorMessage.includes('503') ||
    lowerMessage.includes('service unavailable')
  ) {
    return 503
  }
  if (errorMessage.includes('504')) {
    return 504
  }
  if (errorMessage.includes('502')) {
    return 502
  }
  if (lowerMessage.includes('timeout') || errorMessage.includes('408')) {
    return 408
  }
  if (
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('connection refused')
  ) {
    return 503
  }
  if (lowerMessage.includes('dns') || lowerMessage.includes('enotfound')) {
    return 503
  }
  if (lowerMessage.includes('server error') || errorMessage.includes('500')) {
    return 500
  }
  if (errorMessage.includes('429') || lowerMessage.includes('rate limit')) {
    return 429
  }
  if (
    lowerMessage.includes('network error') ||
    lowerMessage.includes('fetch failed')
  ) {
    return 503
  }

  return undefined
}

async function handlePromptResponse({
  action,
  resolve,
  onError,
  initialSessionState,
  signal,
  pendingAgentResponse,
  middleware,
  llmSpan,
}: {
  action: ServerAction<'prompt-response'> | ServerAction<'prompt-error'>
  resolve: (value: RunReturnType) => any
  onError: (error: { message: string }) => void
  initialSessionState: SessionState
  signal?: AbortSignal
  pendingAgentResponse: string
  middleware?: MiddlewareContext
  llmSpan?: any
}) {
  if (action.type === 'prompt-error') {
    onError({ message: action.message })

    // ── Post-error: end LLM span ──
    if (llmSpan) {
      try { addSpanEvent(llmSpan, 'prompt_error', { error: action.message }) } catch { /* non-fatal */ }
      try { endSpan(llmSpan, 'error') } catch { /* non-fatal */ }
    }

    const statusCode = extractStatusCodeFromMessage(action.message)
    resolve({
      sessionState: initialSessionState,
      output: {
        type: 'error',
        message: action.message,
        ...(statusCode !== undefined && { statusCode }),
      },
    })
  } else if (action.type === 'prompt-response') {
    // Stop enforcing session state schema! It's a black box we will pass back to the server.
    // Only check the output schema.
    const parsedOutput = AgentOutputSchema.safeParse(action.output)
    if (!parsedOutput.success) {
      const message = [
        'Received invalid prompt response from server:',
        JSON.stringify(parsedOutput.error.issues),
        'If this issues persists, please contact support@levelcode.vercel.app',
      ].join('\n')
      onError({ message })
      if (llmSpan) { try { endSpan(llmSpan, 'error') } catch { /* non-fatal */ } }
      resolve({
        sessionState: initialSessionState,
        output: {
          type: 'error',
          message,
        },
      })
      return
    }
    let { sessionState, output } = action

    // If the request was aborted by the user, preserve partial streamed content
    // and append an interruption message so the next prompt knows what happened.
    // The session state from the server already contains all tool calls and results.
    if (signal?.aborted && sessionState) {
      sessionState = cloneDeep(sessionState)
      addCancellationContext(
        sessionState,
        pendingAgentResponse,
        'User interrupted the response. The assistant\'s previous work has been preserved.'
      )
    }

    // ── Post-completion middleware hooks ──
    try {
      if (llmSpan) endSpan(llmSpan, 'ok')
    } catch { /* tracing cleanup non-fatal */ }
    try {
      if (middleware?.semanticMemory && output) {
        const outText = typeof output === 'object' && 'message' in output
          ? String((output as any).message ?? '').slice(0, 500)
          : JSON.stringify(output).slice(0, 500)
        if (outText) {
          middleware.semanticMemory.remember(`Task outcome: ${outText}`, {
            tags: ['outcome'],
            source: 'run_completion',
            importance: 0.3,
          })
        }
      }
    } catch { /* post-run memory recording non-fatal */ }

    const state: RunState = {
      sessionState,
      output: output ?? {
        type: 'error',
        message: 'No output from agent',
      },
    }
    resolve(state)
  } else {
    action satisfies never
    onError({
      message: 'Internal error: prompt response type not handled',
    })
    resolve({
      sessionState: initialSessionState,
      output: {
        type: 'error',
        message: 'Internal error: prompt response type not handled',
      },
    })
  }
}
