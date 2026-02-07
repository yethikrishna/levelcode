# Agent Swarms

Coordinate teams of specialized AI agents to tackle large-scale software engineering tasks.

## Overview

Agent swarms let you create a **team of autonomous agents** that collaborate through structured communication, task management, and role-based authority. Instead of a single agent handling everything, a swarm breaks work across specialized roles -- a coordinator delegates to managers, who assign tasks to engineers, who report results back up the chain.

Key capabilities:

- **24 specialized roles** from intern to CTO, each with distinct authority levels
- **6 development phases** that gate which tools are available as a project matures
- **File-based messaging** so agents communicate through inboxes without shared memory
- **Task dependency tracking** with automatic unblocking when blockers complete
- **Auto-assignment** that matches idle agents to available tasks by role seniority
- **Lifecycle management** with graceful shutdown, idle detection, and failure handling

## Quick Start

### 1. Enable swarm features

```bash
# Via slash command
/team:enable

# Or via environment variable
LEVELCODE_ENABLE_SWARMS=1 levelcode
```

### 2. Create a team

```bash
/team:create my-project
```

This creates a team in the `planning` phase with you as the lead. The team config is persisted to `~/.config/levelcode/teams/my-project/config.json`.

### 3. Advance through phases

```bash
/team:phase pre-alpha
```

Each phase unlocks more tools. In `planning` you can only create and manage tasks. From `pre-alpha` onward agents can communicate. From `alpha` onward all tools are available including agent spawning.

### 4. Let agents work

Once in `alpha` or later, the coordinator agent can spawn managers and engineers, create tasks, and drive the project forward. Agents communicate through their inboxes and report progress through the task system.

### 5. Monitor progress

```bash
/team:status    # Overview with task counts
/team:members   # Table of all agents and their current status
```

## Slash Commands

All team commands are prefixed with `/team:`.

### `/team:create <name>`

Create a new team and set it as the active team.

```bash
/team:create backend-rewrite
```

- Team name must contain only letters, numbers, hyphens, and underscores
- Creates the team directory at `~/.config/levelcode/teams/<name>/`
- Creates the tasks directory at `~/.config/levelcode/tasks/<name>/`
- Initializes with phase `planning` and no members
- Automatically enables swarm features

### `/team:delete`

Delete the currently active team and all its data.

```bash
/team:delete
```

- Removes the team directory and all task files
- Resets the team store to its initial state
- Cannot be undone

### `/team:status`

Display the active team's status including phase, member count, and task breakdown.

```bash
/team:status
```

Example output:

```
Team: backend-rewrite
Phase: alpha
Members: 5

Tasks:
  Pending:     12
  In Progress: 3
  Completed:   8
  Blocked:     2
```

### `/team:phase <phase>`

Advance the team to the next development phase.

```bash
/team:phase pre-alpha
```

- Only forward single-step transitions are allowed (`planning` -> `pre-alpha`, not `planning` -> `alpha`)
- Fires a `phase_transition` hook event
- Valid phases: `planning`, `pre-alpha`, `alpha`, `beta`, `production`, `mature`

### `/team:enable`

Enable swarm features globally. Persists to `~/.config/levelcode/settings.json`.

```bash
/team:enable
```

### `/team:disable`

Disable swarm features globally.

```bash
/team:disable
```

### `/team:members`

Display a table of all team members with their role, status, and current task.

```bash
/team:members
```

Example output:

```
Role                     Status     Name                 Task
-------------------------------------------------------------------------
coordinator              active     team-lead            -
manager                  active     mgr-frontend         42
senior-engineer          working    eng-api              37
researcher               idle       research-1           -
```

## Team Roles

Roles are organized into authority levels. Higher-level roles can manage and spawn lower-level roles.

