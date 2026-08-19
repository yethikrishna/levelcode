import { AGENT_MODES } from '../utils/constants'

import type { SkillsMap } from '@levelcode/common/types/skill'


export interface SlashCommand {
  id: string
  label: string
  description: string
  aliases?: string[]
  /**
   * If true, this command can be invoked without a leading slash when the
   * input matches the command id exactly (no arguments).
   */
  implicitCommand?: boolean
  /**
   * If set, selecting this command inserts this text into the input field
   * instead of executing a command. Useful for agent shortcuts.
   */
  insertText?: string
}

// Generate mode commands from the AGENT_MODES constant
const MODE_COMMANDS: SlashCommand[] = AGENT_MODES.map((mode) => ({
  id: `mode:${mode.toLowerCase()}`,
  label: `mode:${mode.toLowerCase()}`,
  description: `Switch to ${mode} mode`,
}))

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'help',
    label: 'help',
    description: 'Display keyboard shortcuts and tips',
    aliases: ['h', '?'],
    implicitCommand: true,
  },
  {
    id: 'connect:claude',
    label: 'connect:claude',
    description: 'Connect your Claude Pro/Max subscription',
    aliases: ['claude'],
  },
  {
    id: 'ads:enable',
    label: 'ads:enable',
    description: 'Enable contextual ads and earn credits',
  },
  {
    id: 'ads:disable',
    label: 'ads:disable',
    description: 'Disable contextual ads and stop earning credits',
  },
  {
    id: 'init',
    label: 'init',
    description: 'Create a starter knowledge.md file',
    implicitCommand: true,
  },
  {
    id: 'undo',
    label: 'undo',
    description: 'Undo the last change via git checkpoint restore',
    aliases: ['rollback'],
  },
  {
    id: 'usage',
    label: 'usage',
    description: 'View credits and subscription quota',
    aliases: ['credits'],
  },
  {
    id: 'cost',
    label: 'cost',
    description: 'Toggle live token/cost dashboard (per-agent tokens, $ spent, p95 latency)',
    aliases: ['tokens', 'dashboard', 'usage:detail'],
  },
  {
    id: 'buy-credits',
    label: 'buy-credits',
    description: 'Open the usage page to buy credits',
  },
  {
    id: 'new',
    label: 'new',
    description: 'Clear the conversation history and start a new chat',
    aliases: ['n', 'clear', 'c', 'reset'],
    implicitCommand: true,
  },
  {
    id: 'history',
    label: 'history',
    description: 'Browse and resume past conversations',
    aliases: ['chats'],
  },
  {
    id: 'review',
    label: 'review',
    description: 'Review code changes with Titan Agent',
  },
  {
    id: 'agent:gpt-5',
    label: 'agent:gpt-5',
    description: 'Spawn the Titan agent to help solve complex problems',
    insertText: '@Titan Agent ',
  },
  {
    id: 'feedback',
    label: 'feedback',
    description: 'Share general feedback about LevelCode',
  },
  {
    id: 'bash',
    label: 'bash',
    description: 'Enter bash mode ("!" at beginning enters bash mode)',
    aliases: ['!'],
  },
  {
    id: 'image',
    label: 'image',
    description: 'Attach an image file (or Ctrl+V to paste from clipboard)',
    aliases: ['img', 'attach'],
  },
  // Team / swarm commands
  {
    id: 'team:create',
    label: 'team:create',
    description: 'Create a new team',
  },
  {
    id: 'team:delete',
    label: 'team:delete',
    description: 'Delete the current team',
  },
  {
    id: 'team:status',
    label: 'team:status',
    description: 'Show team overview (members, phase, tasks)',
  },
  {
    id: 'team:phase',
    label: 'team:phase',
    description: 'Set the development phase',
  },
  {
    id: 'team:enable',
    label: 'team:enable',
    description: 'Enable swarm features',
  },
  {
    id: 'team:disable',
    label: 'team:disable',
    description: 'Disable swarm features',
  },
  {
    id: 'team:members',
    label: 'team:members',
    description: 'List all members with roles and status',
  },
  {
    id: 'team:metrics',
    label: 'team:metrics',
    description: 'Open team metrics panel (velocity, throughput, quality)',
  },
  {
    id: 'team:settings',
    label: 'team:settings',
    description: 'Open swarm / team settings',
  },
  {
    id: 'topology',
    label: 'topology',
    description: 'Show visual swarm topology graph (agents, message flow, status)',
    aliases: ['swarm', 'swarm:graph', 'graph', 'agents:graph'],
  },
  // Side chat commands
  {
    id: 'sidechat',
    label: 'sidechat',
    description: 'Create a new side chat',
    aliases: ['sc'],
  },
  {
    id: 'sidechats',
    label: 'sidechats',
    description: 'List all side chats',
    aliases: ['scl'],
  },
  // Background agent commands
  {
    id: 'bg:spawn',
    label: 'bg:spawn',
    description: 'Spawn a background agent',
  },
  {
    id: 'bg:list',
    label: 'bg:list',
    description: 'List running background agents',
  },
  {
    id: 'bg:cancel',
    label: 'bg:cancel',
    description: 'Cancel a background task',
  },
  // Marketplace commands
  {
    id: 'marketplace:search',
    label: 'marketplace:search',
    description: 'Search the marketplace for packages',
    aliases: ['mp:search'],
  },
  {
    id: 'marketplace:install',
    label: 'marketplace:install',
    description: 'Install a package from the marketplace',
    aliases: ['mp:install'],
  },
  {
    id: 'marketplace:list',
    label: 'marketplace:list',
    description: 'List installed marketplace packages',
    aliases: ['mp:list'],
  },
  {
    id: 'marketplace:publish',
    label: 'marketplace:publish',
    description: 'Publish a package to the marketplace',
    aliases: ['mp:publish'],
  },
  // PR / GitHub commands
  {
    id: 'pr:attach',
    label: 'pr:attach',
    description: 'Attach swarm to a GitHub PR (owner/repo#number)',
  },
  {
    id: 'pr:detach',
    label: 'pr:detach',
    description: 'Detach swarm from current PR',
  },
  {
    id: 'pr:list',
    label: 'pr:list',
    description: 'List attached PRs',
  },
  // Shared session commands
  {
    id: 'session:create',
    label: 'session:create',
    description: 'Create a new shared collaboration session',
  },
  {
    id: 'session:join',
    label: 'session:join',
    description: 'Join an existing shared session by ID',
  },
  {
    id: 'session:leave',
    label: 'session:leave',
    description: 'Leave the current shared session',
  },
  {
    id: 'session:list',
    label: 'session:list',
    description: 'List active shared sessions',
  },
  {
    id: 'collab:relay',
    label: 'collab:relay',
    description: 'Start a collaboration relay server [port]',
  },
  {
    id: 'collab:relay:stop',
    label: 'collab:relay:stop',
    description: 'Stop the collaboration relay server',
  },
  // Sandbox & permissions
  {
    id: 'sandbox',
    label: 'sandbox',
    description: 'Show current sandbox status and configuration',
  },
  {
    id: 'permissions',
    label: 'permissions',
    description: 'Show/set permission profile (readonly/sandboxed/trusted/godmode)',
    aliases: ['profile'],
  },
  // Diff gate approval
  {
    id: 'approve',
    label: 'approve',
    description: 'Approve pending diff gate (file edit waiting for review)',
  },
  {
    id: 'deny',
    label: 'deny',
    description: 'Deny pending diff gate (reject file edit)',
  },
  // Git checkpoint commands
  {
    id: 'checkpoint:create',
    label: 'checkpoint:create',
    description: 'Create a git auto-checkpoint [label]',
  },
  {
    id: 'checkpoint:list',
    label: 'checkpoint:list',
    description: 'List available git checkpoints',
  },
  {
    id: 'checkpoint:restore',
    label: 'checkpoint:restore',
    description: 'Restore a git checkpoint by ID',
  },
  // Policy engine commands
  {
    id: 'policy:list',
    label: 'policy:list',
    description: 'List available policy templates',
  },
  {
    id: 'policy:load',
    label: 'policy:load',
    description: 'Load a policy template',
  },
  {
    id: 'policy:check',
    label: 'policy:check',
    description: 'Check current tool calls against loaded policies',
  },
  // Semantic memory commands
  {
    id: 'memory:recall',
    label: 'memory:recall',
    description: 'Recall relevant facts from semantic memory',
  },
  {
    id: 'memory:remember',
    label: 'memory:remember',
    description: 'Store a fact in semantic memory',
  },
  // Context budget
  {
    id: 'context:budget',
    label: 'context:budget',
    description: 'Show current context window budget status',
  },
  // Model routing commands
  {
    id: 'model:cascade',
    label: 'model:cascade',
    description: 'Show/set model cascade (fallback chain for models)',
  },
  {
    id: 'model:route',
    label: 'model:route',
    description: 'Test smart model routing for a task',
  },
  {
    id: 'model:local',
    label: 'model:local',
    description: 'Show local model status (ollama/llama.cpp)',
  },
  // Code map commands
  {
    id: 'codemap:build',
    label: 'codemap:build',
    description: 'Build/rebuild the repository code map',
  },
  {
    id: 'codemap:search',
    label: 'codemap:search',
    description: 'Search code map for a symbol',
  },
  {
    id: 'codemap:refs',
    label: 'codemap:refs',
    description: 'Find references to a symbol in code map',
  },
  // Trajectory replay commands
  {
    id: 'trajectory:list',
    label: 'trajectory:list',
    description: 'List recorded agent trajectories',
  },
  {
    id: 'trajectory:replay',
    label: 'trajectory:replay',
    description: 'Replay a recorded trajectory by ID',
  },
  {
    id: 'trajectory:branch',
    label: 'trajectory:branch',
    description: 'Branch a trajectory at a specific step with new prompt',
  },
  // Vault / secrets commands
  {
    id: 'vault:list',
    label: 'vault:list',
    description: 'List stored API keys and providers in vault',
  },
  {
    id: 'vault:add',
    label: 'vault:add',
    description: 'Add a key to vault: /vault:add <provider> <key>',
  },
  {
    id: 'vault:remove',
    label: 'vault:remove',
    description: 'Remove a key from vault by ID',
  },
  // RBAC commands
  {
    id: 'rbac:assign',
    label: 'rbac:assign',
    description: 'Assign a role to a user: /rbac:assign <user> <role>',
  },
  {
    id: 'rbac:check',
    label: 'rbac:check',
    description: 'Check a user permission: /rbac:check <user> <perm>',
  },
  // Handoff commands
  {
    id: 'handoff:park',
    label: 'handoff:park',
    description: 'Park current session state for handoff',
  },
  {
    id: 'handoff:pickup',
    label: 'handoff:pickup',
    description: 'Pick up a parked handoff by ID',
  },
  {
    id: 'handoff:list',
    label: 'handoff:list',
    description: 'List parked handoffs',
  },
  // Debugging & planning
  {
    id: 'debug:hypothesis',
    label: 'debug:hypothesis',
    description: 'Hypothesis-driven debugging for an error',
  },
  {
    id: 'plan:tot',
    label: 'plan:tot',
    description: 'Tree-of-thought planning for a complex task',
  },
  // Refactoring commands
  {
    id: 'refactor:rename',
    label: 'refactor:rename',
    description: 'Rename a symbol across the codebase: /refactor:rename <old> <new>',
  },
  {
    id: 'refactor:extract',
    label: 'refactor:extract',
    description: 'Extract selection into named function: /refactor:extract <range> <name>',
  },
  {
    id: 'refactor:move',
    label: 'refactor:move',
    description: 'Move symbol to another file: /refactor:move <from> <to> <symbol>',
  },
  // Telemetry
  {
    id: 'telemetry',
    label: 'telemetry',
    description: 'Toggle OpenTelemetry tracing on/off',
  },
  // OAuth commands
  {
    id: 'connect',
    label: 'connect',
    description: 'Connect an OAuth provider (e.g., /connect google)',
    aliases: ['oauth'],
  },
  {
    id: 'disconnect',
    label: 'disconnect',
    description: 'Disconnect an OAuth provider',
  },
  // Provider & model commands
  {
    id: 'provider:add',
    label: 'provider:add',
    description: 'Add a new AI provider',
  },
  {
    id: 'provider:list',
    label: 'provider:list',
    description: 'List configured providers',
  },
  {
    id: 'provider:remove',
    label: 'provider:remove',
    description: 'Remove a provider',
  },
  {
    id: 'provider:test',
    label: 'provider:test',
    description: 'Test provider connection',
  },
  {
    id: 'model:list',
    label: 'model:list',
    description: 'Browse and select models',
    aliases: ['models'],
  },
  {
    id: 'model:set',
    label: 'model:set',
    description: 'Set the active model',
  },
  {
    id: 'model:info',
    label: 'model:info',
    description: 'Show current model details',
  },
  {
    id: 'settings',
    label: 'settings',
    description: 'Open provider & model settings',
  },
  ...MODE_COMMANDS,
  {
    id: 'referral',
    label: 'referral',
    description: 'Redeem a referral code for bonus credits',
    aliases: ['redeem'],
  },
  {
    id: 'theme:toggle',
    label: 'theme:toggle',
    description: 'Toggle between light and dark mode',
  },
  {
    id: 'logout',
    label: 'logout',
    description: 'Sign out of your session',
    aliases: ['signout'],
    implicitCommand: true,
  },
  {
    id: 'exit',
    label: 'exit',
    description: 'Quit the CLI',
    aliases: ['quit', 'q'],
    implicitCommand: true,
  },
  // Bible Commands — Human-Vetted Truth System
  {
    id: 'bible:pending',
    label: 'bible:pending',
    description: 'List pending bible entries (awaiting human review)',
    aliases: ['bible:list'],
  },
  {
    id: 'bible:approved',
    label: 'bible:approved',
    description: 'List approved bible entries (agent-trusted truth)',
  },
  {
    id: 'bible:approve',
    label: 'bible:approve',
    description: 'Approve a pending entry (promote to bible truth)',
  },
  {
    id: 'bible:reject',
    label: 'bible:reject',
    description: 'Reject a pending entry',
  },
  {
    id: 'bible:delete',
    label: 'bible:delete',
    description: 'Delete a bible entry',
  },
  {
    id: 'bible:edit',
    label: 'bible:edit',
    description: 'Edit a bible entry (resets to pending)',
  },
  {
    id: 'bible:stats',
    label: 'bible:stats',
    description: 'Show bible statistics',
  },
  {
    id: 'bible:add',
    label: 'bible:add',
    description: 'Manually add a bible entry (requires review)',
  },
  {
    id: 'bible:toggle-research',
    label: 'bible:toggle-research',
    description: 'Toggle auto-research for market insights',
  },
  {
    id: 'bible:context',
    label: 'bible:context',
    description: 'Show approved bible context (for agents)',
  },
  {
    id: 'bible:show',
    label: 'bible:show',
    description: 'Show a single bible entry by ID',
  },
]

export const SLASHLESS_COMMAND_IDS = new Set(
  SLASH_COMMANDS.filter((cmd) => cmd.implicitCommand).map((cmd) =>
    cmd.id.toLowerCase(),
  ),
)

/** Maximum description length for skill commands in the slash menu */
const SKILL_MENU_DESCRIPTION_MAX_LENGTH = 50

function truncateDescription(description: string): string {
  if (description.length <= SKILL_MENU_DESCRIPTION_MAX_LENGTH) {
    return description
  }
  return description.slice(0, SKILL_MENU_DESCRIPTION_MAX_LENGTH - 1) + '…'
}

/**
 * Returns SLASH_COMMANDS merged with skill commands.
 * Skills become slash commands that users can invoke directly.
 */
export function getSlashCommandsWithSkills(skills: SkillsMap): SlashCommand[] {
  const skillCommands: SlashCommand[] = Object.values(skills).map((skill) => ({
    id: `skill:${skill.name}`,
    label: `skill:${skill.name}`,
    description: truncateDescription(skill.description),
  }))

  return [...SLASH_COMMANDS, ...skillCommands]
}
