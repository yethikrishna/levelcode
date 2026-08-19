// Eval regression comparison tool.
// Compares two buffbench eval runs and reports regressions (score drops)
// versus a baseline (typically main branch).

import fs from 'fs'
import path from 'path'

export interface EvalRunSummary {
  agentId: string
  taskId: string
  commitSha: string
  overallScore: number
  completionScore: number
  codeQualityScore: number
  cost: number
  durationMs: number
  error?: string
}

export interface EvalBaseline {
  metadata: {
    timestamp: string
    evalDataPaths: string[]
    agentsTested: string[]
    commitsEvaluated: number
    totalDuration: number
    gitSha?: string
  }
  runs: EvalRunSummary[]
  agentAverages: Record<string, {
    averageScore: number
    averageCost: number
    averageDuration: number
    successRate: number
  }>
}

export interface RegressionResult {
  taskId: string
  agentId: string
  baselineScore: number
  currentScore: number
  delta: number
  isRegression: boolean
  severity: 'critical' | 'major' | 'minor' | 'none'
}

export interface ComparisonReport {
  baseline: { sha?: string; agentCount: number; taskCount: number }
  current: { sha?: string; agentCount: number; taskCount: number }
  regressions: RegressionResult[]
  improvements: RegressionResult[]
  summary: {
    totalTasks: number
    totalRegressions: number
    totalImprovements: number
    averageScoreDelta: number
    criticalRegressions: number
    majorRegressions: number
    minorRegressions: number
  }
}

const CRITICAL_THRESHOLD = -2.0
const MAJOR_THRESHOLD = -1.0
const MINOR_THRESHOLD = -0.3

function classifySeverity(delta: number): RegressionResult['severity'] {
  if (delta <= CRITICAL_THRESHOLD) return 'critical'
  if (delta <= MAJOR_THRESHOLD) return 'major'
  if (delta <= MINOR_THRESHOLD) return 'minor'
  return 'none'
}

function loadEvalRuns(resultsPath: string): EvalBaseline | null {
  if (!fs.existsSync(resultsPath)) return null

  try {
    const raw = fs.readFileSync(resultsPath, 'utf-8')
    const data = JSON.parse(raw)

    const runs: EvalRunSummary[] = []
    const agentAverages: EvalBaseline['agentAverages'] = {}

    for (const [agentId, agentData] of Object.entries(data)) {
      if (agentId === 'metadata' || agentId === 'metaAnalysis') continue

      const ad = agentData as any
      if (!ad.runs) continue

      for (const run of ad.runs) {
        runs.push({
          agentId,
          taskId: run.commitSha?.slice(0, 12) || run.taskId || 'unknown',
          commitSha: run.commitSha,
          overallScore: run.judging?.overallScore ?? 0,
          completionScore: run.judging?.completionScore ?? 0,
          codeQualityScore: run.judging?.codeQualityScore ?? 0,
          cost: run.cost ?? 0,
          durationMs: run.durationMs ?? 0,
          error: run.error,
        })
      }

      const validRuns = ad.runs.filter((r: any) => !r.error)
      const totalRuns = ad.runs.length
      agentAverages[agentId] = {
        averageScore: ad.averageScore ?? 0,
        averageCost: ad.averageCost ?? 0,
        averageDuration: ad.averageDuration ?? 0,
        successRate: totalRuns > 0 ? validRuns.length / totalRuns : 0,
      }
    }

    return {
      metadata: {
        timestamp: data.metadata?.timestamp || new Date().toISOString(),
        evalDataPaths: data.metadata?.evalDataPaths || [],
        agentsTested: data.metadata?.agentsTested || Object.keys(agentAverages),
        commitsEvaluated: data.metadata?.commitsEvaluated || runs.length,
        totalDuration: data.metadata?.totalDuration || 0,
        gitSha: data.metadata?.gitSha,
      },
      runs,
      agentAverages,
    }
  } catch {
    return null
  }
}

