//
// Heavy application bootstrap. Imported lazily by `index.tsx` once we know
// the process is actually starting the TUI — never for `--help`/`--version`.
//
// Every import below is part of the "full boot" cost (SDK bundle, OpenTUI,
// agent runtime). Do not move this module into the launcher's static graph.

import fs from 'fs'
import os from 'os'
import path from 'path'

import { AnalyticsEvent } from '@levelcode/common/constants/analytics-events'
import { getProjectFileTree } from '@levelcode/common/project-file-tree'
import { createCliRenderer } from '@opentui/core'
import { registerTreeSitterWorker } from './generated/tree-sitter-worker'
import { createRoot } from '@opentui/react'
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from '@tanstack/react-query'
import { cyan, green, red, yellow } from 'picocolors'
import React from 'react'

import { App } from './app'
import { handlePublish } from './commands/publish'
import { createProgram, loadPackageVersion } from './cli-flags'
import { runPlainLogin } from './login/plain-login'
import { initializeApp } from './init/init-app'
import { getProjectRoot, setProjectRoot } from './project-files'
import { initAnalytics, trackEvent } from './utils/analytics'
import { isStandaloneMode, startOAuthRefreshManager } from '@levelcode/sdk'

import { useOAuthStore } from './state/oauth-store'
import { getAuthTokenDetails } from './utils/auth'
import { resetLevelCodeClient } from './utils/levelcode-client'
import { initializeAgentRegistry } from './utils/local-agent-registry'
import { clearLogFile, logger } from './utils/logger'
import { shouldShowProjectPicker } from './utils/project-picker'
import { saveRecentProject } from './utils/recent-projects'
import { installProcessCleanupHandlers } from './utils/renderer-cleanup'
import { initializeSkillRegistry } from './utils/skill-registry'
import { detectTerminalTheme } from './utils/terminal-color-detection'
import { setOscDetectedTheme } from './utils/theme-system'

import type { AgentMode } from './utils/constants'
import type { FileTreeNode } from '@levelcode/common/util/file'
import type { ParsedArgs } from './types/cli-args'

// Configure TanStack Query's focusManager for terminal environments
// This is required because there's no browser visibility API in terminal apps
// Without this, refetchInterval won't work because TanStack Query thinks the app is "unfocused"
focusManager.setEventListener(() => {
  // No-op: no event listeners in CLI environment (no window focus/visibility events)
  return () => {}
})
focusManager.setFocused(true)

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes - auth tokens don't change frequently
        gcTime: 10 * 60 * 1000, // 10 minutes - keep cached data a bit longer
        retry: false, // Don't retry failed auth queries automatically
        refetchOnWindowFocus: false, // CLI doesn't have window focus
        refetchOnReconnect: true, // Refetch when network reconnects
        refetchOnMount: false, // Don't refetch on every mount
      },
      mutations: {
        retry: 1, // Retry mutations once on failure
      },
    },
  })
}

function parseArgs(): ParsedArgs {
  const program = createProgram().parse(process.argv)

  const options = program.opts()
  const args = program.args

  const continueFlag = options.continue

  // Determine initial mode from flags (last flag wins if multiple specified)
  let initialMode: AgentMode | undefined
  if (options.free || options.lite) initialMode = 'FREE'
  if (options.max) initialMode = 'MAX'
  if (options.plan) initialMode = 'PLAN'

  // The effort dial scales max steps for every send in this session.
  if (options.effort) {
    const { setEffortLevel } =
      require('./utils/effort') as typeof import('./utils/effort')
    setEffortLevel(options.effort)
  }

  // --worktree resolves synchronously (git exec) before the TUI boots: the
  // whole session then runs inside the worktree.
  let effectiveCwd = options.cwd
  if (options.worktree) {
    // Lazy require keeps the module graph unchanged for non-worktree boots.
    const { createNamedWorktree } =
      require('@levelcode/common/utils/worktree-isolation') as typeof import('@levelcode/common/utils/worktree-isolation')
    effectiveCwd = createNamedWorktree(
      options.cwd ?? process.cwd(),
      options.worktree,
    )
  }

  return {
    initialPrompt: args.length > 0 ? args.join(' ') : null,
    agent: options.agent,
    clearLogs: options.clearLogs || false,
    continue: Boolean(continueFlag),
    continueId:
      typeof continueFlag === 'string' && continueFlag.trim().length > 0
        ? continueFlag.trim()
        : null,
    cwd: effectiveCwd,
    initialMode,
  }
}

