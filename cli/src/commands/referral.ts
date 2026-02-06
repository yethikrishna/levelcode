import { getSystemMessage } from '../utils/message-history'

import type { PostUserMessageFn } from '../types/contracts/send-message'

export async function handleReferralCode(_referralCode: string): Promise<{
  postUserMessage: PostUserMessageFn
}> {
  const postUserMessage: PostUserMessageFn = (prev) => [
    ...prev,
    getSystemMessage(
      'The referral system is not available in open-source mode.',
    ),
  ]
  return { postUserMessage }
}