function loadLatestEvalRun(evalDir: string): EvalBaseline | null {
  if (!fs.existsSync(evalDir)) return null

  const entries = fs.readdirSync(evalDir, { withFileTypes: true })
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse()

  for (const dir of dirs) {
    const finalPath = path.join(evalDir, dir, 'FINAL_RESULTS.json')
    const result = loadEvalRuns(finalPath)
    if (result) return result
  }

  return null
}

export function compareEvalRuns(
  baseline: EvalBaseline,
  current: EvalBaseline,
): ComparisonReport {
  const regressions: RegressionResult[] = []
  const improvements: RegressionResult[] = []
  let totalDelta = 0
  let comparedCount = 0

  const baselineMap = new Map<string, EvalRunSummary>()
  for (const run of baseline.runs) {
    baselineMap.set(`${run.agentId}:${run.commitSha}`, run)
  }

  for (const run of current.runs) {
    const key = `${run.agentId}:${run.commitSha}`
    const baselineRun = baselineMap.get(key)
    if (!baselineRun) continue

    const delta = run.overallScore - baselineRun.overallScore
    totalDelta += delta
    comparedCount++

    const severity = classifySeverity(delta)
    const result: RegressionResult = {
      taskId: run.commitSha?.slice(0, 12) || run.taskId,
      agentId: run.agentId,
      baselineScore: baselineRun.overallScore,
      currentScore: run.overallScore,
      delta,
      isRegression: delta < 0,
      severity,
    }

    if (delta < MINOR_THRESHOLD) {
      regressions.push(result)
    } else if (delta > Math.abs(MINOR_THRESHOLD)) {
      improvements.push(result)
    }
  }

  regressions.sort((a, b) => a.delta - b.delta)
  improvements.sort((a, b) => b.delta - a.delta)

  const criticalRegressions = regressions.filter((r) => r.severity === 'critical').length
  const majorRegressions = regressions.filter((r) => r.severity === 'major').length
  const minorRegressions = regressions.filter((r) => r.severity === 'minor').length

  return {
    baseline: {
      sha: baseline.metadata.gitSha,
      agentCount: Object.keys(baseline.agentAverages).length,
      taskCount: baseline.runs.length,
    },
    current: {
      sha: current.metadata.gitSha,
      agentCount: Object.keys(current.agentAverages).length,
      taskCount: current.runs.length,
    },
    regressions,
    improvements,
    summary: {
      totalTasks: comparedCount,
      totalRegressions: regressions.length,
      totalImprovements: improvements.length,
      averageScoreDelta: comparedCount > 0 ? totalDelta / comparedCount : 0,
      criticalRegressions,
      majorRegressions,
      minorRegressions,
    },
  }
}

