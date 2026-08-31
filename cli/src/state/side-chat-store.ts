import { create } from 'zustand'

import {
  useSideChatStore as useManagerStore,
} from '../side-chats/side-chat-manager'

// ── Facade over the side-chat engine ─────────────────────────────────
//
// The real side-chat engine lives in `side-chats/side-chat-manager.ts`
// (chats, messages, streaming, panel state). This store used to be a second,
// parallel implementation — commands toggled it while the panel rendered
// from the engine, so panel state and data silently diverged. It is now a
// thin mirrored facade: reads derive from the engine, actions delegate to
// it, and `useSideChatStore.subscribe` keeps the mirror in sync.

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

function deriveFromEngine(): SideChatState {
  const engine = useManagerStore.getState()
  return {
    sideChats: engine
      .getSideChats()
      .map((chat) => ({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        lastMessageAt: chat.updatedAt,
        messageCount: chat.messages.length,
        isActive: chat.id === engine.activeChatId,
      })),
    activeSideChatId: engine.activeChatId,
    isSideChatPanelOpen: engine.isPanelOpen,
  }
}

export const useSideChatStore = create<SideChatStore>()(() => ({
  ...deriveFromEngine(),

  createSideChat: (title) => {
    const engine = useManagerStore.getState()
    const id = crypto.randomUUID()
    engine.createSideChat(id, '', title)
    engine.openPanel()
    return id
  },

  closeSideChat: (id) => {
    useManagerStore.getState().closeSideChat(id)
  },

  setActiveSideChat: (id) => {
    const engine = useManagerStore.getState()
    engine.setActiveChat(id)
    if (id) {
      engine.openPanel()
    }
  },

  toggleSideChatPanel: () => {
    useManagerStore.getState().togglePanel()
  },

  closeSideChatPanel: () => {
    useManagerStore.getState().closePanel()
  },

  openSideChatPanel: () => {
    useManagerStore.getState().openPanel()
  },

  // Title/metadata updates beyond the engine's model are not supported;
  // kept as a no-op for interface compatibility.
  updateSideChat: () => {},

  removeSideChat: (id) => {
    useManagerStore.getState().closeSideChat(id)
  },

  reset: () => {
    useManagerStore.getState().reset()
  },
}))

// Mirror engine → facade whenever the engine changes.
useManagerStore.subscribe(() => {
  useSideChatStore.setState(deriveFromEngine())
})
