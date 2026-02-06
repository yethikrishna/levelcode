'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'

interface AnimationStep {
  type: 'typing' | 'output' | 'pause'
  text?: string
  color?: string
  prefix?: string
  duration?: number
  bold?: boolean
}

const ANIMATION_STEPS: AnimationStep[] = [
  // User types prompt
  { type: 'typing', text: 'Add authentication to all API endpoints' },
  { type: 'pause', duration: 600 },
  // Agent workflow
  {
    type: 'output',
    prefix: 'File Picker Agent',
    text: 'scanning codebase...',
    color: 'text-cyan-400',
  },
  { type: 'pause', duration: 800 },
  {
    type: 'output',
    prefix: 'Planner Agent',
    text: 'creating edit plan...',
    color: 'text-yellow-400',
  },
  { type: 'pause', duration: 1000 },
  {
    type: 'output',
    prefix: 'Editor Agent',
    text: 'editing src/api/routes.ts',
    color: 'text-green-400',
  },
  { type: 'pause', duration: 500 },
  {
    type: 'output',
    prefix: 'Editor Agent',
    text: 'editing src/middleware/auth.ts',
    color: 'text-green-400',
  },
  { type: 'pause', duration: 400 },
  {
    type: 'output',
    prefix: 'Editor Agent',
    text: 'editing src/api/users.ts',
    color: 'text-green-400',
  },
  { type: 'pause', duration: 400 },
  {
    type: 'output',
    prefix: 'Editor Agent',
    text: 'editing src/api/projects.ts',
    color: 'text-green-400',
  },
  { type: 'pause', duration: 400 },
  {
    type: 'output',
    prefix: 'Editor Agent',
    text: 'editing src/utils/auth-helpers.ts',
    color: 'text-green-400',
  },
  { type: 'pause', duration: 800 },
  {
    type: 'output',
    prefix: 'Reviewer Agent',
    text: 'validating changes...',
    color: 'text-purple-400',
  },
  { type: 'pause', duration: 1200 },
  {
    type: 'output',
    text: 'Done! 5 files edited, all tests passing.',
    bold: true,
  },
  { type: 'pause', duration: 3000 },
]

const TYPING_SPEED = 55 // ms per character

interface TerminalLine {
  id: number
  text: string
  color?: string
  prefix?: string
  bold?: boolean
  isPrompt?: boolean
}

export default function TerminalAnimation() {
  const [lines, setLines] = useState<TerminalLine[]>([])
  const [currentTyping, setCurrentTyping] = useState('')
  const [showCursor, setShowCursor] = useState(true)
  const [isTypingPrompt, setIsTypingPrompt] = useState(false)
  const lineIdRef = useRef(0)
  const animationRef = useRef<{ cancelled: boolean }>({ cancelled: false })
  const scrollRef = useRef<HTMLDivElement>(null)

  const nextId = useCallback(() => {
    lineIdRef.current += 1
    return lineIdRef.current
  }, [])

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev)
    }, 530)
    return () => clearInterval(cursorInterval)
  }, [])

  const sleep = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve()
        }, ms)
        // Store for cleanup
        if (animationRef.current.cancelled) {
          clearTimeout(timeout)
          resolve()
        }
      }),
    [],
  )

  const typeText = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        let i = 0
        setIsTypingPrompt(true)
        setCurrentTyping('')

        const interval = setInterval(() => {
          if (animationRef.current.cancelled) {
            clearInterval(interval)
            resolve()
            return
          }
          if (i < text.length) {
            setCurrentTyping(text.substring(0, i + 1))
            i++
          } else {
            clearInterval(interval)
            setIsTypingPrompt(false)
            resolve()
          }
        }, TYPING_SPEED)
      }),
    [],
  )

  const runAnimation = useCallback(async () => {
    const ctx = { cancelled: false }
    animationRef.current = ctx

    setLines([])
    setCurrentTyping('')
    setIsTypingPrompt(false)

    // Initial welcome line
    await sleep(800)

    for (const step of ANIMATION_STEPS) {
      if (ctx.cancelled) return

      if (step.type === 'typing' && step.text) {
        await typeText(step.text)
        // Move typed text to lines
        setLines((prev) => [
          ...prev,
          { id: nextId(), text: step.text!, isPrompt: true },
        ])
        setCurrentTyping('')
        setTimeout(scrollToBottom, 10)
      } else if (step.type === 'output') {
        setLines((prev) => [
          ...prev,
          {
            id: nextId(),
            text: step.text || '',
            color: step.color,
            prefix: step.prefix,
            bold: step.bold,
          },
        ])
        setTimeout(scrollToBottom, 10)
      } else if (step.type === 'pause') {
        await sleep(step.duration || 500)
      }
    }

    // Loop: wait then restart
    if (!ctx.cancelled) {
      await sleep(1000)
      if (!ctx.cancelled) {
        runAnimation()
      }
    }
  }, [nextId, scrollToBottom, sleep, typeText])

  useEffect(() => {
    runAnimation()
    return () => {
      animationRef.current.cancelled = true
    }
  }, [runAnimation])

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="rounded-xl overflow-hidden shadow-2xl shadow-black/50 border border-zinc-800">
        {/* Title bar */}
        <div className="bg-[#1a1f2e] px-4 py-2.5 flex items-center gap-3 border-b border-zinc-700/50">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <span className="text-zinc-400 text-sm font-mono ml-2">
            LevelCode
          </span>
        </div>

        {/* Terminal body */}
        <div
          ref={scrollRef}
          className="bg-[#0F172A] p-4 sm:p-6 font-mono text-sm sm:text-base min-h-[320px] max-h-[420px] overflow-y-auto"
          style={{ scrollBehavior: 'smooth' }}
        >
          {/* Welcome text */}
          <div className="text-zinc-500 mb-3 text-xs sm:text-sm">
            LevelCode v2.0 -- AI Coding Agent
          </div>
          <div className="text-zinc-500 mb-4 text-xs sm:text-sm">
            Working directory:{' '}
            <span className="text-blue-400">/projects/my-app</span>
          </div>

          {/* Rendered lines */}
          <AnimatePresence>
            {lines.map((line) => (
              <motion.div
                key={line.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="mb-1 leading-relaxed"
              >
                {line.isPrompt ? (
                  <div className="flex flex-wrap">
                    <span className="text-green-400 mr-2 flex-shrink-0">
                      {'>'}
                    </span>
                    <span className="text-white break-all">{line.text}</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap">
                    {line.prefix && (
                      <span className={`${line.color || 'text-white'} mr-1 flex-shrink-0`}>
                        [{line.prefix}]
                      </span>
                    )}
                    <span
                      className={`${line.color || 'text-white'} ${line.bold ? 'font-bold' : ''} break-all`}
                    >
                      {line.text}
                    </span>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Current typing line */}
          {isTypingPrompt && (
            <div className="flex flex-wrap mb-1">
              <span className="text-green-400 mr-2 flex-shrink-0">{'>'}</span>
              <span className="text-white break-all">{currentTyping}</span>
              <span
                className={`inline-block w-2 h-5 ml-0.5 bg-green-400 align-middle ${showCursor ? 'opacity-100' : 'opacity-0'}`}
                style={{ transition: 'opacity 0.1s' }}
              />
            </div>
          )}

          {/* Idle cursor */}
          {!isTypingPrompt && (
            <div className="flex items-center mt-1">
              <span className="text-green-400 mr-2">{'>'}</span>
              <span
                className={`inline-block w-2 h-5 bg-green-400 ${showCursor ? 'opacity-100' : 'opacity-0'}`}
                style={{ transition: 'opacity 0.1s' }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
