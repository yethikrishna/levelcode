/**
 * `/bug <description>` — opens a pre-filled GitHub issue with the
 * environment context every bug report needs (version, platform, runtime)
 * and nothing that could leak user code or paths.
 */

import { createRequire } from 'module'
import os from 'os'

const REPO = 'yethikrishna/levelcode'

function loadVersion(): string {
  try {
    const require = createRequire(import.meta.url)
    const pkg = require('../../package.json') as { version?: string }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Environment lines shared by every report — safe for public issues. */
export function bugEnvironmentLines(): string[] {
  return [
    `- LevelCode version: ${loadVersion()}`,
    `- Platform: ${process.platform} ${process.arch}`,
    `- Runtime: ${process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.versions.node ?? 'unknown'}`}`,
    `- Mode: interactive CLI`,
    `- Date: ${new Date().toISOString().slice(0, 10)}`,
    `- Home dir name: ${os.homedir().split(/[\\/]/).pop() ? '(redacted)' : '(unknown)'}`,
  ]
}

export function buildBugReportBody(description: string): string {
  return [
    '**What happened?**',
    '',
    description || '<describe the bug>',
    '',
    '**Steps to reproduce**',
    '',
    '1. ',
    '',
    '**Expected behavior**',
    '',
    '<what should have happened>',
    '',
    '**Environment**',
    '',
    ...bugEnvironmentLines(),
  ].join('\n')
}

export function buildBugReportUrl(description: string): string {
  const params = new URLSearchParams({
    title: (description || 'Bug report').slice(0, 120),
    body: buildBugReportBody(description),
  })
  return `https://github.com/${REPO}/issues/new?${params.toString()}`
}