| Level | Role | Description |
|-------|------|-------------|
| 0 | `intern` | Entry-level agent for simple, well-defined read-only tasks |
| 0 | `apprentice` | Learning-level agent for straightforward tasks with basic analysis |
| 1 | `junior-engineer` | Junior engineer handling well-scoped tasks under guidance |
| 2 | `mid-level-engineer` | Mid-level engineer building features and fixing bugs independently |
| 2 | `tester` | Testing specialist writing and running tests for quality assurance |
| 3 | `senior-engineer` | Senior IC handling complex implementations and mentoring |
| 3 | `researcher` | Research specialist investigating codebases, APIs, and documentation |
| 3 | `scientist` | Research engineer using experimentation and benchmarking for analysis |
| 3 | `designer` | UI/UX specialist providing design guidance and specifications |
| 3 | `product-lead` | Product specialist handling requirements, prioritization, and scope |
| 3 | `reviewer` | Code review specialist |
| 4 | `sub-manager` | Team Lead coordinating a small group on a focused workstream |
| 5 | `staff-engineer` | Staff Engineer handling complex cross-cutting implementations |
| 5 | `manager` | Engineering Manager coordinating engineers and tracking delivery |
| 6 | `senior-staff-engineer` | Senior Staff Engineer driving large-scale technical initiatives |
| 7 | `principal-engineer` | Principal Engineer defining architecture and solving the hardest problems |
| 8 | `distinguished-engineer` | Distinguished Engineer shaping technical strategy across the system |
| 9 | `fellow` | Engineering Fellow -- the most senior IC, tackling paradigm-defining problems |
| 10 | `director` | Engineering Director overseeing multiple teams and cross-team alignment |
| 11 | `vp-engineering` | VP of Engineering managing operations, delivery, and team scaling |
| 12 | `coordinator` | Top-level orchestrator that drives multi-agent projects to completion |
| 13 | `cto` | Chief Technology Officer responsible for technical strategy and team structure |

### Role Authority

Authority determines what a role can do:

- **Manage**: A role can manage any role with a strictly lower authority level
- **Spawn**: Each role has an explicit list of roles it can spawn as sub-agents

```typescript
import { canManage, getRoleLevel, getSpawnableRoles } from '@levelcode/agents/team/role-hierarchy'

canManage('manager', 'senior-engineer')  // true (level 5 > level 3)
canManage('senior-engineer', 'manager')  // false (level 3 < level 5)

getRoleLevel('coordinator')  // 12
getRoleLevel('intern')       // 0

getSpawnableRoles('manager')  // ['senior-engineer', 'mid-level-engineer', 'sub-manager']
getSpawnableRoles('intern')   // [] (cannot spawn team agents)
```

### Spawn Permissions

Management roles can spawn specific sub-roles:

| Role | Can Spawn |
|------|-----------|
| `cto` | vp-engineering, coordinator, director, fellow, distinguished-engineer, principal-engineer, manager |
| `vp-engineering` | director, manager, senior-staff-engineer, principal-engineer |
| `coordinator` | manager, senior-engineer, researcher, designer, product-lead, scientist |
| `director` | manager, senior-engineer, researcher, product-lead |
| `manager` | senior-engineer, mid-level-engineer, sub-manager |
| `sub-manager` | mid-level-engineer, junior-engineer |
| `senior-engineer` | junior-engineer, intern, apprentice |
| `staff-engineer` | mid-level-engineer, junior-engineer |
| `principal-engineer` | senior-engineer, staff-engineer |
| `distinguished-engineer` | senior-engineer, staff-engineer |
| `fellow` | senior-engineer, staff-engineer |

## Development Phases

Phases represent the maturity of a project and gate which team tools are available.

### Phase Progression

```
planning -> pre-alpha -> alpha -> beta -> production -> mature
```

Only forward single-step transitions are allowed. You cannot skip phases.

### Phase Details

| Phase | Description | Available Team Tools |
|-------|-------------|---------------------|
| `planning` | Define goals, architecture, and task breakdown. No implementation. | task_create, task_update, task_get, task_list |
| `pre-alpha` | Core scaffolding and foundational work. Communication enabled. | + send_message, team_create |
| `alpha` | Active feature development. All tools available. | + team_delete, spawn_agents, spawn_agent_inline |
| `beta` | Stabilization, testing, bug fixes. All tools available. | All team tools |
| `production` | Release-ready code. All tools available. | All team tools |
| `mature` | Ongoing maintenance and incremental improvements. | All team tools |

Non-team tools (read_files, write_file, grep, etc.) are never gated by phase.

### Phase Gating API

```typescript
import {
  getPhaseTools,
  isToolAllowedInPhase,
  getMinimumPhaseForTool,
  canTransition,
  transitionPhase,
} from '@levelcode/common/utils/dev-phases'

getPhaseTools('planning')
// ['task_create', 'task_update', 'task_get', 'task_list']

isToolAllowedInPhase('send_message', 'planning')  // false
isToolAllowedInPhase('send_message', 'pre-alpha')  // true

getMinimumPhaseForTool('spawn_agents')  // 'alpha'
getMinimumPhaseForTool('read_files')    // null (not a team tool)

canTransition('planning', 'pre-alpha')  // true
canTransition('planning', 'alpha')      // false (must go through pre-alpha)
```