export function formatReportMarkdown(report: ComparisonReport): string {
  const lines: string[] = []

  lines.push('## 📊 Eval Regression Report')
  lines.push('')
  lines.push(`- **Baseline**: ${report.baseline.sha ? report.baseline.sha.slice(0, 7) + ' ' : ''}(${report.baseline.agentCount} agents × ${report.baseline.taskCount} tasks)`)
  lines.push(`- **Current**: ${report.current.sha ? report.current.sha.slice(0, 7) + ' ' : ''}(${report.current.agentCount} agents × ${report.current.taskCount} tasks)`)
  lines.push(`- **Tasks compared**: ${report.summary.totalTasks}`)
  lines.push(`- **Average score delta**: ${report.summary.averageScoreDelta >= 0 ? '+' : ''}${report.summary.averageScoreDelta.toFixed(2)}`)
  lines.push('')

  if (report.summary.criticalRegressions > 0 || report.summary.majorRegressions > 0) {
    lines.push('### ⚠️ Regressions Detected')
    lines.push('')
    lines.push(`- 🔴 Critical: ${report.summary.criticalRegressions}`)
    lines.push(`- 🟠 Major: ${report.summary.majorRegressions}`)
    lines.push(`- 🟡 Minor: ${report.summary.minorRegressions}`)
    lines.push('')
  } else {
    lines.push('### ✅ No Significant Regressions')
    lines.push('')
  }

  if (report.regressions.length > 0) {
    lines.push('#### Regressed Tasks')
    lines.push('')
    lines.push('| Agent | Task | Baseline | Current | Delta | Severity |')
    lines.push('|-------|------|----------|---------|-------|----------|')
    for (const r of report.regressions.slice(0, 30)) {
      const icon = r.severity === 'critical' ? '🔴' : r.severity === 'major' ? '🟠' : '🟡'
      lines.push(`| ${r.agentId} | ${r.taskId} | ${r.baselineScore.toFixed(1)} | ${r.currentScore.toFixed(1)} | ${r.delta.toFixed(1)} | ${icon} ${r.severity} |`)
    }
    if (report.regressions.length > 30) {
      lines.push(`| ... | ... | ... | ... | ... | (+${report.regressions.length - 30} more) |`)
    }
    lines.push('')
  }

  if (report.improvements.length > 0) {
    lines.push('#### Improvements')
    lines.push('')
    lines.push('| Agent | Task | Baseline | Current | Delta |')
    lines.push('|-------|------|----------|---------|-------|')
    for (const r of report.improvements.slice(0, 10)) {
      lines.push(`| ${r.agentId} | ${r.taskId} | ${r.baselineScore.toFixed(1)} | ${r.currentScore.toFixed(1)} | +${r.delta.toFixed(1)} |`)
    }
    if (report.improvements.length > 10) {
      lines.push(`| ... | ... | ... | ... | (+${report.improvements.length - 10} more) |`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function hasBlockingRegression(report: ComparisonReport): boolean {
  return report.summary.criticalRegressions > 0 || report.summary.majorRegressions >= 3
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.log('Usage: eval-compare.ts <baseline.json> <current.json> [--markdown]')
    console.log('  or:  eval-compare.ts --dir <buffbench-logs-dir> --baseline-sha <sha> [--markdown]')
    process.exit(1)
  }

  let baseline: EvalBaseline | null = null
  let current: EvalBaseline | null = null

  const markdown = args.includes('--markdown')
  const dirIdx = args.indexOf('--dir')
  const baselineShaIdx = args.indexOf('--baseline-sha')

  if (dirIdx !== -1 && args[dirIdx + 1]) {
    const logsDir = path.resolve(args[dirIdx + 1])
    const allResults = findAllEvalRuns(logsDir)
    current = allResults[0] || null

    if (baselineShaIdx !== -1 && args[baselineShaIdx + 1]) {
      const sha = args[baselineShaIdx + 1]
      baseline = allResults.find((r) => r.metadata.gitSha?.startsWith(sha)) || null
    }
    if (!baseline && allResults.length > 1) {
      baseline = allResults[1]
    }
  } else {
    baseline = loadEvalRuns(path.resolve(args[0]))
    current = loadEvalRuns(path.resolve(args[1]))
  }

  if (!baseline || !current) {
    console.error('Failed to load baseline or current eval results')
    process.exit(1)
  }

  const report = compareEvalRuns(baseline, current)

  if (markdown) {
    console.log(formatReportMarkdown(report))
  } else {
    console.log(JSON.stringify(report, null, 2))
  }

  process.exit(hasBlockingRegression(report) ? 1 : 0)
}

function findAllEvalRuns(evalDir: string): EvalBaseline[] {
  const results: EvalBaseline[] = []
  if (!fs.existsSync(evalDir)) return results

  const entries = fs.readdirSync(evalDir, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse()

  for (const dir of dirs) {
    const finalPath = path.join(evalDir, dir, 'FINAL_RESULTS.json')
    const result = loadEvalRuns(finalPath)
    if (result) results.push(result)
  }

  return results
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('eval-compare failed:', err)
    process.exit(2)
  })
}
