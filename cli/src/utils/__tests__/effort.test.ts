import { describe, it, expect, beforeEach } from 'bun:test'

import {
  EFFORT_MAX_STEPS,
  DEFAULT_EFFORT,
  setEffortLevel,
  getEffortLevel,
  maxStepsForEffort,
  parseEffortLevel,
  EFFORT_LEVELS,
} from '../effort'

describe('effort dial', () => {
  beforeEach(() => {
    setEffortLevel(DEFAULT_EFFORT)
  })

  it('maps each level to a step budget ordered low → max', () => {
    const values = EFFORT_LEVELS.map((level) => EFFORT_MAX_STEPS[level])
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!)
    }
  })

  it('medium matches the historical default of 100 steps', () => {
    expect(EFFORT_MAX_STEPS.medium).toBe(100)
  })

  it('maxStepsForEffort resolves every level', () => {
    for (const level of EFFORT_LEVELS) {
      expect(maxStepsForEffort(level)).toBe(EFFORT_MAX_STEPS[level])
    }
  })

  it('get/set round-trips', () => {
    setEffortLevel('max')
    expect(getEffortLevel()).toBe('max')
    setEffortLevel('low')
    expect(getEffortLevel()).toBe('low')
  })

  it('parseEffortLevel is case-insensitive and rejects junk', () => {
    expect(parseEffortLevel('HIGH')).toBe('high')
    expect(parseEffortLevel(' max ')).toBe('max')
    expect(parseEffortLevel('ultra')).toBeNull()
    expect(parseEffortLevel(undefined)).toBeNull()
    expect(parseEffortLevel('')).toBeNull()
  })
})
