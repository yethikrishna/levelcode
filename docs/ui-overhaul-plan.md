# LevelCode TUI Overhaul — Improvement List & Plan

Audited 2026-09-05 against `cli/src` (153 components, OpenTUI 0.1.74 + React).
Goal: a modern, GUI-grade terminal experience — consistent iconography,
polished surfaces, and the provider/config flows that are missing today.

**Constraint:** terminals render text cells, not SVG. "Proper icons" = a
curated single-width Unicode glyph set (geometric + arrows + status marks,
forced to text presentation with U+FE0E where needed), themed via tokens —
the approach modern TUIs (crush, opencode) use. No nerd-font requirement.

## A. Iconography & emoji (visual)

1. **No icon registry** — ~160 UI emoji/glyphs scattered across 60 files.
   Create `cli/src/utils/icons.ts`: one semantic token map (activity, status,
   nav, tools, files, messaging) consumed everywhere.
2. **Activity bar** (`state/activity-bar-store.ts:34-42`): 💬👥📁🔍📊🧩⚙️ → themed glyphs.
3. **Welcome screen** (`components/welcome-screen.tsx:19-24`): 🔍🐛🧪♻️🔒📝 chips → glyphs.
4. **Status marks**: ⏳❌✅⚠️💡📋🚀💥🛑👋🔌📦🤖💖📂📷🖼📄📎🔗⏸ across
   command-registry, login-modal, publish-container, session, marketplace,
   agents-console, pr-swarm, attachment cards, toasts, input-modes → icons.ts.
5. **Broken literal**: `welcome-screen.tsx:116` renders `\u00B7` as raw text.

## B. Surfaces & layout polish

6. **Borders**: 60× `borderStyle:'single'` vs 5× rounded → default rounded
   everywhere; double/heavy accents for focus/active panels (unused today).
7. **Hardcoded hex colors** in 21 files (swarm-topology 15, team-metrics 12,
   status-bar 10, token-dashboard 5, markdown-renderer 5, diff-viewer 4, …)
   → migrate to theme tokens so all 5 themes stay coherent.
8. **Spacing rhythm**: inconsistent padding; standardize 1-cell gutters,
   panel padding, and section gaps via shared constants.
9. **Scroll feedback**: scrollbar hidden during streaming
   (`chat.tsx:1478-1481`) — show a subtle position indicator instead.

## C. Provider & config UX (functional gaps)

10. **No custom OpenAI-compatible endpoint**: wizard filters out the `custom`
    category (`provider-wizard.tsx:68-70`) and never writes `baseUrl`
    (`handleSave` L125-140) — users cannot point at LM Studio/llama.cpp/
    Azure/any OpenAI-compatible server despite the schema supporting it.
11. **No baseUrl edit flow**: `provider-store.ts` lacks `updateProvider`;
    settings/model-picker/provider-status-list never show or edit baseUrl.
12. **Test-connection wizard-only**, uses the static definition URL, not the
    user's override; `/provider:test` reads a field the wizard never sets.
13. **No manual model entry** despite `customModelIds` in the schema.
14. **Key-upload to backend on add** (`provider-store.ts:174-200`) with no
    consent/opt-out disclosure in the wizard.
15. **`/model:info`** shows the static definition URL, not the user's override.

## D. Dead / broken surfaces

16. **Activity bar is decorative**: `activeView` is set but no component
    consumes it; keys 1-7 do nothing visible.
17. **Background panel never renders**: `/bg:list` sets
    `openBackgroundPanel: true` but `chat.tsx handleCommandResult` ignores it.
18. **Syntax highlighting is a stub** (`utils/syntax-highlighter.tsx`) while
    OpenTUI ships a tree-sitter `CodeRenderable` + the worker is already
    wired for compiled binaries — light it up.
19. **Diff viewer hand-rolled** while OpenTUI `DiffRenderable` exists.

## E. Model routing (found this session, shipped separately)

20. Catalog parser produced junk entries (`models.dev` nests under
    `provider.models`) → garbage model ids selectable → runs died. Fixed.
21. Placeholder API keys (e.g. `test`) routed requests to doomed providers.
    Fixed with a usable-key guard.
22. Repo-map generation can stall large projects pre-first-token — needs a
    budget/timeout so the first response is never blocked on indexing.

## Execution order

- **Phase 1** (foundation): icons.ts + border/spacing tokens; activity bar,
  welcome screen, status marks, toasts, attachment cards.
- **Phase 2** (provider UX): custom endpoint + baseUrl edit + updateProvider
  + test-from-settings + manual models + consent line.
- **Phase 3** (surfaces): hex→tokens sweep, rounded borders everywhere,
  scroll feedback, syntax highlighting via CodeRenderable.
- **Phase 4** (dead surfaces): wire or remove activity views; background
  panel; diff viewer.

Each phase: build → test (full suites) → live-verify → commit → push.
