# Hooks

Lifecycle hooks are config-defined commands that run at well-defined points
of the agent loop. They are the extension point for guardrails, formatting,
audit trails, and notifications — without touching the agent runtime.

## Configuration

Hooks live in `settings.json` at three levels (all enabled hooks run, in
this order):

1. `~/.config/levelcode/settings.json` — user (CLI settings location)
2. `~/.levelcode/settings.json` — user (data location, `LEVELCODE_DIR`-aware)
3. `.levelcode/settings.json` — project (highest priority)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "write_file|edit_file",
        "hooks": [{ "command": "bun .levelcode/hooks/guard-write.ts" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "write_file",
        "hooks": [{ "command": "bun .levelcode/hooks/format.ts" }]
      }
    ],
    "SessionStart": [{ "hooks": [{ "command": "bun .levelcode/hooks/onboarding.ts" }] }],
    "Stop": [{ "hooks": [{ "command": "bun .levelcode/hooks/notify.ts" }] }]
  }
}
```

- `matcher` — regex string matched against the tool name. Omit to match all.
- `command` — shell command string (`sh -c` on POSIX, `cmd /c` on Windows).
- `argv` — alternative to `command`: direct argv, no shell (portable, testable).
- `timeout` — seconds, default 10. The handler is killed on expiry.

## Events

| Event | Fires | Can block |
|---|---|---|
| `SessionStart` | once per run, before the agent loop | no |
| `PreToolUse` | after permission checks, before a tool executes | **yes** |
| `PostToolUse` | after a tool result is recorded | no |
| `Stop` | once per run, on every termination path (also errors) | no |

## Handler protocol

The payload arrives as JSON on **stdin**:

```json
{
  "event": "PreToolUse",
  "cwd": "/your/project",
  "tool_name": "write_file",
  "tool_input": { "file_path": "src/a.ts", "content": "..." },
  "tool_result": "(PostToolUse only: truncated output summary)"
}
```

**Exit codes:**

- `0` — proceed. stdout may contain a JSON decision:
  `{"decision": "block", "reason": "why"}` blocks a `PreToolUse`;
  `{"additionalContext": "..."}` is logged/surfaced to the consumer.
- `2` — block (`PreToolUse` only). stderr becomes the reason shown to the
  agent. This matches the Claude Code / Codex convention.
- anything else, a timeout, or a spawn failure — **fail-open**: recorded and
  logged, the tool call proceeds. Hooks are productivity tooling, not a
  security boundary; use permission profiles for enforcement.

## Examples

Block edits to generated files:

```ts
// .levelcode/hooks/guard-write.ts
const p = JSON.parse(await Bun.stdin.text())
if (p.tool_input?.file_path?.startsWith('src/generated/')) {
  Bun.write(Bun.stdout, JSON.stringify({
    decision: 'block',
    reason: 'src/generated/ is produced by codegen — edit the generators instead',
  }))
}
```

PostToolUse formatter that reports back:

```ts
// .levelcode/hooks/format.ts
const p = JSON.parse(await Bun.stdin.text())
if (p.tool_name === 'write_file') {
  Bun.spawnSync(['prettier', '--write', p.tool_input.file_path])
  Bun.write(Bun.stdout, JSON.stringify({ additionalContext: 'file formatted' }))
}
```

## Design notes

- One engine, everywhere: hooks run in TUI sessions, headless `levelcode -p`
  runs, and SDK `run()` calls alike.
- Compliance logging (team runs) is wired at the same chokepoint as
  `PostToolUse`: every executed tool call in a team context is written to the
  signed compliance log (`~/.levelcode/swarm/<team>/compliance/events.jsonl`).
- Config warnings (invalid JSON/schema) never break a run; they are surfaced
  to the logger.
