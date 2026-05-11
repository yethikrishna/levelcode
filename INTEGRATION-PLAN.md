# LevelCode Enterprise Integration Plan: GCC + OneContext
## Git-style Context Control & Unified Agent Context Layer

**Target**: ~100,000 LOC | **Team**: 3,000 engineers | **Timeline**: 9 months | **Storage**: Local filesystem | **Language**: Native TypeScript (no Python)

---

## Overview

Integrate two research-backed context management paradigms into LevelCode's existing multi-agent architecture:

1. **GCC (Git-style Context Control)** — Version-controlled agent context with COMMIT, BRANCH, MERGE, CONTEXT operations. Enables checkpointing agent memory, branching for parallel exploration, merging reasoning paths, and structured retrieval. (Paper: arXiv:2508.00031)
2. **OneContext (Agent Self-Managed Context)** — Unified trajectory capture, context sharing across agents/sessions/users, and "continue anywhere" capability. Reimplemented natively in TypeScript. (Reference: github.com/TheAgentContextLab/OneContext)

---

## Requirements

### GCC Core
- Implement a Git-like object model for agent context (commits, branches, refs, objects) stored on the local filesystem under `~/.config/levelcode/contexts/<repoHash>/`
- Support four core operations as both programmatic APIs and agent tools: `context_commit`, `context_branch`, `context_merge`, `context` (retrieval/query)
- Three-way merge for combining divergent context branches (markdown-aware + conflict markers)
- Auto-commit policies: commit at end-of-turn, on tool results, on context pruner runs, on subagent completion
- Subagent branching: each `spawn_agents` call optionally creates a context branch; merge on subagent completion
- Context query language for selective retrieval (by time range, agent, file, keyword)
- Garbage collection and pruning policies (configurable retention)
- Integrity validation (hash-based, detect corruption)

### Trajectory Capture (OneContext)
- Record normalized agent trajectory events (tool calls, tool results, assistant deltas, file changes, reasoning traces) in a canonical JSONL format
- Attach trajectories to GCC commits as metadata
- Step-level and run-level summarizers for human-readable commit messages
- PII/secret redaction hooks (pluggable rulesets for enterprise)
- Token/byte budgeting to keep trajectories within limits
- Adapter layer that hooks into `packages/agent-runtime/src/run-agent-step.ts` event lifecycle

### Context Sharing & Continuation
- Generate shareable context tokens/links from any GCC commit or branch
- Import shared context to reconstruct `SessionState` + `contextState` at any point
- "Continue anywhere" — import a share token into a new CLI session to resume from that exact context state
- Permission model: private (creator only), org-scoped, public
- Link codec with versioning, checksum, and expiry
- Local cache/manifest for imported contexts

### Agent Runtime Deep Integration
- `ContextController` orchestrating commit/branch/merge at step boundaries in `run-agent-step.ts`
- `ContextInjector` that augments system prompts with relevant historical context from GCC
- New tool handlers registered in the runtime tool list for all 9 context tools
- Context-pruner agent enhanced to optionally COMMIT summarized context instead of only truncating
- Team context integration: shared GCC repo pointer for team runs

### SDK Public API
- New `context` option in `RunOptions`: `{ enabled, mode, branch, autoCommit, shareToken }`
- `sdk/src/context/` module exporting `share()`, `continueFrom()`, `sync()` functions
- `RunState` extended with optional `contextState` (branch, head commit, repo ID)
- Full backward compatibility: all new fields optional, no behavior change unless `context.enabled = true`

### CLI Commands & UX
- `/context:commit <summary>` — manual context checkpoint
- `/context:branch <name>` — create named context branch
- `/context:merge <branch>` — merge branch into current
- `/context:log` — show commit history
- `/context:checkout <ref>` — switch branch or restore commit
- `/context:share` — generate shareable link, print to terminal
- `/context:open <token>` — import shared context and continue
- Context status pill in terminal bottom bar (current branch, last commit)
- Context history modal (scrollable commit log)
- Merge conflict resolution UI

### Context Search (Semantic/Hybrid)
- Chunking engine for context content (code-aware splitting)
- Embedding providers (OpenAI, Anthropic) with rate limiting
- Local vector index (stored alongside GCC repo)
- Hybrid query: keyword + semantic with reranking
- Filter by agent, time range, file, branch
- "CONTEXT" tool uses search to retrieve relevant historical context for the agent

