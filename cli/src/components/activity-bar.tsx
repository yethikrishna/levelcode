import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { memo, useCallback } from 'react'

import { Clickable } from './clickable'
import { useTheme } from '../hooks/use-theme'
import { useActivityBarStore, ACTIVITY_ITEMS, type ActivityView } from '../state/activity-bar-store'
import { usePaletteStore } from '../state/palette-store'

import type { KeyEvent } from '@opentui/core'

const ICON_WIDTH = 3
const BADGE_MAX = 9

export const ActivityBar = memo(function ActivityBar() {
  const theme = useTheme()
  const activeView = useActivityBarStore((s) => s.activeView)
  const badges = useActivityBarStore((s) => s.badges)
  const setActiveView = useActivityBarStore((s) => s.setActiveView)
  const openPalette = usePaletteStore((s) => s.open)

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.ctrl || key.meta || key.option) return
        const digit = key.sequence?.match(/^([1-7])$/)?.[1]
        if (digit) {
          const idx = parseInt(digit, 10) - 1
          const item = ACTIVITY_ITEMS[idx]
          if (item) {
            setActiveView(item.id)
          }
        }
      },
      [setActiveView],
    ),
  )

  const handleClick = useCallback(
    (id: ActivityView) => {
      if (id === 'chat') {
        setActiveView('chat')
      } else {
        setActiveView(id)
      }
    },
    [setActiveView],
  )

  return (
    <box
      style={{
        flexDirection: 'column',
        width: 5,
        backgroundColor: theme.activityBarBg ?? '#010409',
        flexShrink: 0,
        height: '100%',
      }}
    >
      <box style={{ height: 1 }} />
      {ACTIVITY_ITEMS.map((item) => {
        const isActive = activeView === item.id
        const badge = badges[item.id]
        return (
          <box key={item.id} style={{ flexDirection: 'row', width: 5, height: 3 }}>
            {isActive ? (
              <box
                style={{
                  width: 1,
                  height: 3,
                  backgroundColor: theme.activityBarActiveFg ?? theme.primary,
                }}
              />
            ) : (
              <box style={{ width: 1 }} />
            )}
            <Clickable
              onMouseDown={() => handleClick(item.id)}
              style={{
                flexDirection: 'column',
                width: 4,
                height: 3,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isActive ? (theme.activityBarActiveBg ?? theme.surface) : 'transparent',
              }}
            >
            <box style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <box style={{ flexDirection: 'row' }}>
                <text
                  style={{
                    fg: isActive
                      ? (theme.activityBarActiveFg ?? theme.primary)
                      : (theme.activityBarFg ?? theme.muted),
                  }}
                >
                  {item.icon}
                </text>
                {badge !== undefined && badge > 0 && (
                  <text style={{ fg: theme.error, attributes: TextAttributes.BOLD, wrapMode: 'none' }}>
                    {'*'}
                  </text>
                )}
              </box>
            </box>
            </Clickable>
          </box>
        )
      })}
      <box style={{ flexGrow: 1 }} />
      <text
        style={{
          fg: theme.foregroundSubtle ?? theme.muted,
          attributes: TextAttributes.DIM,
          paddingLeft: 1,
        }}
      >
        1-7
      </text>
      <box style={{ height: 1 }} />
    </box>
  )
})