## Task Management

Tasks are the primary unit of work in a swarm. They are persisted as individual JSON files in `~/.config/levelcode/tasks/<team-name>/`.

### Task Structure

```typescript
interface TeamTask {
  id: string
  subject: string           // Brief imperative title
  description: string       // Detailed requirements
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  owner?: string            // Agent name that owns this task
  blockedBy: string[]       // Task IDs that must complete first
  blocks: string[]          // Task IDs waiting on this one
  phase: DevPhase           // Phase this task belongs to
  activeForm?: string       // Present continuous form ("Running tests")
  createdAt: number
  updatedAt: number
  metadata?: Record<string, unknown>  // Arbitrary key-value data
}
```

### Task Lifecycle

1. **Create** -- A coordinator or manager creates a task with `task_create`
2. **Assign** -- The task is assigned to an agent (manually or via auto-assign)
3. **In Progress** -- The owning agent marks it `in_progress` and begins work
4. **Complete** -- The agent marks it `completed`, which:
   - Updates the agent's status to `idle`
   - Sends a `task_completed` message to the team lead
   - Checks if any blocked tasks are now unblocked
5. **Blocked** -- If a task depends on unfinished work, it stays `blocked` until all `blockedBy` tasks complete

### Dependency Resolution

Tasks can declare dependencies via `blockedBy`:

```
Task #3 (blockedBy: [#1, #2])
  |
  +-- Task #1 (completed)
  +-- Task #2 (in_progress) <-- still blocking
```

When Task #2 completes, the system automatically detects that Task #3 is now unblocked and makes it available for assignment.

### Auto-Assignment

When `autoAssign` is enabled in team settings, idle agents are automatically matched to available tasks:

1. Find all pending tasks with no owner and no unresolved blockers
2. Find all idle team members
3. For each task (in ID order), find the first idle agent whose role seniority meets the task's requirements
4. Assign the task and update both the task and agent status

Tasks can specify a seniority requirement via `metadata.seniority`:

| Seniority Tag | Minimum Role Level |
|---------------|--------------------|
| `junior` | 1 (junior-engineer+) |
| `mid` | 4 (mid-level-engineer+) |
| `senior` | 6 (senior-engineer+) |

### Task Claiming

Agents can also self-service claim tasks:

```typescript
import { claimTask, releaseTask, completeTask } from '@levelcode/agent-runtime/task-assignment'

// Agent claims an available task
const result = claimTask('my-team', 'engineer-1', 'task-42')
// { success: true }

// Agent releases a task back to pending
releaseTask('my-team', 'task-42')

// Agent marks a task as completed
const { unblockedTaskIds } = completeTask('my-team', 'task-42')
// unblockedTaskIds: ['task-43', 'task-44']  -- tasks that were waiting on #42
```

## Agent Communication

Agents communicate through a **file-based inbox system**. Each agent has an inbox file at `~/.config/levelcode/teams/<team>/inboxes/<agent-name>.json`.

### Message Types

The team protocol supports 9 message types:

| Type | Direction | Purpose |
|------|-----------|---------|
| `message` | Agent -> Agent | Direct message to a specific teammate |
| `broadcast` | Agent -> All | Same message delivered to every teammate |
| `idle_notification` | Agent -> Lead | Agent finished work and is available |
| `task_completed` | Agent -> Lead | Agent completed a task |
| `shutdown_request` | Lead -> Agent | Request an agent to shut down |
| `shutdown_approved` | Agent -> Lead | Agent accepts shutdown |
| `shutdown_rejected` | Agent -> Lead | Agent declines shutdown with reason |
| `plan_approval_request` | Agent -> Lead | Agent submits a plan for review |
| `plan_approval_response` | Lead -> Agent | Approve or reject a submitted plan |

### Sending Messages

Agents use the `send_message` tool with a `type` parameter:

**Direct message:**
```json
{
  "type": "message",
  "recipient": "engineer-1",
  "content": "Please refactor the auth module to use JWT tokens.",
  "summary": "Refactor auth to JWT"
}
```

