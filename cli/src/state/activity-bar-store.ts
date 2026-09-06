import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import { ICON } from '../utils/icons'

export type ActivityView =
  | 'chat'
  | 'teams'
  | 'files'
  | 'search'
  | 'metrics'
  | 'marketplace'
  | 'settings'

export interface ActivityItem {
  id: ActivityView
  icon: string
  label: string
  shortcut: string
  badge?: number
}

interface ActivityBarState {
  activeView: ActivityView
  badges: Partial<Record<ActivityView, number>>
}

interface ActivityBarActions {
  setActiveView: (view: ActivityView) => void
  setBadge: (view: ActivityView, count: number | undefined) => void
  reset: () => void
}

type ActivityBarStore = ActivityBarState & ActivityBarActions

export const ACTIVITY_ITEMS: ActivityItem[] = [
  { id: 'chat', icon: ICON.nav.chat, label: 'Chat', shortcut: '1' },
  { id: 'teams', icon: ICON.nav.teams, label: 'Teams', shortcut: '2' },
  { id: 'files', icon: ICON.nav.files, label: 'Files', shortcut: '3' },
  { id: 'search', icon: ICON.nav.search, label: 'Search', shortcut: '4' },
  { id: 'metrics', icon: ICON.nav.metrics, label: 'Metrics', shortcut: '5' },
  { id: 'marketplace', icon: ICON.nav.marketplace, label: 'Marketplace', shortcut: '6' },
  { id: 'settings', icon: ICON.nav.settings, label: 'Settings', shortcut: '7' },
]

const initialState: ActivityBarState = {
  activeView: 'chat',
  badges: {},
}

export const useActivityBarStore = create<ActivityBarStore>()(
  immer((set) => ({
    ...initialState,

    setActiveView: (view) =>
      set((state) => {
        state.activeView = view
      }),

    setBadge: (view, count) =>
      set((state) => {
        if (count === undefined || count === 0) {
          delete state.badges[view]
        } else {
          state.badges[view] = count
        }
      }),

    reset: () => set(() => ({ ...initialState, badges: {} })),
  })),
)
