# Changelog

All notable changes to LevelCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - Session Inspection, Fork Points & Swarm Budgets (2026-09-01)

### Added
- **Step-level transient-error retry** — a rate limit, provider 5xx, or dropped connection past the AI SDK's own per-call retries no longer kills an agent run mid-flight (a 400-step max-effort run previously lost everything on one blip, since state is only persisted at the end). Each agent step is now retried up to 3 times with 2s/8s/20s backoff, rolling back the partially-mutated step state first; deterministic failures (4xx) and user aborts fail immediately. Verified live: a dead endpoint now spends exactly the 30s backoff budget before surfacing the same error contract.
- **`levelcode --print-config`** — one-shot resolved-config introspection: effort/steps, permission profile facts, providers with active model, env credential presence, MCP servers, and the config paths consulted. Secrets are redacted by construction (API keys, OAuth tokens, and MCP env values print as presence booleans, never values). Honors `--effort` and `--json` (doctor-style dual output) without booting the runtime.
- **`levelcode sessions <id-or-prefix>`** — inspect one saved session's message history with per-message indices and a ready-to-copy fork command, so picking a `--at-message` fork point no longer requires reading run-state.json.
- **`sessions --json`** — machine-readable listing and detail (following `doctor --json`): `{sessions:[...]}` with fork lineage, and `{chatId, historyLength, messages}` for scripts that pick fork points programmatically.
- **`--fork <id> --at-message <n>`** — truncate the cloned history to its first N messages; non-negative-integer validation at flag parse, out-of-range rejected with exit 2 before any model call.
- **Subagent step budgets bounded by the parent** — a spawned agent now gets `min(default, parent's remaining steps)` instead of a flat 100. The effort dial caps the parent, so it now bounds the whole swarm: at `low` (30) children can no longer get a fresh 100-step allowance, and a nearly-depleted parent cannot spawn runaway children.

### Fixed
- CLI session/credential storage ignored `LEVELCODE_HOME` — `getConfigDir` used raw `os.homedir()`, breaking hermetic test/live environments and diverging from the monorepo home-dir convention. Both cli and sdk now resolve through `getUserHomeDir()`.
- Resuming or forking a run-state persisted without `fileContext` (or with a partial agent state) crashed mid-run at `fileContext.agentTemplates` / `agentState.childRunIds` with an opaque TypeError after the fork clone was already on disk. `applyOverridesToSessionState` backfills defaults, so legacy/hand-crafted saves resume cleanly and the model call fails with a real reason.
- CI never ran the sdk `e2e/` suite — the test job only globbed `src/`, so the 72-test mocked e2e suite could drift silently for months (and had). CI now runs unit + e2e files in one `bun test` invocation.

## [Unreleased] - Persistent Teams v1

### Added
- Persistent Teams v1 — teams and their state now persist across sessions with improved disk + Zustand sync

## [Unreleased] - Watch Mode, Forking & Machine Contracts (2026-09-01)

### Added
- **`levelcode agents --watch [interval]`** — live-refreshing swarm view (default 5s, screen-cleared, Ctrl+C exits). The console was static; swarms move.
- **`doctor --json`** — machine-readable health `{ok, summary, checks[]}` for CI pipelines gating on environment health; exit codes unchanged.
- **Compliance tail in `agents <team>`** — signed audit trail per team: total events, tool-call/file-change counts, last 5 entries with timestamps and agent ids (read from `~/.levelcode/swarm/<team>/compliance.jsonl`).
- **`levelcode sessions`** — lists saved sessions newest-first with id, mtime, message count, first user prompt, and fork lineage.
- **`levelcode -p --fork <session-id>`** — branches from a saved session: clone marked `forked-from`, original untouched, result event carries `forked_from`. Try alternative approaches from the same context.
- **`--output-schema <file>`** — validated structured output for headless runs: forces structured_output mode, validates client-side with ajv (draft-07); failures exit 1 with `schema_errors`, successes carry `schema_valid: true`. CI can gate on machine-checkable answers.
- **`/effort <level>`** — change the effort dial mid-session (with `--effort` at boot; shared state).
- **Context metrics in headless results** — `context_tokens` and `history_messages` from the runtime, so CI can alert on runaway context growth across chained runs.

