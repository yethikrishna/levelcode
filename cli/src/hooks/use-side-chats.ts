import { useCallback } from 'react'

import { useSideChatStore } from '../state/side-chat-store'

export function useSideChats() {
  const sideChats = useSideChatStore((state) => state.sideChats)
  const activeSideChatId = useSideChatStore((state) => state.activeSideChatId)
  const isSideChatPanelOpen = useSideChatStore((state) => state.isSideChatPanelOpen)

  const createSideChat = useSideChatStore((state) => state.createSideChat)
  const closeSideChat = useSideChatStore((state) => state.closeSideChat)
  const setActiveSideChat = useSideChatStore((state) => state.setActiveSideChat)
  const toggleSideChatPanel = useSideChatStore((state) => state.toggleSideChatPanel)
  const closeSideChatPanel = useSideChatStore((state) => state.closeSideChatPanel)
  const openSideChatPanel = useSideChatStore((state) => state.openSideChatPanel)
  const updateSideChat = useSideChatStore((state) => state.updateSideChat)
  const removeSideChat = useSideChatStore((state) => state.removeSideChat)

  const activeSideChat = sideChats.find((c) => c.id === activeSideChatId) ?? null

  const handleCreateSideChat = useCallback(
    (title?: string) => {
      return createSideChat(title)
    },
    [createSideChat],
  )

  return {
    sideChats,
    activeSideChat,
    activeSideChatId,
    isSideChatPanelOpen,
    createSideChat: handleCreateSideChat,
    closeSideChat,
    setActiveSideChat,
    toggleSideChatPanel,
    closeSideChatPanel,
    openSideChatPanel,
    updateSideChat,
    removeSideChat,
  }
}
