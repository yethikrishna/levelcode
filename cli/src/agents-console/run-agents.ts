/**
 * Disk glue for `levelcode agents` — thin on purpose; all formatting lives
 * in agents-console.ts (pure, unit-tested). Loaded via dynamic import from
 * index.tsx so the fast path (--help/--version) never pays for it.
 */

import { listAllTeams, getLastActiveTeam } from '@levelcode/common/utils/team-discovery'
import { loadTeamConfig, listTasks } from '@levelcode/common/utils/team-fs'
import { getComplianceEvents } from '@levelcode/common/utils/compliance-logger'

import type { TeamTask } from '@levelcode/common/types/team-config'
import type { AgentsConsoleData, ConsoleTheme, ComplianceSummary } from './agents-console'
import { formatAgentsOverview, formatTeamDetail, ansiTheme, summarizeCompliance } from './agents-console'

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

const CLEAR_SCREEN = '[2J[H'

/** One watch tick: clear + fresh render. Extracted for testability. */
export function renderWatchTick(): string {
  return CLEAR_SCREEN + formatAgentsOverview(collectAgentsData(), themeFor())
}

const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Watch loop: re-render every intervalMs until interrupted. Ctrl+C kills
 * the process (the last render stays visible). Accepts an AbortSignal for
 * tests and embedders.
 */
export async function runWatchLoop(
  intervalMs: number,
  sleep = defaultSleep,
  signal?: AbortSignal,
): Promise<void> {
  for (;;) {
    if (signal?.aborted) return
    process.stdout.write(renderWatchTick())
    await sleep(intervalMs)
    if (signal?.aborted) return
  }
}

/** Load a team's compliance summary; failures degrade to undefined. */
export function loadComplianceSummary(teamName: string): ComplianceSummary | undefined {
  try {
    return summarizeCompliance(getComplianceEvents(teamName))
  } catch {
    return undefined
  }
}

export function renderAgentsCommand(
  teamName?: string,
  compliance: (name: string) => ComplianceSummary | undefined = loadComplianceSummary,
): { output: string; exitCode: number } {
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
      output: formatTeamDetail(
        team.name,
        team.config,
        team.tasks,
        team.isLastActive,
        theme,
        compliance(team.name),
      ),
      exitCode: 0,
    }
  }

  return { output: formatAgentsOverview(data, theme), exitCode: 0 }
}