**Broadcast (use sparingly -- sends to every teammate):**
```json
{
  "type": "broadcast",
  "content": "Blocking issue found in CI pipeline. All work paused.",
  "summary": "CI pipeline blocked"
}
```

**Shutdown request:**
```json
{
  "type": "shutdown_request",
  "recipient": "researcher-1",
  "content": "Task complete, wrapping up the session"
}
```

**Shutdown response:**
```json
{
  "type": "shutdown_response",
  "request_id": "abc-123",
  "approve": true
}
```

**Plan approval:**
```json
{
  "type": "plan_approval_response",
  "recipient": "manager-1",
  "request_id": "plan-456",
  "approve": false,
  "content": "Please add error handling for the API calls"
}
```

### Inbox Polling

Agents poll their inbox file on a configurable interval (default 2 seconds):

```typescript
import { InboxPoller } from '@levelcode/agent-runtime/inbox-poller'

const poller = new InboxPoller({
  teamName: 'my-team',
  agentName: 'engineer-1',
  pollIntervalMs: 2000,
  logger,
})

poller.start()

// Between agent turns, drain accumulated messages
const { messages, formattedContent } = poller.drain()
if (formattedContent) {
  // Inject into the agent's message history
}

// On shutdown
poller.stop()
```

For one-shot reads (no background polling):

```typescript
import { drainInbox } from '@levelcode/agent-runtime/inbox-poller'

const { messages, formattedContent } = drainInbox({
  teamName: 'my-team',
  agentName: 'engineer-1',
  logger,
})
```

## Configuration

### Settings File

Swarm settings are stored in `~/.config/levelcode/settings.json`:

```json
{
  "mode": "DEFAULT",
  "adsEnabled": true,
  "swarmEnabled": true
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LEVELCODE_ENABLE_SWARMS` | Set to `1` or `true` to enable swarm features | `false` |

The environment variable takes precedence over the settings file. If `LEVELCODE_ENABLE_SWARMS=1`, swarms are enabled regardless of the `swarmEnabled` setting.

### Team Config

Each team stores its configuration at `~/.config/levelcode/teams/<name>/config.json`:

```json
{
  "name": "my-project",
  "description": "Backend API rewrite",
  "createdAt": 1738886400000,
  "leadAgentId": "lead-abc123",
  "phase": "alpha",
  "members": [
    {
      "agentId": "lead-abc123",
      "name": "team-lead",
      "role": "coordinator",
      "agentType": "coordinator",
      "model": "",
      "joinedAt": 1738886400000,
      "status": "active",
      "cwd": "/home/user/project"
    }
  ],
  "settings": {
    "maxMembers": 20,
    "autoAssign": true
  }
}
```

### Team Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `maxMembers` | number | 20 | Maximum number of agents in the team |
| `autoAssign` | boolean | true | Automatically assign idle agents to available tasks |

## Architecture

### File System Layout

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

