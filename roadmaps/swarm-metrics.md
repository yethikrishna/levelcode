# Swarm Metrics & Intelligence — Focused Roadmap

**Part of v1 Major Release**

## Features
1. Per-team metrics (tokens used, tasks completed, success rate, avg duration)
2. Team performance dashboard in TUI
3. Automatic template scoring (which templates perform best on which task types)
4. Leaderboard for built-in templates
5. Export metrics to JSON/CSV for CI

## Implementation Notes
- Store metrics alongside persisted teams
- Add `team:get-metrics` tool
- Visual bar charts in terminal using existing TUI components

**Target**: Metrics visible after any team run; templates get quality scores over time.