import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export interface SideChat {
  id: string
  title: string
  createdAt: number
  lastMessageAt: number
  messageCount: number
  isActive: boolean
}

interface SideChatState {
  sideChats: SideChat[]
  activeSideChatId: string | null
  isSideChatPanelOpen: boolean
}

interface SideChatActions {
  createSideChat: (title?: string) => string
  closeSideChat: (id: string) => void
  setActiveSideChat: (id: string | null) => void
  toggleSideChatPanel: () => void
  closeSideChatPanel: () => void
  openSideChatPanel: () => void
  updateSideChat: (id: string, updates: Partial<SideChat>) => void
  removeSideChat: (id: string) => void
  reset: () => void
}

type SideChatStore = SideChatState & SideChatActions

const initialState: SideChatState = {
  sideChats: [],
  activeSideChatId: null,
  isSideChatPanelOpen: false,
}

export const useSideChatStore = create<SideChatStore>()(
  immer((set) => ({
    ...initialState,

    createSideChat: (title) => {
      const id = crypto.randomUUID()
      const newChat: SideChat = {
        id,
        title: title || `Side chat ${Date.now()}`,
        createdAt: Date.now(),
        lastMessageAt: Date.now(),
        messageCount: 0,
        isActive: false,
      }
      set((state) => {
        state.sideChats.push(newChat)
        state.activeSideChatId = id
        state.isSideChatPanelOpen = true
      })
      return id
    },

    closeSideChat: (id) =>
      set((state) => {
        const idx = state.sideChats.findIndex((c) => c.id === id)
        if (idx !== -1) {
          state.sideChats.splice(idx, 1)
        }
        if (state.activeSideChatId === id) {
          state.activeSideChatId = state.sideChats.length > 0
            ? state.sideChats[state.sideChats.length - 1].id
            : null
        }
      }),

    setActiveSideChat: (id) =>
      set((state) => {
        state.activeSideChatId = id
        state.sideChats.forEach((c) => {
          c.isActive = c.id === id
        })
        if (id) {
          state.isSideChatPanelOpen = true
        }
      }),

    toggleSideChatPanel: () =>
      set((state) => {
        state.isSideChatPanelOpen = !state.isSideChatPanelOpen
      }),

    closeSideChatPanel: () =>
      set((state) => {
        state.isSideChatPanelOpen = false
      }),

    openSideChatPanel: () =>
      set((state) => {
        state.isSideChatPanelOpen = true
      }),

    updateSideChat: (id, updates) =>
      set((state) => {
        const chat = state.sideChats.find((c) => c.id === id)
        if (chat) {
          Object.assign(chat, updates)
        }
      }),

    removeSideChat: (id) =>
      set((state) => {
        const idx = state.sideChats.findIndex((c) => c.id === id)
        if (idx !== -1) {
          state.sideChats.splice(idx, 1)
        }
        if (state.activeSideChatId === id) {
          state.activeSideChatId = null
        }
      }),

    reset: () =>
      set((state) => {
        state.sideChats = initialState.sideChats
        state.activeSideChatId = initialState.activeSideChatId
        state.isSideChatPanelOpen = initialState.isSideChatPanelOpen
      }),
  })),
)
