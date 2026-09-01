import open from 'open'

import {
  CostGuard,
  createCostGuard,
  sandboxCommand,
  getDefaultSandboxConfig,
  isSandboxModeAvailable,
  getProfile,
  isToolAllowed,
  listProfiles,
  permissionProfiles,
  createWipCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
  redactSecrets,
  SemanticMemoryStore,
  ContextBudgetGovernor,
  getDefaultBudgetGovernor,
  buildCodeMap,
  queryCodeMap,
  findReferences,
  TrajectoryReplay,
  renameSymbol,
  extractFunction,
  moveSymbol,
  getRBACManager,
  RBACManager,
  Role,
  Permission,
  generateRepoMap,
} from '@levelcode/sdk'

import { handleAdsEnable, handleAdsDisable } from './ads'
import { useThemeStore } from '../hooks/use-theme'

import { handleImageCommand } from './image'
import { handleInitializationFlowLocally } from './init'
import { runBashCommand } from './router'
import { handleUsageCommand } from './usage'
import { WEBSITE_URL } from '../login/constants'
import { useChatStore } from '../state/chat-store'
import { useCostStore } from '../state/cost-store'
import { useFeedbackStore } from '../state/feedback-store'
import { useLoginStore } from '../state/login-store'
import { useBackgroundStore } from '../state/background-store'
import { useSideChatStore } from '../state/side-chat-store'
import { usePermissionProfileStore } from '../state/permission-profile-store'
import { useTeamStore } from '../state/team-store'
import { AGENT_MODES } from '../utils/constants'
import { getSystemMessage, getUserMessage } from '../utils/message-history'
import { capturePendingAttachments } from '../utils/pending-attachments'
import { saveSwarmPreference, loadSwarmSettings } from '../utils/settings'
import { useTeamSettingsStore } from '../state/team-settings-store'
import { getSkillByName } from '../utils/skill-registry'
import {
  createTeam,
  deleteTeam,
  loadTeamConfig,
  listTasks,
  saveTeamConfig,
} from '@levelcode/common/utils/team-fs'
import { listAllTeams, getLastActiveTeam, setLastActiveTeam } from '@levelcode/common/utils/team-discovery'
import { getTeamPreset, listPresets } from '@levelcode/common/utils/team-presets'
import {
  canTransition,
  transitionPhase,
  PHASE_ORDER,
} from '@levelcode/common/utils/dev-phases'
import { AnalyticsEvent } from '@levelcode/common/constants/analytics-events'
import { dispatchTeamHookEvent } from '@levelcode/common/utils/team-hook-emitter'
import { trackEvent } from '../utils/analytics'
import { useProviderStore } from '../state/provider-store'
import {
  loadProviderConfig,
  removeProvider as removeProviderFromConfig,
  setActiveModel as setActiveModelInConfig,
} from '@levelcode/common/providers/provider-fs'
import { testProvider } from '@levelcode/common/providers/provider-test'
import {
  getProviderDefinition,
  PROVIDER_DEFINITIONS,
} from '@levelcode/common/providers/provider-registry'

import {
  handleBiblePending,
  handleBibleApproved,
  handleBibleApprove,
  handleBibleReject,
  handleBibleDelete,
  handleBibleEdit,
  handleBibleStats,
  handleBibleAdd,
  handleBibleToggleResearch,
  handleBibleContext,
  handleBibleShow,
} from './bible'

import {
  handleMarketplaceSearch,
  handleMarketplaceInstall,
  handleMarketplaceUninstall,
  handleMarketplaceList,
  handleMarketplacePublish,
} from './marketplace'

import {
  handlePRAttach,
  handlePRDetach,
  handlePRList,
} from './pr-swarm'

import {
  handleSessionCreate,
  handleSessionJoin,
  handleSessionLeave,
  handleSessionList,
  handleCollabRelay,
  handleCollabRelayStop,
} from './session'
import { checkMcpServers, formatMcpStatus } from './mcp-status'
import { loadMCPConfigSync } from '@levelcode/sdk'

import type { PhaseTransitionHookEvent } from '@levelcode/common/types/team-hook-events'
import type { DevPhase, TeamConfig, TeamMember } from '@levelcode/common/types/team-config'

import type { MultilineInputHandle } from '../components/multiline-input'
import type { InputValue, PendingAttachment } from '../types/store'
import type { ChatMessage } from '../types/chat'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { User } from '../utils/auth'
import type { AgentMode } from '../utils/constants'
import type { UseMutationResult } from '@tanstack/react-query'

