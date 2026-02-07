import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  afterEach,
} from 'bun:test'

import { fetchUserDetails } from '../use-user-details-query'

import type { Logger } from '@levelcode/common/types/contracts/logger'

describe('fetchUserDetails (standalone mode)', () => {
  const mockLogger: Logger = {
    error: mock(() => {}),
    warn: mock(() => {}),
    info: mock(() => {}),
    debug: mock(() => {}),
  }

  const originalEnv = process.env.NEXT_PUBLIC_LEVELCODE_APP_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_LEVELCODE_APP_URL = 'https://test.levelcode.vercel.app'
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_LEVELCODE_APP_URL = originalEnv
  })

  describe('standalone mode behavior', () => {
    test('returns mock email for email field', async () => {
      const result = await fetchUserDetails({
        authToken: 'any-token',
        fields: ['email'] as const,
        logger: mockLogger,
      })
      expect(result).toBeDefined()
      expect(result?.email).toBe('standalone@local')
    })

    test('returns mock id for id field', async () => {
      const result = await fetchUserDetails({
        authToken: 'any-token',
        fields: ['id'] as const,
        logger: mockLogger,
      })
      expect(result).toBeDefined()
      expect(result?.id).toBe('standalone-user')
    })

    test('returns mock data for multiple fields', async () => {
      const result = await fetchUserDetails({
        authToken: 'any-token',
        fields: ['id', 'email'] as const,
        logger: mockLogger,
      })
      expect(result).toBeDefined()
      expect(result?.id).toBe('standalone-user')
      expect(result?.email).toBe('standalone@local')
    })

    test('returns null for referral_code', async () => {
      const result = await fetchUserDetails({
        authToken: 'any-token',
        fields: ['referral_code'] as const,
        logger: mockLogger,
      })
      expect(result).toBeDefined()
      expect(result?.referral_code).toBe(null)
    })

    test('returns null for discord_id', async () => {
      const result = await fetchUserDetails({
        authToken: 'any-token',
        fields: ['discord_id'] as const,
        logger: mockLogger,
      })
      expect(result).toBeDefined()
      expect(result?.discord_id).toBe(null)
    })

    test('does not call logger error', async () => {
      const errorSpy = mock(() => {})
      const testLogger: Logger = { ...mockLogger, error: errorSpy }
      await fetchUserDetails({
        authToken: 'any-token',
        fields: ['email'] as const,
        logger: testLogger,
      })
      expect(errorSpy).not.toHaveBeenCalled()
    })

    test('works without providing apiClient', async () => {
      const result = await fetchUserDetails({
        authToken: 'any-token',
        fields: ['email'] as const,
        logger: mockLogger,
      })
      expect(result).toEqual({ email: 'standalone@local' })
    })
  })
})