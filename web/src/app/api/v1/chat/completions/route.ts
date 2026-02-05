import { insertMessageBigquery } from '@levelcode/bigquery'
import { getUserUsageData } from '@levelcode/billing/usage-service'
import { trackEvent } from '@levelcode/common/analytics'

import { postChatCompletions } from './_post'

import type { NextRequest } from 'next/server'

import { getAgentRunFromId } from '@/db/agent-run'
import { getUserInfoFromApiKey } from '@/db/user'
import { logger, loggerWithContext } from '@/util/logger'

export async function POST(req: NextRequest) {
  return postChatCompletions({
    req,
    getUserInfoFromApiKey,
    logger,
    loggerWithContext,
    trackEvent,
    getUserUsageData,
    getAgentRunFromId,
    fetch,
    insertMessageBigquery,
  })
}
