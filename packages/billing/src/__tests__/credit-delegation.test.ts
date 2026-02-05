import {
  clearMockedModules,
  mockModule,
} from '@levelcode/common/testing/mock-modules'
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test'

import {
  consumeCreditsWithDelegation,
  findOrganizationForRepository,
} from '../credit-delegation'

describe('Credit Delegation', () => {
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }

  beforeAll(async () => {
    // Mock the org-billing functions that credit-delegation depends on
    await mockModule('@levelcode/billing/org-billing', () => ({
      normalizeRepositoryUrl: mock((url: string) => url.toLowerCase().trim()),
      extractOwnerAndRepo: mock((url: string) => {
        if (url.includes('levelcodeai/levelcode')) {
          return { owner: 'levelcodeai', repo: 'levelcode' }
        }
        return null
      }),
      consumeOrganizationCredits: mock(() => Promise.resolve()),
    }))

    // Mock common dependencies
    await mockModule('@levelcode/internal/db', () => {
      const select = mock((fields: Record<string, unknown>) => {
        if ('orgId' in fields && 'orgName' in fields) {
          return {
            from: () => ({
              innerJoin: () => ({
                where: () =>
                  Promise.resolve([
                    {
                      orgId: 'org-123',
                      orgName: 'LevelCodeAI',
                      orgSlug: 'levelcodeai',
                    },
                  ]),
              }),
            }),
          }
        }

        if ('repoUrl' in fields) {
          return {
            from: () => ({
              where: () =>
                Promise.resolve([
                  {
                    repoUrl: 'https://github.com/levelcodeai/levelcode',
                    repoName: 'levelcode',
                    isActive: true,
                  },
                ]),
            }),
          }
        }

        return {
          from: () => ({
            where: () => Promise.resolve([]),
          }),
        }
      })

      return {
        default: {
          select,
        },
      }
    })
  })

  afterAll(() => {
    clearMockedModules()
  })

  describe('findOrganizationForRepository', () => {
    it('should find organization for matching repository', async () => {
      const userId = 'user-123'
      const repositoryUrl = 'https://github.com/levelcodeai/levelcode'

      const result = await findOrganizationForRepository({
        userId,
        repositoryUrl,
        logger,
      })

      expect(result.found).toBe(true)
      expect(result.organizationId).toBe('org-123')
      expect(result.organizationName).toBe('LevelCodeAI')
    })

    it('should return not found for non-matching repository', async () => {
      const userId = 'user-123'
      const repositoryUrl = 'https://github.com/other/repo'

      const result = await findOrganizationForRepository({
        userId,
        repositoryUrl,
        logger,
      })

      expect(result.found).toBe(false)
    })
  })

  describe('consumeCreditsWithDelegation', () => {
    it('should fail when no repository URL provided', async () => {
      const userId = 'user-123'
      const repositoryUrl = null
      const creditsToConsume = 100

      const result = await consumeCreditsWithDelegation({
        userId,
        repositoryUrl,
        creditsToConsume,
        logger,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('No repository URL provided')
    })
  })
})
