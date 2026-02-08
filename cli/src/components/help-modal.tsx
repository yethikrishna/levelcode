import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useState, useCallback } from 'react'

import { useTheme } from '../hooks/use-theme'
import { ShimmerText } from './shimmer-text'
import { Panel, TabView, KeyHint } from './primitives'

import type { KeyEvent } from '@opentui/core'

interface HelpModalProps {
  onClose: () => void
}

// ── Shortcuts data grouped by category ──────────────────────────────

interface ShortcutEntry {
  key: string
  desc: string
  dim?: boolean
}

interface ShortcutGroup {
  category: string
  items: ShortcutEntry[]
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'Navigation',
    items: [
      { key: 'Ctrl+C', desc: 'Cancel / Exit' },
      { key: 'Esc', desc: 'Close modal' },
      { key: 'Up/Down', desc: 'Navigate items' },
      { key: 'Home/End', desc: 'Jump to first / last item', dim: true },
    ],
  },
  {
    category: 'Editing',
    items: [
      { key: 'Ctrl+V', desc: 'Paste clipboard' },
      { key: 'Tab', desc: 'Autocomplete mention' },
      { key: 'Enter', desc: 'Submit / Select' },
      { key: '!', desc: 'Enter bash mode', dim: true },
    ],
  },
  {
    category: 'Views',
    items: [
      { key: 'F1', desc: 'Toggle help' },
      { key: 'PgUp/PgDn', desc: 'Scroll messages' },
      { key: 'Left/Right', desc: 'Switch tabs', dim: true },
      { key: '1-9', desc: 'Jump to tab', dim: true },
    ],
  },
]

// ── Commands data grouped by category ───────────────────────────────

interface CommandEntry {
  cmd: string
  desc: string
  color: 'default' | 'info' | 'secondary'
}

interface CommandGroup {
  category: string
  items: CommandEntry[]
}

const COMMAND_GROUPS: CommandGroup[] = [
  {
    category: 'Chat',
    items: [
      { cmd: '/help', desc: 'Display shortcuts and tips', color: 'default' },
      { cmd: '/new', desc: 'Start a new conversation', color: 'default' },
      { cmd: '/history', desc: 'Browse past conversations', color: 'default' },
      { cmd: '/bash', desc: 'Enter bash mode', color: 'default' },
      { cmd: '/image', desc: 'Attach an image file', color: 'default' },
      { cmd: '/feedback', desc: 'Share feedback', color: 'default' },
      { cmd: '/exit', desc: 'Quit the CLI', color: 'default' },
    ],
  },
  {
    category: 'Providers & Models',
    items: [
      { cmd: '/provider:add', desc: 'Add a new AI provider', color: 'info' },
      { cmd: '/provider:list', desc: 'List configured providers', color: 'info' },
      { cmd: '/provider:remove', desc: 'Remove a provider', color: 'info' },
      { cmd: '/provider:test', desc: 'Test provider connection', color: 'info' },
      { cmd: '/model:list', desc: 'Browse and select models', color: 'info' },
      { cmd: '/model:set', desc: 'Set the active model', color: 'info' },
      { cmd: '/model:info', desc: 'Show current model details', color: 'info' },
      { cmd: '/settings', desc: 'Open provider settings', color: 'info' },
      { cmd: '/connect', desc: 'Connect via OAuth', color: 'info' },
      { cmd: '/disconnect', desc: 'Disconnect OAuth provider', color: 'info' },
    ],
  },
  {
    category: 'Team & Agents',
    items: [
      { cmd: '/team:create', desc: 'Create a new team', color: 'secondary' },
      { cmd: '/team:status', desc: 'Show team overview', color: 'secondary' },
      { cmd: '/team:members', desc: 'List members and roles', color: 'secondary' },
      { cmd: '/team:settings', desc: 'Open team settings', color: 'secondary' },
      { cmd: '/agent:gpt-5', desc: 'Spawn the Titan agent', color: 'secondary' },
      { cmd: '/review', desc: 'Review code with Titan', color: 'secondary' },
    ],
  },
  {
    category: 'Account',
    items: [
      { cmd: '/usage', desc: 'View credits and quota', color: 'default' },
      { cmd: '/buy-credits', desc: 'Open usage page', color: 'default' },
      { cmd: '/referral', desc: 'Redeem a referral code', color: 'default' },
      { cmd: '/theme:toggle', desc: 'Toggle light/dark mode', color: 'default' },
      { cmd: '/logout', desc: 'Sign out of session', color: 'default' },
    ],
  },
]

