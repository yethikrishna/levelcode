import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type NotificationType =
  | 'teammate_idle'
  | 'task_completed'
  | 'phase_transition'
  | 'message_received'
  | 'agent_joined'
  | 'agent_left'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string
  timestamp: number
  read: boolean
  agentName?: string
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
}

interface NotificationActions {
  addNotification: (
    notification: Omit<Notification, 'id' | 'timestamp' | 'read'>,
  ) => void
  markRead: (id: string) => void
  markAllRead: () => void
  clearNotifications: () => void
  getUnread: () => Notification[]
  reset: () => void
}

type NotificationStore = NotificationState & NotificationActions

const initialState: NotificationState = {
  notifications: [],
  unreadCount: 0,
}

export const useNotificationStore = create<NotificationStore>()(
  immer((set, get) => ({
    ...initialState,

    addNotification: (notification) =>
      set((state) => {
        const newNotification: Notification = {
          ...notification,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          read: false,
        }
        state.notifications.unshift(newNotification)
        state.unreadCount += 1
      }),

    markRead: (id) =>
      set((state) => {
        const notification = state.notifications.find((n) => n.id === id)
        if (notification && !notification.read) {
          notification.read = true
          state.unreadCount = Math.max(0, state.unreadCount - 1)
        }
      }),

    markAllRead: () =>
      set((state) => {
        for (const notification of state.notifications) {
          notification.read = true
        }
        state.unreadCount = 0
      }),

    clearNotifications: () =>
      set((state) => {
        state.notifications = []
        state.unreadCount = 0
      }),

    getUnread: () => {
      return get().notifications.filter((n) => !n.read)
    },

    reset: () =>
      set(() => ({
        ...initialState,
        notifications: [],
      })),
  })),
)

export const selectUnreadCount = (state: NotificationStore) =>
  state.unreadCount
export const selectNotifications = (state: NotificationStore) =>
  state.notifications
export const selectHasUnread = (state: NotificationStore) =>
  state.unreadCount > 0
