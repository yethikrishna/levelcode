import { describe, it, expect, beforeEach } from 'bun:test'
import {
  useNotificationStore,
  selectUnreadCount,
  selectNotifications,
  selectHasUnread,
} from '../notification-store'
import type { Notification, NotificationType } from '../notification-store'

function makeNotificationInput(
  overrides?: Partial<Omit<Notification, 'id' | 'timestamp' | 'read'>>,
): Omit<Notification, 'id' | 'timestamp' | 'read'> {
  return {
    type: 'message_received' as NotificationType,
    title: 'Test notification',
    body: 'Test body',
    ...overrides,
  }
}

describe('useNotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.getState().reset()
  })

  describe('initial state', () => {
    it('has empty notifications and unreadCount = 0', () => {
      const state = useNotificationStore.getState()
      expect(state.notifications).toEqual([])
      expect(state.unreadCount).toBe(0)
    })
  })

  describe('addNotification', () => {
    it('adds a notification and increments unreadCount', () => {
      useNotificationStore.getState().addNotification(makeNotificationInput())

      const state = useNotificationStore.getState()
      expect(state.notifications).toHaveLength(1)
      expect(state.unreadCount).toBe(1)
      expect(state.notifications[0].read).toBe(false)
      expect(state.notifications[0].title).toBe('Test notification')
    })

    it('assigns id and timestamp automatically', () => {
      useNotificationStore.getState().addNotification(makeNotificationInput())

      const notification = useNotificationStore.getState().notifications[0]
      expect(notification.id).toBeDefined()
      expect(typeof notification.id).toBe('string')
      expect(notification.timestamp).toBeDefined()
      expect(typeof notification.timestamp).toBe('number')
    })

    it('increments unreadCount for each added notification', () => {
      const store = useNotificationStore.getState()
      store.addNotification(makeNotificationInput({ title: 'First' }))
      store.addNotification(makeNotificationInput({ title: 'Second' }))
      store.addNotification(makeNotificationInput({ title: 'Third' }))

      const state = useNotificationStore.getState()
      expect(state.notifications).toHaveLength(3)
      expect(state.unreadCount).toBe(3)
    })
  })

  describe('markRead', () => {
    it('marks a notification as read and decrements unreadCount', () => {
      useNotificationStore.getState().addNotification(makeNotificationInput())
      const id = useNotificationStore.getState().notifications[0].id

      useNotificationStore.getState().markRead(id)

      const state = useNotificationStore.getState()
      expect(state.notifications[0].read).toBe(true)
      expect(state.unreadCount).toBe(0)
    })

    it('does not decrement below 0 when marking already-read notification', () => {
      useNotificationStore.getState().addNotification(makeNotificationInput())
      const id = useNotificationStore.getState().notifications[0].id

      useNotificationStore.getState().markRead(id)
      useNotificationStore.getState().markRead(id)

      const state = useNotificationStore.getState()
      expect(state.unreadCount).toBe(0)
    })

    it('does nothing for a non-existent id', () => {
      useNotificationStore.getState().addNotification(makeNotificationInput())

      useNotificationStore.getState().markRead('non-existent-id')

      const state = useNotificationStore.getState()
      expect(state.unreadCount).toBe(1)
      expect(state.notifications[0].read).toBe(false)
    })
  })

  describe('markAllRead', () => {
    it('sets unreadCount to 0 and marks all notifications as read', () => {
      const store = useNotificationStore.getState()
      store.addNotification(makeNotificationInput({ title: 'First' }))
      store.addNotification(makeNotificationInput({ title: 'Second' }))
      store.addNotification(makeNotificationInput({ title: 'Third' }))

      useNotificationStore.getState().markAllRead()

      const state = useNotificationStore.getState()
      expect(state.unreadCount).toBe(0)
      for (const notification of state.notifications) {
        expect(notification.read).toBe(true)
      }
    })

    it('is a no-op when there are no notifications', () => {
      useNotificationStore.getState().markAllRead()

      const state = useNotificationStore.getState()
      expect(state.unreadCount).toBe(0)
      expect(state.notifications).toEqual([])
    })
  })

  describe('clearNotifications', () => {
    it('empties the notifications array and resets unreadCount', () => {
      const store = useNotificationStore.getState()
      store.addNotification(makeNotificationInput({ title: 'First' }))
      store.addNotification(makeNotificationInput({ title: 'Second' }))

      useNotificationStore.getState().clearNotifications()

      const state = useNotificationStore.getState()
      expect(state.notifications).toEqual([])
      expect(state.unreadCount).toBe(0)
    })
  })

  describe('getUnread', () => {
    it('returns only unread notifications', () => {
      const store = useNotificationStore.getState()
      store.addNotification(makeNotificationInput({ title: 'First' }))
      store.addNotification(makeNotificationInput({ title: 'Second' }))
      store.addNotification(makeNotificationInput({ title: 'Third' }))

      const firstId = useNotificationStore.getState().notifications[2].id
      useNotificationStore.getState().markRead(firstId)

      const unread = useNotificationStore.getState().getUnread()
      expect(unread).toHaveLength(2)
      expect(unread.every((n) => !n.read)).toBe(true)
    })

    it('returns empty array when all are read', () => {
      const store = useNotificationStore.getState()
      store.addNotification(makeNotificationInput())

      useNotificationStore.getState().markAllRead()

      const unread = useNotificationStore.getState().getUnread()
      expect(unread).toEqual([])
    })

    it('returns empty array when there are no notifications', () => {
      const unread = useNotificationStore.getState().getUnread()
      expect(unread).toEqual([])
    })
  })

  describe('notification ordering', () => {
    it('prepends new notifications (newest first)', () => {
      const store = useNotificationStore.getState()
      store.addNotification(makeNotificationInput({ title: 'First' }))
      store.addNotification(makeNotificationInput({ title: 'Second' }))
      store.addNotification(makeNotificationInput({ title: 'Third' }))

      const titles = useNotificationStore
        .getState()
        .notifications.map((n) => n.title)
      expect(titles).toEqual(['Third', 'Second', 'First'])
    })
  })

  describe('selectors', () => {
    it('selectUnreadCount returns the unread count', () => {
      const store = useNotificationStore.getState()
      store.addNotification(makeNotificationInput())
      store.addNotification(makeNotificationInput())

      expect(selectUnreadCount(useNotificationStore.getState())).toBe(2)
    })

    it('selectNotifications returns the notifications array', () => {
      const store = useNotificationStore.getState()
      store.addNotification(makeNotificationInput({ title: 'Hello' }))

      const notifications = selectNotifications(
        useNotificationStore.getState(),
      )
      expect(notifications).toHaveLength(1)
      expect(notifications[0].title).toBe('Hello')
    })

    it('selectHasUnread returns true when there are unread notifications', () => {
      useNotificationStore.getState().addNotification(makeNotificationInput())

      expect(selectHasUnread(useNotificationStore.getState())).toBe(true)
    })

    it('selectHasUnread returns false when all are read', () => {
      useNotificationStore.getState().addNotification(makeNotificationInput())
      useNotificationStore.getState().markAllRead()

      expect(selectHasUnread(useNotificationStore.getState())).toBe(false)
    })

    it('selectHasUnread returns false when there are no notifications', () => {
      expect(selectHasUnread(useNotificationStore.getState())).toBe(false)
    })
  })

  describe('notification types', () => {
    it('preserves agentName when provided', () => {
      useNotificationStore.getState().addNotification(
        makeNotificationInput({
          type: 'agent_joined',
          agentName: 'alice',
        }),
      )

      const notification = useNotificationStore.getState().notifications[0]
      expect(notification.agentName).toBe('alice')
      expect(notification.type).toBe('agent_joined')
    })

    it('handles all notification types', () => {
      const types: NotificationType[] = [
        'teammate_idle',
        'task_completed',
        'phase_transition',
        'message_received',
        'agent_joined',
        'agent_left',
      ]

      for (const type of types) {
        useNotificationStore.getState().addNotification(
          makeNotificationInput({ type, title: `Notification: ${type}` }),
        )
      }

      const state = useNotificationStore.getState()
      expect(state.notifications).toHaveLength(types.length)
      expect(state.unreadCount).toBe(types.length)
    })
  })
})
