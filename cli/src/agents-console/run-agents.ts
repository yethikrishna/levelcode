/**
 * Disk glue for `levelcode agents` — thin on purpose; all formatting lives
 * in agents-console.ts (pure, unit-tested). Loaded via dynamic import from
 * index.tsx so the fast path (--help/--version) never pays for it.
 */

import { listAllTeams, getLastActiveTeam } from '@levelcode/common/utils/team-discovery'
import { loadTeamConfig, listTasks } from '@levelcode/common/utils/team-fs'

import type { TeamTask } from '@levelcode/common/types/team-config'
import type { AgentsConsoleData, ConsoleTheme } from './agents-console'
import { formatAgentsOverview, formatTeamDetail, ansiTheme } from './agents-console'

export function collectAgentsData(): AgentsConsoleData {
  const lastActive = getLastActiveTeam()
  const teams: AgentsConsoleData['teams'] = []

  for (const summary of listAllTeams()) {
    const config = loadTeamConfig(summary.name)
    if (!config) continue
    let tasks: TeamTask[] = []
    try {
      tasks = listTasks(summary.name)
    } catch {
      tasks = []
    }
    teams.push({
      name: summary.name,
      config,
      tasks,
      isLastActive: summary.name === lastActive,
    })
  }

  // Most recently active first, then alphabetical.
  teams.sort((a, b) => {
    if (a.isLastActive !== b.isLastActive) return a.isLastActive ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return { teams }
}

function themeFor(): ConsoleTheme {
  return ansiTheme(!process.env.NO_COLOR && Boolean(process.stdout.isTTY))
}

export function renderAgentsCommand(teamName?: string): { output: string; exitCode: number } {
  const theme = themeFor()
  const data = collectAgentsData()

  if (teamName) {
    const team = data.teams.find(
      (t) => t.name === teamName || t.name.toLowerCase() === teamName.toLowerCase(),
    )
    if (!team) {
      return {
        output: `No team named "${teamName}" found.\nRun \`levelcode agents\` to list all teams.`,
        exitCode: 1,
      }
    }
    return {
      output: formatTeamDetail(team.name, team.config, team.tasks, team.isLastActive, theme),
      exitCode: 0,
    }
  }

  return { output: formatAgentsOverview(data, theme), exitCode: 0 }
}
