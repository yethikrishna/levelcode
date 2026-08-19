import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { useShallow } from 'zustand/react/shallow'
import { useEffect, useMemo, useRef, useCallback } from 'react'

import type { ChatMessage } from '../types/chat'
import type { MutableRefObject } from 'react'

export interface SideChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  isStreaming?: boolean
  blocks?: ChatMessage['blocks']
}

export interface SideChat {
  id: string
  title: string
  prompt: string
  createdAt: number
  updatedAt: number
  messages: SideChatMessage[]
  isActive: boolean
  isStreaming: boolean
  projectSnapshot: {
    cwd: string
    readOnlyFiles: Map<string, string>
  }
}

export interface SideChatState {
  sideChats: Map<string, SideChat>
  activeChatId: string | null
  isPanelOpen: boolean
  selectedChatIndex: number
}

interface SideChatActions {
  createSideChat: (id: string, prompt: string, title?: string) => SideChat
  sendMessage: (chatId: string, content: string) => void
  closeSideChat: (id: string) => void
  setActiveChat: (id: string | null) => void
  togglePanel: () => void
  openPanel: () => void
  closePanel: () => void
  setSelectedChatIndex: (index: number) => void
  getSideChatState: (id: string) => SideChat | null
  getSideChats: () => SideChat[]
  addAssistantMessage: (chatId: string, content: string, isStreaming?: boolean) => string
  appendToStreaming: (chatId: string, messageId: string, delta: string) => void
  finalizeStreaming: (chatId: string, messageId: string) => void
  addSystemMessage: (chatId: string, content: string) => void
  updateProjectSnapshot: (chatId: string, files: Record<string, string>) => void
  reset: () => void
}

type SideChatStore = SideChatState & SideChatActions

let nextMsgCounter = 0

function generateMessageId(): string {
  nextMsgCounter++
  return `side-msg-${Date.now()}-${nextMsgCounter}`
}

const initialState: SideChatState = {
  sideChats: new Map<string, SideChat>(),
  activeChatId: null,
  isPanelOpen: false,
  selectedChatIndex: 0,
}

export const useSideChatStore = create<SideChatStore>()(
  immer((set, get) => ({
    ...initialState,

    createSideChat: (id, prompt, title) => {
      const now = Date.now()
      const chat: SideChat = {
        id,
        title: title ?? `Side Chat ${get().sideChats.size + 1}`,
        prompt,
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id: generateMessageId(),
            role: 'system',
            content: prompt,
            timestamp: now,
          },
        ],
        isActive: true,
        isStreaming: false,
        projectSnapshot: {
          cwd: process.cwd(),
          readOnlyFiles: new Map<string, string>(),
        },
      }

      set((state) => {
        state.sideChats.set(id, chat)
        state.activeChatId = id
        state.selectedChatIndex = state.sideChats.size - 1
      })

      return chat
    },

    sendMessage: (chatId, content) => {
      const now = Date.now()
      set((state) => {
        const chat = state.sideChats.get(chatId)
        if (!chat) return

        chat.messages.push({
          id: generateMessageId(),
          role: 'user',
          content,
          timestamp: now,
        })
        chat.updatedAt = now
        chat.isStreaming = true
      })
    },

    closeSideChat: (id) => {
      set((state) => {
        state.sideChats.delete(id)
        if (state.activeChatId === id) {
          const remaining = Array.from(state.sideChats.keys())
          state.activeChatId = remaining.length > 0 ? remaining[remaining.length - 1] : null
          state.selectedChatIndex = Math.min(state.selectedChatIndex, Math.max(0, remaining.length - 1))
        }
        if (state.sideChats.size === 0) {
          state.isPanelOpen = false
        }
      })
    },

    setActiveChat: (id) => {
      set((state) => {
        state.activeChatId = id
        if (id) {
          const chatIds = Array.from(state.sideChats.keys())
          state.selectedChatIndex = chatIds.indexOf(id)
        }
      })
    },

    togglePanel: () => {
      set((state) => {
        state.isPanelOpen = !state.isPanelOpen
      })
    },

    openPanel: () => {
      set((state) => {
        state.isPanelOpen = true
      })
    },

    closePanel: () => {
      set((state) => {
        state.isPanelOpen = false
      })
    },

    setSelectedChatIndex: (index) => {
      set((state) => {
        const chatIds = Array.from(state.sideChats.keys())
        const clamped = Math.max(0, Math.min(index, chatIds.length - 1))
        state.selectedChatIndex = clamped
        if (chatIds[clamped]) {
          state.activeChatId = chatIds[clamped]
        }
      })
    },

    getSideChatState: (id) => {
      return get().sideChats.get(id) ?? null
    },

    getSideChats: () => {
      return Array.from(get().sideChats.values()).sort((a, b) => a.createdAt - b.createdAt)
    },

    addAssistantMessage: (chatId, content, isStreaming = false) => {
      const msgId = generateMessageId()
      const now = Date.now()
      set((state) => {
        const chat = state.sideChats.get(chatId)
        if (!chat) return

        chat.messages.push({
          id: msgId,
          role: 'assistant',
          content,
          timestamp: now,
          isStreaming,
        })
        chat.updatedAt = now
        if (!isStreaming) {
          chat.isStreaming = false
        }
      })
      return msgId
    },

    appendToStreaming: (chatId, messageId, delta) => {
      set((state) => {
        const chat = state.sideChats.get(chatId)
        if (!chat) return
        const msg = chat.messages.find((m) => m.id === messageId)
        if (msg && msg.isStreaming) {
          msg.content += delta
        }
      })
    },

    finalizeStreaming: (chatId, messageId) => {
      set((state) => {
        const chat = state.sideChats.get(chatId)
        if (!chat) return
        const msg = chat.messages.find((m) => m.id === messageId)
        if (msg) {
          msg.isStreaming = false
        }
        chat.isStreaming = false
        chat.updatedAt = Date.now()
      })
    },

    addSystemMessage: (chatId, content) => {
      const now = Date.now()
      set((state) => {
        const chat = state.sideChats.get(chatId)
        if (!chat) return
        chat.messages.push({
          id: generateMessageId(),
          role: 'system',
          content,
          timestamp: now,
        })
        chat.updatedAt = now
      })
    },

    updateProjectSnapshot: (chatId, files) => {
      set((state) => {
        const chat = state.sideChats.get(chatId)
        if (!chat) return
        chat.projectSnapshot.readOnlyFiles = new Map(Object.entries(files))
      })
    },

    reset: () => {
      set(() => ({
        ...initialState,
        sideChats: new Map(),
      }))
    },
  })),
)

