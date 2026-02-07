# LevelCode

LevelCode is a tool for editing codebases via natural-language instructions to Buffy (an expert AI programming assistant).

## Goals

- Make expert engineers faster (power-user focus).
- Reduce time/effort for common programming tasks.
- Improve via iteration/feedback (learn/adapt from usage).

## Key Technologies

- TypeScript monorepo (Bun workspaces)
- Bun runtime + package manager
- Next.js (web app + API routes)
- Multiple LLM providers (Anthropic/OpenAI/Gemini/etc.)

## Repo Map

- `cli/`: TUI client (OpenTUI + React) and local UX
- `sdk/`: JS/TS SDK used by the CLI and external users
- `web/`: Next.js app + API routes (the “web API”)
- `packages/agent-runtime/`: agent runtime + tool handling (server-side)
- `common/`: shared types, tools, schemas, utilities
- `agents/`: main agents shipped with levelcode
- `.agents/`: local agent templates (prompt + programmatic agents)

## Request Flow

1. CLI/SDK sends user input + context to the LevelCode web API.
2. Agent runtime streams events/chunks back through SDK callbacks.
3. Tools execute locally (file edits, terminal commands, search) to satisfy tool calls.

## Development

Start everything:

```bash
bun dev
```

Or run services + CLI separately:

```bash
bun up
bun start-cli
bun ps
bun down
```

Worktrees (run multiple stacks on different ports): create `.env.development.local`:

```bash
PORT=3001
NEXT_PUBLIC_WEB_PORT=3001
NEXT_PUBLIC_LEVELCODE_APP_URL=http://localhost:3001
```

Logs: `debug/console/` (`db.log`, `studio.log`, `sdk.log`, `web.log`).

Package management:

- Use `bun install`, `bun run ...` (avoid `npm`).

## Agents And Tools

Agents:

- Prompt/programmatic agents live in `.agents/` (programmatic agents use `handleSteps` generators).
- Generator functions execute in a sandbox; agent templates define tool access and subagents.

Shell shims (direct commands without `levelcode` prefix):

```bash
levelcode shims install levelcode/base-lite@1.0.0
eval "$(levelcode shims env)"
base-lite "fix this bug"
```

Tools:

- Tool definitions live in `common/src/tools` and are executed via the SDK helpers + agent-runtime.

## Git Safety Rules

- Never force-push `main` unless explicitly requested.
- To exclude files from a commit: stage only what you want (`git add <paths>`). Never use `git restore`/`git checkout HEAD -- <file>` to “uncommit” changes.
- Run interactive git commands in tmux (anything that opens an editor or prompts).

## Error Handling

Prefer `ErrorOr<T>` return values (`success(...)`/`failure(...)` in `common/src/util/error.ts`) over throwing.

## Testing

- Prefer dependency injection over module mocking; define contracts in `common/src/types/contracts/`.
- Use `spyOn()` only for globals / legacy seams.
- Avoid `mock.module()` for functions; use `@levelcode/common/testing/mock-modules.ts` helpers for constants only.

CLI hook testing note: React 19 + Bun + RTL `renderHook()` is unreliable; prefer integration tests via components for hook behavior.

### CLI tmux Testing

For testing CLI behavior via tmux, use the helper scripts in `scripts/tmux/`. These handle bracketed paste mode and session logging automatically. Session data is saved to `debug/tmux-sessions/` in YAML format and can be viewed with `bun scripts/tmux/tmux-viewer/index.tsx`. See `scripts/tmux/README.md` for details.

## Environment Variables

Quick rules:

- Public client env: `NEXT_PUBLIC_*` only, validated in `common/src/env-schema.ts` (used via `@levelcode/common/env`).
- Server secrets: validated in `packages/internal/src/env-schema.ts` (used via `@levelcode/internal/env`).
- Runtime/OS env: pass typed snapshots instead of reading `process.env` throughout the codebase.

Env DI helpers:

- Base contracts: `common/src/types/contracts/env.ts` (`BaseEnv`, `BaseCiEnv`, `ClientEnv`, `CiEnv`)
- Helpers: `common/src/env-process.ts`, `common/src/env-ci.ts`
- Test helpers: `common/src/testing-env-process.ts`, `common/src/testing-env-ci.ts`
- CLI: `cli/src/utils/env.ts` (`getCliEnv`)
- CLI test helpers: `cli/src/testing/env.ts` (`createTestCliEnv`)
- SDK: `sdk/src/env.ts` (`getSdkEnv`)
- SDK test helpers: `sdk/src/testing/env.ts` (`createTestSdkEnv`)

Bun loads (highest precedence last):

- `.env.local` (Infisical-synced secrets, gitignored)
- `.env.development.local` (worktree overrides like ports, gitignored)

Releases: release scripts read `LEVELCODE_GITHUB_TOKEN`.

## Database Migrations

Edit schema using Drizzle’s TS DSL (don’t hand-write migration SQL), then run the internal DB scripts to generate/apply migrations.

## Referral System

Referral codes are applied via the CLI (web onboarding only instructs the user); see `web/src/app/api/referrals/helpers.ts`.

## Agent Swarms

Agent swarms let you create a coordinated team of autonomous AI agents that collaborate through structured communication, task management, and role-based authority. Instead of a single agent handling everything, a swarm breaks work across specialized roles -- a coordinator delegates to managers, who assign tasks to engineers, who report results back up the chain.

### Overview

Key capabilities:

- **24 specialized roles** (intern through CTO), each with distinct authority levels (0-13).
- **6 development phases** (`planning` -> `pre-alpha` -> `alpha` -> `beta` -> `production` -> `mature`) that gate which team tools are available.
- **File-based messaging** -- agents communicate through per-agent inbox files, not shared memory.
- **Task dependency tracking** with automatic unblocking when blockers complete.
- **Auto-assignment** that matches idle agents to available tasks by role seniority.
- **Lifecycle management** with graceful shutdown, idle detection, and failure handling.

