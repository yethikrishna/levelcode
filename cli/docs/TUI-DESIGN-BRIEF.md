# LevelCode TUI — 100,000× Design Brief

> Aggregated from three research passes (2026-08-31): SOTA TUI frameworks
> (OpenTUI, Ink v7, Bubble Tea v2, Ratatui 0.30), terminal design systems
> (Catppuccin, Nord, Flexoki, Geist, termstandard), and agentic CLI UX
> (Claude Code, Codex, Gemini CLI, opencode, Crush, Aider, Amp).
> Every item is an engineering technique this codebase can adopt.

## Where LevelCode already meets the bar

- Semantic `ChatTheme` token architecture (surface ramp, status segments,
  syntax palette) — matches the Geist/Catppuccin two-tier model.
- Truecolor detection + ANSI-name fallback for Terminal.app.
- IDE theme inference, OSC theme detection, theme file watching.
- 90-command registry, slash suggestions, @-mentions, message queueing,
  side chats, checkpoints, permission profiles, cost dashboard.

## Adopted in this pass

1. **Thin launcher** (`index.tsx` + `cli-flags.ts`): `--help`/`--version`/
   unknown-flag errors resolve in milliseconds — the multi-MB runtime loads
   only when the app actually boots (Bubble Tea/Ratatui-style "parse first,
   pay later"). Non-TTY invocations refuse gracefully instead of dumping
   escape soup into pipes.
2. **Command palette wired to the real registry**: all ~90 commands, grouped
   by namespace (`team:`, `model:`, …), ranked by a scored fuzzy matcher
   (`utils/fuzzy-match.ts`) with match highlighting, arg-command prefill
   (`[args]` chip → inserts `/cmd ` into the input), windowed scrolling,
   Ctrl+U / Ctrl+W editing, home/end.
3. **Spinner craft** (primitives/spinner): cli-spinners-standard cadences
   (80ms braille / 130ms line), single-width-glyph invariant (layout never
   shifts), `done` terminal state (✓ — a finished spinner must never freeze
   mid-frame, ora etiquette), `LEVELCODE_NO_MOTION=1` reduced-motion freeze,
   `LEVELCODE_SPINNER_INTERVAL_MS` global retune.

## Next-bar items (roadmap, research-backed)

### Architecture
- **TerminalCapabilities module** (Bubble Tea v2 pattern): probe color
  profile, background color (OSC 11), kitty keyboard, bracketed paste, OSC 8
  once at boot; degrade at output time. Replace scattered `COLORTERM` checks.
- **Panic-safe teardown** (Ratatui `init/restore`): `renderer.destroy()` on
  every exit path incl. unhandled errors (OpenTUI contract when
  `exitOnCtrlC: false`).
- **Static scrollback contract** (Ink `<Static>`): append *finished* chat
  blocks above the live region; only the active turn re-renders. Biggest
  perf + scrollback/search win for long sessions.

### Visual craft
- **Dual-stepped accents** (Flexoki): same token re-tuned per mode — dark
  uses 600-weight hex, light uses 400. Today's light theme reuses dark hexes.
- **Contrast floor** (WCAG 2.2 adapted): text ≥ 4.5:1, focus/selection ≥
  3:1, muted ≈ 3:1 for non-essential only. Nord's comments (1.7:1) are the
  cautionary tale.
- **Never color-only status**: pair ✓/✗/⚠ with labels everywhere
  (figures/log-symbols rule; also covers deuteranopia).
- **Rounded borders** (`╭ ╮ ╯ ╰`) as the default panel style; heavy/ASCII
  as the degradation ladder.

### Interaction
- **Permission modes as a cycled key** (Shift+Tab: default → acceptEdits →
  plan → bypass) instead of per-action dialogs (Claude Code/Gemini).
- **Queue-while-running with editable queue** (Enter queues, Up pulls back).
- **Raw-scrollback mode** (Codex `/raw`): toggle that swaps the TUI for
  plain streamed lines so terminal selection/copy works.
- **Interrupt keeps partial output** (Aider): tokens already paid for stay
  in the transcript.
- **Rewind = code + prompt together** (opencode `/undo` re-displays the
  original prompt for editing).
- **Notifications respect terminal focus** (Crush/Codex): bell/OSC 9 only
  when unfocused.
- **Status line as data**: model · mode · context-left % · cost · git
  branch, debounced 300ms (Claude Code reference contract).

### Testing
- Frame-string assertions (`ink-testing-library.lastFrame` pattern) for
  primitives; pure render = f(state) keeps tests TTY-free.

## Feature deltas shipped alongside

- `levelcode doctor` — dependency health panel (exit code CI-usable).
- `levelcode -p "prompt" [--output-format text|json|stream-json]` — headless
  print mode over the PrintModeEvent NDJSON protocol (unix-citizen stdout).
