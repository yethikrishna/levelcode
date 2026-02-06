import { getSystemMessage } from '../utils/message-history'

import type { PostUserMessageFn } from '../types/contracts/send-message'

/**
 * Standalone mode: usage command shows a message that credits are unlimited.
 */
export async function handleUsageCommand(): Promise<{
  postUserMessage: PostUserMessageFn
}> {
  const postUserMessage: PostUserMessageFn = (prev) => [
    ...prev,
    getSystemMessage('Running in standalone mode. No usage limits apply.'),
  ]
  return { postUserMessage }
}