async function runCli(): Promise<void> {
  // Compiled-binary workers: OpenTUI's tree-sitter worker cannot be spawned
  // from the exe's virtual filesystem; register a blob-URL worker path
  // before the renderer (and its tree-sitter client) is created.
  registerTreeSitterWorker()

  // Run OSC theme detection BEFORE anything else.
  // This MUST happen before OpenTUI starts because OSC responses come through stdin,
  // and OpenTUI also listens to stdin. Running detection here ensures stdin is clean.
  if (process.stdin.isTTY && process.platform !== 'win32') {
    try {
      const oscTheme = await detectTerminalTheme()
      if (oscTheme) {
        setOscDetectedTheme(oscTheme)
      }
    } catch {
      // Silently ignore OSC detection failures
    }
  }

  const {
    initialPrompt,
    agent,
    clearLogs,
    continue: continueChat,
    continueId,
    cwd,
    initialMode,
  } = parseArgs()

  const isLoginCommand = process.argv[2] === 'login'
  const isPublishCommand = process.argv.includes('publish')
  const hasAgentOverride = Boolean(agent && agent.trim().length > 0)

  await initializeApp({ cwd })

  // Handle login command before rendering the app
  if (isLoginCommand) {
    await runPlainLogin()
    return
  }

  // Show helpful error when no API key is available
  if (!getAuthTokenDetails().token && !isStandaloneMode()) {
    console.error(
      '\n  No API key found. To use LevelCode, set your OpenRouter API key:\n\n' +
      '    export OPENROUTER_API_KEY="sk-or-v1-your-key-here"\n\n' +
      '  Get your API key at: https://openrouter.ai/keys\n',
    )
    process.exit(1)
  }

  // Show project picker only when user starts at the home directory or an ancestor
  const projectRoot = getProjectRoot()
  const homeDir = os.homedir()
  const startCwd = process.cwd()
  const showProjectPicker = shouldShowProjectPicker(startCwd, homeDir)

  // Initialize agent registry (loads user agents via SDK).
  // When --agent is provided, skip local .agents to avoid overrides.
  if (isPublishCommand || !hasAgentOverride) {
    await initializeAgentRegistry()
  }

  // Initialize skill registry (loads skills from .agents/skills)
  await initializeSkillRegistry()

  // Initialize OAuth connection statuses and start background token refresh
  try {
    await useOAuthStore.getState().loadConnectionStatuses()
    startOAuthRefreshManager()
  } catch {
    // OAuth initialization is optional
  }

  // Handle publish command before rendering the app
  if (isPublishCommand) {
    const publishIndex = process.argv.indexOf('publish')
    const agentIds = process.argv.slice(publishIndex + 1)
    const result = await handlePublish(agentIds)

    if (result.success && result.publisherId && result.agents) {
      logger.info(green('✅ Successfully published:'))
      for (const agent of result.agents) {
        logger.info(
          cyan(
            `  - ${agent.displayName} (${result.publisherId}/${agent.id}@${agent.version})`,
          ),
        )
      }
      process.exit(0)
    } else {
      logger.error(red('❌ Publish failed'))
      if (result.error) logger.error(red(`Error: ${result.error}`))
      if (result.details) logger.error(red(result.details))
      if (result.hint) logger.warn(yellow(`Hint: ${result.hint}`))
      process.exit(1)
    }
  }

  // Initialize analytics
  try {
    initAnalytics()

    // Track app launch event
    trackEvent(AnalyticsEvent.APP_LAUNCHED, {
      version: loadPackageVersion(),
      platform: process.platform,
      arch: process.arch,
      hasInitialPrompt: Boolean(initialPrompt),
      hasAgentOverride: hasAgentOverride,
      continueChat,
      initialMode: initialMode ?? 'DEFAULT',
    })
  } catch (error) {
    // Analytics initialization is optional - don't fail the app if it errors
    logger.debug(error, 'Failed to initialize analytics')
  }

  if (clearLogs) {
    clearLogFile()
  }

  const queryClient = createQueryClient()

  const AppWithAsyncAuth = () => {
    // Compute auth state synchronously to avoid a null-state first render.
    // In standalone mode, auth is never required.
    const standalone = isStandaloneMode()
    const initialAuthState = React.useMemo(() => {
      if (standalone) {
        return { requireAuth: false, hasInvalidCredentials: false }
      }
      const apiKey = getAuthTokenDetails().token ?? ''
      if (!apiKey) {
        return { requireAuth: true, hasInvalidCredentials: false }
      }
      return { requireAuth: false, hasInvalidCredentials: true }
    }, [standalone])

    const [requireAuth, setRequireAuth] = React.useState<boolean | null>(
      initialAuthState.requireAuth,
    )
    const [hasInvalidCredentials, setHasInvalidCredentials] = React.useState(
      initialAuthState.hasInvalidCredentials,
    )
    const [fileTree, setFileTree] = React.useState<FileTreeNode[]>([])
    const [currentProjectRoot, setCurrentProjectRoot] =
      React.useState(projectRoot)
    const [showProjectPickerScreen, setShowProjectPickerScreen] =
      React.useState(showProjectPicker)

    const loadFileTree = React.useCallback(async (root: string) => {
      try {
        if (root) {
          const tree = await getProjectFileTree({
            projectRoot: root,
            fs: fs.promises,
          })
          setFileTree(tree)
        }
      } catch (error) {
        // Silently fail - fileTree is optional for @ menu
      }
    }, [])

    React.useEffect(() => {
      loadFileTree(currentProjectRoot)
    }, [currentProjectRoot, loadFileTree])

    // Callback for when user selects a new project from the picker
    const handleProjectChange = React.useCallback(
      async (newProjectPath: string) => {
        // Change process working directory
        process.chdir(newProjectPath)

        // Track directory change (avoid logging full paths for privacy)
        const isGitRepo = fs.existsSync(path.join(newProjectPath, '.git'))
        const pathDepth = newProjectPath.split(path.sep).filter(Boolean).length
        trackEvent(AnalyticsEvent.CHANGE_DIRECTORY, {
          isGitRepo,
          pathDepth,
          isHomeDir: newProjectPath === os.homedir(),
        })
        // Update the project root in the module state
        setProjectRoot(newProjectPath)
        // Reset client to ensure tools use the updated project root
        resetLevelCodeClient()
        // Save to recent projects list
        saveRecentProject(newProjectPath)
        // Update local state
        setCurrentProjectRoot(newProjectPath)
        // Reset file tree state to trigger reload
        setFileTree([])
        // Hide the picker and show the chat
        setShowProjectPickerScreen(false)
      },
      [],
    )

    return (
      <App
        initialPrompt={initialPrompt}
        agentId={agent}
        requireAuth={requireAuth}
        hasInvalidCredentials={hasInvalidCredentials}
        fileTree={fileTree}
        continueChat={continueChat}
        continueChatId={continueId ?? undefined}
        initialMode={initialMode}
        showProjectPicker={showProjectPickerScreen}
        onProjectChange={handleProjectChange}
      />
    )
  }

  const renderer = await createCliRenderer({
    backgroundColor: 'transparent',
    exitOnCtrlC: false,
  })
  installProcessCleanupHandlers(renderer)
  createRoot(renderer).render(
    <QueryClientProvider client={queryClient}>
      <AppWithAsyncAuth />
    </QueryClientProvider>,
  )
}

export { runCli }
