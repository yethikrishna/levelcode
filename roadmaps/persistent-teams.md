# Persistent Teams & Team Templates Roadmap

**Status**: Implementation starting now  
**Goal**: Make multi-agent teams durable and reusable across sessions

---

## Problem
Today teams exist only in-memory for a single session. Users lose their carefully assembled teams when they exit or start a new conversation.

---

## Solution

### 1. Team Registry (Core)
- Store team definitions + last known state under `~/.config/levelcode/teams/`
- Schema: `{ id, name, members: [{role, model, config}], createdAt, lastUsed }`
- Commands:
  - `/team:save <name>` — persist current active team
  - `/team:load <name>` — restore a saved team (optionally resume last state)
  - `/team:list` — show all saved teams with member counts
  - `/team:delete <name>`

### 2. Team Templates
Pre-defined high-value teams:
- `code-review` — senior-engineer + distinguished-engineer + tester
- `fullstack-sprint` — product-lead + principal-engineer + designer + tester
- `research` — researcher + scientist + cto
- `security-audit` — distinguished-engineer + validator + principal-engineer

Users can save their own templates too.

### 3. Metrics (Later)
Track per-team: tasks completed, avg tokens per task, success rate.

---

## Implementation Plan

1. Create `packages/agent-runtime/src/team-registry.ts`
2. Add persistence layer (JSON files + simple index)
3. Expose new tools in the runtime tool list
4. Wire slash commands in CLI
5. Update `agents/team/index.ts` to support loading from registry
6. Add tests and docs

---

## Success Criteria
- User can create a 4-agent team, run a task, exit, then later type `/team:load my-review-team` and continue with the exact same agents.
- Templates are discoverable via `/team:templates`.

**Owner of this roadmap**: Grok (current session) + LevelCode maintainers

**Target completion**: End of May 2025 (MVP)

---

## Implementation Status (May 2025)

**Completed in this session**:
- Created `TeamRegistry` class (`packages/agent-runtime/src/team-registry.ts`)
  - JSON file persistence under `~/.config/levelcode/teams/`
  - `save()`, `load()`, `list()`, `delete()` methods
- Implemented three tool handlers:
  - `team-save.ts`
  - `team-load.ts`
  - `team-list.ts`

**Next immediate steps**:
1. Register the new tools in `tools/handlers/list.ts` and the tool executor
2. Wire the handlers into the main tool map
3. Add `/team:save`, `/team:load`, `/team:list` slash commands in the CLI
4. Expose `teamRegistry` in the public SDK

**MVP usable via code**:
```ts
import { teamRegistry } from '@levelcode/agent-runtime';

await teamRegistry.save({
  name: 'code-review',
  members: [
    { role: 'senior-engineer' },
    { role: 'distinguished-engineer' },
    { role: 'tester' },
  ],
});
```