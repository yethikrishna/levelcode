import React, { useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { useNotificationStore } from '../state/notification-store'

import type { Notification } from '../state/notification-store'

const MAX_VISIBLE_NOTIFICATIONS = 5

const formatTimestamp = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

interface NotificationItemProps {
  notification: Notification
  onPress: (id: string) => void
}

const NotificationItem = ({ notification, onPress }: NotificationItemProps) => {
  const theme = useTheme()

  return (
    <Button
      onClick={() => onPress(notification.id)}
      style={{
        flexDirection: 'row',
        gap: 1,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text>
        <span fg={notification.read ? theme.secondary : theme.warning}>
          {notification.read ? ' ' : '*'}
        </span>
        <span fg={notification.read ? theme.secondary : theme.foreground}>
          {' '}
          {notification.title}
        </span>
        <span fg={theme.secondary}> {formatTimestamp(notification.timestamp)}</span>
      </text>
    </Button>
  )
}

export const NotificationBadge = () => {
  const theme = useTheme()
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const notifications = useNotificationStore((s) => s.notifications)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const [expanded, setExpanded] = useState(false)

  if (unreadCount === 0 && !expanded) {
    return null
  }

  const displayCount = unreadCount > 99 ? '99+' : String(unreadCount)

  const handleBadgePress = () => {
    setExpanded((prev) => !prev)
  }

  const handleNotificationPress = (id: string) => {
    markRead(id)
  }

  const handleMarkAllRead = () => {
    markAllRead()
    setExpanded(false)
  }

  const visibleNotifications = notifications.slice(0, MAX_VISIBLE_NOTIFICATIONS)

  return (
    <box style={{ flexDirection: 'column' }}>
      <Button onClick={handleBadgePress}>
        <text>
          <span fg={theme.surface}> </span>
          <span fg={unreadCount > 0 ? theme.warning : theme.secondary} bg={theme.surface}>
            {` ${displayCount} `}
          </span>
          <span fg={theme.surface}> </span>
        </text>
      </Button>

      {expanded && notifications.length > 0 && (
        <box
          style={{
            flexDirection: 'column',
            borderStyle: 'round',
            borderColor: theme.border,
            padding: 0,
            marginTop: 1,
          }}
        >
          <box
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingLeft: 1,
              paddingRight: 1,
              backgroundColor: theme.surface,
            }}
          >
            <text>
              <span fg={theme.foreground}>Notifications</span>
            </text>
            {unreadCount > 0 && (
              <Button onClick={handleMarkAllRead}>
                <text>
                  <span fg={theme.primary}>Mark all read</span>
                </text>
              </Button>
            )}
          </box>

          {visibleNotifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onPress={handleNotificationPress}
            />
          ))}

          {notifications.length > MAX_VISIBLE_NOTIFICATIONS && (
            <box style={{ paddingLeft: 1 }}>
              <text>
                <span fg={theme.secondary}>
                  +{notifications.length - MAX_VISIBLE_NOTIFICATIONS} more
                </span>
              </text>
            </box>
          )}
        </box>
      )}
    </box>
  )
}