### Component Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLI Layer                                 │
│  /team:* commands  ->  command-registry.ts                       │
│  Team panel TUI    ->  team-panel.tsx                            │
│  Zustand store     ->  team-store.ts (in-memory state + sync)   │
└──────────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────────┐
│                     Agent Runtime Layer                           │
│  Tool handlers:  team-create.ts, team-delete.ts, send-message.ts│
│                  task-create.ts, task-get.ts, task-update.ts,    │
│                  task-list.ts, task-completed.ts                 │
│  Lifecycle:      team-lifecycle.ts (registry, shutdown, idle)    │
│  Context:        team-context.ts (discover which team an agent   │
│                  belongs to)                                     │
│  Messaging:      inbox-poller.ts + message-formatter.ts         │
│  Assignment:     task-assignment.ts (auto-assign, claim, deps)  │
│  Prompts:        team-prompt.ts (inject team context into system │
│                  prompt)                                         │
└──────────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────────┐
│                       Common Layer                                │
│  Types:     team-config.ts, team-protocol.ts, team-hook-events.ts│
│  Schemas:   team-config-schemas.ts (Zod validation)             │
│  Utils:     team-fs.ts (CRUD for configs, tasks, inboxes)       │
│             dev-phases.ts (phase ordering, tool gating)          │
│             team-hook-emitter.ts (fire hook events)              │
│             team-analytics.ts (track events)                     │
└──────────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────────┐
│                       Agent Templates                             │
│  agents/team/index.ts        (registry of all 20 templates)     │
│  agents/team/coordinator.ts  (top-level orchestrator)            │
│  agents/team/manager.ts      (work stream coordinator)           │
│  agents/team/senior-engineer.ts  (complex implementations)      │
│  agents/team/role-hierarchy.ts   (authority levels, spawn rules) │
│  ... 16 more role templates                                      │
└──────────────────────────────────────────────────────────────────┘
```

### How Communication Works

1. Agent A calls the `send_message` tool with `type: "message"` and `recipient: "agent-b"`
2. The `send-message.ts` handler discovers which team Agent A belongs to by scanning team configs
3. The handler validates the recipient exists in the team's member list
4. The message is appended to Agent B's inbox file (`inboxes/agent-b.json`)
5. Agent B's `InboxPoller` reads and clears the inbox on its next poll cycle
6. The messages are formatted and injected into Agent B's next prompt turn

### How Task Assignment Works

1. A coordinator creates tasks with dependencies via `task_create`
2. When auto-assign is enabled, the system periodically:
   - Finds pending tasks with no owner and no unresolved blockers
   - Finds idle agents (status = `idle`, no in-progress tasks)
   - Matches agents to tasks by role seniority
3. When an agent completes a task:
   - The task status is set to `completed`
   - The agent status is set to `idle`
   - A `task_completed` message is sent to the team lead
   - All tasks listing this task in their `blockedBy` are checked -- if all their blockers are now complete, they become available

### How Lifecycle Management Works

The `team-lifecycle.ts` module maintains an in-memory registry of active agents:

- **registerAgent** -- Called after an agent is spawned. Stores the agent's `AbortController` for graceful shutdown.
- **markAgentWorking** -- Called when an agent picks up a task. Updates both registry and team config.
- **markAgentIdle** -- Called when an agent has no more work. Fires `teammate_idle` hook, sends idle notification to lead.
- **markAgentBlocked** -- Called when an agent is waiting on a dependency.
- **markAgentFailed** -- Called on unrecoverable error. Aborts the controller, notifies the lead, unregisters.
- **approveShutdown** -- Aborts the agent, removes it from the team, sends confirmation.
- **shutdownAllAgents** -- Force-stops all agents in a team (used when deleting a team).

### Data Validation

All data read from disk is validated with Zod schemas before use:

- `teamConfigSchema` -- validates team config structure
- `teamTaskSchema` -- validates individual task files
- `teamProtocolMessageSchema` -- validates inbox messages (discriminated union on `type`)

Corrupted files produce clear error messages identifying the file and validation failure.

### Concurrency & File Locking

Multiple agents may read and write the same files concurrently. The `file-lock.ts` utility provides advisory locking via `withLock()` to prevent data corruption:

```typescript
import { withLock } from '@levelcode/common/utils/file-lock'

await withLock(configPath, () => {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  config.members.push(newMember)
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
})
```

Critical operations in `team-fs.ts` (saveTeamConfig, addTeamMember, removeTeamMember, createTask, updateTask, sendMessage) all use file locking.

## API Reference

### Types

**`team-config.ts`**

```typescript
type TeamRole =
  | 'coordinator' | 'cto' | 'vp-engineering' | 'director'
  | 'fellow' | 'distinguished-engineer' | 'principal-engineer'
  | 'senior-staff-engineer' | 'staff-engineer' | 'manager'
  | 'sub-manager' | 'senior-engineer' | 'super-senior'
  | 'mid-level-engineer' | 'junior-engineer' | 'researcher'
  | 'scientist' | 'designer' | 'product-lead' | 'tester'
  | 'reviewer' | 'intern' | 'apprentice'

type DevPhase =
  | 'planning' | 'pre-alpha' | 'alpha'
  | 'beta' | 'production' | 'mature'

type AgentStatus =
  | 'active' | 'idle' | 'working'
  | 'blocked' | 'completed' | 'failed'

interface TeamMember {
  agentId: string
  name: string
  role: TeamRole
  agentType: string
  model: string
  joinedAt: number
  status: AgentStatus
  currentTaskId?: string
  cwd: string
}

interface TeamConfig {
  name: string
  description: string
  createdAt: number
  leadAgentId: string
  phase: DevPhase
  members: TeamMember[]
  settings: {
    maxMembers: number
    autoAssign: boolean
  }
}

