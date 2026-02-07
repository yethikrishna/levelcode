# Changelog

All notable changes to LevelCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-07

### Added
- Agent Swarms/Teams system for multi-agent coordination
- 24 team roles from Intern to CTO with hierarchy
- 21 agent templates (coordinator, manager, senior-engineer, researcher, designer, product-lead, intern, apprentice, junior-engineer, mid-level-engineer, staff-engineer, senior-staff-engineer, principal-engineer, distinguished-engineer, fellow, cto, vp-engineering, director, tester, sub-manager, scientist)
- 7 new tools: TeamCreate, TeamDelete, SendMessage, TaskCreate, TaskGet, TaskUpdate, TaskList
- 7 /team:* slash commands for team management
- Development phase lifecycle (planning → pre-alpha → alpha → beta → production → mature)
- Inbox-based inter-agent messaging (DM, broadcast, shutdown, plan approval)
- Team panel TUI component showing real-time team status
- swarmEnabled setting and LEVELCODE_ENABLE_SWARMS env flag
- File-based persistence at ~/.config/levelcode/teams/
- Hook events: TeammateIdle, TaskCompleted, PhaseTransition

## [0.0.001] - 2026-02-05

### Added
- Initial release of LevelCode
- Multi-agent architecture with specialized agents:
  - File Picker Agent
  - Planner Agent
  - Editor Agent
  - Reviewer Agent
- Support for 200+ models via OpenRouter
- TypeScript SDK for programmatic use
- Terminal-first CLI with real-time streaming
- Custom agent workflows with TypeScript generators
- Comprehensive documentation
- Evaluation benchmarks (BuffBench)

### Features
- Natural language code editing
- Intelligent file discovery
- Precise code modifications
- Automatic code review
- Git integration

### Technical
- Built with TypeScript and Bun
- React-based terminal UI (OpenTUI)
- Monorepo structure with workspaces
- Comprehensive test suite

## [Unreleased]

### Planned
- VS Code Extension
- JetBrains Plugin
- Web Interface
- Self-Hosted Server Mode
- Plugin Marketplace

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 0.1.0   | 2026-02-07 | Agent Swarms/Teams system |
| 0.0.001 | 2026-02-05 | Initial release |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute to this project.

## Credits

Created by [Yethikrishna R](https://github.com/yethikrishna)

Based on [LevelCode](https://github.com/LevelCodeAI/levelcode) (Apache 2.0 License)