### Security, Governance, Audit
- Configurable retention policies per org/team (auto-delete after N days)
- Append-only audit log for all context operations
- Secret/PII redaction pipeline (pre-commit hook)
- RBAC: team-level context access policies in `TeamConfig.settings.contextPolicy`
- Share link expiry and revocation

### Web Backend & Admin
- New API routes under `web/src/app/api/context/` for future cloud sync readiness
- DB schema additions for contexts, commits, trajectories, shares, audit log
- Admin viewer: context timeline, commit inspector, trajectory replay
- Org-level context analytics and usage monitoring

---

## LOC Breakdown by Workstream

| WS | Workstream | Product LOC | Test LOC | Total LOC | Engineers | Duration |
|---:|---|---:|---:|---:|---:|---|
| 0 | Foundation: types + tool contracts | 4,200 | 1,800 | **6,000** | 120 | Months 1–2 |
| 1 | GCC core: context repo + operations | 13,000 | 4,000 | **17,000** | 380 | Months 1–4 |
| 2 | Trajectory capture (OneContext) | 6,500 | 3,500 | **10,000** | 250 | Months 2–5 |
| 3 | Context sharing & continuation | 9,500 | 4,500 | **14,000** | 320 | Months 3–6 |
| 4 | Agent-runtime deep integration | 8,000 | 4,000 | **12,000** | 350 | Months 4–7 |
| 5 | SDK public API + backward compat | 4,600 | 2,400 | **7,000** | 180 | Months 5–7 |
| 6 | CLI UX + commands | 6,500 | 3,500 | **10,000** | 420 | Months 5–8 |
| 7 | Web backend + DB + admin UI | 5,800 | 3,200 | **9,000** | 430 | Months 6–9 |
| 8 | Security, governance, audit | 2,800 | 1,200 | **4,000** | 250 | Months 7–9 |
| 9 | Context search + perf harness | 7,400 | 3,600 | **11,000** | 300 | Months 5–9 |
| | **TOTAL** | **68,300** | **31,700** | **100,000** | **3,000** | **9 months** |

---

## Dependency DAG

```
WS0 (types) ──→ WS1 (GCC core) ──→ WS2 (trajectory) ──→ WS3 (sync/share)
                                                              │
WS0 ──→ WS4 (runtime integration) ←── WS1 + WS2 + WS3       │
              │                                               │
              ├──→ WS5 (SDK API) ←── WS3                     │
              │         │                                     │
              │         └──→ WS6 (CLI UX)                     │
              │                                               │
              └──→ WS7 (web backend) ←── WS3 + WS9           │
                       │                                      │
                       └──→ WS8 (security) ←── WS0–WS7       │
                                                              │
WS9 (search + perf) ←── WS0 + WS1 + WS3 ────────────────────┘
```

---

## New Packages & Directories

| Package | Path | Purpose |
|---|---|---|
| `@levelcode/context-control` | `packages/context-control/` | GCC object model, storage, ops, merge, query, GC |
| `@levelcode/context-trajectory` | `packages/context-trajectory/` | Event normalization, summarizers, redaction, adapters |
| `@levelcode/context-sync` | `packages/context-sync/` | Share tokens, link codec, permissions, local cache |
| `@levelcode/context-search` | `packages/context-search/` | Chunking, embeddings, indexing, hybrid query, rerank |
| — | `packages/agent-runtime/src/context/` | Runtime controller, injector, auto-commit, branching |
| — | `packages/agent-runtime/src/tools/handlers/tool/context/` | 9 new tool handlers |
| — | `sdk/src/context/` | SDK public API: share, continue, sync, options |
| — | `cli/src/commands/context/` | 8 CLI commands |
| — | `cli/src/components/context/` | Status pill, history modal, merge modal, settings |
| — | `web/src/app/api/context/` | API routes for future cloud sync |
| — | `web/src/server/context/` | Backend services: auth, share, trajectory, search |
| — | `web/src/app/admin/contexts/` | Admin viewer pages |
| — | `common/src/types/context/` | Shared types: gcc, trajectory, share, policy |

