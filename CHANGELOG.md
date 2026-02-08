# Changelog

All notable changes to LevelCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
