'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'

// ─── FLOATING CODE SYMBOLS ──────────────────────────────────────────────────────

const SYMBOLS = [
  '{ }', '< />', '( )', '[ ]', '=>', '&&', '||', '...', '??', '::',
  'fn', 'if', 'let', '===', '#!', '/**', '*/', '/**/', '0x', '//',
]

function FloatingSymbol({ symbol, index }: { symbol: string; index: number }) {
  const x = 5 + (index * 17) % 90
  const delay = index * 0.7
  const duration = 8 + (index % 5) * 2

  return (
    <motion.span
      className="absolute text-zinc-800/40 font-mono text-sm sm:text-base pointer-events-none select-none"
      style={{ left: `${x}%` }}
      initial={{ y: '110%', opacity: 0 }}
      animate={{
        y: '-10%',
        opacity: [0, 0.4, 0.4, 0],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'linear',
      }}
    >
      {symbol}
    </motion.span>
  )
}

// ─── COPY BUTTON ────────────────────────────────────────────────────────────────

function CopyInstallCommand() {
  const [copied, setCopied] = useState(false)
  const command = 'npm install -g @levelcode/cli'

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = command
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [command])

  return (
    <motion.button
      onClick={handleCopy}
      className="group flex items-center gap-3 px-5 py-3 rounded-lg bg-zinc-900/90 border border-zinc-800 hover:border-emerald-500/40 transition-all duration-300 cursor-pointer"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <span className="text-zinc-500 font-mono text-sm">$</span>
      <code className="text-emerald-400 font-mono text-sm sm:text-base">{command}</code>
      <span className="ml-2 text-zinc-500 group-hover:text-zinc-300 transition-colors">
        {copied ? (
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </span>
    </motion.button>
  )
}

// ─── ANIMATED STARS BADGE ───────────────────────────────────────────────────────

function GitHubStarsBadge() {
  return (
    <motion.a
      href="https://github.com/yethikrishna/levelcode"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-all text-xs font-mono text-zinc-400 hover:text-zinc-200"
      whileHover={{ scale: 1.05 }}
    >
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
      <span>Star on GitHub</span>
      <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    </motion.a>
  )
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────────

export default function BrandHero() {
  return (
    <div className="relative w-full overflow-hidden py-16 sm:py-24">
      {/* Floating symbols background */}
      <div className="absolute inset-0 overflow-hidden">
        {SYMBOLS.map((sym, idx) => (
          <FloatingSymbol key={idx} symbol={sym} index={idx} />
        ))}
      </div>

      {/* Gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0c1018]/50 to-transparent pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center px-4">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <GitHubStarsBadge />
        </motion.div>

        {/* Title with gradient */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter mb-4"
        >
          <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
            LEVELCODE
          </span>
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-lg sm:text-xl text-zinc-400 max-w-lg mb-3"
        >
          The Open-Source AI Coding Agent
        </motion.p>

        {/* Founder credit */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-sm text-zinc-600 mb-8 font-mono"
        >
          Founded by{' '}
          <span className="text-zinc-400">Yethikrishna R</span>
        </motion.p>

        {/* Install command with copy */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <CopyInstallCommand />
        </motion.div>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="text-xs text-zinc-600 mt-4"
        >
          No account required · Apache 2.0 License · Works with 200+ models
        </motion.p>
      </div>
    </div>
  )
}
