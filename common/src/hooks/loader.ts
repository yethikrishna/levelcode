import fs from 'fs'
import os from 'os'
import path from 'path'

import { hooksConfigSchema } from './types'

import type { HookMatcher, HookEventName, HooksConfig } from './types'

/**
 * Hook configuration loader.
 *
 * Reads (in order; all enabled hooks run, later sources are appended):
 *   1. {home}/.config/levelcode[-env]/settings.json   (CLI settings location)
 *   2. {home}/.levelcode/settings.json                (common data location)
 *   3. {projectRoot}/.levelcode/settings.json         (project-level)
 *
 * Invalid entries are dropped with reasons returned, never thrown — a broken
 * settings file must not take the agent down.
 */

export type LoadedHooks = {
  hooks: Partial<Record<HookEventName, HookMatcher[]>>
  /** Human-readable problems found in config files (dropped entries). */
  warnings: string[]
  /** Which files were actually read. */
  sources: string[]
}

function configEnvSuffix(): string {
  const env = process.env.NEXT_PUBLIC_CB_ENVIRONMENT
  return env && env !== 'prod' ? `-${env}` : ''
}

/** Candidate settings.json paths in load order. */
export function getHookConfigPaths(projectRoot: string): string[] {
  const home = os.homedir()
  const commonBase =
    process.env.LEVELCODE_DIR || path.join(home, '.levelcode')
  return [
    path.join(
      home,
      '.config',
      `levelcode${configEnvSuffix()}`,
      'settings.json',
    ),
    path.join(commonBase, 'settings.json'),
    path.join(projectRoot, '.levelcode', 'settings.json'),
  ]
}

function readHooksFromSettings(
  filePath: string,
  warnings: string[],
): Partial<Record<HookEventName, HookMatcher[]>> | null {
  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null // Missing or unreadable: skip silently (expected most of the time)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    warnings.push(`${filePath}: invalid JSON — hooks in this file are ignored`)
    return null
  }

  const hooksRaw =
    parsed && typeof parsed === 'object' && 'hooks' in parsed
      ? (parsed as { hooks?: unknown }).hooks
      : undefined
  if (hooksRaw === undefined) {
    return null // File exists, no hooks key: fine
  }

  const result = hooksConfigSchema.safeParse(hooksRaw)
  if (!result.success) {
    warnings.push(
      `${filePath}: invalid hooks config — ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')} — hooks in this file are ignored`,
    )
    return null
  }
  return result.data
}

export function loadHooks(projectRoot: string): LoadedHooks {
  const warnings: string[] = []
  const sources: string[] = []
  const merged: Partial<Record<HookEventName, HookMatcher[]>> = {}

  for (const filePath of getHookConfigPaths(projectRoot)) {
    const hooks = readHooksFromSettings(filePath, warnings)
    if (!hooks) continue
    sources.push(filePath)
    for (const [event, matchers] of Object.entries(hooks) as [
      HookEventName,
      HookMatcher[],
    ][]) {
      if (!matchers?.length) continue
      merged[event] = [...(merged[event] ?? []), ...matchers]
    }
  }

  return { hooks: merged, warnings, sources }
}
