import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, memo } from 'react'

import { useTheme } from '../../hooks/use-theme'

import type { KeyEvent } from '@opentui/core'

export interface TabDefinition {
  key: string
  label: string
}

interface TabViewProps {
  tabs: TabDefinition[]
  activeTab: string
  onTabChange: (key: string) => void
  children: React.ReactNode
}

export const TabView = memo(function TabView({
  tabs,
  activeTab,
  onTabChange,
  children,
}: TabViewProps) {
  const theme = useTheme()

  const activeIndex = tabs.findIndex((t) => t.key === activeTab)

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'left') {
          const prevIndex = activeIndex > 0 ? activeIndex - 1 : tabs.length - 1
          onTabChange(tabs[prevIndex].key)
          return
        }

        if (key.name === 'right') {
          const nextIndex = activeIndex < tabs.length - 1 ? activeIndex + 1 : 0
          onTabChange(tabs[nextIndex].key)
          return
        }

        // Number keys 1-9 to jump to tab
        if (
          key.sequence &&
          key.sequence.length === 1 &&
          !key.ctrl &&
          !key.meta
        ) {
          const num = parseInt(key.sequence, 10)
          if (num >= 1 && num <= 9 && num <= tabs.length) {
            onTabChange(tabs[num - 1].key)
          }
        }
      },
      [activeIndex, tabs, onTabChange],
    ),
  )

  return (
    <box style={{ flexDirection: 'column', width: '100%' }}>
      {/* Tab bar */}
      <box
        style={{
          flexDirection: 'row',
          gap: 0,
          paddingBottom: 0,
        }}
      >
        {tabs.map((tab, idx) => {
          const isActive = tab.key === activeTab
          const isLast = idx === tabs.length - 1
          return (
            <box key={tab.key} style={{ flexDirection: 'column' }}>
              {/* Tab label row */}
              <box style={{ flexDirection: 'row' }}>
                <text
                  style={{
                    fg: isActive ? theme.primary : theme.muted,
                    attributes: isActive
                      ? TextAttributes.BOLD
                      : TextAttributes.DIM,
                  }}
                >
                  {isActive ? `[${idx + 1}] ${tab.label}` : ` ${idx + 1}  ${tab.label}`}
                </text>
                {/* Tab separator */}
                {!isLast && (
                  <text style={{ fg: theme.border, attributes: TextAttributes.DIM }}>
                    {' \u2502 '}
                  </text>
                )}
              </box>
              {/* Active tab underline */}
              {isActive && (
                <text style={{ fg: theme.primary }}>
                  {'\u2594'.repeat(tab.label.length + 4)}
                </text>
              )}
            </box>
          )
        })}
      </box>
      <box style={{ flexDirection: 'column', flexGrow: 1 }}>
        {children}
      </box>
    </box>
  )
})
