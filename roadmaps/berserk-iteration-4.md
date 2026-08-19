# Berserk Iteration 4 — Next Tasks (Post-Verification)

**Generated autonomously**

### Analysis of Verification Results
- Team Metrics module loads successfully
- GCC core is present but not yet wired into common tests
- 62 team-related test failures in `common` package (mostly FS mocking and lifecycle tests) — likely impacted by recent Persistent Teams work
- Role hierarchy test failures (14 vs 21 roles)

### Next High-Value Actions
1. Investigate + fix team FS test failures (high priority — blocks confidence in Persistent Teams)
2. Wire GCC into the agent-runtime test suite
3. Continue monitoring Iteration 3 subagents (context tools, base2, multiline)

**Action**: Spawn 1-2 subagents for team test fixes + GCC wiring.