### Fixed
- `levelcode sessions` fast path never set the project root — the listing always degraded to empty (regression-tested via the live flow: seed → list → fork → list).

## [Unreleased] - Compaction, Effort Dial & MCP Health (2026-08-31)

### Added
- **`/compact`** (alias `/context:compact`) — manual context compaction: prunes the live RunState's message history through the ContextBudgetGovernor (system messages preserved, middle summarized with a GCC token, recent messages kept) so the next send continues from ~60% of the prior context. The governor existed and ran automatically at 80%/95% thresholds; this is the on-demand lever.
- **`--effort low|medium|high|max`** — one flag scaling maxAgentSteps (30/100/200/400) for the whole session, interactive and headless. `medium` preserves the historical default; invalid levels rejected at flag parse. The mapping lives in one pure module ready to carry per-agent step budgets.
- **`/mcp`** — live MCP server health view: connects to every configured server (8s per-server timeout), lists tool counts, renders reachable/unreachable with a summary, notes that failed servers are skipped for tool calls.
- **read_files inline cap** — files over 64k characters return head+tail with a truncation notice and the file path instead of flooding the context (~250k tokens for a 1MB file → ~16k max).

### Changed
- **eval-regression workflow is path-gated** — the baseline+PR buffbench pass (an hour of model calls) now runs only when a PR touches the agent loop, prompts, tools, context management, or eval machinery; docs/web/UI-only PRs skip it.

### Fixed
- sdk `run-file-filter` suite gets timeout headroom (LLM-mock flows under load exceeded the 5s default).

## [Unreleased] - Agents Console & Headless Sessions (2026-08-31)

### Added
- **`levelcode agents` swarm console** — TUI-free view of every team on this machine read from disk (fast path, no agent runtime): member status glyphs, in-progress task per agent, task summaries, last-active marker; `levelcode agents <team>` detail view with per-task blockers. CI-friendly exit codes. Previously the only way to see swarm state was booting the TUI.
- **Headless session resume** — `levelcode -p --continue [id]` resumes the most recent session (or a given one) by replaying the persisted RunState; headless runs persist their finished session in the TUI's chat format, so sessions are interchangeable between surfaces. Success results carry `session_id` for CI chaining (`run 1 → session_id → run 2 --continue <id>`). Missing session exits 2 with an actionable message.
- **`doctor` now checks hooks config validity and installed skills** — warns on invalid settings JSON (with the offending path), counts configured hook event types and available SKILL.md skills.

### Changed
- **`run_terminal_command` output hygiene** — 50k-char cap with silent middle-drop replaced by 30k head+tail plus the full output spilled to `%TEMP%/levelcode-command-output/*.log` with `output_file`/`stderr_file` pointers in the result: the agent can grep the remainder instead of losing it, and a single noisy command can no longer flood the context window (~12k tokens → ~7.5k max).

### Fixed
- **Phantom dependencies broke fresh installs** — `@types/lru-cache@^10` and `@types/form-data@^4` (hallucinated specifiers; neither version exists on npm) removed from workspace manifests; `bun.lock` refreshed.
- **Team-test matrix failures on Linux CI** — bun caches `os.homedir()` at first use, so per-test HOME swapping silently left team fixtures in the first temp home; tests now clean the cached teams/tasks roots.

## [Unreleased] - Hooks, Worktrees & Skills (2026-08-31)

### Added
- **Lifecycle hooks engine** (`common/src/hooks/`, docs in `docs/hooks.md`) — config-defined commands at `SessionStart` / `PreToolUse` / `PostToolUse` / `Stop`. `PreToolUse` can block tool calls (exit 2 or `{"decision":"block"}` — the Claude Code / Codex convention); everything else fails open by design. Config loads from `~/.config/levelcode/settings.json`, `~/.levelcode/settings.json`, and project `.levelcode/settings.json`; handlers accept `command` (shell) or `argv` (portable), with per-hook timeouts. 19 tests exercise the engine end-to-end with real subprocesses.
- **Worktree isolation** — `levelcode --worktree <name>` boots any session (TUI or `--worktree` + `-p` for CI) inside `.levelcode/worktrees/<name>` on branch `worktree/<name>`; re-entering reuses the worktree (resume semantics). New `.worktreeinclude` convention copies gitignored files (`.env`, local config) into fresh worktrees so builds/tests actually run. `common/src/utils/worktree-isolation.ts` hardened: all git invocations via `execFileSync` argv arrays (no shell interpolation), `.claude/worktrees` → `.levelcode/worktrees`, `mkdirp` dependency dropped. 11 tests against real temp repos.
- **Skills ecosystem compat** — `allowed-tools` frontmatter field (agentskills.io) parsed into `allowedTools`; user-level skill dirs `~/.config/levelcode/skills/` and `~/.levelcode/skills/` (plus project `.levelcode/skills/`) now scanned alongside the Claude-compatible dirs. First tests for the skills loader (8).

