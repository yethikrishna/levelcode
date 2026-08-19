# Persistent Teams

LevelCode supports **persistent teams** — reusable, named collections of specialized agents that can be saved, loaded, and reused across sessions.

## Overview

Instead of re-specifying team members every time, you can:

- Save a configured team under a name
- Load it in future sessions
- Use built-in high-value templates
- Manage teams via CLI slash commands or agent tools

## Built-in Templates

Three production-ready templates ship out of the box:

| Template          | Display Name              | Roles                                      | Best For                              |
|-------------------|---------------------------|--------------------------------------------|---------------------------------------|
| `code-review`     | Code Review Team          | coordinator, senior-staff-engineer, principal-engineer, tester, reviewer | PR reviews, security audits, QA gates |
| `fullstack-sprint`| Fullstack Sprint Team     | coordinator, cto, senior-engineer, mid-level-engineer, designer, tester, product-lead | Feature implementation sprints        |
| `research`        | Research & Exploration Team | coordinator, fellow, scientist, researcher, distinguished-engineer | R&D spikes, tech evaluations          |

Use `/team:templates` to list them with descriptions.

## CLI Commands

- `/team:save <name>` — Persist current team
- `/team:load <name>` — Restore a saved team
- `/team:list` — Show saved teams + built-in templates
- `/team:delete <name>` — Remove a saved team
- `/team:templates` — Browse built-in templates

## Agent Tools

Agents can autonomously manage teams using:
- `team_save`
- `team_load`
- `team_list`
- `team_delete`

Example: *"Save this team configuration as 'frontend-review-crew'"*

## SDK Usage

```ts
import { teamRegistry } from '@levelcode/agent-runtime'

await teamRegistry.save('my-team', members)
const loaded = await teamRegistry.load('my-team')
```

## Getting Started

1. Spawn agents into a team using normal multi-agent flows
2. Run `/team:save my-review-team`
3. In a new session: `/team:load my-review-team`
4. Spawn agents — they will use the saved configuration

Persistent teams integrate seamlessly with the existing agent swarm and role hierarchy system.

See also: [docs/agent-swarms.md](./agent-swarms.md)
