# LevelCode Roadmap

> Last updated: May 2025  
> Status: Living document — reevaluated weekly

LevelCode is the open-source multi-agent AI coding system that outperforms single-model tools through specialized agent swarms.

---

## Current Focus (Q2 2025)

### 1. Agent Context & Memory (GCC + OneContext)
Foundation for persistent, branchable, shareable agent memory.

- **GCC (Git-style Context Control)** — Versioned context commits, branches, merges, and selective retrieval
- **OneContext Trajectory Capture** — Structured recording of every agent action for replay, analysis, and "continue anywhere"
- **Context Sharing Tokens** — Export/import context state across machines and sessions

**Target**: Minimal GCC implementation with `context:commit`, `context:branch`, and shareable tokens by end of June.

### 2. Persistent Teams & Team Templates
Make multi-agent teams durable and reusable.

- ✅ **TeamRegistry core** implemented (May 2025)
- Save and restore named teams across sessions (`/team:save`, `/team:load`)
- Pre-built team templates (Code Review, Full-Stack Sprint, Research, Security Audit) — in progress
- Team performance metrics dashboard — planned

### 3. base2 — Next-Gen Default Agent
Evolve the core reasoning agent with:
- Deeper tool-use orchestration
- Native multi-step planning
- Better self-correction and verification loops

---

## Completed

### Agent Swarms (v1)
- Multi-agent orchestration with team lead + teammate roles
- Dynamic agent spawning and task delegation
- Inter-agent messaging and shared task system
- Rich role hierarchy (intern → distinguished engineer, product-lead, cto, etc.)

### Modern CLI & SDK
- TUI rebuilt with OpenTUI + React 19
- Full core functionality extracted into `@levelcode/sdk`
- CLI is now a thin, powerful client of the SDK

---

## Future Plans (Prioritized)

### Swarm Enhancements
| Feature                        | Priority | Status     | Notes |
|--------------------------------|----------|------------|-------|
| Persistent Teams Across Sessions | P0      | Planned   | Save/restore team configs + state |
| Team Templates                 | P0      | Planned   | Code-review, full-stack, research teams |
| Team Performance Metrics       | P1      | Planned   | Efficiency, completion rate, utilization |
| Remote Agent Support           | P2      | Planned   | Distributed execution across machines |
| Swarm Marketplace              | P3      | Future    | Community templates & agent configs |

### Agent Context System (GCC + OneContext)
See [roadmaps/agent-context.md](./roadmaps/agent-context.md) for the detailed integration plan.

### Developer Experience
- First-class `/team:*` slash command family
- Visual team builder in the TUI
- One-click "Continue this session on another machine"
- Better evals and self-improvement loops

---

## How to Contribute

1. Pick an item from the tables above or open a new proposal in Discussions
2. For large features, create a focused roadmap doc under `roadmaps/`
3. Implement behind feature flags when possible
4. Add tests and update this document when merged

---

**Next milestone**: Persistent Teams + basic GCC context commits (target: June 2025)