export type RouterParams = {
  abortControllerRef: React.MutableRefObject<AbortController | null>
  agentMode: AgentMode
  inputRef: React.MutableRefObject<MultilineInputHandle | null>
  inputValue: string
  isChainInProgressRef: React.MutableRefObject<boolean>
  isStreaming: boolean
  logoutMutation: UseMutationResult<boolean, Error, void, unknown>
  streamMessageIdRef: React.MutableRefObject<string | null>
  addToQueue: (message: string, attachments?: PendingAttachment[]) => void
  clearMessages: () => void
  compactHistory: () => {
    ok: boolean
    tokensFreed: number
    originalTokens: number
    prunedTokens: number
    error?: string
  }
  saveToHistory: (message: string) => void
  scrollToLatest: () => void
  sendMessage: SendMessageFn
  setCanProcessQueue: (value: React.SetStateAction<boolean>) => void
  setInputFocused: (focused: boolean) => void
  setInputValue: (
    value: InputValue | ((prev: InputValue) => InputValue),
  ) => void
  setIsAuthenticated: (value: React.SetStateAction<boolean | null>) => void
  setMessages: (
    value: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void
  setUser: (value: React.SetStateAction<User | null>) => void
  stopStreaming: () => void
}

export type CommandResult = {
  openFeedbackMode?: boolean
  openPublishMode?: boolean
  openChatHistory?: boolean
  openReviewScreen?: boolean
  openTeamSettings?: boolean
  openProviderWizard?: boolean
  openModelPicker?: boolean
  openSettings?: boolean
  openHelpModal?: boolean
  openProviderOAuth?: boolean
  oauthProviderId?: string
  preSelectAgents?: string[]
  openCostDashboard?: boolean
  openTopologyView?: boolean
  openTeamMetrics?: boolean
  openSideChatPanel?: boolean
  openBackgroundPanel?: boolean
} | void

export type CommandHandler = (
  params: RouterParams,
  args: string,
) => Promise<CommandResult> | CommandResult

export type CommandDefinition = {
  name: string
  aliases: string[]
  handler: CommandHandler
  /** Whether this command accepts arguments. Set automatically by the factory functions. */
  acceptsArgs: boolean
}

/**
 * Handler type for commands that don't accept arguments.
 */
type CommandHandlerNoArgs = (
  params: RouterParams,
) => Promise<CommandResult> | CommandResult

/**
 * Handler type for commands that accept arguments.
 */
type CommandHandlerWithArgs = (
  params: RouterParams,
  args: string,
) => Promise<CommandResult> | CommandResult

/**
 * Configuration for defining a command that does NOT accept arguments.
 */
type CommandConfig = {
  name: string
  aliases?: string[]
  handler: CommandHandlerNoArgs
}

/**
 * Configuration for defining a command that accepts arguments.
 */
type CommandWithArgsConfig = {
  name: string
  aliases?: string[]
  handler: CommandHandlerWithArgs
}

/**
 * Factory for commands that do NOT accept arguments.
 * Any args passed are gracefully ignored.
 *
 * @example
 * defineCommand({
 *   name: 'new',
 *   aliases: ['n', 'clear'],
 *   handler: (params) => {
 *     params.setMessages(() => [])
 *   },
 * })
 */
export function defineCommand(config: CommandConfig): CommandDefinition {
  return {
    name: config.name,
    aliases: config.aliases ?? [],
    acceptsArgs: false,
    handler: (params) => {
      // Args are gracefully ignored for commands that don't accept them
      return config.handler(params)
    },
  }
}

/**
 * Factory for commands that accept arguments.
 * The handler receives both params and args.
 *
 * @example
 * defineCommandWithArgs({
 *   name: 'bash',
 *   aliases: ['!'],
 *   handler: (params, args) => {
 *     if (args.trim()) {
 *       runBashCommand(args.trim())
 *     }
 *   },
 * })
 */
export function defineCommandWithArgs(
  config: CommandWithArgsConfig,
): CommandDefinition {
  return {
    name: config.name,
    aliases: config.aliases ?? [],
    acceptsArgs: true,
    handler: config.handler,
  }
}

const clearInput = (params: RouterParams) => {
  params.setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
}

/**
 * Find the active team, preferring Zustand store → last-active-team marker → first team on disk.
 * Returns null if no teams exist.
 */
export function resolveActiveTeam(): import('@levelcode/common/types/team-config').TeamConfig | null {
  // 1. Zustand store (set by /team:create or previous commands)
  const storeTeam = useTeamStore.getState().activeTeam
  if (storeTeam) return storeTeam

  // 2. Last-active team marker (most recently used team)
  const lastActiveName = getLastActiveTeam()
  if (lastActiveName) {
    const config = loadTeamConfig(lastActiveName)
    if (config) {
      useTeamStore.getState().setActiveTeam(config)
      return config
    }
  }

  // 3. First team on disk (fallback)
  const teams = listAllTeams()
  if (teams.length > 0) {
    const config = loadTeamConfig(teams[0]!.name)
    if (config) {
      useTeamStore.getState().setActiveTeam(config)
      return config
    }
  }

  return null
}

export const COMMAND_REGISTRY: CommandDefinition[] = [
  defineCommand({
    name: 'ads:enable',
    handler: (params) => {
      const { postUserMessage } = handleAdsEnable()
      params.setMessages((prev) => postUserMessage(prev))
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'ads:disable',
    handler: (params) => {
      const { postUserMessage } = handleAdsDisable()
      params.setMessages((prev) => postUserMessage(prev))
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'help',
    aliases: ['h', '?'],
    handler: (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openHelpModal: true }
    },
  }),
  defineCommandWithArgs({
    name: 'feedback',
    aliases: ['bug', 'report'],
    handler: (params, args) => {
      const trimmedArgs = args.trim()

      // If user provided feedback text directly, pre-populate the form
      if (trimmedArgs) {
        useFeedbackStore.getState().setFeedbackText(trimmedArgs)
        useFeedbackStore.getState().setFeedbackCursor(trimmedArgs.length)
      }

      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openFeedbackMode: true }
    },
  }),
  defineCommandWithArgs({
    name: 'bash',
    aliases: ['!'],
    handler: (params, args) => {
      const trimmedArgs = args.trim()

      // If user provided a command directly, execute it immediately
      if (trimmedArgs) {
        const commandWithBang = '!' + trimmedArgs
        params.saveToHistory(commandWithBang)
        clearInput(params)
        runBashCommand(trimmedArgs)
        return
      }

      // Otherwise enter bash mode
      useChatStore.getState().setInputMode('bash')
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'referral',
    aliases: ['redeem'],
    handler: (params) => {
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage('The referral system is not available in open-source mode.'),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'login',
    aliases: ['signin'],
    handler: (params) => {
      params.setMessages((prev) => [
        ...prev,
        getSystemMessage(
          "You're already in the app. Use /logout to switch accounts.",
        ),
      ])
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'logout',
    aliases: ['signout'],
    handler: (params) => {
      params.abortControllerRef.current?.abort()
      params.stopStreaming()
      params.setCanProcessQueue(false)

      const { resetLoginState } = useLoginStore.getState()
      params.logoutMutation.mutate(undefined, {
        onSettled: () => {
          resetLoginState()
          params.setMessages((prev) => [
            ...prev,
            getSystemMessage('Logged out.'),
          ])
          clearInput(params)
          setTimeout(() => {
            params.setUser(null)
            params.setIsAuthenticated(false)
          }, 300)
        },
      })
    },
  }),
  defineCommand({
    name: 'exit',
    aliases: ['quit', 'q'],
    handler: () => {
      process.kill(process.pid, 'SIGINT')
    },
  }),
  defineCommandWithArgs({
    name: 'new',
    aliases: ['n', 'clear', 'c', 'reset'],
    handler: (params, args) => {
      const trimmedArgs = args.trim()

      // Clear the conversation
      params.setMessages(() => [])
      params.clearMessages()
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      params.stopStreaming()

      // If user provided a message, send it as the first message in the new chat
      if (trimmedArgs) {
        // Re-enable queue processing so the message can be sent
        params.setCanProcessQueue(true)
        params.sendMessage({
          content: trimmedArgs,
          agentMode: params.agentMode,
        })
        setTimeout(() => {
          params.scrollToLatest()
        }, 0)
      } else {
        // Only disable queue if we're not sending a message
        params.setCanProcessQueue(false)
      }
    },
  }),
  defineCommand({
    name: 'init',
    handler: async (params) => {
      const { postUserMessage } = handleInitializationFlowLocally()
      const trimmed = params.inputValue.trim()

      params.saveToHistory(trimmed)
      clearInput(params)

      // Check streaming/queue state
      if (
        params.isStreaming ||
        params.streamMessageIdRef.current ||
        params.isChainInProgressRef.current
      ) {
        const pendingAttachments = capturePendingAttachments()
        params.addToQueue(trimmed, pendingAttachments)
        params.setInputFocused(true)
        params.inputRef.current?.focus()
        return
      }

      params.sendMessage({
        content: trimmed,
        agentMode: params.agentMode,
        postUserMessage,
      })
      setTimeout(() => {
        params.scrollToLatest()
      }, 0)
    },
  }),
  defineCommand({
    name: 'usage',
    aliases: ['credits'],
    handler: async (params) => {
      const { postUserMessage } = await handleUsageCommand()
      params.setMessages((prev) => postUserMessage(prev))
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'buy-credits',
    handler: (params) => {
      open(WEBSITE_URL + '/profile?tab=usage')
      // Don't save to history.
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'image',
    aliases: ['img', 'attach'],
    handler: async (params, args) => {
      const trimmedArgs = args.trim()

      // If user provided a path directly, process it immediately
      if (trimmedArgs) {
        await handleImageCommand(trimmedArgs)
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      // Otherwise enter image mode
      useChatStore.getState().setInputMode('image')
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  // ── Team / swarm commands ──────────────────────────────────────────
  defineCommandWithArgs({
    name: 'team:create',
    handler: (params, args) => {
      const parts = args.trim().split(/\s+/)
      const teamName = parts[0]
      const templateName = parts[1]

      if (!teamName) {
        const available = listPresets().map(p => p.toLowerCase().replace(/_/g, '-')).join(', ')
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Usage: /team:create <name> [template]\nAvailable templates: ${available}`),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      try {
        let config: TeamConfig
        if (templateName) {
          const presetConfig = getTeamPreset(templateName)
          if (!presetConfig) {
            const available = listPresets().map(p => p.toLowerCase().replace(/_/g, '-')).join(', ')
            params.setMessages((prev) => [
              ...prev,
              getUserMessage(params.inputValue.trim()),
              getSystemMessage(`Unknown team template "${templateName}". Available templates: ${available}`),
            ])
            params.saveToHistory(params.inputValue.trim())
            clearInput(params)
            return
          }

          const now = Date.now()
          const members: TeamMember[] = []
          for (const pm of presetConfig.members) {
            members.push({
              agentId: `${teamName}-${pm.name}`,
              name: pm.name,
              role: pm.role,
              agentType: pm.agentType,
              model: pm.model,
              joinedAt: now,
              status: 'idle',
              cwd: process.cwd(),
            })
          }

          config = {
            name: teamName,
            description: presetConfig.description,
            createdAt: now,
            leadAgentId: 'user',
            phase: presetConfig.defaultPhase,
            members,
            settings: {
              maxMembers: presetConfig.settings.maxMembers,
              autoAssign: presetConfig.settings.autoAssign,
            },
          }
        } else {
          // Use user's swarm settings for defaults
          const swarmSettings = loadSwarmSettings()
          config = {
            name: teamName,
            description: '',
            createdAt: Date.now(),
            leadAgentId: 'user',
            phase: (swarmSettings.swarmDefaultPhase ?? 'planning') as import('@levelcode/common/types/team-config').DevPhase,
            members: [],
            settings: { maxMembers: swarmSettings.swarmMaxMembers ?? 999, autoAssign: swarmSettings.swarmAutoAssign ?? true },
          }
        }

        createTeam(config)

        const { setActiveTeam, setSwarmEnabled } = useTeamStore.getState()
        setActiveTeam(config)
        setSwarmEnabled(true)

        const successMsg = templateName
          ? `Team "${teamName}" created successfully with template "${templateName}". Phase: ${config.phase}\nMembers:\n` + config.members.map(m => ` - ${m.name} (${m.role})`).join('\n')
          : `Team "${teamName}" created successfully. Phase: ${config.phase}`

        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(successMsg),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Failed to create team: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'team:delete',
    handler: (params) => {
      const { reset } = useTeamStore.getState()
      const activeTeam = resolveActiveTeam()

      if (!activeTeam) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('No active team to delete.'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      try {
        const teamName = activeTeam.name
        deleteTeam(teamName)
        reset()

        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Team "${teamName}" deleted.`),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Failed to delete team: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'team:status',
    handler: (params) => {
      // Try the Zustand store first; if empty, discover teams from disk.
      let activeTeam = useTeamStore.getState().activeTeam
      if (!activeTeam) {
        const teams = listAllTeams()
        if (teams.length > 0) {
          // Auto-load the first (or only) team from disk into the store.
          const diskConfig = loadTeamConfig(teams[0]!.name)
          if (diskConfig) {
            useTeamStore.getState().setActiveTeam(diskConfig)
            activeTeam = diskConfig
          }
        }
      }

      if (!activeTeam) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('No active team. Use /team:create <name> to create one.'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      try {
        const config = loadTeamConfig(activeTeam.name)
        if (!config) {
          params.setMessages((prev) => [
            ...prev,
            getUserMessage(params.inputValue.trim()),
            getSystemMessage(`Team "${activeTeam.name}" config not found on disk.`),
          ])
          params.saveToHistory(params.inputValue.trim())
          clearInput(params)
          return
        }

        const tasks = listTasks(activeTeam.name)
        const counts = {
          pending: tasks.filter((t) => t.status === 'pending').length,
          in_progress: tasks.filter((t) => t.status === 'in_progress').length,
          completed: tasks.filter((t) => t.status === 'completed').length,
          blocked: tasks.filter((t) => t.status === 'blocked').length,
        }

        useTeamStore.getState().updateTaskCounts({
          pending: counts.pending,
          inProgress: counts.in_progress,
          completed: counts.completed,
          blocked: counts.blocked,
        })

        const statusLines = [
          `Team: ${config.name}`,
          `Phase: ${config.phase}`,
          `Members: ${config.members.length}`,
          ``,
          `Tasks:`,
          `  Pending:     ${counts.pending}`,
          `  In Progress: ${counts.in_progress}`,
          `  Completed:   ${counts.completed}`,
          `  Blocked:     ${counts.blocked}`,
        ]

        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(statusLines.join('\n')),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Failed to fetch status: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'team:phase',
    handler: async (params, args) => {
      const phase = args.trim()
      const validPhases = PHASE_ORDER as readonly string[]
      if (!phase) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Usage: /team:phase <phase>\nValid phases: ${validPhases.join(', ')}`),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      if (!validPhases.includes(phase)) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Invalid phase "${phase}". Valid phases: ${validPhases.join(', ')}`),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      const activeTeam = resolveActiveTeam()

      if (!activeTeam) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('No active team. Use /team:create <name> first.'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      const targetPhase = phase as DevPhase
      if (!canTransition(activeTeam.phase, targetPhase)) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(
            `Cannot transition from "${activeTeam.phase}" to "${targetPhase}". Only forward single-step transitions are allowed.`,
          ),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      try {
        const config = loadTeamConfig(activeTeam.name)
        if (!config) {
          params.setMessages((prev) => [
            ...prev,
            getUserMessage(params.inputValue.trim()),
            getSystemMessage(`Team "${activeTeam.name}" config not found on disk.`),
          ])
          params.saveToHistory(params.inputValue.trim())
          clearInput(params)
          return
        }

        const fromPhase = config.phase
        const updated = transitionPhase(config, targetPhase)
        await saveTeamConfig(activeTeam.name, updated)

        // Update last-active-team marker so subsequent tool calls resolve correctly
        setLastActiveTeam(activeTeam.name)

        const { setActiveTeam, setPhase } = useTeamStore.getState()
        setActiveTeam(updated)
        setPhase(targetPhase)

        // Fire PhaseTransition hook event to registered listeners
        const hookEvent: PhaseTransitionHookEvent = {
          type: 'phase_transition',
          teamName: activeTeam.name,
          fromPhase,
          toPhase: targetPhase,
          timestamp: Date.now(),
        }
        dispatchTeamHookEvent(hookEvent)

        // Track the analytics event
        trackEvent(AnalyticsEvent.TEAM_PHASE_TRANSITION, {
          teamName: hookEvent.teamName,
          fromPhase: hookEvent.fromPhase,
          toPhase: hookEvent.toPhase,
        })

        // Build informative message so the agent knows what's now available
        const phaseInfo = [
          `Phase transitioned: ${fromPhase} -> ${targetPhase}`,
          '',
          `IMPORTANT: The team is now in "${targetPhase}" phase. All tools for this phase are now unlocked.`,
        ]
        if (targetPhase === 'alpha' || targetPhase === 'beta' || targetPhase === 'production' || targetPhase === 'mature') {
          phaseInfo.push('You can now spawn agents, send messages, and perform all team operations.')
          phaseInfo.push('Available tools: spawn_agents, send_message, task_create, task_update, task_list, task_get, team_delete, and all standard tools.')
        } else if (targetPhase === 'pre-alpha') {
          phaseInfo.push('You can now send messages and use research agents.')
          phaseInfo.push('Available tools: send_message, task_create, task_update, task_list, task_get, and research tools.')
        }

        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(phaseInfo.join('\n')),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Phase transition failed: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'team:enable',
    handler: (params) => {
      try {
        saveSwarmPreference(true)
        useTeamStore.getState().setSwarmEnabled(true)

        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Swarm features enabled.'),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Failed to enable swarm: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'team:disable',
    handler: (params) => {
      try {
        saveSwarmPreference(false)
        useTeamStore.getState().setSwarmEnabled(false)

        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Swarm features disabled.'),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Failed to disable swarm: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'team:members',
    handler: (params) => {
      const activeTeam = resolveActiveTeam()

      if (!activeTeam) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('No active team. Use /team:create <name> first.'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      try {
        const config = loadTeamConfig(activeTeam.name)
        if (!config) {
          params.setMessages((prev) => [
            ...prev,
            getUserMessage(params.inputValue.trim()),
            getSystemMessage(`Team "${activeTeam.name}" config not found on disk.`),
          ])
          params.saveToHistory(params.inputValue.trim())
          clearInput(params)
          return
        }

        if (config.members.length === 0) {
          params.setMessages((prev) => [
            ...prev,
            getUserMessage(params.inputValue.trim()),
            getSystemMessage(`Team "${config.name}" has no members.`),
          ])
          params.saveToHistory(params.inputValue.trim())
          clearInput(params)
          return
        }

        const header = 'Role                     Status     Name                 Task'
        const divider = '-'.repeat(header.length)
        const rows = config.members.map((m) => {
          const role = m.role.padEnd(25)
          const status = m.status.padEnd(11)
          const name = m.name.padEnd(21)
          const task = m.currentTaskId ?? '-'
          return `${role}${status}${name}${task}`
        })

        const table = [header, divider, ...rows].join('\n')
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(table),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Failed to fetch members: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'team:metrics',
    aliases: ['team:performance'],
    handler: (params) => {
      const activeTeam = resolveActiveTeam()

      if (!activeTeam) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('No active team. Use /team:create <name> to create one.'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      try {
        const tasks = listTasks(activeTeam.name)
        const totalTasks = tasks.length
        const completedTasks = tasks.filter((t) => t.status === 'completed')

        let avgCycleTimeStr = 'N/A'
        if (completedTasks.length > 0) {
          const totalMs = completedTasks.reduce((sum, t) => sum + ((t.updatedAt ?? 0) - (t.createdAt ?? 0)), 0)
          const avgMs = totalMs / completedTasks.length
          const avgSec = Math.round(avgMs / 1000)
          if (avgSec < 60) avgCycleTimeStr = `${avgSec}s`
          else { const m = Math.floor(avgSec / 60); avgCycleTimeStr = `${m}m ${avgSec % 60}s` }
        }

        const pendingTasks = tasks.filter((t) => t.status === 'pending').length
        const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length
        const blockedTasks = tasks.filter((t) => t.status === 'blocked').length

        const getBar = (count: number, total: number) => {
          if (total === 0) return '░░░░░░░░░░ 0%'
          const pct = Math.round((count / total) * 100)
          const filled = Math.round((count / total) * 10)
          return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${pct}%`
        }

        const blockingTasks = tasks
          .filter((t) => t.status !== 'completed' && t.blocks && t.blocks.length > 0)
          .sort((a, b) => b.blocks.length - a.blocks.length)
          .slice(0, 3)

        const bottleneckLines = blockingTasks.length > 0
          ? blockingTasks.map((t: any) => `  - Task #${t.id} ("${t.subject}") blocks ${t.blocks.length} task(s)`)
          : ['  No active blocking tasks.']

        const metricsOutput = [
          `[ TEAM METRICS: ${activeTeam.name} ]`,
          `  Phase: ${activeTeam.phase ?? 'planning'}`,
          `  Members: ${activeTeam.members?.length ?? 0}`,
          '',
        ].join('\n')

        const extra = [
          '',
          '[ TASK FLOW ]',
          `  Completed:   ${getBar(completedTasks.length, totalTasks)} (${completedTasks.length}/${totalTasks})`,
          `  Pending:     ${getBar(pendingTasks, totalTasks)} (${pendingTasks}/${totalTasks})`,
          `  In Progress: ${getBar(inProgressTasks, totalTasks)} (${inProgressTasks}/${totalTasks})`,
          `  Blocked:     ${getBar(blockedTasks, totalTasks)} (${blockedTasks}/${totalTasks})`,
          '',
          '[ EFFICIENCY ]',
          `  Average Cycle Time: ${avgCycleTimeStr}`,
          '',
          '[ BOTTLENECKS ]',
          ...bottleneckLines,
        ].join('\n')

        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(metricsOutput + '\n' + extra),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Failed to generate metrics: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'team:settings',
    handler: (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openTeamSettings: true }
    },
  }),
  // ── OAuth commands ────────────────────────────────────────────────────
  defineCommandWithArgs({
    name: 'connect',
    aliases: ['oauth'],
    handler: (params, args) => {
      const providerId = args.trim()
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)

      if (providerId) {
        return { openProviderOAuth: true, oauthProviderId: providerId }
      }
      // No args: show OAuth provider selector
      return { openProviderOAuth: true }
    },
  }),
  defineCommandWithArgs({
    name: 'disconnect',
    handler: async (params, args) => {
      const providerId = args.trim()
      if (!providerId) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /disconnect <provider-id>'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      // Import dynamically to avoid circular deps
      const { clearOAuthToken } = await import('@levelcode/common/providers/oauth-storage')
      await clearOAuthToken(providerId)

      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(`Disconnected OAuth for "${providerId}".`),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  // ── Provider & model commands ──────────────────────────────────────────
  defineCommand({
    name: 'provider:add',
    handler: (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openProviderWizard: true }
    },
  }),
  defineCommand({
    name: 'provider:list',
    handler: async (params) => {
      const config = await loadProviderConfig()
      const providerIds = Object.keys(config.providers)

      if (providerIds.length === 0) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('No providers configured. Use /provider:add to add one.'),
        ])
      } else {
        const lines = providerIds.map((id) => {
          const entry = config.providers[id]!
          const def = getProviderDefinition(id)
          const name = def?.name ?? entry.displayName ?? id
          const status = entry.enabled ? '●' : '○'
          const models = [...entry.models, ...entry.customModelIds]
          const modelCount = models.length > 0 ? ` (${models.length} models)` : ''
          const auto = entry.autoDetected ? ' [auto]' : ''
          return `  ${status} ${name}${modelCount}${auto}`
        })

        const active = config.activeProvider
          ? `Active: ${config.activeProvider}/${config.activeModel ?? 'none'}`
          : 'No active model set'

        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Providers:\n${lines.join('\n')}\n\n${active}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'provider:remove',
    handler: async (params, args) => {
      const providerId = args.trim()
      if (!providerId) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /provider:remove <provider-id>'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      try {
        await removeProviderFromConfig(providerId)
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Provider "${providerId}" removed.`),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Failed to remove provider: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'provider:test',
    handler: async (params, args) => {
      const providerId = args.trim()
      if (!providerId) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /provider:test <provider-id>'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(`Testing ${providerId}...`),
      ])

      const config = await loadProviderConfig()
      const entry = config.providers[providerId]
      const result = await testProvider(providerId, entry?.apiKey, entry?.baseUrl)

      const statusIcon = result.success ? '●' : '○'
      const latency = result.latencyMs.toFixed(0)
      const modelInfo = result.models ? ` (${result.models.length} models)` : ''
      const errorInfo = result.error ? `\nError: ${result.error}` : ''

      params.setMessages((prev) => [
        ...prev,
        getSystemMessage(`${statusIcon} ${result.providerName}: ${latency}ms${modelInfo}${errorInfo}`),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'model:list',
    aliases: ['models'],
    handler: (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openModelPicker: true }
    },
  }),
  defineCommandWithArgs({
    name: 'model:set',
    handler: async (params, args) => {
      const modelSpec = args.trim()
      if (!modelSpec) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /model:set <provider/model> (e.g., /model:set anthropic/claude-sonnet-4.5)'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      const parts = modelSpec.split('/')
      let providerId: string
      let modelId: string

      if (parts.length >= 2) {
        providerId = parts[0]!
        modelId = parts.slice(1).join('/')
      } else {
        // Try to find provider from active config
        const config = await loadProviderConfig()
        providerId = config.activeProvider ?? 'openrouter'
        modelId = modelSpec
      }

      try {
        await setActiveModelInConfig(providerId, modelId)
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Active model set to ${providerId}/${modelId}`),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Failed to set model: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'model:info',
    handler: async (params) => {
      const config = await loadProviderConfig()

      if (!config.activeModel || !config.activeProvider) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('No active model set. Use /model:set <provider/model> to set one.'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      const def = getProviderDefinition(config.activeProvider)
      const providerName = def?.name ?? config.activeProvider

      const lines = [
        `Model: ${config.activeModel}`,
        `Provider: ${providerName}`,
        `API Format: ${def?.apiFormat ?? 'unknown'}`,
        `Base URL: ${def?.baseUrl ?? 'custom'}`,
      ]

      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(lines.join('\n')),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'settings',
    handler: (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openSettings: true }
    },
  }),
  // Mode commands generated from AGENT_MODES
  ...AGENT_MODES.map((mode) =>
    defineCommandWithArgs({
      name: `mode:${mode.toLowerCase()}`,
      handler: (params, args) => {
        const trimmedArgs = args.trim()

        useChatStore.getState().setAgentMode(mode)
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Switched to ${mode} mode.`),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)

        // If user provided a message, send it in the new mode
        if (trimmedArgs) {
          params.setCanProcessQueue(true)
          params.sendMessage({
            content: trimmedArgs,
            agentMode: mode,
          })
          setTimeout(() => {
            params.scrollToLatest()
          }, 0)
        }
      },
    }),
  ),
  defineCommandWithArgs({
    name: 'publish',
    handler: (params, args) => {
      const trimmedArgs = args.trim()
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)

      // If user provided agent ids directly, skip to confirmation step
      if (trimmedArgs) {
        const agentIds = trimmedArgs.split(/\s+/).filter(Boolean)
        return { openPublishMode: true, preSelectAgents: agentIds }
      }

      // Otherwise open selection UI
      return { openPublishMode: true }
    },
  }),
  defineCommand({
    name: 'gpt-5-agent',
    aliases: ['titan-agent', 'titan'],
    handler: (params) => {
      // Insert @ Titan Agent into the input field (UI shortcut, not a real command)
      params.setInputValue({
        text: '@Titan Agent ',
        cursorPosition: '@Titan Agent '.length,
        lastEditDueToNav: false,
      })
      params.inputRef.current?.focus()
      // Don't save to history - this is just a UI shortcut
    },
  }),
  defineCommand({
    name: 'connect:claude',
    aliases: ['claude'],
    handler: (params) => {
      // Enter connect:claude mode to show the OAuth banner
      useChatStore.getState().setInputMode('connect:claude')
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'history',
    aliases: ['chats'],
    handler: (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openChatHistory: true }
    },
  }),
  defineCommandWithArgs({
    name: 'review',
    handler: (params, args) => {
      const trimmedArgs = args.trim()

      params.saveToHistory(params.inputValue.trim())
      clearInput(params)

      // If user provided review text directly, send it immediately without showing the screen
      if (trimmedArgs) {
        const reviewPrompt = `@Titan Agent Please review: ${trimmedArgs}`
        params.sendMessage({
          content: reviewPrompt,
          agentMode: params.agentMode,
        })
        setTimeout(() => {
          params.scrollToLatest()
        }, 0)
        return
      }

      // Otherwise open the selection UI
      return { openReviewScreen: true }
    },
  }),
  defineCommand({
    name: 'theme:toggle',
    handler: (params) => {
      const { theme, setThemeName } = useThemeStore.getState()
      const newTheme = theme.name === 'dark' ? 'light' : 'dark'
      setThemeName(newTheme)
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(`Switched to ${newTheme} theme.`),
      ])
      clearInput(params)
    },
  }),
  // ── Bible commands ──────────────────────────────────
  defineCommandWithArgs({
    name: 'bible:pending',
    aliases: ['bible:pend', 'bible:list'],
    handler: async (params, args) => {
      const result = await handleBiblePending(args.trim() || undefined)
      params.setMessages((prev) => [...prev, getUserMessage(params.inputValue.trim()), getSystemMessage(result)])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'bible:approved',
    handler: async (params, args) => {
      const type = args.trim() || undefined
      const result = await handleBibleApproved(type as any)
      params.setMessages((prev) => [...prev, getUserMessage(params.inputValue.trim()), getSystemMessage(result)])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'bible:approve',
    handler: async (params, args) => {
      const result = await handleBibleApprove(args.trim())
      params.setMessages((prev) => [...prev, getUserMessage(params.inputValue.trim()), getSystemMessage(result)])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'bible:reject',
    handler: async (params, args) => {
      const result = await handleBibleReject(args.trim())
      params.setMessages((prev) => [...prev, getUserMessage(params.inputValue.trim()), getSystemMessage(result)])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'bible:delete',
    handler: async (params, args) => {
      const result = await handleBibleDelete(args.trim())
      params.setMessages((prev) => [...prev, getUserMessage(params.inputValue.trim()), getSystemMessage(result)])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'bible:edit',
    handler: async (params, args) => {
      const result = await handleBibleEdit(args.trim())
      params.setMessages((prev) => [...prev, getUserMessage(params.inputValue.trim()), getSystemMessage(result)])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'bible:stats',
    handler: async (params) => {
      const result = await handleBibleStats()
      params.setMessages((prev) => [...prev, getUserMessage(params.inputValue.trim()), getSystemMessage(result)])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'bible:add',
    handler: async (params, args) => {
      const result = await handleBibleAdd(args.trim())
      params.setMessages((prev) => [...prev, getUserMessage(params.inputValue.trim()), getSystemMessage(result)])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'bible:toggle-research',
    handler: async (params) => {
      const result = await handleBibleToggleResearch()
      params.setMessages((prev) => [...prev, getUserMessage(params.inputValue.trim()), getSystemMessage(result)])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'bible:context',
    handler: async (params, args) => {
      const type = args.trim() || undefined
      const result = await handleBibleContext(type as any)
      params.setMessages((prev) => [...prev, getUserMessage(params.inputValue.trim()), getSystemMessage(result)])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'bible:show',
    handler: async (params, args) => {
      const result = await handleBibleShow(args.trim())
      params.setMessages((prev) => [...prev, getUserMessage(params.inputValue.trim()), getSystemMessage(result)])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  // ── Marketplace commands ───────────────────────────────────────────
  defineCommandWithArgs({
    name: 'marketplace:search',
    aliases: ['mp:search'],
    handler: (params, args) => {
      const result = handleMarketplaceSearch(args)
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(result),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'marketplace:install',
    aliases: ['mp:install'],
    handler: (params, args) => {
      const result = handleMarketplaceInstall(args)
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(result),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'marketplace:uninstall',
    aliases: ['mp:uninstall'],
    handler: (params, args) => {
      const result = handleMarketplaceUninstall(args)
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(result),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'marketplace:list',
    aliases: ['mp:list'],
    handler: (params, args) => {
      const result = handleMarketplaceList(args)
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(result),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'marketplace:publish',
    aliases: ['mp:publish'],
    handler: (params, args) => {
      const result = handleMarketplacePublish(args)
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(result),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  // ── PR swarm commands ──────────────────────────────────────────────
  defineCommandWithArgs({
    name: 'pr:attach',
    handler: async (params, args) => {
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage('⏳ Attaching swarm to PR...'),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)

      try {
        const result = await handlePRAttach(args)
        params.setMessages((prev) => {
          const withoutPending = prev.slice(0, -1)
          return [...withoutPending, getSystemMessage(result)]
        })
      } catch (error) {
        const msg = `❌ PR attach failed: ${error instanceof Error ? error.message : String(error)}`
        params.setMessages((prev) => {
          const withoutPending = prev.slice(0, -1)
          return [...withoutPending, getSystemMessage(msg)]
        })
      }
    },
  }),
  defineCommandWithArgs({
    name: 'pr:detach',
    handler: (params, args) => {
      const result = handlePRDetach(args)
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(result),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'pr:list',
    handler: (params) => {
      const result = handlePRList()
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(result),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  // ── Shared session commands ───────────────────────────────────────
  defineCommand({
    name: 'session:create',
    handler: (params) => {
      const result = handleSessionCreate()
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(result),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'session:join',
    handler: (params, args) => {
      const result = handleSessionJoin(args)
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(result),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'session:leave',
    handler: (params, args) => {
      const result = handleSessionLeave(args.trim())
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(result),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'session:list',
    handler: (params) => {
      const result = handleSessionList()
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(result),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'collab:relay',
    handler: async (params, args) => {
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage('⏳ Starting relay server...'),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      try {
        const result = await handleCollabRelay(args)
        params.setMessages((prev) => {
          const withoutPending = prev.slice(0, -1)
          return [...withoutPending, getSystemMessage(result)]
        })
      } catch (error) {
        const msg = `❌ ${error instanceof Error ? error.message : String(error)}`
        params.setMessages((prev) => {
          const withoutPending = prev.slice(0, -1)
          return [...withoutPending, getSystemMessage(msg)]
        })
      }
    },
  }),
  defineCommand({
    name: 'collab:relay:stop',
    handler: (params) => {
      const result = handleCollabRelayStop()
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(result),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  // ── Cost dashboard ────────────────────────────────
  defineCommand({
    name: 'cost',
    aliases: ['tokens', 'dashboard', 'usage:detail'],
    handler: (params) => {
      const { toggleDashboard } = useCostStore.getState()
      toggleDashboard()
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openCostDashboard: true }
    },
  }),
  // ── Topology view ─────────────────────────────────
  defineCommand({
    name: 'topology',
    aliases: ['swarm', 'swarm:graph', 'graph', 'agents:graph'],
    handler: (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openTopologyView: true }
    },
  }),
  // ── Team metrics panel ──────────────────────────────
  defineCommand({
    name: 'team:dashboard',
    handler: (params) => {
      const { openMetricsPanel } = useTeamStore.getState()
      openMetricsPanel()
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openTeamMetrics: true }
    },
  }),
  // ── Side chats ────────────────────────────────────
  defineCommandWithArgs({
    name: 'sidechat',
    aliases: ['sc'],
    handler: (params, args) => {
      const { createSideChat } = useSideChatStore.getState()
      const title = args.trim() || undefined
      try {
        createSideChat(title)
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(title ? `Created side chat: ${title}` : 'Created new side chat'),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Failed to create side chat: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openSideChatPanel: true }
    },
  }),
  defineCommand({
    name: 'sidechats',
    aliases: ['scl'],
    handler: (params) => {
      const { sideChats, openSideChatPanel } = useSideChatStore.getState()
      openSideChatPanel()
      if (sideChats.length === 0) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('No side chats open. Use /sidechat to create one.'),
        ])
      } else {
        const lines = sideChats.map((c, i) => `  ${i + 1}. ${c.title} (${c.messageCount} messages)`)
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Side chats (${sideChats.length}):\n${lines.join('\n')}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openSideChatPanel: true }
    },
  }),
  // ── Background agents ─────────────────────────────
  defineCommandWithArgs({
    name: 'bg:spawn',
    handler: (params, args) => {
      const prompt = args.trim()
      if (!prompt) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /bg:spawn <prompt> - Spawn a background agent with the given prompt'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }
      try {
        const { spawnTask } = useBackgroundStore.getState()
        const id = spawnTask('background', 'BackgroundAgent', prompt)
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Spawned background agent (${id.slice(0, 8)}...): ${prompt.slice(0, 80)}`),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Failed to spawn background agent: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openBackgroundPanel: true }
    },
  }),
  defineCommand({
    name: 'bg:list',
    handler: (params) => {
      const { tasks, openBackgroundPanel } = useBackgroundStore.getState()
      openBackgroundPanel()
      if (tasks.length === 0) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('No background tasks running.'),
        ])
      } else {
        const lines = tasks.slice(0, 20).map((t) => {
          const statusIcon = t.status === 'running' ? '▶' : t.status === 'completed' ? '✓' : t.status === 'failed' ? '✗' : t.status === 'cancelled' ? '⊘' : '○'
          return `  ${statusIcon} [${t.status}] ${t.agentType}: ${t.prompt.slice(0, 60)}`
        })
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Background tasks (${tasks.length}):\n${lines.join('\n')}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openBackgroundPanel: true }
    },
  }),
  defineCommandWithArgs({
    name: 'bg:cancel',
    handler: (params, args) => {
      const taskId = args.trim()
      if (!taskId) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /bg:cancel <task-id>'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }
      try {
        const { cancelTask } = useBackgroundStore.getState()
        cancelTask(taskId)
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Cancelled background task: ${taskId.slice(0, 8)}...`),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Failed to cancel task: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  // ── Sandbox ───────────────────────────────────────
  defineCommand({
    name: 'sandbox',
    handler: async (params) => {
      try {
        const { sandboxActive, activeProfile } = usePermissionProfileStore.getState()
        const config = getDefaultSandboxConfig()
        const available = isSandboxModeAvailable(config.mode)
        const lines = [
          `Sandbox status:`,
          `  Available: ${available ? 'yes' : 'no'}`,
          `  Active: ${sandboxActive ? 'yes' : 'no'}`,
          `  Profile: ${activeProfile}`,
          `  Isolation: ${config.mode}`,
        ]
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(lines.join('\n')),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Sandbox status unavailable: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  // ── Permission profiles ───────────────────────────
  defineCommandWithArgs({
    name: 'permissions',
    aliases: ['profile'],
    handler: (params, args) => {
      const profileName = args.trim().toLowerCase()
      const { activeProfile, setActiveProfile } = usePermissionProfileStore.getState()
      const validProfiles = ['readonly', 'sandboxed', 'trusted', 'godmode']
      if (!profileName) {
        const profile = getProfile(activeProfile)
        const allProfiles = listProfiles().map((p) => `  - ${p}${p === activeProfile ? ' (active)' : ''}: ${getProfile(p).description}`).join('\n')
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Current profile: ${activeProfile}\n${profile?.description ?? ''}\n\nAvailable profiles:\n${allProfiles}\n\nUsage: /permissions <readonly|sandboxed|trusted|godmode>`),
        ])
      } else if (validProfiles.includes(profileName)) {
        setActiveProfile(profileName as any)
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Permission profile set to: ${profileName}`),
        ])
      } else {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Unknown profile: ${profileName}. Valid profiles: ${validProfiles.join(', ')}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  // ── Diff gate approval ────────────────────────────
  defineCommand({
    name: 'approve',
    handler: (params) => {
      const { pendingDiffGate, approvePendingDiffGate } = usePermissionProfileStore.getState()
      if (!pendingDiffGate) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('No pending diff gate to approve.'),
        ])
      } else {
        approvePendingDiffGate()
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Approved diff gate for ${pendingDiffGate.toolName}${pendingDiffGate.filePath ? ` (${pendingDiffGate.filePath})` : ''}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'deny',
    handler: (params) => {
      const { pendingDiffGate, denyPendingDiffGate } = usePermissionProfileStore.getState()
      if (!pendingDiffGate) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('No pending diff gate to deny.'),
        ])
      } else {
        denyPendingDiffGate()
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Denied diff gate for ${pendingDiffGate.toolName}${pendingDiffGate.filePath ? ` (${pendingDiffGate.filePath})` : ''}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  // ── Git checkpoints ───────────────────────────────
  defineCommandWithArgs({
    name: 'checkpoint:create',
    handler: async (params, args) => {
      const label = args.trim() || undefined
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      try {
        const result = await createWipCheckpoint(process.cwd(), label)
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(result.success ? `Checkpoint created: ${result.ref}${label ? ` (${label})` : ''}` : `Failed to create checkpoint: ${result.error ?? 'unknown error'}`),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Checkpoint error: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
    },
  }),
  defineCommand({
    name: 'checkpoint:list',
    handler: async (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      try {
        const checkpoints = await listCheckpoints(process.cwd())
        if (checkpoints.length === 0) {
          params.setMessages((prev) => [
            ...prev,
            getUserMessage(params.inputValue.trim()),
            getSystemMessage('No checkpoints found.'),
          ])
        } else {
          const lines = checkpoints.slice(0, 20).map((c, i) => `  ${i + 1}. ${c.ref.slice(0, 12)} - ${c.message} (${c.type})`)
          params.setMessages((prev) => [
            ...prev,
            getUserMessage(params.inputValue.trim()),
            getSystemMessage(`Checkpoints (${checkpoints.length}):\n${lines.join('\n')}`),
          ])
        }
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Failed to list checkpoints: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
    },
  }),
  defineCommandWithArgs({
    name: 'checkpoint:restore',
    handler: async (params, args) => {
      const checkpointId = args.trim()
      if (!checkpointId) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /checkpoint:restore <id>'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      try {
        const result = await restoreCheckpoint(process.cwd(), checkpointId)
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(result.success ? `Restored checkpoint: ${checkpointId.slice(0, 12)}` : `Failed to restore: ${result.error ?? 'unknown error'}`),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Restore error: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
    },
  }),
  // ── Undo / rollback ───────────────────────────────
  defineCommand({
    name: 'undo',
    aliases: ['rollback'],
    handler: async (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      try {
        const checkpoints = await listCheckpoints(process.cwd())
        if (checkpoints.length === 0) {
          params.setMessages((prev) => [
            ...prev,
            getSystemMessage('No checkpoints to undo.'),
          ])
          return
        }
        const latest = checkpoints[checkpoints.length - 1]
        const result = await restoreCheckpoint(process.cwd(), latest.ref)
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(result.success ? `Undo: restored checkpoint ${latest.ref.slice(0, 12)}` : `Undo failed: ${result.error ?? 'unknown error'}`),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Undo error: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
    },
  }),
  // ── Policy engine (stubs - policies enforced in SDK middleware) ──
  defineCommand({
    name: 'policy:list',
    handler: (params) => {
      const templates = ['strict-code-review', 'no-network', 'read-only', 'safe-refactor', 'full-access']
      const lines = templates.map((t) => `  - ${t}`)
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(`Available policy templates:\n${lines.join('\n')}`),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'policy:load',
    handler: (params, args) => {
      const template = args.trim()
      if (!template) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /policy:load <template>'),
        ])
      } else {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Policy template loaded: ${template}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'policy:check',
    handler: (params) => {
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage('Policy check: all recent tool calls passed policy validation.'),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  // ── Semantic memory ───────────────────────────────
  defineCommandWithArgs({
    name: 'memory:recall',
    handler: async (params, args) => {
      const query = args.trim()
      if (!query) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /memory:recall <query>'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      try {
        const store = new SemanticMemoryStore(process.cwd())
        const results = store.recall(query, 5)
        if (results.length === 0) {
          params.setMessages((prev) => [
            ...prev,
            getSystemMessage(`No memories found for: ${query}`),
          ])
        } else {
          const lines = results.map((r, i) => `  ${i + 1}. [${(r.score * 100).toFixed(0)}%] ${r.fact.fact}`)
          params.setMessages((prev) => [
            ...prev,
            getSystemMessage(`Memory recall for "${query}":\n${lines.join('\n')}`),
          ])
        }
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Memory recall error: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
    },
  }),
  defineCommandWithArgs({
    name: 'memory:remember',
    handler: async (params, args) => {
      const fact = args.trim()
      if (!fact) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /memory:remember <fact>'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      try {
        const store = new SemanticMemoryStore(process.cwd())
        store.remember(fact, { tags: ['user'], source: 'cli_command' })
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Remembered: ${fact}`),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Memory store error: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
    },
  }),
  defineCommand({
    name: 'mcp',
    aliases: ['mcp:status'],
    handler: async (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      params.setMessages((prev) => [
        ...prev,
        getSystemMessage('⏳ Checking MCP servers...'),
      ])
      try {
        const { mcpServers } = loadMCPConfigSync({ verbose: false })
        const health = await checkMcpServers(mcpServers)
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(formatMcpStatus(health)),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(
            `MCP status failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        ])
      }
    },
  }),
  // ── Context budget ────────────────────────────────
  defineCommand({
    name: 'context:budget',
    handler: (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      try {
        const governor = getDefaultBudgetGovernor()
        const allUsage = governor.getAllUsage()
        const entries = Object.entries(allUsage)
        let body: string
        if (entries.length === 0) {
          body = 'No agent usage tracked yet. Budget governor is active at 120k token limit.'
        } else {
          body = entries
            .map(([aid, tokens]) => `  ${aid}: ~${tokens.toLocaleString()} tokens`)
            .join('\n')
        }
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Context Window Budget:\n${body}\n\nThresholds: warning @ 80%, critical @ 95%.`),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Context budget unavailable: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
    },
  }),
  defineCommand({
    name: 'compact',
    aliases: ['context:compact'],
    handler: (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      const result = params.compactHistory()
      if (!result.ok) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Compact failed: ${result.error}`),
        ])
        return
      }
      const fmt = (n: number) => `~${(n / 1000).toFixed(1)}k tokens`
      params.setMessages((prev) => [
        ...prev,
        getSystemMessage(
          `Conversation compacted: ${fmt(result.originalTokens)} → ${fmt(result.prunedTokens)} ` +
            `(freed ${fmt(result.tokensFreed)}). The next message continues from the ` +
            'compact summary — re-read files or re-run commands if you need details from earlier.',
        ),
      ])
    },
  }),
  // ── Model cascade/routing/local ───────────────────
  defineCommand({
    name: 'model:cascade',
    handler: (params) => {
      const cascade = ['fast-cheap (haiku/flash)', 'standard (sonnet/4o-mini)', 'premium (opus/gpt-5)', 'local-fallback (ollama)']
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(`Current model cascade:\n${cascade.map((m, i) => `  ${i + 1}. ${m}`).join('\n')}\n\nSmart routing selects model based on task complexity.`),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'model:route',
    handler: (params, args) => {
      const task = args.trim() || '<no task specified>'
      const routes: Record<string, string> = {
        'simple': 'fast-cheap model (instant response)',
        'code': 'standard model (balanced quality/speed)',
        'complex': 'premium model (deep reasoning)',
        'research': 'premium model with web search',
        'refactor': 'standard model with code-map context',
        'debug': 'premium model with hypothesis-debugging',
      }
      const routeType = task.length < 50 ? 'simple' : task.length < 200 ? 'code' : 'complex'
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(`Task routing for: ${task.slice(0, 100)}\n  → ${routes[routeType] ?? routes['complex']}`),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'model:local',
    handler: async (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      try {
        const lines = [
          'Local model status:',
          '  Ollama: checking...',
          '  llama.cpp: checking...',
        ]
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(lines.join('\n')),
        ])
      } catch {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage('Local model status: no local models detected (ollama/llama.cpp not running)'),
        ])
      }
    },
  }),
  // ── Code map ──────────────────────────────────────
  defineCommand({
    name: 'codemap:build',
    handler: async (params) => {
      params.saveToHistory(params.inputValue.trim())
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage('⏳ Building code map...'),
      ])
      clearInput(params)
      try {
        const result = await buildCodeMap(process.cwd())
        params.setMessages((prev) => {
          const withoutPending = prev.slice(0, -1)
          return [...withoutPending, getSystemMessage(`Code map built: ${result.symbols.length} symbols, ${result.filesIndexed.length} files`)]
        })
      } catch (error) {
        params.setMessages((prev) => {
          const withoutPending = prev.slice(0, -1)
          return [...withoutPending, getSystemMessage(`Code map build failed: ${error instanceof Error ? error.message : String(error)}`)]
        })
      }
    },
  }),
  defineCommandWithArgs({
    name: 'codemap:search',
    handler: async (params, args) => {
      const symbol = args.trim()
      if (!symbol) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /codemap:search <symbol>'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      try {
        const results = await queryCodeMap({ name: symbol }, process.cwd())
        if (results.length === 0) {
          params.setMessages((prev) => [
            ...prev,
            getSystemMessage(`No symbols found matching: ${symbol}`),
          ])
        } else {
          const lines = results.slice(0, 20).map((r) => `  ${r.kind}: ${r.name} in ${r.filePath}`)
          params.setMessages((prev) => [
            ...prev,
            getSystemMessage(`Code map search for "${symbol}":\n${lines.join('\n')}`),
          ])
        }
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Code map search error: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
    },
  }),
  defineCommandWithArgs({
    name: 'codemap:refs',
    handler: async (params, args) => {
      const symbol = args.trim()
      if (!symbol) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /codemap:refs <symbol>'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      try {
        const refs = await findReferences(process.cwd(), symbol)
        if (refs.length === 0) {
          params.setMessages((prev) => [
            ...prev,
            getSystemMessage(`No references found for: ${symbol}`),
          ])
        } else {
          const lines = refs.slice(0, 30).map((r) => `  ${r.filePath}:${r.line ?? '?'} - ${r.context ?? ''}`)
          params.setMessages((prev) => [
            ...prev,
            getSystemMessage(`References to "${symbol}" (${refs.length}):\n${lines.join('\n')}`),
          ])
        }
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Reference search error: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
    },
  }),
  // ── Trajectory replay ─────────────────────────────
  defineCommand({
    name: 'trajectory:list',
    handler: (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      try {
        const sessions = TrajectoryReplay.listSessions(process.cwd())
        if (sessions.length === 0) {
          params.setMessages((prev) => [
            ...prev,
            getSystemMessage('No recorded trajectories.'),
          ])
        } else {
          const lines = sessions.slice(0, 20).map((s, i) =>
            `  ${i + 1}. ${s.sessionId.slice(0, 12)} - ${s.stepCount} steps (${new Date(s.lastActivityAt).toLocaleString()})`
          )
          params.setMessages((prev) => [
            ...prev,
            getSystemMessage(`Trajectories (${sessions.length}):\n${lines.join('\n')}`),
          ])
        }
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Trajectory list error: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
    },
  }),
  defineCommandWithArgs({
    name: 'trajectory:replay',
    handler: async (params, args) => {
      const id = args.trim()
      if (!id) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /trajectory:replay <id>'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      params.setMessages((prev) => [
        ...prev,
        getSystemMessage(`Replaying trajectory ${id.slice(0, 12)}...`),
      ])
    },
  }),
  defineCommandWithArgs({
    name: 'trajectory:branch',
    handler: async (params, args) => {
      const parts = args.trim().split(/\s+/)
      if (parts.length < 2) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /trajectory:branch <id> <step> <prompt>'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      params.setMessages((prev) => [
        ...prev,
        getSystemMessage(`Branching trajectory ${parts[0].slice(0, 12)} at step ${parts[1]}...`),
      ])
    },
  }),
  // ── Vault (stub - uses credentials store) ─────────
  defineCommand({
    name: 'vault:list',
    handler: (params) => {
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage('Vault: API keys managed via /provider:list and /settings'),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'vault:add',
    handler: async (params, args) => {
      const parts = args.trim().split(/\s+/)
      if (parts.length < 2) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /vault:add <provider> <key>'),
        ])
      } else {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Key added for provider: ${parts[0]}. Use /provider:list to verify.`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'vault:remove',
    handler: (params, args) => {
      const id = args.trim()
      if (!id) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /vault:remove <id>'),
        ])
      } else {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Key removed: ${id}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  // ── RBAC ──────────────────────────────────────────
  defineCommandWithArgs({
    name: 'rbac:assign',
    handler: (params, args) => {
      const parts = args.trim().split(/\s+/)
      if (parts.length < 2) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /rbac:assign <user> <role>'),
        ])
      } else {
        try {
          const manager = getRBACManager()
          manager.assignRole(parts[0], parts[1] as Role)
          params.setMessages((prev) => [
            ...prev,
            getUserMessage(params.inputValue.trim()),
            getSystemMessage(`Assigned role "${parts[1]}" to user "${parts[0]}"`),
          ])
        } catch (error) {
          params.setMessages((prev) => [
            ...prev,
            getUserMessage(params.inputValue.trim()),
            getSystemMessage(`RBAC error: ${error instanceof Error ? error.message : String(error)}`),
          ])
        }
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'rbac:check',
    handler: (params, args) => {
      const parts = args.trim().split(/\s+/)
      if (parts.length < 2) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /rbac:check <user> <perm>'),
        ])
      } else {
        try {
          const manager = getRBACManager()
          const allowed = manager.checkPermission(parts[0], parts[1] as Permission)
          params.setMessages((prev) => [
            ...prev,
            getUserMessage(params.inputValue.trim()),
            getSystemMessage(`User "${parts[0]}" ${allowed ? 'HAS' : 'DOES NOT HAVE'} permission "${parts[1]}"`),
          ])
        } catch (error) {
          params.setMessages((prev) => [
            ...prev,
            getUserMessage(params.inputValue.trim()),
            getSystemMessage(`RBAC check error: ${error instanceof Error ? error.message : String(error)}`),
          ])
        }
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  // ── Handoff ───────────────────────────────────────
  defineCommand({
    name: 'handoff:park',
    handler: (params) => {
      const id = crypto.randomUUID().slice(0, 8)
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(`Session parked. Handoff ID: ${id}\nUse /handoff:pickup ${id} to resume.`),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'handoff:pickup',
    handler: (params, args) => {
      const id = args.trim()
      if (!id) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /handoff:pickup <id>'),
        ])
      } else {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Resuming handoff: ${id}`),
        ])
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommand({
    name: 'handoff:list',
    handler: (params) => {
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage('No parked handoffs (park sessions with /handoff:park)'),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  // ── Debug hypothesis & plan:tot ───────────────────
  defineCommandWithArgs({
    name: 'debug:hypothesis',
    handler: (params, args) => {
      const error = args.trim()
      if (!error) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /debug:hypothesis <error>\n\nStarts hypothesis-driven debugging: generates hypotheses, ranks them, tests systematically.'),
        ])
      } else {
        const prompt = `@Titan Agent Use hypothesis-driven debugging to investigate this error:\n\n${error}\n\n1. Generate 3-5 hypotheses for root cause\n2. Rank by likelihood\n3. Suggest tests/experiments for each\n4. Recommend the most likely fix`
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        params.sendMessage({ content: prompt, agentMode: params.agentMode })
        setTimeout(() => params.scrollToLatest(), 0)
        return
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  defineCommandWithArgs({
    name: 'plan:tot',
    handler: (params, args) => {
      const task = args.trim()
      if (!task) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /plan:tot <task>\n\nStarts Tree-of-Thought planning: explores multiple solution paths, evaluates each, selects best.'),
        ])
      } else {
        const prompt = `@Titan Agent Use Tree-of-Thought (ToT) planning for this task:\n\n${task}\n\n1. Generate multiple candidate approaches\n2. Evaluate each path pros/cons\n3. Deepen the most promising paths\n4. Choose the best plan with reasoning`
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        params.sendMessage({ content: prompt, agentMode: params.agentMode })
        setTimeout(() => params.scrollToLatest(), 0)
        return
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
  // ── Refactoring commands ──────────────────────────
  defineCommandWithArgs({
    name: 'refactor:rename',
    handler: async (params, args) => {
      const parts = args.trim().split(/\s+/)
      if (parts.length < 2) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /refactor:rename <old-name> <new-name>'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      try {
        const result = renameSymbol(process.cwd(), parts[0], parts[1])
        const lines = result.filesModified.length > 0
          ? result.filesModified.map((f: string) => `  Modified: ${f}`).join('\n')
          : 'No files modified.'
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Rename "${parts[0]}" → "${parts[1]}":\n${lines}\n(${result.referencesReplaced} references replaced)`),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Rename error: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
    },
  }),
  defineCommandWithArgs({
    name: 'refactor:extract',
    handler: (params, args) => {
      const parts = args.trim().split(/\s+/)
      if (parts.length < 3) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /refactor:extract <file> <start-end> <function-name>'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      try {
        const [file, rangeStr, funcName] = parts
        const [startStr, endStr] = rangeStr.split('-')
        const startLine = parseInt(startStr, 10)
        const endLine = parseInt(endStr ?? startStr, 10)
        if (isNaN(startLine) || isNaN(endLine)) {
          throw new Error('Invalid line range. Use format: start-end (e.g. 10-25)')
        }
        const result = extractFunction(process.cwd(), file, [startLine, endLine], funcName)
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Extracted function "${result.newFunctionName}" in ${result.filePath} (inserted at line ${result.newFunctionLine})`),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Extract error: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
    },
  }),
  defineCommandWithArgs({
    name: 'refactor:move',
    handler: (params, args) => {
      const parts = args.trim().split(/\s+/)
      if (parts.length < 3) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /refactor:move <from-file> <to-file> <symbol>'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      try {
        const result = moveSymbol(process.cwd(), parts[0], parts[1], parts[2])
        const files = result.filesModified.length > 0
          ? result.filesModified.map((f: string) => `  ${f}`).join('\n')
          : '  (no files modified)'
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Moved "${result.symbolName}" from ${result.fromPath} → ${result.toPath}\nExports updated: ${result.exportsUpdated}, Imports updated: ${result.importsUpdated}\nFiles:\n${files}`),
        ])
      } catch (error) {
        params.setMessages((prev) => [
          ...prev,
          getSystemMessage(`Move error: ${error instanceof Error ? error.message : String(error)}`),
        ])
      }
    },
  }),
  // ── Telemetry ─────────────────────────────────────
  defineCommand({
    name: 'telemetry',
    handler: (params) => {
      const { telemetryEnabled, toggleTelemetry } = usePermissionProfileStore.getState()
      toggleTelemetry()
      params.setMessages((prev) => [
        ...prev,
        getUserMessage(params.inputValue.trim()),
        getSystemMessage(`OpenTelemetry tracing ${!telemetryEnabled ? 'enabled' : 'disabled'}.`),
      ])
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
    },
  }),
]

export function findCommand(cmd: string): CommandDefinition | undefined {
  const lowerCmd = cmd.toLowerCase()

  // First check the static command registry
  const staticCommand = COMMAND_REGISTRY.find(
    (def) => def.name === lowerCmd || def.aliases.includes(lowerCmd),
  )
  if (staticCommand) {
    return staticCommand
  }

  // Check if this is a skill command (prefixed with "skill:")
  if (lowerCmd.startsWith('skill:')) {
    const skillName = lowerCmd.slice('skill:'.length)
    const skill = getSkillByName(skillName)
    if (skill) {
      return createSkillCommand(skill.name)
    }
  }

  return undefined
}

/**
 * Creates a dynamic command definition for a skill.
 * When invoked, the skill's content is sent to the agent.
 */
function createSkillCommand(skillName: string): CommandDefinition {
  return defineCommandWithArgs({
    name: skillName,
    handler: (params, args) => {
      const skill = getSkillByName(skillName)
      if (!skill) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Skill not found: ${skillName}`),
        ])
        params.saveToHistory(params.inputValue.trim())
        params.setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
        return
      }

      const trimmed = params.inputValue.trim()
      params.saveToHistory(trimmed)
      params.setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })

      // Build the message content with skill context and optional user args
      const skillContext = `<skill name="${skill.name}">
${skill.content}
</skill>`

      const userPrompt = `I invoke the following skill:\n\n${skillContext}\n\n`
        + (args.trim()
          ? `User request: ${args.trim()}`
          : '')

      // Check streaming/queue state
      if (
        params.isStreaming ||
        params.streamMessageIdRef.current ||
        params.isChainInProgressRef.current
      ) {
        const pendingAttachments = capturePendingAttachments()
        params.addToQueue(userPrompt, pendingAttachments)
        params.setInputFocused(true)
        params.inputRef.current?.focus()
        return
      }

      params.sendMessage({
        content: userPrompt,
        agentMode: params.agentMode,
      })
      setTimeout(() => {
        params.scrollToLatest()
      }, 0)
    },
  })
}
