# AGENTS.md

Instructions for AI coding agents (and humans) working in this repository.

## What this is

**LevelCode** — an open-source, multi-agent AI coding agent (a Bun + TypeScript
monorepo). The CLI (`cli/`) drives swarms of named agents (intern, apprentice,
designer, product-lead, researcher) that edit code, run tools, and coordinate
through a task/team system. A Next.js dashboard (`web/`), an SDK (`sdk/`), and
an agent runtime (`packages/agent-runtime/`) share the core in `common/`.

## Non-negotiable rules

1. **Bun, not Node.** All scripts run through Bun (`.bun-version` pins the
   version; CI matches it). Use `bun test`, `bun run`, `Bun.spawn` — not npm,
   jest, or child_process conventions.
2. **No raw `process.env` in package source.** Env access goes through the
   env-helper modules (`sdk/src/env.ts`, `common/src/env-process.ts`, …).
   `bun run typecheck` enforces this with `scripts/check-env-architecture.ts`;
   add documented exceptions to its allowlist only when a file genuinely
   cannot import helpers (e.g. `cli/src/cli-flags.ts`, which must stay
   dependency-light for fast `--help`).
3. **Zero test regressions.** Before declaring done, run the suites of every
   workspace you touched (see Commands). If you add cross-cutting code, run
   the suites of its consumers too.
4. **No new scratch files.** `/_*` and `/temp-*` at the repo root are
   gitignored; never commit session scratch. Clean up after yourself.

## Commands

```bash
bun install                 # bootstrap
bun dev                     # run the CLI in dev mode
bun test                    # Bun's own runner across the whole repo (one process)
bun run test                # official CI path: per-workspace test scripts
bun run typecheck           # env-architecture check (not tsc!)
bun x tsc --noEmit          # per-package TypeScript, run inside a package dir
bun run up / down / ps      # start/stop/status local services (db, backend)
bun --cwd web dev           # web dashboard
```

There is no root `tsc` script; each package owns its tsconfig. The env-arch
check is the only cross-package "typecheck".

## Testing: the mock.module trap (read this before writing tests)

Bun's `mock.module()` is **process-global and sticky for the entire test
run**. Plain `bun test` at the repo root loads every test file into ONE
process, alphabetically: `cli/` before `packages/`. A partial module mock in
an early file (e.g. `cli/src/state/__tests__/team-store-sync.test.ts`)
therefore replaces the module for every later file that imports it — this
caused a 276-test failure wave once. Rules:

- If you `mock.module`, spread the real module first and override only what
  you need:
  ```ts
  const realTeamFs = { ...(await import('@levelcode/common/utils/team-fs')) }
  mock.module('@levelcode/common/utils/team-fs', () => ({
    ...realTeamFs,
    loadTeamConfig: mockLoadTeamConfig,
  }))
  ```
- Capture real implementations **before** `mock.module` registers (Bun's
  `import * as` namespaces are live bindings — a static import will reflect
  the mock later and any "delegate to real" closure will recurse into
  itself).
- In `afterAll`, re-point overridden mocks at the real implementations so
  leak-through is harmless (see `team-store-sync.test.ts` for the pattern).
- Tests that only exercise pure logic should use dependency injection
  (`runHeadless`'s `client`/`sink` options) instead of module mocks.

## Architecture map

```
cli/        TUI (OpenTUI/React), commands, side-chats, headless mode
  src/index.tsx       thin launcher: parses flags, answers --help fast
  src/cli-main.tsx    heavy bootstrap: only loads for interactive runs
  src/headless/       -p/--print mode: NDJSON PrintModeEvent stream to stdout
  src/doctor/         levelcode doctor: dependency/health checks
common/     shared core: types, tools, team-fs, sandbox, permissions, MCP client
sdk/        public SDK: run(), LevelCodeClient, skills/agents loading
packages/agent-runtime/  the agent loop (loopAgentSteps, run-agent-step, tools)
web/        Next.js dashboard + docs site
.agents/    bundled agent definitions + skills (cleanup, review)
agents/     agent templates; agents-graveyard/ is still imported by 2 tests
editors/    vscode/jetbrains/nvim/zed integrations (separate ecosystems)
```

### The event protocol

One protocol, many consumers: `common/src/types/print-mode.ts` defines
`PrintModeEvent` (start/text/tool_call/tool_result/subagent_*/error/finish).
The TUI, headless mode, and the web dashboard all consume it. If you touch
the agent loop, keep this contract intact: **a failed run must emit an
`error` event before `finish`** (`packages/agent-runtime/src/main-prompt.ts`),
and consumers must never report success without a `finish` or text
(`cli/src/headless/run-headless.ts` enforces this).

## Conventions

- TypeScript strict; ESM (`"type": "module"`).
- Formatting via prettier (`.prettierrc`); no separate lint gate — match the
  surrounding code style.
- Errors: use `sdk/src/error-utils.ts` helpers (`createHttpError`,
  `getErrorStatusCode`) for API-shaped failures.
- Logging: pass the `Logger` contract (`common/src/types/contracts/logger`)
  around; never `console.log` in library code.
- Sensitive-file protection: `cli/src/utils/create-run-config.ts`
  (`isSensitiveFile`) is the single denylist for agent file reads — extend it
  rather than adding ad-hoc checks.
- Version bumps for the CLI go through `bun run release:cli`.

## CI notes

- `.github/workflows/ci.yml` pins bun 1.3.5 (keep `.bun-version` in sync).
- `evals.yml` only fires when a commit message contains `[buffbench]` and
  runs `bun run run-buffbench` inside `evals/`.
- The nightly e2e workflow builds the SDK then runs web docs checks; there is
  intentionally no `.agents` e2e suite.

## Concurrency warning

This repo is sometimes worked on by more than one agent session at a time
(check `git status` and running `bun.exe` processes before assuming you are
alone). Do not revert changes you did not make; verify with the test suites
instead.
