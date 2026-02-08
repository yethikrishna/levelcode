import open from 'open'

import { handleAdsEnable, handleAdsDisable } from './ads'
import { useThemeStore } from '../hooks/use-theme'
import { handleHelpCommand } from './help'
import { handleImageCommand } from './image'
import { handleInitializationFlowLocally } from './init'
import { runBashCommand } from './router'
import { handleUsageCommand } from './usage'
import { WEBSITE_URL } from '../login/constants'
import { useChatStore } from '../state/chat-store'
import { useFeedbackStore } from '../state/feedback-store'
import { useLoginStore } from '../state/login-store'
import { useTeamStore } from '../state/team-store'
import { AGENT_MODES } from '../utils/constants'
import { getSystemMessage, getUserMessage } from '../utils/message-history'
import { capturePendingAttachments } from '../utils/pending-attachments'
import { saveSwarmPreference } from '../utils/settings'
import { useTeamSettingsStore } from '../state/team-settings-store'
import { getSkillByName } from '../utils/skill-registry'
import {
  createTeam,
  deleteTeam,
  loadTeamConfig,
  listTasks,
  saveTeamConfig,
} from '@levelcode/common/utils/team-fs'
import { listAllTeams } from '@levelcode/common/utils/team-discovery'
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

import type { PhaseTransitionHookEvent } from '@levelcode/common/types/team-hook-events'
import type { DevPhase, TeamConfig } from '@levelcode/common/types/team-config'

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
  preSelectAgents?: string[]
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
    handler: async (params) => {
      const { postUserMessage } = await handleHelpCommand()
      params.setMessages((prev) => postUserMessage(prev))
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
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
      const teamName = args.trim()
      if (!teamName) {
        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage('Usage: /team:create <name>'),
        ])
        params.saveToHistory(params.inputValue.trim())
        clearInput(params)
        return
      }

      try {
        const config: TeamConfig = {
          name: teamName,
          description: '',
          createdAt: Date.now(),
          leadAgentId: 'user',
          phase: 'planning',
          members: [],
          settings: { maxMembers: 10, autoAssign: false },
        }
        createTeam(config)

        const { setActiveTeam, setSwarmEnabled } = useTeamStore.getState()
        setActiveTeam(config)
        setSwarmEnabled(true)

        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Team "${teamName}" created successfully. Phase: planning`),
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
      // Try the Zustand store first; if empty, discover teams from disk.
      let activeTeam = useTeamStore.getState().activeTeam
      if (!activeTeam) {
        const teams = listAllTeams()
        if (teams.length > 0) {
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

      // Try the Zustand store first; if empty, discover teams from disk.
      let activeTeam = useTeamStore.getState().activeTeam
      if (!activeTeam) {
        const teams = listAllTeams()
        if (teams.length > 0) {
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

        params.setMessages((prev) => [
          ...prev,
          getUserMessage(params.inputValue.trim()),
          getSystemMessage(`Phase transitioned: ${fromPhase} -> ${targetPhase}`),
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
      // Try the Zustand store first; if empty, discover teams from disk.
      let activeTeam = useTeamStore.getState().activeTeam
      if (!activeTeam) {
        const teams = listAllTeams()
        if (teams.length > 0) {
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
    name: 'team:settings',
    handler: (params) => {
      params.saveToHistory(params.inputValue.trim())
      clearInput(params)
      return { openTeamSettings: true }
    },
  }),
  // ── Provider & model commands ──────────────────────────────────────────
  defineCommand({
    name: 'provider:add',
    aliases: ['connect'],
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
