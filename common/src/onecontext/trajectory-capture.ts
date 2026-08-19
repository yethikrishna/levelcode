import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

export type TrajectoryEvent = 
  | { type: 'tool_call'; id: string; name: string; args: any; ts: number }
  | { type: 'tool_result'; id: string; result: any; ts: number }
  | { type: 'delta'; content: string; ts: number }

export interface TrajectoryCaptureOptions {
  outputDir?: string
  enabled?: boolean
}

let captureEnabled = false
let outputPath: string | null = null

export function initTrajectoryCapture(opts: TrajectoryCaptureOptions = {}) {
  if (opts.enabled === false) return
  captureEnabled = true
  const dir = opts.outputDir || join(process.cwd(), '.onecontext')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  outputPath = join(dir, 'trajectory.jsonl')
}

export function captureRunAgentStep(event: TrajectoryEvent) {
  if (!captureEnabled || !outputPath) return
  const line = JSON.stringify({ ...event, session: process.env.SESSION_ID || 'default' }) + '\n'
  appendFileSync(outputPath, line)
}

// Hook adapter for run-agent-step events
export function attachRunAgentStepHook(hookFn: (step: any) => void) {
  // Placeholder hook attachment - integrates with agent step runners
  // In real impl would subscribe to emitter or patch the run function
  return hookFn
}

export function attachToGCC(commitFn: Function) {
  // Attach capture when GCC (Git Commit Context) commits are available
  return (...args: any[]) => {
    const result = commitFn(...args)
    captureRunAgentStep({ type: 'delta', content: 'gcc_commit', ts: Date.now() })
    return result
  }
}
