# Release Plan: Persistent Teams v1 (Stable Release Feature)

**Coordinator**: Grok (this session)  
**Target Feature**: Persistent Teams + Team Templates  
**Goal**: Reach production-ready state for next LevelCode release

---

## Release Criteria (Definition of Done)

A feature is considered **stable release ready** when ALL of the following are true:

1. **Core Functionality**
   - `teamRegistry.save / load / list / delete` work reliably
   - End-to-end flow: create team → save → exit session → new session → load team → spawn agents from it

2. **Agent Tool Integration**
   - `team_save`, `team_load`, `team_list` tools are registered and callable by agents
   - Agents can use these tools autonomously (e.g. "save this team as 'review-team'")

3. **CLI / UX**
   - Slash commands: `/team:save`, `/team:load`, `/team:list`, `/team:delete`, `/team:templates`
   - Good error messages and confirmation output

4. **SDK**
   - `teamRegistry` exported from `@levelcode/agent-runtime`
   - TypeScript types are clean and documented

5. **Built-in Templates**
   - At least 3 high-value templates ship: `code-review`, `fullstack-sprint`, `research`

6. **Quality**
   - Unit tests + at least one integration test
   - All existing tests still pass
   - No new console warnings or silent failures

7. **Documentation**
   - Updated `docs/agent-swarms.md`
   - New `docs/persistent-teams.md` guide
   - README mentions the new capability
   - CHANGELOG entry

8. **Release Readiness**
   - Version bump (minor)
   - Release notes written
   - Feature works on both Linux and Windows (WSL)

---

## Implementation Phases & Subagent Assignments

### Phase 0 — Foundation (Done)
- TeamRegistry core class created
- Three tool handler files created (`team-save`, `team-load`, `team-list`)

### Phase 1 — Tool Registration & Runtime Integration (High Priority)
**Subagent**: `tool-integration-agent`  
**Tasks**:
- Register the 3 new handlers in `tools/handlers/list.ts`
- Add them to the main tool executor map
- Ensure they appear in the agent's available tools
- Add basic validation and error handling

### Phase 2 — CLI Slash Commands
**Subagent**: `cli-commands-agent`  
**Tasks**:
- Create command files under `cli/src/commands/team/`
- Implement `/team:save`, `/team:load`, `/team:list`, `/team:delete`
- Add `/team:templates` that shows built-in templates
- Wire them into the slash command router

### Phase 3 — Built-in Templates & Polish
**Subagent**: `templates-agent`  
**Tasks**:
- Define 3–4 built-in team templates in a new `team-templates.ts`
- Make `team:list` and `/team:templates` show them nicely
- Add helpful descriptions and role explanations

### Phase 4 — Tests & Verification
**Subagent**: `test-agent`  
**Tasks**:
- Unit tests for `TeamRegistry`
- Integration test: save → load → verify members
- Run full test suite and fix any regressions

### Phase 5 — Documentation & Release Prep
**Subagent**: `docs-release-agent`  
**Tasks**:
- Write `docs/persistent-teams.md`
- Update `docs/agent-swarms.md`
- Add entry to CHANGELOG.md
- Prepare release notes

### Phase 6 — Final Verification (Coordinator)
- Run end-to-end manual test
- Confirm all release criteria are met
- Bump version in package.json files
- Create git tag and summary

---

## Subagent Communication Rules

- Each subagent works in its own isolated worktree when possible
- Report progress via `todo_write` inside their scope
- When blocked, report to coordinator with clear next action needed
- Coordinator (me) reviews diffs and approves merges
- We continue in a loop until **all** release criteria are satisfied

---

**Status**: Plan created. Ready to spawn subagents.