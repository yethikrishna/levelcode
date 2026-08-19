import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type PaletteAction = {
  id: string
  icon: string
  label: string
  shortcut?: string
  section: 'quick' | 'recent' | 'commands'
  action: () => void
}

interface PaletteState {
  isOpen: boolean
  query: string
  selectedIndex: number
  recentActions: string[]
}

interface PaletteActions {
  open: () => void
  close: () => void
  toggle: () => void
  setQuery: (q: string) => void
  setSelectedIndex: (i: number) => void
  moveSelectionDown: (total: number) => void
  moveSelectionUp: (total: number) => void
  addRecentAction: (id: string) => void
  reset: () => void
}

type PaletteStore = PaletteState & PaletteActions

const initialState: PaletteState = {
  isOpen: false,
  query: '',
  selectedIndex: 0,
  recentActions: [],
}

export const usePaletteStore = create<PaletteStore>()(
  immer((set) => ({
    ...initialState,

    open: () =>
      set((state) => {
        state.isOpen = true
        state.query = ''
        state.selectedIndex = 0
      }),

    close: () =>
      set((state) => {
        state.isOpen = false
        state.query = ''
        state.selectedIndex = 0
      }),

    toggle: () =>
      set((state) => {
        state.isOpen = !state.isOpen
        if (state.isOpen) {
          state.query = ''
          state.selectedIndex = 0
        }
      }),

    setQuery: (q) =>
      set((state) => {
        state.query = q
        state.selectedIndex = 0
      }),

    setSelectedIndex: (i) =>
      set((state) => {
        state.selectedIndex = i
      }),

    moveSelectionDown: (total) =>
      set((state) => {
        if (total <= 0) return
        state.selectedIndex = (state.selectedIndex + 1) % total
      }),

    moveSelectionUp: (total) =>
      set((state) => {
        if (total <= 0) return
        state.selectedIndex = (state.selectedIndex - 1 + total) % total
      }),

    addRecentAction: (id) =>
      set((state) => {
        state.recentActions = [id, ...state.recentActions.filter((r) => r !== id)].slice(0, 5)
      }),

    reset: () => set(() => ({ ...initialState, recentActions: [] })),
  })),
)
