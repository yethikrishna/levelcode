import { trackEvent } from '@levelcode/common/analytics'
import db from '@levelcode/internal/db'

import { postAgentRuns } from './_post'

import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger, loggerWithContext } from '@/util/logger'

export async function POST(req: NextRequest) {
  return postAgentRuns({
    req,
    getUserInfoFromApiKey,
    logger,
    loggerWithContext,
    trackEvent,
    db,
  })
}
