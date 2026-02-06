'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// ─── CONFIGURATION ─────────────────────────────────────────────────────────────

const CHAR_DELAY = 38
const LINE_PAUSE = 120
const PHASE_PAUSE = 600
const RESTART_PAUSE = 4000

type LineKind =
  | 'prompt'
  | 'info'
  | 'agent-cyan'
  | 'agent-yellow'
  | 'agent-green'
  | 'agent-purple'
  | 'diff-add'
  | 'diff-del'
  | 'diff-header'
  | 'success'
  | 'tree'
  | 'plan'
  | 'muted'

interface ScriptLine {
  kind: LineKind
  text: string
  delay?: number // pause AFTER this line (ms)
  typewriter?: boolean // character-by-character
}

const SCRIPT: ScriptLine[] = [
  // ── User prompt ───────────────────────────────────────────────────────────
  { kind: 'prompt', text: 'Add authentication middleware to all API routes', typewriter: true, delay: PHASE_PAUSE },

  // ── File Picker Agent ─────────────────────────────────────────────────────
  { kind: 'agent-cyan', text: '◆ File Picker Agent  scanning project...', delay: 300 },
  { kind: 'tree', text: '  src/', delay: 80 },
  { kind: 'tree', text: '  ├── api/', delay: 80 },
  { kind: 'tree', text: '  │   ├── routes.ts          ← match', delay: 100 },
  { kind: 'tree', text: '  │   ├── users.ts           ← match', delay: 80 },
  { kind: 'tree', text: '  │   ├── projects.ts        ← match', delay: 80 },
  { kind: 'tree', text: '  │   └── health.ts', delay: 80 },
  { kind: 'tree', text: '  ├── middleware/', delay: 80 },
  { kind: 'tree', text: '  │   └── cors.ts', delay: 80 },
  { kind: 'tree', text: '  └── utils/', delay: 80 },
  { kind: 'tree', text: '      └── helpers.ts', delay: 200 },
  { kind: 'info', text: '  Found 5 relevant files in 0.8s', delay: PHASE_PAUSE },

  // ── Planner Agent ─────────────────────────────────────────────────────────
  { kind: 'agent-yellow', text: '◆ Planner Agent  creating edit plan...', delay: 400 },
  { kind: 'plan', text: '  Step 1  Create src/middleware/auth.ts', delay: 200 },
  { kind: 'plan', text: '  Step 2  Add JWT verification logic', delay: 200 },
  { kind: 'plan', text: '  Step 3  Wrap routes in routes.ts', delay: 200 },
  { kind: 'plan', text: '  Step 4  Protect users.ts endpoints', delay: 200 },
  { kind: 'plan', text: '  Step 5  Protect projects.ts endpoints', delay: 200 },
  { kind: 'plan', text: '  Step 6  Add auth helper utilities', delay: 300 },
  { kind: 'info', text: '  Plan: 5 files, 6 steps', delay: PHASE_PAUSE },

  // ── Editor Agent — actual diffs ───────────────────────────────────────────
  { kind: 'agent-green', text: '◆ Editor Agent  editing src/middleware/auth.ts', delay: 300 },
  { kind: 'diff-header', text: '  + src/middleware/auth.ts  (new file)', delay: 150 },
  { kind: 'diff-add', text: '  + import { verify } from "jsonwebtoken"', delay: 80 },
  { kind: 'diff-add', text: '  + import { Request, Response, Next } from "express"', delay: 80 },
  { kind: 'diff-add', text: '  +', delay: 40 },
  { kind: 'diff-add', text: '  + export const authMiddleware = (req: Request, res: Response, next: Next) => {', delay: 80 },
  { kind: 'diff-add', text: '  +   const token = req.headers.authorization?.split(" ")[1]', delay: 80 },
  { kind: 'diff-add', text: '  +   if (!token) return res.status(401).json({ error: "Missing token" })', delay: 80 },
  { kind: 'diff-add', text: '  +   try {', delay: 60 },
  { kind: 'diff-add', text: '  +     req.user = verify(token, process.env.JWT_SECRET!)', delay: 80 },
  { kind: 'diff-add', text: '  +     next()', delay: 60 },
  { kind: 'diff-add', text: '  +   } catch { return res.status(403).json({ error: "Invalid token" }) }', delay: 80 },
  { kind: 'diff-add', text: '  + }', delay: 300 },

  { kind: 'agent-green', text: '◆ Editor Agent  editing src/api/routes.ts', delay: 300 },
  { kind: 'diff-header', text: '  ~ src/api/routes.ts', delay: 150 },
  { kind: 'diff-del', text: '  - router.get("/users", getUsers)', delay: 100 },
  { kind: 'diff-add', text: '  + router.get("/users", authMiddleware, getUsers)', delay: 100 },
  { kind: 'diff-del', text: '  - router.post("/users", createUser)', delay: 100 },
  { kind: 'diff-add', text: '  + router.post("/users", authMiddleware, createUser)', delay: 100 },
  { kind: 'diff-del', text: '  - router.get("/projects", getProjects)', delay: 100 },
  { kind: 'diff-add', text: '  + router.get("/projects", authMiddleware, getProjects)', delay: 300 },

  { kind: 'agent-green', text: '◆ Editor Agent  editing 3 more files...', delay: 200 },
  { kind: 'info', text: '  src/api/users.ts  +4 -2', delay: 120 },
  { kind: 'info', text: '  src/api/projects.ts  +4 -2', delay: 120 },
  { kind: 'info', text: '  src/utils/helpers.ts  +12 -0', delay: PHASE_PAUSE },

  // ── Reviewer Agent ────────────────────────────────────────────────────────
  { kind: 'agent-purple', text: '◆ Reviewer Agent  validating changes...', delay: 500 },
  { kind: 'info', text: '  ✓ TypeScript compilation passed', delay: 250 },
  { kind: 'info', text: '  ✓ No circular dependencies introduced', delay: 250 },
  { kind: 'info', text: '  ✓ Auth middleware correctly applied', delay: 250 },
  { kind: 'info', text: '  ✓ JWT_SECRET env var referenced', delay: 300 },

  // ── Done ──────────────────────────────────────────────────────────────────
  { kind: 'success', text: '✓ Done — 5 files edited · 42 lines changed · 0 errors', delay: RESTART_PAUSE },
]

