# Worktree Isolation

Git worktrees give every agent (or every run) its own checkout, branch, and
node-free workspace state — so parallel agents never clobber each other's
edits, and a bad run never touches your main checkout.

## Per-run isolation: `--worktree <name>`

```bash
# Interactive: boot the TUI inside an isolated worktree
levelcode --worktree feature-auth

# Headless / CI: run the whole task in a throwaway checkout
levelcode -p --output-format json --worktree ci-fix-42 "fix the failing test"
```

- Creates `.levelcode/worktrees/<name>` on branch `worktree/<name>` (from the
  current HEAD) and runs the session inside it.
- Re-entering the same name **reuses** the existing worktree (resume
  semantics) — uncommitted work survives.
- Combine with `--cwd <dir>` to create the worktree inside a different repo.
- Remove with `git worktree remove .levelcode/worktrees/<name>` (the branch
  `worktree/<name>` is kept).

## `.worktreeinclude`

Git worktrees contain only **tracked** files — but builds and tests usually
need gitignored files (`.env`, local config, secrets). List them in a
`.worktreeinclude` file at the repo root:

```gitignore
# copied into every new worktree
.env
.env.local
config/*.local
```

Each new worktree (agent or named) gets these files copied from the repo
root. Lines starting with `#` are comments; a path ending in `/*` copies all
immediate files of that directory.

## Swarm agents

The hierarchical swarm coordinator creates per-agent worktrees via
`createAgentWorktree(repoRoot, agentId, taskId)`:

- branch `agent/<agentId>/<taskId>`
- path `.levelcode/worktrees/<agentId>/<taskId>`
- `.worktreeinclude` files copied on creation
- helpers: `commitInWorktree`, `getWorktreeDiffStats`,
  `hasUncommittedChanges`, `rollbackWorktree`, `removeAgentWorktree`

All exported from `@levelcode/common/utils/worktree-isolation` (also
re-exported from `@levelcode/sdk`).