### Team Roles and Hierarchy

Roles are organized into authority levels. Higher-level roles can manage and spawn lower-level roles.

| Level | Roles |
|-------|-------|
| 0 | `intern`, `apprentice` |
| 1 | `junior-engineer` |
| 2 | `mid-level-engineer`, `tester` |
| 3 | `senior-engineer`, `researcher`, `scientist`, `designer`, `product-lead`, `reviewer` |
| 4 | `sub-manager` |
| 5 | `staff-engineer`, `manager` |
| 6 | `senior-staff-engineer` |
| 7 | `principal-engineer` |
| 8 | `distinguished-engineer` |
| 9 | `fellow` |
| 10 | `director` |
| 11 | `vp-engineering` |
| 12 | `coordinator` |
| 13 | `cto` |

Authority rules: a role can manage any role with a strictly lower level. Each role has an explicit list of roles it can spawn (see `agents/team/role-hierarchy.ts`).

### Development Phases

Phases represent project maturity and gate which team tools are available.

| Phase | Available Team Tools |
|-------|---------------------|
| `planning` | `task_create`, `task_update`, `task_get`, `task_list` |
| `pre-alpha` | Above + `send_message`, `team_create` |
| `alpha` | All tools including `team_delete`, `spawn_agents`, `spawn_agent_inline` |
| `beta`/`production`/`mature` | All team tools |

Only forward single-step transitions are allowed (cannot skip phases). Non-team tools (file reads, edits, shell commands) are never gated by phase.

### Team Tools

| Tool | Min Phase | Description |
|------|-----------|-------------|
| `team_create` | `pre-alpha` | Create a new team with configuration |
| `team_delete` | `alpha` | Disband the current team |
| `spawn_agents` | `alpha` | Launch new agent teammates with specified roles |
| `spawn_agent_inline` | `alpha` | Spawn a single agent with inline configuration |
| `send_message` | `pre-alpha` | Send a direct message or broadcast to teammates |
| `task_create` | `planning` | Create a new task with subject, description, and metadata |
| `task_get` | `planning` | Retrieve full details of a task by ID |
| `task_update` | `planning` | Update task status, owner, dependencies, or description |
| `task_list` | `planning` | List all tasks with filtering by status |

### Communication Protocol

Agents communicate through a file-based inbox system. Each agent has an inbox file at `~/.config/levelcode/teams/<team>/inboxes/<agent-name>.json`.

Message types: `message` (direct), `broadcast` (all teammates), `idle_notification`, `task_completed`, `shutdown_request`, `shutdown_approved`, `shutdown_rejected`, `plan_approval_request`, `plan_approval_response`.

Agents poll their inbox on a configurable interval (default 2s) via `InboxPoller` from `packages/agent-runtime/`. Messages are formatted and injected into the agent's next prompt turn.

### Storage Paths

```
~/.config/levelcode/
  settings.json                  # Global settings (swarmEnabled, mode)
  teams/
    <team-name>/
      config.json                # Team config (members, phase, settings)
      inboxes/
        <agent-name>.json        # Per-agent message inbox
  tasks/
    <team-name>/
      <task-id>.json             # Individual task files
```

Team config includes: name, description, phase, lead agent ID, members list, and settings (`maxMembers`, `autoAssign`).

### Architecture Layers

- **CLI Layer**: `/team:*` slash commands (`command-registry.ts`), team panel TUI (`team-panel.tsx`), Zustand store (`team-store.ts`).
- **Agent Runtime Layer**: tool handlers (`team-create.ts`, `team-delete.ts`, `send-message.ts`, `task-create.ts`, etc.), lifecycle management (`team-lifecycle.ts`), context discovery (`team-context.ts`), inbox polling (`inbox-poller.ts`), task assignment (`task-assignment.ts`), system prompt injection (`team-prompt.ts`).
- **Common Layer**: types (`team-config.ts`, `team-protocol.ts`), Zod schemas (`team-config-schemas.ts`), file operations (`team-fs.ts`), phase utilities (`dev-phases.ts`), hook emitter (`team-hook-emitter.ts`), analytics (`team-analytics.ts`).
- **Agent Templates**: `agents/team/` contains templates for all 24 roles, plus `role-hierarchy.ts` for authority levels and spawn rules.

### Slash Commands

| Command | Description |
|---------|-------------|
| `/team:create <name>` | Create a new team and set it as active |
| `/team:delete` | Delete the currently active team and all its data |
| `/team:status` | Display team status (phase, member count, task breakdown) |
| `/team:phase <phase>` | Advance to the next development phase |
| `/team:enable` | Enable swarm features globally |
| `/team:disable` | Disable swarm features globally |
| `/team:members` | Display table of all team members |

### Enabling Swarms

- Via slash command: `/team:enable`
- Via environment variable: `LEVELCODE_ENABLE_SWARMS=1`
- The env var takes precedence over the `swarmEnabled` setting in `~/.config/levelcode/settings.json`.

### Concurrency and File Locking

Multiple agents may read/write the same files concurrently. The `file-lock.ts` utility (`@levelcode/common/utils/file-lock`) provides advisory locking via `withLock()`. Critical operations in `team-fs.ts` (saveTeamConfig, addTeamMember, removeTeamMember, createTask, updateTask, sendMessage) all use file locking.

### Hook Events

| Event | Fired When |
|-------|------------|
| `teammate_idle` | Agent finishes work and has nothing to do |
| `task_completed` | A task is marked as completed |
| `phase_transition` | The team's dev phase changes |