---

## Detailed File Breakdown

### WS0 — Foundation: Types + Tool Contracts (6,000 LOC)

#### New Files
| File | Est. LOC | Notes |
|---|---:|---|
| `common/src/types/context/gcc.ts` | 650 | Commit/branch/merge/context selector types, zod schemas |
| `common/src/types/context/trajectory.ts` | 520 | Normalized event schema (tool_call, tool_result, assistant_delta, file_change) |
| `common/src/types/context/share.ts` | 420 | Share tokens, permissions, expiry, audience (org/user/public) |
| `common/src/types/context/index.ts` | 60 | Barrel exports |
| `common/src/tools/params/tool/context/context-commit.ts` | 230 | Tool schema + examples |
| `common/src/tools/params/tool/context/context-branch.ts` | 220 | |
| `common/src/tools/params/tool/context/context-merge.ts` | 260 | |
| `common/src/tools/params/tool/context/context.ts` | 260 | "CONTEXT" retrieval operator |
| `common/src/tools/params/tool/context/context-share.ts` | 240 | Create share link |
| `common/src/tools/params/tool/context/context-open.ts` | 240 | Open/import share link |
| `common/src/tools/params/tool/context/context-log.ts` | 200 | Commit log listing |
| `common/src/tools/params/tool/context/context-checkout.ts` | 260 | Switch branch/commit pointer |
| `common/src/tools/params/tool/context/context-gc.ts` | 240 | Garbage collect/prune policies |

#### Existing Files to Modify
| File | Est. delta LOC | Change |
|---|---:|---|
| `common/src/tools/constants.ts` | +40 | Add new tool names to `toolNames` |
| `common/src/tools/list.ts` | +120 | Register tool params + client schemas |
| `common/src/types/session-state.ts` | +220 | Add optional `contextState?: { repoId; branch; headCommitId }` to `SessionState` |
| `common/src/types/team-config.ts` | +80 | Optional `contextPolicy` at `TeamConfig.settings` |

#### Tests (1,800 LOC)
- Unit (bun test): `common/src/types/context/__tests__/*` (~1,500 LOC)
- Integration: tool-schema roundtrip parse tests (~300 LOC)

---

### WS1 — GCC Core: Context Repo + Operations (17,000 LOC)

#### New Files
| File | LOC |
|---|---:|
| `packages/context-control/package.json` | 60 |
| `packages/context-control/src/index.ts` | 80 |
| `packages/context-control/src/repo/context-repo.ts` | 650 |
| `packages/context-control/src/repo/repo-config.ts` | 220 |
| `packages/context-control/src/repo/repo-state.ts` | 280 |
| `packages/context-control/src/model/commit.ts` | 220 |
| `packages/context-control/src/model/branch.ts` | 160 |
| `packages/context-control/src/model/merge.ts` | 240 |
| `packages/context-control/src/model/context-file.ts` | 220 |
| `packages/context-control/src/storage/fs-layout.ts` | 280 |
| `packages/context-control/src/storage/fs-store.ts` | 900 |
| `packages/context-control/src/storage/object-store.ts` | 520 |
| `packages/context-control/src/storage/locks.ts` | 350 |
| `packages/context-control/src/storage/hash.ts` | 320 |
| `packages/context-control/src/ops/commit.ts` | 520 |
| `packages/context-control/src/ops/branch.ts` | 360 |
| `packages/context-control/src/ops/merge.ts` | 700 |
| `packages/context-control/src/ops/context.ts` | 650 |
| `packages/context-control/src/indexing/snapshot.ts` | 600 |
| `packages/context-control/src/indexing/diff.ts` | 550 |
| `packages/context-control/src/merge/three-way.ts` | 650 |
| `packages/context-control/src/merge/markdown-merge.ts` | 500 |
| `packages/context-control/src/merge/conflict-markers.ts` | 250 |
| `packages/context-control/src/selectors/query-language.ts` | 750 |
| `packages/context-control/src/selectors/parser.ts` | 600 |
| `packages/context-control/src/selectors/evaluator.ts` | 650 |
| `packages/context-control/src/gc/prune.ts` | 500 |
| `packages/context-control/src/hooks/auto-commit-policy.ts` | 400 |
| `packages/context-control/src/integrity/validate.ts` | 430 |
| `packages/context-control/src/util/errors.ts` | 220 |
| `packages/context-control/src/util/path.ts` | 180 |
| `packages/context-control/src/util/json.ts` | 150 |
| `packages/context-control/src/util/time.ts` | 120 |