### Changed
- **Compliance logging is now real** — the previously dead `compliance-logging.ts` module is wired at the tool-executor chokepoint: every executed tool call in a team context writes a signed entry (`tool-call`, success/failure, args, traceId) to `~/.levelcode/swarm/<team>/compliance/events.jsonl`.
- `common` now passes `tsc --noEmit` clean (fixed zod v4 `z.record` arity in background-agent, dead comparisons in `concurrent/ot.ts`).

### Fixed
- **CI on Linux**: `packages/llm-cache/package.json` and `packages/prompt-engineering/package.json` were markdown-fenced (`\`\`\`json`) AI-session artifacts — `bun install --frozen-lockfile` failed on any fresh checkout; both repaired and re-serialized.

## [Unreleased] - TUI Quality Pass (2026-08-31)

### Added
- `levelcode doctor` — dependency & environment health panel, CI-usable exit code
- `levelcode -p "prompt"` headless print mode with `--output-format text|json|stream-json` (PrintModeEvent NDJSON)
- `cli/docs/TUI-DESIGN-BRIEF.md` — aggregated 2026 SOTA TUI research (OpenTUI, Ink v7, Bubble Tea v2, Ratatui 0.30, terminal design systems, agentic CLI UX) into an adoptable roadmap

### Changed
- **CLI launcher restructure** — `src/index.tsx` is now a dependency-light entry that parses flags first; `--help`, `--version`, and unknown-flag errors resolve in milliseconds instead of blocking on the multi-megabyte runtime import. The heavy app bootstrap moved to `src/cli-main.tsx` (lazy-loaded only when the TUI actually boots)
- **Command palette now drives the real command registry** — all ~90 slash commands grouped by namespace (`team:`, `model:`, …) replace the 13 hard-coded no-op entries; scored fuzzy matching (`utils/fuzzy-match.ts`), match highlighting, `[args]` commands prefill the input, windowed scrolling for long lists, Ctrl+U/Ctrl+W editing, Home/End
- **Spinner craft** — cli-spinners-standard cadences (80ms braille), single-width-glyph invariant, terminal `done` state (✓), `LEVELCODE_NO_MOTION=1` reduced-motion freeze, `LEVELCODE_SPINNER_INTERVAL_MS` retune

