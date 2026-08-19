const fs = require('fs');

const managerFile = 'c:/Users/kkvin/levelcode-project/levelcode/cli/src/side-chats/side-chat-manager.ts';
const panelFile = 'c:/Users/kkvin/levelcode-project/levelcode/cli/src/side-chats/side-chat-panel.tsx';

let mc = fs.readFileSync(managerFile, 'utf8');
let pc = fs.readFileSync(panelFile, 'utf8');

// Step 1: Add fs, path imports and RunState type
const oldImports = `import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { useShallow } from 'zustand/react/shallow'
import { useEffect, useMemo, useRef, useCallback } from 'react'

import type { ChatMessage } from '../types/chat'
import type { MutableRefObject } from 'react'`;

const newImports = `import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { useShallow } from 'zustand/react/shallow'
import { useEffect, useMemo, useRef, useCallback } from 'react'
import * as fs from 'fs'
import * as path from 'path'

import type { ChatMessage } from '../types/chat'
import type { MutableRefObject } from 'react'
import type { RunState } from '@levelcode/sdk'`;

mc = mc.replace(oldImports, newImports);

// Step 2: Add lastRunState to SideChat interface
mc = mc.replace(
  'isStreaming: boolean\n  projectSnapshot:',
  'isStreaming: boolean\n  lastRunState?: RunState\n  projectSnapshot:'
);

// Step 3: Add SideChatOptions interface before SideChatState
const optionsIface = `export interface SideChatOptions {
  title?: string
  cwd?: string
  apiKey?: string
  model?: string
  maxSteps?: number
  onStreamChunk?: (chatId: string, delta: string) => void
  onComplete?: (chatId: string, finalContent: string) => void
  onError?: (chatId: string, error: Error) => void
}

`;
mc = mc.replace('export interface SideChatState {', optionsIface + 'export interface SideChatState {');

// Step 4: Add setRunState and setStreaming to SideChatActions
mc = mc.replace(
  'updateProjectSnapshot: (chatId: string, files: Record<string, string>) => void\n  reset:',
  'updateProjectSnapshot: (chatId: string, files: Record<string, string>) => void\n  setRunState: (chatId: string, runState: RunState) => void\n  setStreaming: (chatId: string, streaming: boolean) => void\n  reset:'
);

// Step 5: Add implementations of setRunState and setStreaming in the store before reset
const storeMethods = `    setRunState: (chatId, runState) => {
      set((state) => {
        const chat = state.sideChats.get(chatId)
        if (chat) {
          chat.lastRunState = runState
        }
      })
    },

    setStreaming: (chatId, streaming) => {
      set((state) => {
        const chat = state.sideChats.get(chatId)
        if (chat) {
          chat.isStreaming = streaming
        }
      })
    },

    reset: () => {`;
mc = mc.replace('    reset: () => {', storeMethods);
// We added a new reset: above, need to remove the duplicate old reset signature
// Actually the replacement worked correctly - the old 'reset: () => {' is now the second one, but we need only one.
// Let's check and remove the extra:
const resetOccurrences = mc.split('    reset: () => {').length - 1;
if (resetOccurrences > 1) {
  // Remove the duplicate that came from our insertion
  const idx = mc.indexOf('    reset: () => {\n      set(() => ({');
  const secondIdx = mc.indexOf('    reset: () => {', idx + 20);
  if (secondIdx > 0) {
    // Find the matching block and remove it
    const before = mc.substring(0, secondIdx);
    let after = mc.substring(secondIdx);
    // Find the end of this reset function (next "  })),")
    const endMarker = '  })),\n)';
    const endIdx = after.indexOf(endMarker);
    if (endIdx > 0) {
      after = after.substring(endIdx);
      mc = before + after;
    }
  }
}

fs.writeFileSync(managerFile, mc, 'utf8');
console.log('Steps 1-5 done for manager, length:', mc.length);

// Update panel references from Ctrl+B to F2
pc = pc.replace(/\[Ctrl\+B\]/g, '[F2]');
if (pc.includes("Ctrl+B toggle panel")) {
  pc = pc.replace("Ctrl+B toggle panel", "F2 toggle panel");
}
fs.writeFileSync(panelFile, pc, 'utf8');
console.log('Panel updated');