**Storage layout**: `~/.config/levelcode/contexts/<repoHash>/` (default). Optional portable: `<projectRoot>/.levelcode/context/`

#### Tests (4,000 LOC)
| File(s) | LOC |
|---|---:|
| `packages/context-control/src/__tests__/commit.test.ts` | 520 |
| `.../branch.test.ts` | 380 |
| `.../merge-3way.test.ts` | 600 |
| `.../merge-markdown.test.ts` | 520 |
| `.../selectors.test.ts` | 620 |
| `.../fs-store.test.ts` | 700 |
| `.../gc.test.ts` | 360 |
| `.../integrity.test.ts` | 300 |

---

### WS2 — Trajectory Capture (10,000 LOC)

#### New Files
| File | LOC | Notes |
|---|---:|---|
| `packages/context-trajectory/src/index.ts` | 80 | |
| `packages/context-trajectory/src/events/types.ts` | 420 | Zod + TS types |
| `packages/context-trajectory/src/events/normalize.ts` | 650 | Convert runtime events → canonical |
| `packages/context-trajectory/src/events/serializer.ts` | 520 | JSONL encoding, chunking |
| `packages/context-trajectory/src/events/redaction.ts` | 520 | PII/secret scrubbing hooks |
| `packages/context-trajectory/src/reducers/session-reducer.ts` | 700 | Fold events → summary state |
| `packages/context-trajectory/src/reducers/task-reducer.ts` | 520 | Tie into team tasks |
| `packages/context-trajectory/src/summarizers/step-summarizer.ts` | 620 | Short summary per agent step |
| `packages/context-trajectory/src/summarizers/run-summarizer.ts` | 650 | Roll-up summary (for commit message) |
| `packages/context-trajectory/src/util/dedupe.ts` | 260 | Deduplicate repeated deltas |
| `packages/context-trajectory/src/util/size-budget.ts` | 300 | Token/byte budgeting |
| `packages/context-trajectory/src/util/clock.ts` | 180 | Consistent timestamps |
| `packages/context-trajectory/src/adapters/levelcode-runtime.ts` | 1,080 | Glue layer for agent-runtime events |

#### Tests (3,500 LOC)
- Unit: normalization, serializer, redaction (~2,500)
- Integration: "replay trajectory to reconstruct state" (~1,000)

---

### WS3 — Context Sharing & Continuation (14,000 LOC)

#### New Files
| File | LOC |
|---|---:|
| `packages/context-sync/src/index.ts` | 80 |
| `packages/context-sync/src/client/http-client.ts` | 520 |
| `packages/context-sync/src/client/routes.ts` | 260 |
| `packages/context-sync/src/client/retry.ts` | 280 |
| `packages/context-sync/src/share/share-token.ts` | 480 |
| `packages/context-sync/src/share/permissions.ts` | 420 |
| `packages/context-sync/src/share/link-codec.ts` | 650 |
| `packages/context-sync/src/sync/delta.ts` | 700 |
| `packages/context-sync/src/sync/push.ts` | 720 |
| `packages/context-sync/src/sync/pull.ts` | 760 |
| `packages/context-sync/src/sync/reconcile.ts` | 780 |
| `packages/context-sync/src/sync/state-machine.ts` | 650 |
| `packages/context-sync/src/cache/local-cache.ts` | 500 |
| `packages/context-sync/src/cache/manifest.ts` | 450 |
| `packages/context-sync/src/util/backoff.ts` | 200 |
| `packages/context-sync/src/util/limits.ts` | 240 |
| `packages/context-sync/src/util/errors.ts` | 260 |
| `packages/context-sync/src/adapters/sdk.ts` | 760 |
| `packages/context-sync/src/adapters/cli.ts` | 610 |

#### Existing Files to Modify
| File | Est. delta LOC | Change |
|---|---:|---|
| `sdk/src/run.ts` | +120 | Accept `contextOptions` + pass through |
| `cli/src/utils/run-state-storage.ts` | +140 | Persist share/import metadata |

