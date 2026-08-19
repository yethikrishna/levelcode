import * as fsSync from 'fs'
import * as path from 'path'

import {
  CHECK_MANIFEST_FILES,
  detectProjectChecks,
  summarizeCheckOutput,
} from '../../../common/src/utils/project-checks'
import { runTerminalCommand } from './run-terminal-command'

import type {
  CheckKind,
  ManifestFiles,
} from '../../../common/src/utils/project-checks'
import type { LevelCodeToolOutput } from '../../../common/src/tools/list'

const DEFAULT_TIMEOUT_SECONDS = 300

export interface VerifyChangesOptions {
  projectPath: string
  checks?: CheckKind[]
  timeout_seconds?: number
  env?: NodeJS.ProcessEnv
}

function readManifestFiles(projectPath: string): ManifestFiles {
  const files: ManifestFiles = {}
  for (const name of CHECK_MANIFEST_FILES) {
    const fullPath = path.join(projectPath, name)
    try {
      // Lockfiles can be huge; we only need to know they exist.
      const stat = fsSync.statSync(fullPath)
      if (!stat.isFile()) continue
      const needsContent =
        name === 'package.json' ||
        name === 'pyproject.toml' ||
        name === 'Makefile' ||
        name === 'requirements.txt'
      files[name] = needsContent ? fsSync.readFileSync(fullPath, 'utf8') : ''
    } catch {
      // File absent — skip.
    }
  }
  return files
}

function extractCommandOutput(
  output: LevelCodeToolOutput<'run_terminal_command'>,
): { text: string; exitCode: number | null } {
  let text = ''
  let exitCode: number | null = null
  for (const part of output) {
    if (part.type === 'json' && part.value && typeof part.value === 'object') {
      const value = part.value as Record<string, unknown>
      if (typeof value.stdout === 'string') text += value.stdout
      if (typeof value.stderr === 'string') text += `\n${value.stderr}`
      if (typeof value.exitCode === 'number') exitCode = value.exitCode
      if (typeof value.errorMessage === 'string') text += `\n${value.errorMessage}`
    }
  }
  return { text: text.trim(), exitCode }
}

/**
 * Client-side implementation of the `verify_changes` tool: detect this
 * project's verification commands, run them in order, stop at the first
 * failure, and return structured results with summarized output.
 */
export async function verifyChanges(
  options: VerifyChangesOptions,
): Promise<LevelCodeToolOutput<'verify_changes'>> {
  const { projectPath, checks, env } = options
  const timeoutSeconds = options.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS

  const manifests = readManifestFiles(projectPath)
  const detected = detectProjectChecks(manifests, { only: checks })

  if (detected.length === 0) {
    return [
      {
        type: 'json',
        value: {
          passed: true,
          results: [],
          message:
            'No verification commands detected for this project (looked for package.json scripts, tsconfig.json, Cargo.toml, go.mod, pyproject.toml, Makefile). Consider adding a typecheck/lint/test script, or run commands directly with run_terminal_command.',
        },
      },
    ]
  }

  const results: Array<{
    check: string
    command: string
    source: string
    passed: boolean
    exitCode: number | null
    durationMs: number
    summary?: string
  }> = []
  const skipped: string[] = []
  let allPassed = true

  for (const check of detected) {
    if (!allPassed) {
      skipped.push(`${check.kind} (${check.command})`)
      continue
    }

    const startedAt = Date.now()
    let text = ''
    let exitCode: number | null = null
    try {
      const output = await runTerminalCommand({
        command: check.command,
        process_type: 'SYNC',
        cwd: projectPath,
        timeout_seconds: timeoutSeconds,
        env,
      })
      const extracted = extractCommandOutput(output)
      text = extracted.text
      exitCode = extracted.exitCode
    } catch (error) {
      text = error instanceof Error ? error.message : String(error)
      exitCode = -1
    }
    const durationMs = Date.now() - startedAt
    const passed = exitCode === 0

    results.push({
      check: check.kind,
      command: check.command,
      source: check.source,
      passed,
      exitCode,
      durationMs,
      ...(passed ? {} : { summary: summarizeCheckOutput(text) }),
    })

    if (!passed) {
      allPassed = false
    }
  }

  return [
    {
      type: 'json',
      value: {
        passed: allPassed,
        results,
        ...(skipped.length > 0 ? { skipped } : {}),
        ...(allPassed
          ? { message: `All ${results.length} check(s) passed.` }
          : {
              message:
                'Verification failed. Fix the issues in the failing check, then call verify_changes again. Subsequent checks were skipped.',
            }),
      },
    },
  ]
}
