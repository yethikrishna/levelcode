import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

import {
  runDoctorChecks,
  formatDoctorReport,
  doctorExitCode,
} from '../../doctor/doctor'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

describe('doctor hooks/skills checks', () => {
  // Explicit overrides: os.homedir() caches on first call, so tests must not
  // rely on env pinning — they pass projectRoot/homeDir directly.
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-fixtures-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reports none-configured hooks and skills on a bare project', () => {
    const checks = runDoctorChecks({ projectRoot: tmpDir, homeDir: tmpDir })
    const hooks = checks.find((c) => c.name === 'hooks config')!
    const skills = checks.find((c) => c.name === 'skills')!
    expect(hooks.status).toBe('ok')
    expect(hooks.detail).toContain('none configured')
    expect(skills.status).toBe('ok')
    expect(skills.detail).toContain('none installed')
  })

  it('warns on invalid JSON in a hooks-bearing settings file', () => {
    fs.mkdirSync(path.join(tmpDir, '.levelcode'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, '.levelcode', 'settings.json'),
      '{"hooks": { "PreToolUse": [ BROKEN',
      'utf-8',
    )
    const checks = runDoctorChecks({ projectRoot: tmpDir, homeDir: tmpDir })
    const hooks = checks.find((c) => c.name === 'hooks config')!
    expect(hooks.status).toBe('warn')
    expect(hooks.hint).toContain('settings.json')
  })

  it('counts configured hooks and installed skills', () => {
    fs.mkdirSync(path.join(tmpDir, '.levelcode'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, '.levelcode', 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ command: 'exit 0' }] }],
          Stop: [{ hooks: [{ command: 'exit 0' }] }],
        },
      }),
      'utf-8',
    )
    const skillDir = path.join(tmpDir, '.agents', 'skills', 'my-skill')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      ['---', 'name: my-skill', 'description: test', '---', 'body'].join(
        String.fromCharCode(10),
      ),
      'utf-8',
    )

    const checks = runDoctorChecks({ projectRoot: tmpDir, homeDir: tmpDir })
    const hooks = checks.find((c) => c.name === 'hooks config')!
    const skills = checks.find((c) => c.name === 'skills')!
    expect(hooks.detail).toContain('2 event type(s)')
    expect(skills.detail).toContain('1 skill(s)')
  })
})

describe('doctor', () => {
  describe('runDoctorChecks', () => {
    it('returns a non-empty set of checks with valid statuses', () => {
      const checks = runDoctorChecks()
      expect(checks.length).toBeGreaterThan(0)
      for (const check of checks) {
        expect(['ok', 'warn', 'fail']).toContain(check.status)
        expect(check.name.length).toBeGreaterThan(0)
        expect(check.detail.length).toBeGreaterThan(0)
      }
    })

    it('always checks the runtime and provider credentials', () => {
      const checks = runDoctorChecks()
      const names = checks.map((c) => c.name)
      expect(names).toContain('runtime')
      expect(names).toContain('Model provider credentials')
      expect(names).toContain('config directory')
      expect(names).toContain('hooks config')
      expect(names).toContain('skills')
    })
  })

  describe('formatDoctorReport', () => {
    it('renders every check with its icon and detail', () => {
      const report = formatDoctorReport([
        { name: 'alpha', status: 'ok', detail: 'fine' },
        { name: 'beta', status: 'warn', detail: 'meh', hint: 'do better' },
        { name: 'gamma', status: 'fail', detail: 'broken' },
      ])

      expect(report).toContain('alpha')
      expect(report).toContain('fine')
      expect(report).toContain('beta')
      expect(report).toContain('do better')
      expect(report).toContain('gamma')
      expect(report).toContain('broken')
      expect(report).toContain('1 ok, 1 warnings, 1 failures')
    })

    it('shows an all-clear summary when nothing fails', () => {
      const report = formatDoctorReport([
        { name: 'alpha', status: 'ok', detail: 'fine' },
      ])
      expect(report).toContain('1 ok, 0 warnings, 0 failures')
    })
  })

  describe('doctorExitCode', () => {
    it('is 0 when no checks fail', () => {
      expect(
        doctorExitCode([
          { name: 'a', status: 'ok', detail: '' },
          { name: 'b', status: 'warn', detail: '' },
        ]),
      ).toBe(0)
    })

    it('is 1 when any check fails', () => {
      expect(
        doctorExitCode([{ name: 'a', status: 'fail', detail: '' }]),
      ).toBe(1)
    })
  })
})
