# Agent Context Roadmap — GCC + OneContext

**Owner**: LevelCode Core Team  
**Status**: Planning → Implementation (Wave 1)  
**Related**: INTEGRATION-PLAN.md (original detailed spec)

---

## Vision

Give every agent session **version-controlled, branchable, shareable memory** so teams can:
- Checkpoint reasoning at any point
- Explore multiple solution paths in parallel (branch)
- Merge the best paths
- Resume or share context across machines ("continue anywhere")

---

## Wave 1 — Minimal Viable Context (Target: June 2025)

### Core GCC Model
- Local filesystem store at `~/.config/levelcode/contexts/<repoHash>/`
- Git-like objects: commits, branches, refs, trees
- Three core operations exposed as tools + CLI:
  - `context:commit [summary]`
  - `context:branch <name>`
  - `context:merge <branch>`
- Auto-commit hooks at turn end, subagent completion, and context pruning

### OneContext Trajectory Layer
- JSONL event log attached to every GCC commit
- Events: tool calls, results, assistant deltas, file edits, reasoning traces
- PII redaction hooks
- Token budgeting

### SDK & CLI Surface
- New `RunOptions.context` options
- `/context:commit`, `/context:branch`, `/context:share` commands
- `LevelCodeClient` methods: `share()`, `continueFrom(token)`

### Success Criteria
- User can manually checkpoint a session, branch it, and resume from a share token on another machine
- Context operations add <5% overhead to normal turns

---

## Wave 2 — Deep Integration

- Automatic context injection into system prompts
- Team-level shared context repo
- Context pruner that can COMMIT summaries instead of only truncating
- Visual branch explorer in TUI

---

## Non-Goals (for now)
- Remote/distributed context store
- Full three-way semantic merge of code changes (only context reasoning)
- Enterprise policy engine

---

## References
- Original INTEGRATION-PLAN.md (detailed requirements)
- arXiv:2508.00031 (GCC paper)
- TheAgentContextLab/OneContext

---

**Next step**: Implement `ContextController` + `context:commit` tool in `packages/agent-runtime`.