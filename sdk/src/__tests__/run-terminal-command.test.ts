import { describe, it, expect } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { runTerminalCommand } from '../tools/run-terminal-command'

// Real subprocess tests (bash — available on this repo's dev machines and CI).
// Windows needs Git Bash; the tool errors clearly without it, in which case
// these tests skip rather than fail (environment, not code).

const BASH_AVAILABLE = (() => {
  if (process.platform !== 'win32') return true
  try {
    const { spawnSync } = require('child_process') as typeof import('child_process')
    const r = spawnSync('bash', ['-c', 'true'], { stdio: 'ignore' })
    return r.status === 0
  } catch {
    return false
  }
})()

const d = BASH_AVAILABLE ? describe : describe.skip

async function asValue(output: Array<{ type: string; value: unknown }>): Promise<Record<string, unknown>> {
  const first = output[0]!
  expect(first.type).toBe('json')
  return first.value as Record<string, unknown>
}

d('runTerminalCommand output hygiene', () => {
  it(
    'returns small output inline with exit code and no spill file',
    async () => {
      const value = await asValue(
        await runTerminalCommand({
          command: 'echo hello-hygiene',
          process_type: 'SYNC',
          cwd: os.tmpdir(),
          timeout_seconds: 15,
        }),
      )

      expect(value.stdout).toContain('hello-hygiene')
      expect(value.exitCode).toBe(0)
      expect(value.output_file).toBeUndefined()
      expect(value.stderr_file).toBeUndefined()
    },
    { timeout: 30_000 },
  )

  it(
    'spills oversized stdout to a file and points the agent at it',
    async () => {
      const value = await asValue(
        await runTerminalCommand({
          command: `${JSON.stringify(process.execPath)} -e "console.log('x'.repeat(120000))"`,
          process_type: 'SYNC',
          cwd: os.tmpdir(),
          timeout_seconds: 30,
        }),
      )

      const stdout = String(value.stdout)
      // Truncated head+tail, not the full 120k chars
      expect(stdout.length).toBeLessThan(60_000)
      expect(value.output_file).toBeTypeOf('string')

      const spillPath = value.output_file as string
      const spilled = fs.readFileSync(spillPath, 'utf-8')
      expect(spilled.length).toBeGreaterThanOrEqual(120_000)
      // Head and tail both preserved by the middle cut
      expect(stdout.startsWith('x')).toBe(true)

      fs.rmSync(spillPath, { force: true })
    },
    { timeout: 60_000 },
  )

  it(
    'spills oversized stderr separately from stdout',
    async () => {
      const value = await asValue(
        await runTerminalCommand({
          command: `${JSON.stringify(process.execPath)} -e "console.error('e'.repeat(40000)); console.log('ok')"`,
          process_type: 'SYNC',
          cwd: os.tmpdir(),
          timeout_seconds: 30,
        }),
      )

      expect(value.exitCode).toBe(0)
      expect(value.stderr_file).toBeTypeOf('string')
      expect(value.output_file).toBeUndefined()

      const spilled = fs.readFileSync(value.stderr_file as string, 'utf-8')
      expect(spilled.length).toBeGreaterThanOrEqual(40_000)

      fs.rmSync(value.stderr_file as string, { force: true })
    },
    { timeout: 60_000 },
  )

  it(
    'propagates non-zero exit codes',
    async () => {
      const value = await asValue(
        await runTerminalCommand({
          command: 'exit 3',
          process_type: 'SYNC',
          cwd: os.tmpdir(),
          timeout_seconds: 15,
        }),
      )
      expect(value.exitCode).toBe(3)
    },
    { timeout: 30_000 },
  )
})
