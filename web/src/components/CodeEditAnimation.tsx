'use client'

import { motion, useInView } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'

// ─── FILE TABS ──────────────────────────────────────────────────────────────────

const FILES = [
  { name: 'routes.ts', active: true },
  { name: 'auth.ts', active: false },
  { name: 'users.ts', active: false },
  { name: 'projects.ts', active: false },
  { name: 'helpers.ts', active: false },
]

// ─── CODE DIFF DATA ─────────────────────────────────────────────────────────────

interface DiffLine {
  type: 'context' | 'add' | 'del' | 'empty'
  lineNum?: number
  text: string
}

const BEFORE_LINES: DiffLine[] = [
  { type: 'context', lineNum: 1, text: 'import express from "express"' },
  { type: 'context', lineNum: 2, text: 'import { getUsers, createUser } from "./users"' },
  { type: 'context', lineNum: 3, text: 'import { getProjects } from "./projects"' },
  { type: 'context', lineNum: 4, text: '' },
  { type: 'context', lineNum: 5, text: 'const router = express.Router()' },
  { type: 'context', lineNum: 6, text: '' },
  { type: 'del', lineNum: 7, text: 'router.get("/users", getUsers)' },
  { type: 'del', lineNum: 8, text: 'router.post("/users", createUser)' },
  { type: 'del', lineNum: 9, text: 'router.get("/projects", getProjects)' },
  { type: 'context', lineNum: 10, text: '' },
  { type: 'context', lineNum: 11, text: 'export default router' },
]

const AFTER_LINES: DiffLine[] = [
  { type: 'context', lineNum: 1, text: 'import express from "express"' },
  { type: 'context', lineNum: 2, text: 'import { getUsers, createUser } from "./users"' },
  { type: 'context', lineNum: 3, text: 'import { getProjects } from "./projects"' },
  { type: 'add', lineNum: 4, text: 'import { authMiddleware } from "../middleware/auth"' },
  { type: 'context', lineNum: 5, text: '' },
  { type: 'context', lineNum: 6, text: 'const router = express.Router()' },
  { type: 'context', lineNum: 7, text: '' },
  { type: 'add', lineNum: 8, text: 'router.get("/users", authMiddleware, getUsers)' },
  { type: 'add', lineNum: 9, text: 'router.post("/users", authMiddleware, createUser)' },
  { type: 'add', lineNum: 10, text: 'router.get("/projects", authMiddleware, getProjects)' },
  { type: 'context', lineNum: 11, text: '' },
  { type: 'context', lineNum: 12, text: 'export default router' },
]

// ─── SYNTAX HIGHLIGHTING (simplified) ───────────────────────────────────────────

function highlight(text: string): JSX.Element {
  if (!text) return <span>&nbsp;</span>

  // Keywords
  const keywords = ['import', 'from', 'const', 'export', 'default', 'router']
  const strings = /"[^"]*"/g
  const methods = /\.(get|post|put|delete|Router)\b/g

  let result = text
  const spans: { start: number; end: number; className: string }[] = []

  // Find strings
  let match: RegExpExecArray | null
  while ((match = strings.exec(text)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length, className: 'text-amber-300' })
  }

  // If we have spans, split and render
  if (spans.length > 0) {
    const parts: JSX.Element[] = []
    let lastIdx = 0
    spans.forEach((span, i) => {
      if (span.start > lastIdx) {
        parts.push(<span key={`pre-${i}`}>{highlightKeywords(text.substring(lastIdx, span.start))}</span>)
      }
      parts.push(<span key={`str-${i}`} className={span.className}>{text.substring(span.start, span.end)}</span>)
      lastIdx = span.end
    })
    if (lastIdx < text.length) {
      parts.push(<span key="end">{highlightKeywords(text.substring(lastIdx))}</span>)
    }
    return <>{parts}</>
  }

  return <>{highlightKeywords(text)}</>
}

