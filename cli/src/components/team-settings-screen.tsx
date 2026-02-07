import { useKeyboard } from '@opentui/react'
import React, { useCallback, useEffect, useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { useTeamStore } from '../state/team-store'
import { BORDER_CHARS } from '../utils/ui-constants'
import {
  loadSwarmSettings,
  saveSwarmPreference,
  saveSwarmMaxMembers,
  saveSwarmAutoAssign,
  saveSwarmDefaultPhase,
} from '../utils/settings'
import { PHASE_ORDER } from '@levelcode/common/utils/dev-phases'

import type { KeyEvent } from '@opentui/core'
import type { DevPhase } from '@levelcode/common/types/team-config'

const PHASE_OPTIONS: readonly DevPhase[] = PHASE_ORDER

interface SettingItem {
  id: string
  label: string
  type: 'toggle' | 'number' | 'select'
}

const SETTING_ITEMS: SettingItem[] = [
  { id: 'swarmEnabled', label: 'Swarm Enabled', type: 'toggle' },
  { id: 'maxMembers', label: 'Max Team Members', type: 'number' },
  { id: 'autoAssign', label: 'Auto-assign Tasks', type: 'toggle' },
  { id: 'defaultPhase', label: 'Default Phase', type: 'select' },
]

interface TeamSettingsScreenProps {
  onClose: () => void
}

export const TeamSettingsScreen: React.FC<TeamSettingsScreenProps> = ({
  onClose,
}) => {
  const theme = useTheme()
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Load current values from settings on mount
  const [swarmEnabled, setSwarmEnabled] = useState(false)
  const [maxMembers, setMaxMembers] = useState(20)
  const [autoAssign, setAutoAssign] = useState(false)
  const [defaultPhase, setDefaultPhase] = useState<string>('planning')

  useEffect(() => {
    const current = loadSwarmSettings()
    setSwarmEnabled(current.swarmEnabled)
    setMaxMembers(current.swarmMaxMembers)
    setAutoAssign(current.swarmAutoAssign)
    setDefaultPhase(current.swarmDefaultPhase)
  }, [])

  const toggleSwarmEnabled = useCallback(() => {
    const next = !swarmEnabled
    setSwarmEnabled(next)
    saveSwarmPreference(next)
    useTeamStore.getState().setSwarmEnabled(next)
  }, [swarmEnabled])

  const toggleAutoAssign = useCallback(() => {
    const next = !autoAssign
    setAutoAssign(next)
    saveSwarmAutoAssign(next)
  }, [autoAssign])

  const adjustMaxMembers = useCallback(
    (delta: number) => {
      const next = Math.max(1, Math.min(100, maxMembers + delta))
      setMaxMembers(next)
      saveSwarmMaxMembers(next)
    },
    [maxMembers],
  )

  const cyclePhase = useCallback(
    (direction: number) => {
      const currentIdx = PHASE_OPTIONS.indexOf(defaultPhase as DevPhase)
      const nextIdx =
        (currentIdx + direction + PHASE_OPTIONS.length) % PHASE_OPTIONS.length
      const next = PHASE_OPTIONS[nextIdx]!
      setDefaultPhase(next)
      saveSwarmDefaultPhase(next)
    },
    [defaultPhase],
  )

  const handleAction = useCallback(() => {
    const item = SETTING_ITEMS[selectedIndex]
    if (!item) return

    switch (item.id) {
      case 'swarmEnabled':
        toggleSwarmEnabled()
        break
      case 'autoAssign':
        toggleAutoAssign()
        break
      case 'maxMembers':
        adjustMaxMembers(1)
        break
      case 'defaultPhase':
        cyclePhase(1)
        break
    }
  }, [selectedIndex, toggleSwarmEnabled, toggleAutoAssign, adjustMaxMembers, cyclePhase])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          onClose()
          return
        }
        if (key.name === 'up') {
          setSelectedIndex((prev) => Math.max(0, prev - 1))
          return
        }
        if (key.name === 'down') {
          setSelectedIndex((prev) =>
            Math.min(SETTING_ITEMS.length - 1, prev + 1),
          )
          return
        }
        if (key.name === 'return' || key.name === 'enter' || key.name === 'space') {
          handleAction()
          return
        }

        const item = SETTING_ITEMS[selectedIndex]
        if (!item) return

        if (key.name === 'left') {
          if (item.id === 'maxMembers') {
            adjustMaxMembers(-1)
          } else if (item.id === 'defaultPhase') {
            cyclePhase(-1)
          } else if (item.type === 'toggle') {
            handleAction()
          }
          return
        }
        if (key.name === 'right') {
          if (item.id === 'maxMembers') {
            adjustMaxMembers(1)
          } else if (item.id === 'defaultPhase') {
            cyclePhase(1)
          } else if (item.type === 'toggle') {
            handleAction()
          }
          return
        }
      },
      [onClose, selectedIndex, handleAction, adjustMaxMembers, cyclePhase],
    ),
  )

  const getValueDisplay = (item: SettingItem): string => {
    switch (item.id) {
      case 'swarmEnabled':
        return swarmEnabled ? 'ON' : 'OFF'
      case 'maxMembers':
        return `< ${maxMembers} >`
      case 'autoAssign':
        return autoAssign ? 'ON' : 'OFF'
      case 'defaultPhase':
        return `< ${defaultPhase} >`
      default:
        return ''
    }
  }

  const getValueColor = (item: SettingItem): string => {
    switch (item.id) {
      case 'swarmEnabled':
        return swarmEnabled ? theme.success : theme.muted
      case 'autoAssign':
        return autoAssign ? theme.success : theme.muted
      default:
        return theme.primary
    }
  }

  return (
    <box
      title=" Swarm / Teams "
      titleAlignment="center"
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.primary,
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
      }}
    >
      {SETTING_ITEMS.map((item, index) => {
        const isSelected = index === selectedIndex
        const valueDisplay = getValueDisplay(item)
        const valueColor = getValueColor(item)

        return (
          <Button
            key={item.id}
            onClick={() => {
              setSelectedIndex(index)
              handleAction()
            }}
            style={{
              flexDirection: 'row',
              height: 1,
              paddingLeft: 0,
              paddingRight: 0,
            }}
          >
            <text
              style={{
                fg: isSelected ? theme.primary : theme.foreground,
                bg: isSelected ? theme.surface : undefined,
              }}
            >
              {isSelected ? '> ' : '  '}
              {item.label}
            </text>
            <text style={{ fg: theme.muted }}>{'  '}</text>
            <text
              style={{
                fg: isSelected ? valueColor : theme.muted,
              }}
            >
              {valueDisplay}
            </text>
          </Button>
        )
      })}
      <text style={{ fg: theme.muted }}>
        {'\u2191\u2193 navigate \u00B7 Enter/Space toggle \u00B7 \u2190\u2192 adjust \u00B7 Esc close'}
      </text>
    </box>
  )
}