#### Tests (4,500 LOC)
- Unit: link-codec, permissions, delta/push/pull (~2,500)
- Integration: push/pull against mocked server (~1,500)
- E2E: CLI share → open → continue (~500)

---

### WS4 — Agent Runtime Deep Integration (12,000 LOC)

#### New Files
| File | LOC | Notes |
|---|---:|---|
| `packages/agent-runtime/src/context/context-controller.ts` | 820 | Orchestrates commit/branch/merge policies |
| `packages/agent-runtime/src/context/context-injector.ts` | 620 | Builds system-prompt additions from GCC |
| `packages/agent-runtime/src/context/context-autocommit.ts` | 720 | When to commit (end turn, tool results, compaction) |
| `packages/agent-runtime/src/context/context-branching.ts` | 520 | Subagent branch policy |
| `packages/agent-runtime/src/context/context-merge-policy.ts` | 560 | Merge strategies |
| `packages/agent-runtime/src/context/context-telemetry.ts` | 340 | Events for analytics |
| `packages/agent-runtime/src/system-prompt/context-repo-prompt.ts` | 520 | Prompt section template |
| Tool handler: `context_commit.ts` | 420 | |
| Tool handler: `context_branch.ts` | 340 | |
| Tool handler: `context_merge.ts` | 480 | |
| Tool handler: `context.ts` | 520 | |
| Tool handler: `context_share.ts` | 420 | |
| Tool handler: `context_open.ts` | 440 | |
| Tool handler: `context_log.ts` | 300 | |
| Tool handler: `context_checkout.ts` | 380 | |

#### Existing Files to Modify
| File | Est. delta LOC | Change |
|---|---:|---|
| `packages/agent-runtime/src/run-agent-step.ts` | +280 | Hook controller at step boundaries |
| `packages/agent-runtime/src/main-prompt.ts` | +120 | Initialize context per prompt |
| `packages/agent-runtime/src/tools/handlers/list.ts` | +60 | Register new handlers |
| `packages/agent-runtime/src/team-context.ts` | +40 | Add context repo pointer |
| `agents/context-pruner.ts` | +340 | Optionally COMMIT summary |

#### Tests (4,000 LOC)
- Unit: controller policies, injector formatting, merge-policy selection (~2,500)
- Integration: spawn_agents creates branch; merge on completion; rollback on failure (~1,500)

---

### WS5 — SDK Public API (7,000 LOC)

#### New Files
| File | LOC |
|---|---:|
| `sdk/src/context/index.ts` | 80 |
| `sdk/src/context/types.ts` | 380 |
| `sdk/src/context/options.ts` | 260 |
| `sdk/src/context/share.ts` | 520 |
| `sdk/src/context/continue.ts` | 520 |
| `sdk/src/context/sync.ts` | 620 |
| `sdk/src/context/errors.ts` | 220 |
| `sdk/src/context/telemetry.ts` | 280 |

#### Existing Files to Modify
| File | Est. delta LOC | Change |
|---|---:|---|
| `sdk/src/run.ts` | +350 | Add `context?: { enabled, mode, shareToken?, branch?, autoCommit? }` |
| `sdk/src/run-state.ts` | +180 | Extend `RunState` with `contextState` |
| `sdk/src/index.ts` | +120 | Export new context APIs |
| `sdk/src/team.ts` | +250 | Optional team context policy passthrough |

#### Tests (2,400 LOC)
- Unit: link codec wiring, option validation (~1,400)
- Integration: "previousRun + contextState" continuation and roundtrip (~1,000)

---

### WS6 — CLI UX + Commands (10,000 LOC)