export interface SideChatsRefs {
  activeChatIdRef: MutableRefObject<string | null>
  isPanelOpenRef: MutableRefObject<boolean>
}

export interface UseSideChatsReturn {
  sideChats: SideChat[]
  activeChatId: string | null
  activeChat: SideChat | null
  isPanelOpen: boolean
  selectedChatIndex: number
  createSideChat: (id: string, prompt: string, title?: string) => SideChat
  sendMessage: (chatId: string, content: string) => void
  closeSideChat: (id: string) => void
  setActiveChat: (id: string | null) => void
  togglePanel: () => void
  openPanel: () => void
  closePanel: () => void
  setSelectedChatIndex: (index: number) => void
  getSideChatState: (id: string) => SideChat | null
  refs: SideChatsRefs
}

export function useSideChats(): UseSideChatsReturn {
  const {
    activeChatId,
    isPanelOpen,
    selectedChatIndex,
    createSideChat: storeCreate,
    sendMessage: storeSend,
    closeSideChat: storeClose,
    setActiveChat: storeSetActive,
    togglePanel: storeToggle,
    openPanel: storeOpen,
    closePanel: storeClosePanel,
    setSelectedChatIndex: storeSetIndex,
    getSideChatState: storeGetState,
  } = useSideChatStore(
    useShallow((store) => ({
      activeChatId: store.activeChatId,
      isPanelOpen: store.isPanelOpen,
      selectedChatIndex: store.selectedChatIndex,
      createSideChat: store.createSideChat,
      sendMessage: store.sendMessage,
      closeSideChat: store.closeSideChat,
      setActiveChat: store.setActiveChat,
      togglePanel: store.togglePanel,
      openPanel: store.openPanel,
      closePanel: store.closePanel,
      setSelectedChatIndex: store.setSelectedChatIndex,
      getSideChatState: store.getSideChatState,
    })),
  )

  const rawSideChats = useSideChatStore((s) => s.sideChats)

  const sideChats = useMemo(
    () => Array.from(rawSideChats.values()).sort((a, b) => a.createdAt - b.createdAt),
    [Array.from(rawSideChats.keys()).join(',')],
  )

  const activeChat = useMemo(
    () => (activeChatId ? rawSideChats.get(activeChatId) ?? null : null),
    [activeChatId, rawSideChats],
  )

  const activeChatIdRef = useRef<string | null>(activeChatId)
  const isPanelOpenRef = useRef<boolean>(isPanelOpen)

  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])

  useEffect(() => {
    isPanelOpenRef.current = isPanelOpen
  }, [isPanelOpen])

  const refs: SideChatsRefs = {
    activeChatIdRef,
    isPanelOpenRef,
  }

  return {
    sideChats,
    activeChatId,
    activeChat,
    isPanelOpen,
    selectedChatIndex,
    createSideChat: storeCreate,
    sendMessage: storeSend,
    closeSideChat: storeClose,
    setActiveChat: storeSetActive,
    togglePanel: storeToggle,
    openPanel: storeOpen,
    closePanel: storeClosePanel,
    setSelectedChatIndex: storeSetIndex,
    getSideChatState: storeGetState,
    refs,
  }
}

export const SIDE_CHAT_KEYBINDING = 'F2'

export function useSideChatKeybinding(
  onToggle?: () => void,
) {
  const handler = useCallback(
    (key: any) => {
      const toggle = onToggle ?? (() => useSideChatStore.getState().togglePanel())
      if (key.name === 'f2') {
        toggle()
        return true
      }
      return false
    },
    [onToggle],
  )

  return handler
}
