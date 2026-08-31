import { describe, it, expect, beforeEach, afterEach, setDefaultTimeout } from 'bun:test'

// Each hook run spawns a real bun subprocess; cold starts on a loaded
// machine can exceed the 5s default.
setDefaultTimeout(30_000)
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { createHookRunner } from '../runner'
import { parseHookDecision } from '../decision'
import { loadHooks, getHookConfigPaths } from '../loader'

import type { HooksConfig } from '../types'

// Real hook scripts written to a temp dir and run via `bun <script>` — the
// engine is exercised end-to-end (spawn, stdin JSON, stdout decision).
const BUN = process.execPath

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-test-'))
})

afterEach(() => {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

function writeHook(name: string, code: string): string {
  const file = path.join(tmpDir, name)
  fs.writeFileSync(file, code, 'utf-8')
  return `${BUN} ${file}`
}

const payload = (over: Record<string, unknown> = {}) => ({
  event: 'PreToolUse' as const,
  cwd: tmpDir,
  tool_name: 'write_file',
  tool_input: { file_path: 'src/a.ts' },
  ...over,
})

describe('parseHookDecision', () => {
  it('parses a block decision', () => {
    expect(
      parseHookDecision('{"decision":"block","reason":"no writes"}'),
    ).toEqual({ decision: 'block', reason: 'no writes' })
  })

  it('parses additionalContext', () => {
    expect(parseHookDecision('{"additionalContext":"lint ok"}')).toEqual({
      additionalContext: 'lint ok',
    })
  })

  it('returns null for plain text, empty, oversized, or non-object JSON', () => {
    expect(parseHookDecision('hello world')).toBeNull()
    expect(parseHookDecision('')).toBeNull()
    expect(parseHookDecision('[1,2,3]')).toBeNull()
    expect(parseHookDecision('x'.repeat(17 * 1024))).toBeNull()
  })
})

describe('loadHooks', () => {
  it('reads hooks from project .levelcode/settings.json', () => {
    const projectDir = path.join(tmpDir, 'proj')
    fs.mkdirSync(path.join(projectDir, '.levelcode'), { recursive: true })
    fs.writeFileSync(
      path.join(projectDir, '.levelcode', 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: 'write_file', hooks: [{ command: 'echo hi' }] },
          ],
        },
      }),
      'utf-8',
    )

    const loaded = loadHooks(projectDir)
    expect(loaded.sources).toHaveLength(1)
    expect(loaded.hooks.PreToolUse).toHaveLength(1)
    expect(loaded.warnings).toEqual([])
  })

  it('collects warnings for invalid JSON and invalid shape without throwing', () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), '{not json', 'utf-8')
    // Note: tmpDir is the LEVELCODE_DIR candidate — point the loader at it
    const orig = process.env.LEVELCODE_DIR
    process.env.LEVELCODE_DIR = tmpDir
    try {
      const loaded = loadHooks(tmpDir)
      expect(
        loaded.warnings.some((w) => w.includes('invalid JSON')),
      ).toBe(true)
      expect(loaded.hooks.PreToolUse).toBeUndefined()
    } finally {
      if (orig === undefined) delete process.env.LEVELCODE_DIR
      else process.env.LEVELCODE_DIR = orig
    }
  })

  it('returns empty when no config files exist', () => {
    const loaded = loadHooks(path.join(tmpDir, 'does-not-exist'))
    expect(loaded.sources).toEqual([])
    expect(loaded.warnings).toEqual([])
  })

  it('getHookConfigPaths includes project .levelcode/settings.json', () => {
    const paths = getHookConfigPaths('/proj')
    expect(paths[paths.length - 1]).toBe(path.join('/proj', '.levelcode', 'settings.json'))
  })
})

