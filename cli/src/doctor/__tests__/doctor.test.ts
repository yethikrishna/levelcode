import { describe, it, expect } from 'bun:test'

import {
  runDoctorChecks,
  formatDoctorReport,
  doctorExitCode,
} from '../../doctor/doctor'

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