const KEY_COL_WIDTH = 14
const CMD_COL_WIDTH = 20

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  const theme = useTheme()
  const [activeTab, setActiveTab] = useState('shortcuts')

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape') onClose()
      },
      [onClose],
    ),
  )

  const tabs = [
    { key: 'shortcuts', label: 'Shortcuts' },
    { key: 'commands', label: 'Commands' },
    { key: 'about', label: 'About' },
  ]

  const commandColor = (c: CommandEntry['color']): string => {
    switch (c) {
      case 'info':
        return theme.info
      case 'secondary':
        return theme.secondary
      default:
        return theme.primary
    }
  }

  return (
    <Panel
      title="Help"
      borderColor={theme.primary}
      headerRight={
        <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
          v0.3.0
        </text>
      }
    >
      <TabView tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {/* ── Shortcuts Tab ─────────────────────────────────────── */}
        {activeTab === 'shortcuts' && (
          <box style={{ flexDirection: 'column', paddingTop: 1 }}>
            {SHORTCUT_GROUPS.map((group, groupIdx) => (
              <box
                key={group.category}
                style={{
                  flexDirection: 'column',
                  paddingTop: groupIdx === 0 ? 0 : 1,
                }}
              >
                {/* Category header */}
                <text
                  style={{
                    fg: theme.foreground,
                    attributes: TextAttributes.BOLD,
                  }}
                >
                  {'  '}{group.category}
                </text>

                {/* Shortcut rows */}
                {group.items.map((s) => (
                  <text key={s.key} style={{ fg: theme.foreground }}>
                    {'    '}
                    <span
                      fg={theme.primary}
                      attributes={TextAttributes.BOLD}
                    >
                      {s.key.padEnd(KEY_COL_WIDTH)}
                    </span>
                    <span
                      fg={s.dim ? theme.muted : theme.foreground}
                      attributes={s.dim ? TextAttributes.DIM : undefined}
                    >
                      {s.desc}
                    </span>
                  </text>
                ))}
              </box>
            ))}
          </box>
        )}

        {/* ── Commands Tab ──────────────────────────────────────── */}
        {activeTab === 'commands' && (
          <box style={{ flexDirection: 'column', paddingTop: 1 }}>
            {COMMAND_GROUPS.map((group, groupIdx) => (
              <box
                key={group.category}
                style={{
                  flexDirection: 'column',
                  paddingTop: groupIdx === 0 ? 0 : 1,
                }}
              >
                {/* Category header */}
                <text
                  style={{
                    fg: theme.foreground,
                    attributes: TextAttributes.BOLD,
                  }}
                >
                  {'  '}{group.category}
                </text>

                {/* Command rows */}
                {group.items.map((c) => (
                  <text key={c.cmd} style={{ fg: theme.foreground }}>
                    {'    '}
                    <span fg={commandColor(c.color)}>
                      {c.cmd.padEnd(CMD_COL_WIDTH)}
                    </span>
                    <span fg={theme.muted}>
                      {c.desc}
                    </span>
                  </text>
                ))}
              </box>
            ))}
          </box>
        )}

        {/* ── About Tab ─────────────────────────────────────────── */}
        {activeTab === 'about' && (
          <box style={{ flexDirection: 'column', paddingTop: 1, gap: 0 }}>
            {/* Title with shimmer */}
            <box style={{ flexDirection: 'row', paddingLeft: 2, paddingBottom: 0 }}>
              <text
                style={{
                  fg: theme.primary,
                  attributes: TextAttributes.BOLD,
                }}
              >
                <ShimmerText text="LevelCode" primaryColor={theme.primary} />
              </text>
              <text style={{ fg: theme.muted, attributes: TextAttributes.DIM }}>
                {' v0.3.0'}
              </text>
            </box>

            <text style={{ fg: theme.foreground, paddingLeft: 2 }}>
              {''}
            </text>

            {/* Description block */}
            <text style={{ fg: theme.foreground, paddingLeft: 2 }}>
              {'Terminal-based AI coding agent'}
            </text>
            <text style={{ fg: theme.muted, paddingLeft: 2 }}>
              {'Multi-provider \u00B7 OAuth \u00B7 35+ APIs'}
            </text>

            <text style={{ fg: theme.foreground, paddingLeft: 2 }}>
              {''}
            </text>

            {/* Features */}
            <text style={{ fg: theme.foreground, paddingLeft: 2 }}>
              <span fg={theme.success}>{'\u2713'}</span>
              {'  Multi-provider model routing'}
            </text>
            <text style={{ fg: theme.foreground, paddingLeft: 2 }}>
              <span fg={theme.success}>{'\u2713'}</span>
              {'  OAuth & API key authentication'}
            </text>
            <text style={{ fg: theme.foreground, paddingLeft: 2 }}>
              <span fg={theme.success}>{'\u2713'}</span>
              {'  Team / swarm collaboration'}
            </text>
            <text style={{ fg: theme.foreground, paddingLeft: 2 }}>
              <span fg={theme.success}>{'\u2713'}</span>
              {'  Titan agent powered by GPT-5'}
            </text>

            <text style={{ fg: theme.foreground, paddingLeft: 2 }}>
              {''}
            </text>

            {/* Links */}
            <text style={{ paddingLeft: 2 }}>
              <span fg={theme.muted}>{'repo  '}</span>
              <span fg={theme.info} attributes={TextAttributes.UNDERLINE}>
                {'github.com/yethikrishna/levelcode'}
              </span>
            </text>
            <text style={{ paddingLeft: 2 }}>
              <span fg={theme.muted}>{'license  '}</span>
              <span fg={theme.foreground}>{'Apache-2.0'}</span>
            </text>
          </box>
        )}
      </TabView>
      <KeyHint
        hints={[
          { key: 'Esc', label: 'Close' },
          { key: 'Left/Right', label: 'Switch Tab' },
        ]}
      />
    </Panel>
  )
}