#### New Files
| File | LOC | Notes |
|---|---:|---|
| `cli/src/state/context-store.ts` | 520 | Zustand store (branch/head/share status) |
| `cli/src/commands/context/index.ts` | 180 | Router wiring |
| `cli/src/commands/context/commit.ts` | 420 | `/context:commit` |
| `cli/src/commands/context/branch.ts` | 360 | `/context:branch` |
| `cli/src/commands/context/merge.ts` | 420 | `/context:merge` |
| `cli/src/commands/context/log.ts` | 340 | `/context:log` |
| `cli/src/commands/context/checkout.ts` | 380 | `/context:checkout` |
| `cli/src/commands/context/share.ts` | 440 | `/context:share` |
| `cli/src/commands/context/open.ts` | 420 | `/context:open <token>` |
| `cli/src/components/context/context-status-pill.tsx` | 260 | Bottom bar indicator |
| `cli/src/components/context/context-history-modal.tsx` | 620 | Commit log UI |
| `cli/src/components/context/context-merge-modal.tsx` | 520 | Conflict UX |
| `cli/src/components/context/context-settings.tsx` | 480 | Auto-commit/share defaults |
| `cli/src/utils/context/formatters.ts` | 260 | Consistent UX strings |
| `cli/src/utils/context/parse-commands.ts` | 340 | Robust parsing |

#### Existing Files to Modify
| File | Est. delta LOC | Change |
|---|---:|---|
| `cli/src/commands/router.ts` | +120 | Register new command group |
| `cli/src/chat.tsx` | +140 | Render context status + modals |

#### Tests (3,500 LOC)
- Unit: command parsing, store reducers, formatters (~1,500)
- Integration: CLI → SDK run with context enabled (~1,000)
- E2E: share token printed → open → continue run (~1,000)

---

### WS7 — Web Backend + DB + Admin UI (9,000 LOC)

#### New Files
| File | LOC |
|---|---:|
| `web/src/server/context/context-service.ts` | 780 |
| `web/src/server/context/context-auth.ts` | 420 |
| `web/src/server/context/context-share.ts` | 520 |
| `web/src/server/context/context-trajectory.ts` | 520 |
| `web/src/server/context/context-commits.ts` | 620 |
| `web/src/server/context/context-search.ts` | 700 |
| `web/src/app/api/context/create/route.ts` | 220 |
| `web/src/app/api/context/[id]/commit/route.ts` | 260 |
| `web/src/app/api/context/[id]/events/route.ts` | 260 |
| `web/src/app/api/context/share/route.ts` | 260 |
| `web/src/app/api/context/share/[token]/route.ts` | 280 |
| `web/src/app/admin/contexts/page.tsx` | 320 |
| `web/src/app/admin/contexts/[id]/page.tsx` | 420 |
| `web/src/app/admin/contexts/[id]/components/timeline.tsx` | 420 |

#### DB Schema Additions
| File | Est. delta LOC | Change |
|---|---:|---|
| `packages/internal/src/db/schema.ts` | +520 | Tables: contexts, commits, events, shares, search index |
| `packages/internal/src/db/migrations/*` | +900 | 2–4 migrations |

#### Tests (3,200 LOC)
- Jest unit: auth, share token expiry, service methods (~1,700)
- Integration: API route tests with test DB (~800)
- Playwright e2e: open share link, view timeline (~700)

---

### WS8 — Security, Governance, Audit (4,000 LOC)

#### New Files
| File | LOC | Notes |
|---|---:|---|
| `common/src/types/context/policy.ts` | 380 | Retention, redaction modes, share defaults |
| `common/src/util/redaction.ts` | 420 | Generic scrubbing utilities |
| `packages/context-trajectory/src/events/redaction-rules.ts` | 420 | Enterprise rulesets |
| `packages/context-sync/src/share/audience.ts` | 260 | org/user/public |
| `web/src/server/context/audit.ts` | 520 | Append-only audit log |
| `web/src/server/context/retention.ts` | 420 | Scheduled cleanup |
| DB migrations | 380 | Audit tables |

#### Tests (1,200 LOC)
- Unit: redaction, policy evaluation (~900)
- Integration: retention deletes old shares/contexts (~300)

---

### WS9 — Context Search + Performance (11,000 LOC)