### Fixed
- All 8 failing E2E/CLI tests: `--help`, `-h`, `--version`, `-v`, `--agent`, `--clear-logs`, invalid flags previously timed out because the entire SDK bundle loaded before flag parsing (cold-cache import measured at 84s on Windows)
- Non-TTY invocations now refuse gracefully with guidance instead of rendering escape sequences into pipes
- Flaky timeouts under load: local-agents suite and image-dimensions compression tests get explicit timeouts instead of the 5s default
- **276-test failure wave in root `bun test`** — `cli/src/state/__tests__/team-store-sync.test.ts` left a partial `mock.module('@levelcode/common/utils/team-fs')` registered process-wide (bun's module mocks are sticky across test files); the mock now spreads the real module and re-delegates to real behavior in `afterAll`
- **Silent-error runs** — `packages/agent-runtime/src/main-prompt.ts` emitted a clean `finish` event even when the model stream failed; failed runs now emit an `error` event before `finish`, and headless mode reports `error_during_execution` with exit code 1 instead of a false success
- Windows path handling: `getFiles` containment now uses the `path.relative` idiom instead of a `startsWith` prefix check, and tool-output keys are normalized to forward slashes; code-search / read-files / user-knowledge test fixtures made platform-agnostic
- `LevelCodeClient` team API ergonomics: `getTeamStatus` returns `null` (instead of throwing) for missing/corrupted teams, `deleteTeam` is idempotent, `createTeam` honors an explicit `leadAgentId`
- Prompt-caching subagent tests updated to prefix semantics (child prompt must share the parent's byte-identical prefix; appended team context is allowed) matching the team-context feature
- CI workflows: `evals.yml` pointed at the deleted `git-evals/run-eval-set.ts` (now runs the bundled `run-buffbench`), nightly e2e referenced a nonexistent `.agents` e2e suite (removed), `bun run typecheck` passes again (process.env architecture violations routed through SDK env helpers)
- Repo hygiene: 8 root scratch files (`_*.mjs`, `temp-*`) removed from git and gitignored, dead `python-app/` and `backend/` stubs (with committed `.pyc` artifacts) removed, `.bun-version` aligned to 1.3.5, stale README links/roadmap corrected
- Side chats actually wired: F2 toggles the panel, the panel renders as a TUI overlay, and the two duplicate side-chat zustand stores are unified into one engine with a mirrored facade

## [0.3.3] - 2026-02-09

### Fixed
- Cross-verified all 35 providers — found and fixed 4 routing bugs
- `fireworks-ai` wrong ID in aggregator fallback list (should be `fireworks`)
- AWS Bedrock `aws-credentials` auth type was silently sending no headers
- Azure OpenAI empty `baseUrl` caused URL construction crash — added guard with helpful error
- Perplexity baseUrl missing `/v1` suffix
- Added `groq` and `aihubmix` to aggregator fallback list
- Fixed `provider-test.ts` to handle `aws-credentials` auth type

## [0.3.2] - 2026-02-09

### Fixed
- Added "never truncate" quality standards to ALL team agent system prompts
- Agents no longer self-truncate with "due to length constraints"
- Context-pruner handles overflow automatically — agents write complete implementations

## [0.3.1] - 2026-02-09

### Fixed
- Added `context-pruner` to all 12 team agent `spawnableAgents` lists
- Senior engineers, managers, staff engineers etc. can now spawn context-pruner without errors

## [0.3.0] - 2026-02-09

### Added — TUI Component Library (16 primitives)
- `Panel` — Bordered container with animated fade-in, BOLD title, decorative separator, surface background
- `ListNavigator` — Scrollable list with `▸` focus arrow, `✦` active badge, group headers, scroll indicators, mouse click
- `TabView` — Tabbed content with `│` separators, number key shortcuts (1-9)
- `SearchInput` — Magnifying glass icon, blinking cursor, result count
- `StatusBadge` — Pulsing green dot for connected, blinking red for error
- `KeyHint` — `‹Esc› Close · ‹Enter› Select` keyboard shortcut hints
- `ConfirmDialog` — Yes/No with Left/Right nav, Y/N shortcuts, danger variant
- `MultiSelect` — Checkbox list with Space toggle, "N of M selected" counter
- `TextInput` — Proper input with blinking cursor, password masking, label
- `BreadcrumbNav` — `✓ Done › Current › Future` step trail for wizards
- `Toast` — Auto-dismissing notifications with variant icons (✓/✕/⚠/ℹ)
- `Spinner` — Animated braille `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms frames
- `Divider` — Solid/dashed/dotted section separator with optional label
- `Table` — Aligned columns with BOLD headers, striped rows, empty state
- `Alert` — Bordered inline info/success/warning/error messages with icons
- `Switch` — `◉ ON` / `○ OFF` boolean toggle with click support

### Added — Universal OAuth System
- Generic PKCE flow (`oauth-flow.ts`) — provider-agnostic authorization
- Localhost HTTP callback server (`oauth-callback-server.ts`) — auto-captures tokens
- Token encryption at rest (`oauth-storage.ts`) — AES-256-CBC with machine-derived key
- OAuth provider configs: Google Gemini, GitHub Models, Azure AD, OpenRouter, Claude
- `/connect` and `/disconnect` slash commands
- OAuth Zustand store with connection status tracking
- OAuth tab in Settings panel showing per-provider connection status
- Startup initialization: auto-loads connection statuses, starts background token refresh
- Env var detection: `GOOGLE_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_ID`, `AZURE_OAUTH_CLIENT_ID`, `OPENROUTER_OAUTH_CLIENT_ID`

### Added — Smart Model Routing
- `isClaudeModel()` guard prevents non-Anthropic models hitting Anthropic SDK
- Aggregator fallback (Case 3): OpenRouter-style model IDs (`org/model`) auto-route to configured aggregators
- `getDefaultModel()` — fallback when requested model unavailable
- `getAvailableModels()` and `isModelAvailable()` helpers
- `OPEN_ROUTER_API_KEY` and `CODEBUFF_BYOK_OPENROUTER` env var support (in addition to `OPENROUTER_API_KEY`)
- Model picker merges catalog models + provider-specific models — shows all available

### Added — Multi-Provider Web Search (5 providers)
- Tavily (free: 1,000 queries/month) — AI-summarized answers
- Brave Search (free: 2,000 queries/month) — high quality results
- Serper (free: 2,500 queries) — Google search results
- SearXNG (free forever, self-hosted) — open source metasearch
- DuckDuckGo (free forever, no key) — always-available fallback
- Automatic fallback chain with `searchWithFallback()`
- Web search works in standalone mode without LevelCode backend

### Added — Team System Improvements
- Commander/team-lead bypasses ALL phase restrictions
- Per-member `toolOverrides` — commander can grant (`allowed`) or revoke (`blocked`) tools
- Teams use user's `swarmDefaultPhase` setting (no more forced "planning")
- `resolveActiveTeam()` with proper priority: Zustand → last-active marker → disk
- `setLastActiveTeam()` after phase transitions for persistence
- `maxMembers` default raised to 999 (effectively limitless)
- Phase transition messages explicitly inform agent of unlocked tools
- Quality standards in all team agent prompts — "never truncate, never stub"

### Changed — Redesigned Screens
- **Model Picker** — Panel + SearchInput + ListNavigator with provider groups, colored capability badges `[R]`=blue `[V]`=green `[T]`=yellow, cost display, available vs unconfigured models sorted
- **Provider Wizard** — BreadcrumbNav step trail, back navigation (Backspace), TextInput for API keys with masking, Spinner during test, auto-sets first model as active
- **Settings Panel** — 4 tabs (General/Providers/OAuth/Theme), interactive Switch toggle for auto-detect, +/- for catalog refresh hours, OAuth connection status per provider, color palette preview
- **Help Modal** — F1 shortcut, 3 tabs (Shortcuts/Commands/About), grouped shortcuts by category, full command list
- **Status Bar** — Shows active provider/model alongside timer and team indicator

### Fixed
- `<span>` must be inside `<text>` crash — all `<span style=` converted to direct attributes
- Ripgrep binary discovery: added system PATH, scoop/choco/cargo locations, monorepo walk-up
- Model picker showing 0 models — merged catalog + provider models
- PKCE verifier bug — `codeVerifierRef` persists verifier across OAuth flow
- Claude OAuth authorization URL corrected to `claude.ai/oauth/authorize`
- Provider wizard auto-creates provider entry for OAuth-only connections
- `/help` now opens the help modal instead of inline text

## [0.2.7] - 2026-02-08

### Fixed
- Resolved TUI component crashes in provider commands (invalid `bold` style prop)

## [0.2.5] - 2026-02-08

### Added
- Universal multi-provider system with 35 providers across 9 categories
- Provider registry (`provider-registry.ts`) with definitions for: Anthropic, OpenAI, Google, xAI, OpenRouter, Groq, Together, Fireworks, Mistral, DeepSeek, Cohere, Perplexity, Replicate, Alibaba, Moonshot, Ollama, LM Studio, Nvidia, Cerebras, DeepInfra, AWS Bedrock, Azure OpenAI, GitHub Models, and more
- Provider configuration persistence at `~/.config/levelcode/providers.json`
- Model catalog from `models.dev/api.json` with local caching
- Auto-detection of local providers (Ollama, LM Studio)
- Provider wizard TUI for adding providers (`/provider:add`)
- Model picker TUI for browsing and selecting models (`/models`)
- Settings panel TUI (`/settings`)
- Provider test command (`/provider:test`)
- Slash commands: `/provider:add`, `/provider:list`, `/provider:remove`, `/provider:test`, `/model:list`, `/model:set`, `/model:info`, `/settings`

### Fixed
- Resolved team context persistence and agent lifecycle gaps

## [0.2.4] - 2026-02-08

### Changed
- Made Sage (main agent) aware of team/swarm tools and capabilities

## [0.2.3] - 2026-02-08

### Fixed
- Added `spawn_agents` to junior-engineer toolNames

## [0.2.2] - 2026-02-07

### Fixed
- Corrected `spawnableAgents` IDs to match actual agent definitions
- Resolved CI infrastructure issues
- Updated all CI workflows to use master branch

## [0.2.1] - 2026-02-07

### Fixed
- Resolved all code review issues for agent swarm system
- Removed remaining legacy branding references from core runtime

## [0.2.0] - 2026-02-07

### Added
- Complete agent swarm system with 100-agent capacity
- Full role hierarchy from Intern (level 0) to CTO (level 13)
- Spawn authority validation — agents can only spawn lower-ranked roles
- Team analytics tracking

## [0.1.0] - 2026-02-07

### Added
- Agent Swarms/Teams system for multi-agent coordination
- 24 team roles from Intern to CTO with hierarchy
- 21 agent templates (coordinator, manager, senior-engineer, researcher, designer, product-lead, intern, apprentice, junior-engineer, mid-level-engineer, staff-engineer, senior-staff-engineer, principal-engineer, distinguished-engineer, fellow, cto, vp-engineering, director, tester, sub-manager, scientist)
- 7 new tools: TeamCreate, TeamDelete, SendMessage, TaskCreate, TaskGet, TaskUpdate, TaskList
- 7 `/team:*` slash commands for team management
- Development phase lifecycle: planning → pre-alpha → alpha → beta → production → mature
- Inbox-based inter-agent messaging (DM, broadcast, shutdown, plan approval)
- Team panel TUI component showing real-time team status
- `swarmEnabled` setting and `LEVELCODE_ENABLE_SWARMS` env flag
- File-based persistence at `~/.config/levelcode/teams/`
- Hook events: TeammateIdle, TaskCompleted, PhaseTransition

## [0.0.12] - 2026-02-06

### Fixed
- Migrated credentials from legacy manicode config dir to levelcode

## [0.0.11] - 2026-02-06

### Changed
- Complete LevelCode branding overhaul
- Added `OPENROUTER_BASE_URL` and `ANTHROPIC_BASE_URL` env var support

## [0.0.10] - 2026-02-06

### Fixed
- Resolved CLI backend URL and Vercel deployment issues
- Vercel build configuration (outputFileTracingRoot, ENOENT fixes)

## [0.0.9] - 2026-02-05

### Added
- Standalone mode — CLI/SDK work without backend using `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY`
- Ads system with graceful degradation

## [0.0.3] - 2026-02-05

### Added
- Initial npm publishing of SDK and CLI
- Graceful env validation for open-source CLI

## [0.0.1] - 2026-02-05

### Added
- Initial release of LevelCode
- Multi-agent architecture: File Picker, Planner, Editor, Reviewer agents
- Support for 200+ models via OpenRouter
- TypeScript SDK for programmatic use
- Terminal-first CLI with real-time streaming
- Custom agent workflows with TypeScript generators
- React-based terminal UI (OpenTUI)
- Git integration
- Evaluation benchmarks (BuffBench)

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 0.3.3 | 2026-02-09 | Cross-verify all 35 providers, fix 4 routing bugs |
| 0.3.2 | 2026-02-09 | "Never truncate" quality standards for agents |
| 0.3.1 | 2026-02-09 | context-pruner added to all team agents |
| 0.3.0 | 2026-02-09 | TUI overhaul (16 primitives), OAuth, smart routing, web search |
| 0.2.7 | 2026-02-08 | Fix TUI component crashes |
| 0.2.5 | 2026-02-08 | Universal multi-provider system (35 providers) |
| 0.2.0 | 2026-02-07 | Complete agent swarm system (100 agents) |
| 0.1.0 | 2026-02-07 | Agent swarms/teams, 24 roles, 7 tools |
| 0.0.9 | 2026-02-05 | Standalone mode |
| 0.0.1 | 2026-02-05 | Initial release |