function highlightKeywords(text: string): JSX.Element {
  const parts = text.split(/\b/)
  return (
    <>
      {parts.map((part, i) => {
        if (['import', 'from', 'const', 'export', 'default'].includes(part)) {
          return <span key={i} className="text-violet-400">{part}</span>
        }
        if (part.startsWith('.')) {
          return <span key={i} className="text-blue-300">{part}</span>
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// ─── DIFF PANE COMPONENT ────────────────────────────────────────────────────────

function DiffPane({
  label,
  lines,
  visibleCount,
}: {
  label: string
  lines: DiffLine[]
  visibleCount: number
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-xs text-zinc-500 px-3 py-1.5 border-b border-zinc-800/60 font-mono">
        {label}
      </div>
      <div className="p-0 font-mono text-[12px] sm:text-[13px] leading-[1.75]">
        {lines.slice(0, visibleCount).map((line, idx) => {
          const bgClass =
            line.type === 'add'
              ? 'bg-emerald-500/10'
              : line.type === 'del'
                ? 'bg-red-500/10'
                : ''
          const numColor =
            line.type === 'add'
              ? 'text-emerald-500/50'
              : line.type === 'del'
                ? 'text-red-500/50'
                : 'text-zinc-700'
          const textColor =
            line.type === 'add'
              ? 'text-emerald-300'
              : line.type === 'del'
                ? 'text-red-300 line-through decoration-red-500/30'
                : 'text-zinc-400'
          const prefix =
            line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '

          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: idx * 0.04 }}
              className={`flex ${bgClass} hover:bg-zinc-800/30 transition-colors`}
            >
              <span className={`${numColor} w-8 sm:w-10 text-right pr-2 select-none flex-shrink-0`}>
                {line.lineNum ?? ''}
              </span>
              <span className={`${numColor} w-4 text-center select-none flex-shrink-0`}>
                {prefix}
              </span>
              <span className={`${textColor} pl-2 whitespace-pre overflow-hidden`}>
                {line.type === 'context' ? highlight(line.text) : highlight(line.text)}
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────────

export default function CodeEditAnimation() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: false, amount: 0.3 })
  const [visibleLines, setVisibleLines] = useState(0)
  const [activeFile, setActiveFile] = useState(0)
  const [editCount, setEditCount] = useState(0)

  // Animate lines appearing
  useEffect(() => {
    if (!isInView) {
      setVisibleLines(0)
      setEditCount(0)
      return
    }

    const maxLines = Math.max(BEFORE_LINES.length, AFTER_LINES.length)
    let current = 0
    const iv = setInterval(() => {
      current++
      setVisibleLines(current)
      if (current >= maxLines) {
        clearInterval(iv)
        // Cycle through files
        setTimeout(() => setEditCount(5), 600)
      }
    }, 120)

    return () => clearInterval(iv)
  }, [isInView])

  // Cycle active file tab
  useEffect(() => {
    if (!isInView) return
    const iv = setInterval(() => {
      setActiveFile(prev => (prev + 1) % FILES.length)
    }, 2500)
    return () => clearInterval(iv)
  }, [isInView])

  return (
    <div ref={ref} className="w-full max-w-4xl mx-auto">
      <div
        className="rounded-xl overflow-hidden border border-zinc-800/80"
        style={{
          boxShadow: '0 0 60px -20px rgba(99, 102, 241, 0.12), 0 20px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* ── TITLE BAR ──────────────────────────────────────────────────────── */}
        <div className="bg-[#151922] px-3 py-1.5 flex items-center gap-2 border-b border-zinc-800/60 select-none">
          <div className="flex gap-[6px]">
            <div className="w-[10px] h-[10px] rounded-full bg-[#ff5f57]" />
            <div className="w-[10px] h-[10px] rounded-full bg-[#febc2e]" />
            <div className="w-[10px] h-[10px] rounded-full bg-[#28c840]" />
          </div>
          <div className="flex items-center gap-1 ml-2 overflow-x-auto">
            {FILES.map((file, idx) => (
              <div
                key={file.name}
                className={`px-2.5 py-0.5 rounded text-[11px] font-mono transition-colors whitespace-nowrap ${
                  idx === activeFile
                    ? 'bg-zinc-800 text-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-400'
                }`}
              >
                {file.name}
                {idx === activeFile && (
                  <span className="ml-1 text-emerald-400 text-[9px]">●</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── DIFF BODY ──────────────────────────────────────────────────────── */}
        <div className="flex divide-x divide-zinc-800/60 bg-[#0c1018] min-h-[280px]">
          <DiffPane label="Before" lines={BEFORE_LINES} visibleCount={visibleLines} />
          <DiffPane label="After — LevelCode" lines={AFTER_LINES} visibleCount={visibleLines} />
        </div>

        {/* ── STATUS BAR ─────────────────────────────────────────────────────── */}
        <div className="bg-[#151922] px-3 py-1 flex items-center justify-between border-t border-zinc-800/60 select-none text-[10px] font-mono">
          <div className="flex items-center gap-3 text-zinc-500">
            <span className="text-emerald-500">●</span>
            <span>LevelCode</span>
            <span className="text-zinc-700">|</span>
            <span>{editCount > 0 ? `${editCount} files edited` : 'editing...'}</span>
            <span className="text-zinc-700">|</span>
            <span className="text-emerald-400">0 errors</span>
          </div>
          <span className="text-zinc-600 hidden sm:block">
            TypeScript · UTF-8
          </span>
        </div>
      </div>
    </div>
  )
}