#### New Files
| File | LOC |
|---|---:|
| `packages/context-search/src/index.ts` | 80 |
| `packages/context-search/src/chunking/chunker.ts` | 620 |
| `packages/context-search/src/embeddings/provider.ts` | 260 |
| `packages/context-search/src/embeddings/anthropic.ts` | 420 |
| `packages/context-search/src/embeddings/openai.ts` | 420 |
| `packages/context-search/src/indexer/indexer.ts` | 880 |
| `packages/context-search/src/indexer/storage.ts` | 520 |
| `packages/context-search/src/query/hybrid.ts` | 820 |
| `packages/context-search/src/query/rerank.ts` | 520 |
| `packages/context-search/src/query/filters.ts` | 420 |
| `packages/context-search/src/util/rate-limit.ts` | 260 |
| `packages/context-search/src/util/budgets.ts` | 320 |
| `scripts/context-load-test.ts` | 720 |
| `scripts/context-perf-bench.ts` | 620 |

#### Tests (3,600 LOC)
- Unit: chunking, filters, codec (~2,000)
- Integration: index/query against test DB (~1,100)
- E2E: "query context and inject into agent prompt" (~500)

---

## Existing Files Requiring Modification (Master List)

### `common/`
- `common/src/types/session-state.ts` — add `contextState?`
- `common/src/tools/constants.ts` — new tool names
- `common/src/tools/list.ts` — register new tool params
- `common/src/types/team-config.ts` — optional context policy/settings

### `packages/agent-runtime/`
- `packages/agent-runtime/src/main-prompt.ts` — initialize/inject GCC context per prompt
- `packages/agent-runtime/src/run-agent-step.ts` — auto-commit/branch/merge hooks
- `packages/agent-runtime/src/tools/handlers/list.ts` — register new tool handlers
- `packages/agent-runtime/src/team-context.ts` — optional context pointer for team runs
- `agents/context-pruner.ts` — optionally commit summaries

### `sdk/`
- `sdk/src/run.ts` — accept `contextOptions`; pass to runtime
- `sdk/src/run-state.ts` — persist/clone context state
- `sdk/src/index.ts` — export new APIs
- `sdk/src/team.ts` — propagate context policy

### `cli/`
- `cli/src/commands/` (router) — register `/context:*` commands
- `cli/src/chat.tsx` — render context status; history modal

### `web/` + `packages/internal/`
- `packages/internal/src/db/schema.ts` + migrations
- New route handlers under `web/src/app/api/context/*`
- New service modules under `web/src/server/context/*`
- Admin viewer pages under `web/src/app/admin/contexts/*`

---

## Milestones

| Month | Milestone | What Ships |
|---|---|---|
| 2 | **M1: Foundation** | Types, schemas, tool contracts finalized. GCC core MVP (commit + branch on local FS) |
| 4 | **M2: GCC Complete** | Full COMMIT/BRANCH/MERGE/CONTEXT with three-way merge, query language, GC |
| 5 | **M3: Trajectory** | Event capture hooked into runtime, summarizers generating commit messages |
| 6 | **M4: Share & Continue** | Share links, import, "continue anywhere" working end-to-end CLI → CLI |
| 7 | **M5: Runtime + SDK** | Auto-commit, subagent branching, SDK public API, context-aware prompts |
| 8 | **M6: CLI + Web** | All 8 CLI commands, status pill, admin viewer, context search operational |
| 9 | **M7: Enterprise GA** | Security/audit/retention, full test suite (80%+ coverage), perf benchmarks, docs |

---

## Backward Compatibility Strategy

1. **All new fields optional** — `SessionState.contextState?: ...` defaults to undefined
2. **No behavior change unless enabled** — `contextOptions.enabled` defaults to `false`
3. **Tool availability gated by agent template** — New context tools appear only in templates that opt in
4. **Share/continue is additive** — Existing `previousRun` workflow unchanged; share tokens simply hydrate `previousRun` + `contextState`

---

## Testing Strategy

- **80% unit coverage** for all new code
- **Integration tests** for cross-package boundaries (GCC ↔ trajectory, sync ↔ GCC, runtime ↔ controller)
- **E2E tests** for CLI share→open→continue workflow and web admin viewer
- **Performance benchmarks**: context commit/query latency, merge performance with large histories
- **Load testing**: 1000+ commits, 100+ branches, concurrent access patterns

---

## References

- GCC Paper: https://arxiv.org/pdf/2508.00031 (Git Context Controller: Manage the Context of LLM-based Agents like Git)
- OneContext: https://github.com/TheAgentContextLab/OneContext (Agent Self-Managed Context Layer)
- Emergent Mind: https://www.emergentmind.com/papers/2508.00031
