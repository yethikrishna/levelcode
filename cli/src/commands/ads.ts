import { getSystemMessage } from '../utils/message-history'

import type { ChatMessage } from '../types/chat'

export const handleAdsEnable = (): {
  postUserMessage: (messages: ChatMessage[]) => ChatMessage[]
} => {
  return {
    postUserMessage: (messages) => [
      ...messages,
      getSystemMessage('Ads are not available in standalone mode.'),
    ],
  }
}

export const handleAdsDisable = (): {
  postUserMessage: (messages: ChatMessage[]) => ChatMessage[]
} => {
  return {
    postUserMessage: (messages) => [
      ...messages,
      getSystemMessage('Ads are not available in standalone mode.'),
    ],
  }
}

export const getAdsEnabled = (): boolean => {
  return false
}