// ─── COLOUR MAP ────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<LineKind, string> = {
  'prompt': 'text-white',
  'info': 'text-zinc-400',
  'agent-cyan': 'text-cyan-400',
  'agent-yellow': 'text-amber-400',
  'agent-green': 'text-emerald-400',
  'agent-purple': 'text-violet-400',
  'diff-add': 'text-emerald-400',
  'diff-del': 'text-red-400',
  'diff-header': 'text-blue-400',
  'success': 'text-emerald-300',
  'tree': 'text-zinc-500',
  'plan': 'text-zinc-300',
  'muted': 'text-zinc-600',
}

const ICON_MAP: Record<string, string> = {
  'agent-cyan': '🔍',
  'agent-yellow': '📋',
  'agent-green': '✏️',
  'agent-purple': '✅',
}

// ─── RENDERED LINE COMPONENT ───────────────────────────────────────────────────

function RenderedLine({ kind, text }: { kind: LineKind; text: string }) {
  const color = COLOR_MAP[kind]

  if (kind === 'prompt') {
    return (
      <div className="flex gap-2">
        <span className="text-emerald-400 select-none flex-shrink-0">❯</span>
        <span className="text-white font-medium">{text}</span>
      </div>
    )
  }

  if (kind.startsWith('agent-')) {
    const icon = ICON_MAP[kind] || '◆'
    const parts = text.replace('◆ ', '').split('  ')
    return (
      <div className="flex gap-2 mt-2">
        <span className="select-none flex-shrink-0">{icon}</span>
        <span className={color}>
          <span className="font-bold">{parts[0]}</span>
          {parts[1] && <span className="text-zinc-400 ml-2">{parts[1]}</span>}
        </span>
      </div>
    )
  }

  if (kind === 'diff-add') {
    return <div className={`${color} bg-emerald-500/8 rounded-sm pl-2 -ml-2`}>{text}</div>
  }
  if (kind === 'diff-del') {
    return <div className={`${color} bg-red-500/8 rounded-sm pl-2 -ml-2`}>{text}</div>
  }
  if (kind === 'diff-header') {
    return <div className={`${color} font-bold mt-1`}>{text}</div>
  }

  if (kind === 'success') {
    return (
      <div className={`${color} font-bold mt-3 text-base`}>
        {text}
      </div>
    )
  }

  return <div className={color}>{text}</div>
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function TerminalAnimation() {
  const [lines, setLines] = useState<Array<{ id: number; kind: LineKind; text: string }>>([])
  const [typingText, setTypingText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [cursorVisible, setCursorVisible] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const idCounter = useRef(0)
  const cancelRef = useRef(false)

  // Cursor blink
  useEffect(() => {
    const id = setInterval(() => setCursorVisible(v => !v), 530)
    return () => clearInterval(id)
  }, [])

  // Auto-scroll
  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
  }, [])

  // Sleep helper
  const wait = useCallback((ms: number) => new Promise<void>(resolve => {
    const t = setTimeout(resolve, ms)
    if (cancelRef.current) { clearTimeout(t); resolve() }
  }), [])

  // Typewriter
  const typeChars = useCallback((text: string) => new Promise<void>(resolve => {
    setIsTyping(true)
    setTypingText('')
    let i = 0
    const iv = setInterval(() => {
      if (cancelRef.current) { clearInterval(iv); resolve(); return }
      if (i < text.length) {
        setTypingText(text.substring(0, ++i))
        scrollDown()
      } else {
        clearInterval(iv)
        setIsTyping(false)
        resolve()
      }
    }, CHAR_DELAY)
  }), [scrollDown])

  // Main loop
  const run = useCallback(async () => {
    cancelRef.current = false
    setLines([])
    setTypingText('')
    setIsTyping(false)
    await wait(600)

    for (const step of SCRIPT) {
      if (cancelRef.current) return

      if (step.typewriter && step.text) {
        await typeChars(step.text)
        idCounter.current++
        setLines(prev => [...prev, { id: idCounter.current, kind: step.kind, text: step.text }])
        setTypingText('')
        scrollDown()
      } else {
        idCounter.current++
        setLines(prev => [...prev, { id: idCounter.current, kind: step.kind, text: step.text }])
        scrollDown()
        await wait(step.delay ?? LINE_PAUSE)
      }

      if (step.delay && !step.typewriter) await wait(0) // already waited
      else if (step.delay && step.typewriter) await wait(step.delay)
    }

    if (!cancelRef.current) run()
  }, [wait, typeChars, scrollDown])

  useEffect(() => {
    run()
    return () => { cancelRef.current = true }
  }, [run])

  // Glow effect around terminal
  const glowStyle = useMemo(() => ({
    boxShadow: '0 0 80px -20px rgba(16, 185, 129, 0.15), 0 25px 60px -12px rgba(0, 0, 0, 0.5)',
  }), [])

  return (
    <div className="w-full max-w-3xl mx-auto relative group">
      {/* Subtle reflection */}
      <div className="absolute -inset-px rounded-xl bg-gradient-to-b from-emerald-500/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

      <div className="rounded-xl overflow-hidden border border-zinc-800/80 relative" style={glowStyle}>
        {/* ── TITLE BAR ─────────────────────────────────────────────────────── */}
        <div className="bg-[#151922] px-4 py-2 flex items-center justify-between border-b border-zinc-800/60 select-none">
          <div className="flex items-center gap-3">
            {/* Traffic lights */}
            <div className="flex gap-[6px]">
              <div className="w-[11px] h-[11px] rounded-full bg-[#ff5f57] ring-1 ring-[#e0443e]/30" />
              <div className="w-[11px] h-[11px] rounded-full bg-[#febc2e] ring-1 ring-[#d4a123]/30" />
              <div className="w-[11px] h-[11px] rounded-full bg-[#28c840] ring-1 ring-[#24a834]/30" />
            </div>
            {/* Tab */}
            <div className="flex items-center gap-2 ml-3 px-3 py-0.5 rounded-md bg-zinc-800/60 text-zinc-300 text-xs font-mono">
              <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              LevelCode
            </div>
          </div>
          <span className="text-zinc-600 text-[10px] font-mono hidden sm:block">
            ~/projects/my-app
          </span>
        </div>

        {/* ── TERMINAL BODY ─────────────────────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="bg-[#0c1018] p-4 sm:p-5 font-mono text-[13px] sm:text-sm leading-[1.65] min-h-[360px] max-h-[460px] overflow-y-auto scroll-smooth"
        >
          {/* System info */}
          <div className="text-zinc-600 mb-1 text-xs flex items-center gap-2">
            <span className="text-emerald-500/60">●</span>
            LevelCode v2.0.0 &mdash; Multi-Agent AI Coding Engine
          </div>
          <div className="text-zinc-700 mb-4 text-xs">
            cwd <span className="text-blue-400/70">/projects/my-app</span>
            <span className="text-zinc-700 mx-2">·</span>
            model <span className="text-amber-400/70">anthropic/claude-opus-4</span>
          </div>

          {/* Lines */}
          <AnimatePresence>
            {lines.map(line => (
              <motion.div
                key={line.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="min-h-[1.5em]"
              >
                <RenderedLine kind={line.kind} text={line.text} />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing line */}
          {isTyping && (
            <div className="flex gap-2 min-h-[1.5em]">
              <span className="text-emerald-400 select-none flex-shrink-0">❯</span>
              <span className="text-white">{typingText}</span>
              <span className={`inline-block w-[7px] h-[18px] bg-emerald-400 rounded-[1px] self-center transition-opacity duration-100 ${cursorVisible ? 'opacity-100' : 'opacity-0'}`} />
            </div>
          )}

          {/* Idle cursor */}
          {!isTyping && (
            <div className="flex items-center gap-2 min-h-[1.5em] mt-0.5">
              <span className="text-emerald-400 select-none">❯</span>
              <span className={`inline-block w-[7px] h-[18px] bg-emerald-400 rounded-[1px] transition-opacity duration-100 ${cursorVisible ? 'opacity-100' : 'opacity-0'}`} />
            </div>
          )}
        </div>

        {/* ── STATUS BAR ────────────────────────────────────────────────────── */}
        <div className="bg-[#151922] px-4 py-1 flex items-center justify-between border-t border-zinc-800/60 select-none text-[10px] font-mono">
          <div className="flex items-center gap-3 text-zinc-500">
            <span className="text-emerald-500">●</span>
            <span>standalone</span>
            <span className="text-zinc-700">|</span>
            <span>agents: 4</span>
          </div>
          <span className="text-zinc-600 hidden sm:block">
            by Yethikrishna R
          </span>
        </div>
      </div>
    </div>
  )
}
