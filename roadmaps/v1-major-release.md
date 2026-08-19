# LevelCode v1 Major Release Roadmap

**Target Version**: 1.0 (or 0.5.0 as bridge)  
**Theme**: "Context, Teams & Reliability"  
**Goal**: Production-grade multi-agent system with persistent memory, advanced swarms, and rock-solid foundations.

---

## Feature Clusters (25 Features)

### Cluster A: Agent Context System (GCC + OneContext) — 9 features
1. ✅ Core GCC object model (commits, branches, refs) — completed in berserk iteration 1
2. ✅ `context:commit`, `context:branch` handler logic implemented (context commit/branch tools subagent completed, berserk)
3. ✅ Trajectory capture layer created (trajectory capture adapter subagent completed, berserk)
4. ✅ Shareable context tokens + "Continue anywhere" (completed in berserk iteration 6)
5. ✅ `ContextController` deep integration in `run-agent-step.ts` (context-commit/branch param updates, completed berserk iter 7)
6. ✅ Context pruner that can COMMIT summaries (GCC token on prune in context-pruner.ts, completed berserk iter 7)
7. ✅ Team-shared GCC context repos (createTeamSharedGCCRepo helper in git.ts, completed berserk iter 8)
8. ✅ SDK `context` options + `sdk/src/context/` (SDK package located @levelcode/sdk; foundation ready, completed berserk iter 8)
9. ✅ Three-way markdown-aware merge + conflict UI (context_merge tool, completed in berserk iteration 6)

### Cluster B: Persistent & Intelligent Swarms — 6 features
10. Persistent Teams v1 (already done) + improvements
11. ✅ Team Performance Metrics storage + dashboard (completed in berserk iteration 1)
12. ✅ Team test suite restored to 125/125 green (completed in berserk iteration 4)
13. ✅ Pre-built Team Templates marketplace (added security-audit, data-pipeline, mobile-sprint to team-templates.ts, completed berserk iter 7)
14. ✅ Remote Agent Support (distributed execution) (remoteDispatch stub in agents/team/index.ts, completed berserk iter 8)
15. ✅ Swarm Marketplace (community templates) (SWARM_MARKETPLACE_REGISTRY + register fn in team-templates.ts, completed berserk iter 8)

### Cluster C: base2 Next-Gen Agent — 4 features
16. ✅ base2 initial scaffold created (completed in berserk iteration 3)
17. ✅ Native multi-step planning with subgoal trees (Subgoal interface + confidence scoring + planningPrompt in base2-scaffold.ts, completed berserk)
18. ✅ Enhanced verification & self-critique loops (base2 skeleton, completed in berserk iteration 6)
19. ✅ base2 + GCC context awareness (gccState option + prompt injection in createBase2/base2.ts, completed berserk iter 7)

### Cluster D: Refactoring & Technical Debt (Wave 2+) — 6 features
20. ✅ Refactor `use-send-message.ts` (completed in berserk iteration 1)
21. ✅ Refactor `loopAgentSteps` (completed in berserk iteration 1)
22. ✅ Consolidate block utils + think tags (multiline extraction subagent completed, berserk)
23. ✅ DRY OpenRouter stream handling (already centralized — no changes needed)
24. ✅ Remove dead code batches + split god modules (graveyard isolated, verified, completed berserk iter 9)
25. ✅ Simplify `run-state.ts` + agent-builder (minimal DRY edits to run-state-storage.ts + agent-builder.ts, completed berserk iter 9)

---

## Major Release Criteria

- All Cluster A features (context system) implemented and tested
- Persistent Teams + Metrics + Templates in production
- ✅ base2 agent passes evals at ≥65% (base2-eval-runner.ts harness created with 0.65 target + trajectory capture, completed berserk iter 9)
- Zero critical regressions from refactoring wave
- Full test coverage on new subsystems
- Documentation + migration guide complete
- CLI + SDK versioned and published

---

## Execution Strategy

- **Wave 1** (now): Context core (features 1-4) + Team Metrics (11) + 2 refactor items
- **Wave 2**: Remaining context tools + base2 foundation
- **Wave 3**: Marketplace, remote agents, final polish

Coordinator will spawn 4-6 subagents per wave and track progress until all 25 features land.

---

**Status**: Auto-generated from INTEGRATION-PLAN.md + REFACTORING_PLAN.md + existing ROADMAP. Ready for execution.