interface TeamTask {
  id: string
  subject: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  owner?: string
  blockedBy: string[]
  blocks: string[]
  phase: DevPhase
  activeForm?: string
  createdAt: number
  updatedAt: number
  metadata?: Record<string, unknown>
}
```

### File System Operations (`team-fs.ts`)

| Function | Description |
|----------|-------------|
| `createTeam(config)` | Create a new team directory and config file |
| `loadTeamConfig(teamName)` | Load and validate team config from disk |
| `saveTeamConfig(teamName, config)` | Write team config to disk (with file locking) |
| `deleteTeam(teamName)` | Remove team directory and task files |
| `addTeamMember(teamName, member)` | Add a member to the team config |
| `removeTeamMember(teamName, agentId)` | Remove a member from the team config |
| `createTask(teamName, task)` | Write a new task file |
| `updateTask(teamName, taskId, updates)` | Partially update a task file |
| `listTasks(teamName)` | List all tasks for a team |
| `getTask(teamName, taskId)` | Read a single task file |
| `sendMessage(teamName, to, message)` | Append a message to an agent's inbox |
| `readInbox(teamName, agentName)` | Read all messages from an agent's inbox |
| `clearInbox(teamName, agentName)` | Clear an agent's inbox |

### Phase Utilities (`dev-phases.ts`)

| Function | Description |
|----------|-------------|
| `getPhaseOrder(phase)` | Get numeric index (0-5) for a phase |
| `canTransition(current, target)` | Check if a phase transition is valid |
| `transitionPhase(config, target)` | Return a new config with the updated phase |
| `getPhaseTools(phase)` | Get team tool names available in a phase |
| `isToolAllowedInPhase(tool, phase)` | Check if a tool is allowed in a phase |
| `getMinimumPhaseForTool(tool)` | Get the earliest phase a tool is available |

### Role Hierarchy (`role-hierarchy.ts`)

| Function | Description |
|----------|-------------|
| `getRoleLevel(role)` | Get numeric authority level (0-13) |
| `canManage(manager, subordinate)` | Check if a role has authority over another |
| `getSpawnableRoles(role)` | Get the list of roles a given role can spawn |

### Lifecycle (`team-lifecycle.ts`)

| Function | Description |
|----------|-------------|
| `registerAgent(team, id, name, abort)` | Register a spawned agent |
| `unregisterAgent(team, id)` | Remove an agent from the registry |
| `getActiveAgents(team)` | List all registered agents for a team |
| `isAgentActive(team, id)` | Check if an agent is registered and active |
| `updateAgentStatus(team, id, status)` | Update status in registry and config |
| `markAgentIdle(params)` | Mark idle, fire hook, notify lead |
| `markAgentWorking(params)` | Mark working, set current task |
| `markAgentBlocked(params)` | Mark agent as blocked |
| `markAgentFailed(params)` | Mark failed, abort, notify lead |
| `approveShutdown(params)` | Gracefully shut down an agent |
| `rejectShutdown(params)` | Reject a shutdown request |
| `shutdownAllAgents(team)` | Force-stop all agents in a team |

### Task Assignment (`task-assignment.ts`)

| Function | Description |
|----------|-------------|
| `isTaskBlocked(team, taskId)` | Check if a task has unresolved blockers |
| `getUnblockedTasks(team)` | Get pending tasks with all blockers resolved |
| `findAvailableTasks(team)` | Get unblocked tasks with no owner |
| `findIdleAgents(team)` | Get idle members with no in-progress tasks |
| `isAgentSuitableForTask(agent, task)` | Check role seniority vs task requirements |
| `autoAssignTasks(team)` | Match idle agents to available tasks |
| `claimTask(team, agent, taskId)` | Agent self-service task claiming |
| `releaseTask(team, taskId)` | Release a task back to pending |
| `completeTask(team, taskId)` | Complete a task and unblock dependents |

### Hook Events (`team-hook-events.ts`)

| Event Type | Fields | Fired When |
|------------|--------|------------|
| `teammate_idle` | agentName, teamName, lastTaskId | Agent finishes work and has nothing to do |
| `task_completed` | taskId, taskSubject, owner, teamName | A task is marked as completed |
| `phase_transition` | teamName, fromPhase, toPhase | The team's dev phase changes |

---

*For creating custom standalone agents, see [Custom Agents](./custom-agents.md). For general architecture, see [Architecture](./architecture.md).*
