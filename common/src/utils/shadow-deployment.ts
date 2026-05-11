import type { SwarmState } from '../utils/swarm-state'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { getConfigDir } from '../utils/auth'

// ============================================================================
// Shadow Deployment Configuration
// ============================================================================

export interface ShadowConfig {
  enabled: boolean           // Enable shadow deployments (default true)
  testBranch: string      // Branch for shadow testing (default: auto-gen)
  autoCompare: boolean    // Auto-compare results (default true)
  testTimeout: number    // Max ms for shadow test (default 60000)
  metricsToCompare: string[] // Which metrics to compare
}

const DEFAULT_SHADOW_CONFIG: ShadowConfig = {
  enabled: true,
  testBranch: '',
  autoCompare: true,
  testTimeout: 60000,
  metricsToCompare: ['testsPassed', 'buildSuccess', 'lintErrors'],
}

// ============================================================================
// Shadow Environment
// ============================================================================

export interface ShadowInstance {
  taskId: string
  mainWorktree: string
  shadowWorktree: string
  mainResult?: ShadowResult
  shadowResult?: ShadowResult
  status: 'pending' | 'running' | 'completed' | 'failed'
  diff?: string
}

export interface ShadowResult {
  success: boolean
  duration: number
  testsPassed?: number
  testsFailed?: number
  lintErrors?: number
  buildSuccess: boolean
  error?: string
  output?: string
}

// ============================================================================
// Shadow Deployment Management
// ============================================================================

export function createShadowInstance(
  taskId: string,
  mainWorktree: string,
  testBranch?: string,
): ShadowInstance {
  const branchName = testBranch || `shadow-${taskId}-${Date.now()}`

  return {
    taskId,
    mainWorktree,
    shadowWorktree: path.join(path.dirname(mainWorktree), branchName),
    status: 'pending',
  }
}

export function setupShadowInstance(
  instance: ShadowInstance,
): { success: boolean; error?: string } {
  try {
    // Create branch from main for testing
    execSync(`git worktree add "${instance.shadowWorktree}" -b ${path.basename(instance.shadowWorktree)}`, {
      cwd: instance.mainWorktree,
      stdio: 'pipe',
    })

    instance.status = 'pending'
    return { success: true }
  } catch (error) {
    instance.status = 'failed'
    return { success: false, error: String(error) }
  }
}

