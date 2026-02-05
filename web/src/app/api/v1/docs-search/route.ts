import { consumeCreditsWithFallback } from '@levelcode/billing/credit-delegation'
import { getUserUsageData } from '@levelcode/billing/usage-service'
import { trackEvent } from '@levelcode/common/analytics'

import { postDocsSearch } from './_post'

import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger, loggerWithContext } from '@/util/logger'

export async function POST(req: NextRequest) {
  return postDocsSearch({
    req,
    getUserInfoFromApiKey,
    logger,
    loggerWithContext,
    trackEvent,
    getUserUsageData,
    consumeCreditsWithFallback,
    fetch,
  })
}