describe('createHookRunner (real subprocesses)', () => {
  it('PreToolUse: JSON block decision blocks the tool', async () => {
    const config: HooksConfig = {
      PreToolUse: [
        {
          matcher: 'write_file',
          hooks: [
            {
              argv: [
                BUN,
                '-e',
                'Bun.write(Bun.stdout, JSON.stringify({decision:"block",reason:"no writes today"}))',
              ],
            },
          ],
        },
      ],
    }
    const runner = createHookRunner({ hooks: config })
    const outcome = await runner.runEvent('PreToolUse', payload())

    expect(outcome.blocked).toBe(true)
    expect(outcome.reason).toBe('no writes today')
  })

  it('PreToolUse: exit code 2 blocks with stderr as reason', async () => {
    const config: HooksConfig = {
      PreToolUse: [
        {
          hooks: [
            {
              argv: [
                BUN,
                '-e',
                'process.stderr.write("forbidden"); process.exit(2)',
              ],
            },
          ],
        },
      ],
    }
    const runner = createHookRunner({ hooks: config })
    const outcome = await runner.runEvent('PreToolUse', payload())

    expect(outcome.blocked).toBe(true)
    expect(outcome.reason).toBe('forbidden')
  })

  it('PreToolUse: non-blocking exit 0 allows the tool', async () => {
    const config: HooksConfig = {
      PreToolUse: [{ hooks: [{ command: 'exit 0' }] }],
    }
    const runner = createHookRunner({ hooks: config })
    const outcome = await runner.runEvent('PreToolUse', payload())

    expect(outcome.blocked).toBe(false)
  })

  it('matcher filters by tool name regex', async () => {
    let ran = false
    const config: HooksConfig = {
      PreToolUse: [
        {
          matcher: '^bash$',
          hooks: [{ command: 'exit 0' }],
        },
      ],
    }
    const runner = createHookRunner({ hooks: config })
    const result = await runner.runEvent(
      'PreToolUse',
      payload({ tool_name: 'write_file' }),
    )
    expect(result.results).toHaveLength(0)
    ran = true
    expect(ran).toBe(true)
  })

  it('handler receives JSON payload on stdin', async () => {
    const script = path.join(tmpDir, 'echo-payload.mjs')
    fs.writeFileSync(
      script,
      `const data = await Bun.stdin.text();
const p = JSON.parse(data);
Bun.write(Bun.stdout, JSON.stringify({ additionalContext: 'tool=' + p.tool_name + ' file=' + p.tool_input.file_path }));`,
      'utf-8',
    )
    const config: HooksConfig = {
      PreToolUse: [{ hooks: [{ argv: [BUN, script] }] }],
    }
    const runner = createHookRunner({ hooks: config })
    const outcome = await runner.runEvent('PreToolUse', payload())

    expect(outcome.blocked).toBe(false)
    expect(outcome.additionalContext).toContain('tool=write_file')
    expect(outcome.additionalContext).toContain('file=src/a.ts')
  })

  it('PostToolUse collects additionalContext without blocking semantics', async () => {
    const config: HooksConfig = {
      PostToolUse: [
        {
          hooks: [
            {
              argv: [
                BUN,
                '-e',
                'Bun.write(Bun.stdout, JSON.stringify({additionalContext:"formatting applied"}))',
              ],
            },
          ],
        },
      ],
    }
    const runner = createHookRunner({ hooks: config })
    const outcome = await runner.runEvent('PostToolUse', {
      event: 'PostToolUse',
      cwd: tmpDir,
      tool_name: 'write_file',
      tool_result: 'ok',
    })

    expect(outcome.blocked).toBe(false)
    expect(outcome.additionalContext.trim()).toBe('formatting applied')
  })

  it('failing handler (exit 1) fails open and is recorded', async () => {
    const config: HooksConfig = {
      PreToolUse: [{ hooks: [{ command: 'exit 1' }] }],
    }
    const runner = createHookRunner({ hooks: config })
    const outcome = await runner.runEvent('PreToolUse', payload())

    expect(outcome.blocked).toBe(false)
    expect(outcome.results[0]!.exitCode).toBe(1)
  })

  it('spawn failure fails open with spawnError recorded', async () => {
    const config: HooksConfig = {
      PreToolUse: [{ hooks: [{ command: 'definitely-not-a-real-command-xyz' }] }],
    }
    const runner = createHookRunner({ hooks: config })
    const outcome = await runner.runEvent('PreToolUse', payload())

    expect(outcome.blocked).toBe(false)
    const r = outcome.results[0]!
    expect(r.spawnError !== undefined || r.exitCode !== 0).toBe(true)
  })

  it('timed-out handler fails open and is marked timedOut', async () => {
    const config: HooksConfig = {
      PreToolUse: [
        {
          hooks: [
            {
              argv: [
                BUN,
                '-e',
                'await new Promise((r) => setTimeout(r, 10_000))',
              ],
              timeout: 1,
            },
          ],
        },
      ],
    }
    const runner = createHookRunner({ hooks: config })
    const outcome = await runner.runEvent('PreToolUse', payload())

    expect(outcome.blocked).toBe(false)
    expect(outcome.results[0]!.timedOut).toBe(true)
  })

  it('loads config from disk via settings.json and runs it', async () => {
    const hookScript = path.join(tmpDir, 'block-all.mjs')
    fs.writeFileSync(
      hookScript,
      'Bun.write(Bun.stdout, JSON.stringify({decision:"block",reason:"disk-config"}));',
      'utf-8',
    )
    const projectDir = path.join(tmpDir, 'proj')
    fs.mkdirSync(path.join(projectDir, '.levelcode'), { recursive: true })
    fs.writeFileSync(
      path.join(projectDir, '.levelcode', 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { hooks: [{ argv: [BUN, hookScript] }] },
          ],
        },
      }),
      'utf-8',
    )

    const warnings: string[] = []
    const runner = createHookRunner({ onConfigWarning: (w) => warnings.push(w) })
    const outcome = await runner.runEvent('PreToolUse', payload({ cwd: projectDir }))

    expect(outcome.blocked).toBe(true)
    expect(outcome.reason).toBe('disk-config')
    expect(warnings).toEqual([])
  })

  it('shell command string works via cmd/sh wrap', async () => {
    const command =
      process.platform === 'win32'
        ? 'exit 0'
        : 'true'
    const config: HooksConfig = {
      PreToolUse: [{ hooks: [{ command }] }],
    }
    const runner = createHookRunner({ hooks: config })
    const outcome = await runner.runEvent('PreToolUse', payload())
    expect(outcome.blocked).toBe(false)
    expect(outcome.results[0]!.exitCode).toBe(0)
  })

  it('writeHook helper produces runnable scripts', async () => {
    const cmd = writeHook('ok.mjs', 'process.exit(0)')
    const config: HooksConfig = {
      PreToolUse: [{ hooks: [{ command: cmd }] }],
    }
    const runner = createHookRunner({ hooks: config })
    const outcome = await runner.runEvent('PreToolUse', payload())
    expect(outcome.results[0]!.exitCode).toBe(0)
  })
})