export function cleanupShadowInstance(
  instance: ShadowInstance,
  repoRoot: string,
): void {
  try {
    // Remove shadow worktree
    execSync(`git worktree remove "${instance.shadowWorktree}"`, {
      cwd: repoRoot,
      stdio: 'pipe',
    })
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Shadow Testing
// ============================================================================

export async function runShadowTest(
  instance: ShadowInstance,
  testCommand: string,
  timeout = DEFAULT_SHADOW_CONFIG.testTimeout,
): Promise<ShadowResult> {
  instance.status = 'running'

  const startTime = Date.now()

  try {
    // Run test command in shadow worktree
    const output = execSync(testCommand, {
      cwd: instance.shadowWorktree,
      encoding: 'utf-8',
      timeout,
    })

    const duration = Date.now() - startTime

    instance.shadowResult = {
      success: true,
      duration,
      buildSuccess: true,
      output,
    }

    instance.status = 'completed'
    return instance.shadowResult
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMsg = String(error)

    instance.shadowResult = {
      success: false,
      duration,
      buildSuccess: false,
      error: errorMsg,
    }

    instance.status = 'failed'
    return instance.shadowResult
  }
}

// ============================================================================
// Comparison
// ============================================================================

export function compareResults(
  instance: ShadowInstance,
): {
  differs: boolean
  mainBetter: boolean
  differences: Array<{
    metric: string
    main: number | boolean
    shadow: number | boolean
    delta: number
  }>
} {
  const differences: Array<{
    metric: string
    main: number | boolean
    shadow: number | boolean
    delta: number
  }> = []

  if (!instance.mainResult || !instance.shadowResult) {
    return { differs: false, mainBetter: false, differences }
  }

  const main = instance.mainResult
  const shadow = instance.shadowResult

  // Compare tests
  if (main.testsPassed !== undefined && shadow.testsPassed !== undefined) {
    const delta = shadow.testsPassed - main.testsPassed
    if (delta !== 0) {
      differences.push({
        metric: 'testsPassed',
        main: main.testsPassed,
        shadow: shadow.testsPassed,
        delta,
      })
    }
  }

  // Compare build
  if (main.buildSuccess !== shadow.buildSuccess) {
    differences.push({
      metric: 'buildSuccess',
      main: main.buildSuccess,
      shadow: shadow.buildSuccess,
      delta: main.buildSuccess ? 1 : -1,
    })
  }

  const differs = differences.length > 0
  const mainBetter = differences.every(d => {
    if (typeof d.main === 'boolean') {
      return d.main === true
    }
    // For numbers: higher is better
    return (d.main as number) >= (d.shadow as number)
  })

  return { differs, mainBetter, differences }
}

// ============================================================================
// Shadow Execution for Tasks
// ============================================================================

export async function runShadowDeployment(
  state: SwarmState,
  taskId: string,
  mainCommand: string,
  shadowCommand: string,
  testBranch?: string,
): Promise<{
  mainResult: ShadowResult
  shadowResult: ShadowResult
  differs: boolean
}> {
  const task = state.tasks.find(t => t.taskId === taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  const repoRoot = process.cwd()
  const instance = createShadowInstance(taskId, repoRoot, testBranch)

  // Setup shadow
  const setup = setupShadowInstance(instance)
  if (!setup.success) {
    throw new Error(`Failed to setup shadow: ${setup.error}`)
  }

  // Run main in original
  instance.mainResult = await runShadowTest(instance, mainCommand)

  // Run shadow with test
  instance.shadowResult = await runShadowTest(instance, shadowCommand)

  // Compare
  const { differs } = compareResults(instance)

  // Cleanup
  cleanupShadowInstance(instance, repoRoot)

  return {
    mainResult: instance.mainResult!,
    shadowResult: instance.shadowResult!,
    differs,
  }
}

// ============================================================================
// Shadow State Persistence
// ============================================================================

export function saveShadowState(
  teamName: string,
  instances: ShadowInstance[],
): void {
  const dir = getConfigDir()
  const shadowDir = path.join(dir, 'swarm', 'shadows')
  if (!fs.existsSync(shadowDir)) {
    fs.mkdirSync(shadowDir, { recursive: true })
  }

  const filePath = path.join(shadowDir, `${teamName}.json`)
  fs.writeFileSync(filePath, JSON.stringify(instances, null, 2), 'utf-8')
}

export function loadShadowState(teamName: string): ShadowInstance[] {
  try {
    const dir = getConfigDir()
    const filePath = path.join(dir, 'swarm', 'shadows', `${teamName}.json`)
    if (!fs.existsSync(filePath)) {
      return []
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return []
  }
}

// ============================================================================
// Formatting
// ============================================================================

export function formatShadowResult(
  instance: ShadowInstance,
  compare?: ReturnType<typeof compareResults>,
): string {
  const lines = [
    `=== Shadow Test: ${instance.taskId} ===`,
    `Status: ${instance.status}`,
    '',
  ]

  if (instance.mainResult) {
    lines.push('Main:')
    lines.push(`  Success: ${instance.mainResult.success}`)
    lines.push(`  Duration: ${instance.mainResult.duration}ms`)
  }

  if (instance.shadowResult) {
    lines.push('Shadow:')
    lines.push(`  Success: ${instance.shadowResult.success}`)
    lines.push(`  Duration: ${instance.shadowResult.duration}ms`)
  }

  if (compare) {
    lines.push('')
    lines.push(`Differs: ${compare.differs ? 'YES' : 'NO'}`)
    if (compare.differs) {
      lines.push('Differences:')
      for (const diff of compare.differences) {
        lines.push(`  ${diff.metric}: ${diff.main} vs ${diff.shadow} (${diff.delta > 0 ? '+' : ''}${diff.delta})`)
      }
    }
  }

  return lines.join('\n')
}