import { API_KEY_ENV_VAR } from '@levelcode/common/constants/paths'

import { WEBSITE_URL } from './constants'
import { getLevelCodeApiKeyFromEnv, isStandaloneMode } from './env'
import { run } from './run'
import {
  sdkCreateTeam,
  sdkDeleteTeam,
  sdkGetTeamStatus,
  sdkListTeams,
} from './team'

import type { RunOptions, LevelCodeClientOptions } from './run'
import type { RunState } from './run-state'
import type { CreateTeamOptions, TeamStatus, RunWithTeamOptions } from './team'
import type { TeamConfig } from '@levelcode/common/types/team-config'
import type { TeamSummary } from '@levelcode/common/utils/team-discovery'

export class LevelCodeClient {
  public options: LevelCodeClientOptions & {
    apiKey: string
    fingerprintId: string
  }

  constructor(options: LevelCodeClientOptions) {
    const foundApiKey = options.apiKey ?? getLevelCodeApiKeyFromEnv() ?? (isStandaloneMode() ? 'standalone-mode' : undefined)
    if (!foundApiKey) {
      throw new Error(
        `LevelCode API key not found. Please provide an apiKey in the constructor of LevelCodeClient or set the ${API_KEY_ENV_VAR} environment variable.`,
      )
    }

    this.options = {
      apiKey: foundApiKey,
      handleEvent: (event) => {
        if (event.type === 'error') {
          throw new Error(
            `Received error: ${event.message}.\n\nProvide a handleEvent function to handle this error.`,
          )
        }
      },
      fingerprintId: `levelcode-sdk-${Math.random().toString(36).substring(2, 15)}`,
      ...options,
    }
  }

  /**
   * Run a LevelCode agent with the specified options.
   *
   * @param agent - The agent to run. Use 'base' for the default agent, or specify a custom agent ID if you made your own agent config.
   * @param prompt - The user prompt describing what you want the agent to do.
   * @param params - (Optional) Additional parameters for the agent. Most agents don't use this, but some custom agents can take a JSON object as input in addition to the user prompt string.
   * @param handleEvent - (Optional) Callback function that receives every event during execution (assistant messages, tool calls, etc.). This allows you to stream the agent's progress in real-time. We will likely add a token-by-token streaming callback in the future.
   * @param previousRun - (Optional) JSON state returned from a previous run() call. Use this to continue a conversation or session with the agent, maintaining context from previous interactions.
   * @param projectFiles - (Optional) All the files in your project as a plain JavaScript object. Keys should be the full path from your current directory to each file, and values should be the string contents of the file. Example: { "src/index.ts": "console.log('hi')" }. This helps LevelCode pick good source files for context.
   * @param knowledgeFiles - (Optional) Knowledge files to inject into every run() call. Uses the same schema as projectFiles - keys are file paths and values are file contents. These files are added directly to the agent's context.
   * @param agentDefinitions - (Optional) Array of custom agent definitions. Each object should satisfy the AgentDefinition type. You can input the agent's id field into the agent parameter to run that agent.
   * @param customToolDefinitions - (Optional) Array of custom tool definitions that extend the agent's capabilities. Each tool definition includes a name, Zod schema for input validation, and a handler function. These tools can be called by the agent during execution.
   * @param maxAgentSteps - (Optional) Maximum number of steps the agent can take before stopping. Use this as a safety measure in case your agent starts going off the rails. A reasonable number is around 20.
   * @param env - (Optional) Environment variables to pass to terminal commands executed by the agent. These will be merged with the current process environment, with the custom values taking precedence. Can also be provided in individual run() calls to override.
   *
   * @returns A Promise that resolves to a RunState JSON object which you can pass to a subsequent run() call to continue the run. Use result.output to get the agent's output.
   */
  public async run(
    options: RunOptions & LevelCodeClientOptions,
  ): Promise<RunState> {
    return run({ ...this.options, ...options })
  }

  /**
   * Check connection to the LevelCode backend by hitting the /healthz endpoint.
   *
   * @returns Promise that resolves to true if connected, false otherwise
   */
  public async checkConnection(): Promise<boolean> {
    if (isStandaloneMode()) {
      return true
    }

    try {
      const response = await fetch(`${WEBSITE_URL}/api/healthz`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      })

      if (!response.ok) return false

      const result = await response.json()
      return (
        typeof result === 'object' &&
        result !== null &&
        'status' in result &&
        (result as { status?: unknown }).status === 'ok'
      )
    } catch {
      return false
    }
  }

  /**
   * Create a new team for coordinating multiple agents.
   *
   * @param name - Unique name for the team.
   * @param options - Optional configuration including description, phase, preset, members, and settings.
   * @returns The created TeamConfig.
   */
  public createTeam(name: string, options?: CreateTeamOptions): TeamConfig {
    return sdkCreateTeam(name, this.options.fingerprintId, options)
  }

  /**
   * Delete a team and all its associated data (inboxes, tasks).
   *
   * @param name - Name of the team to delete.
   */
  public deleteTeam(name: string): void {
    sdkDeleteTeam(name)
  }

  /**
   * Get the full status of a team including its config, tasks, and member count.
   *
   * @param name - Name of the team.
   * @returns TeamStatus with config, tasks array, and memberCount.
   */
  public getTeamStatus(name: string): TeamStatus {
    return sdkGetTeamStatus(name)
  }

  /**
   * List all teams with summary information (name, phase, member count).
   *
   * @returns Array of TeamSummary objects.
   */
  public listTeams(): TeamSummary[] {
    return sdkListTeams()
  }

  /**
   * Run an agent as part of a team. The agent will be registered as a team member
   * and the run will include team context.
   *
   * @param options - Run options extended with teamName, memberName, and role.
   * @returns A Promise that resolves to a RunState.
   */
  public async runWithTeam(options: RunWithTeamOptions): Promise<RunState> {
    const { teamName, memberName, role, ...runOptions } = options
    const status = sdkGetTeamStatus(teamName)
    const isMember = status.config.members.some(
      (m) => m.name === memberName,
    )
    if (!isMember) {
      throw new Error(
        `Agent "${memberName}" is not a member of team "${teamName}". ` +
          `Current members: ${status.config.members.map((m) => m.name).join(', ')}`,
      )
    }

    const teamContext = [
      `You are agent "${memberName}" with role "${role}" on team "${teamName}".`,
      `Team phase: ${status.config.phase}.`,
      `Team members: ${status.config.members.map((m) => `${m.name} (${m.role})`).join(', ')}.`,
    ].join(' ')

    const augmentedPrompt = `${teamContext}\n\n${runOptions.prompt}`

    return this.run({
      ...runOptions,
      prompt: augmentedPrompt,
    })
  }
}
