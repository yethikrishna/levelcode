'use client'

import { motion, useInView } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

// ─── FEATURE CARD COMPONENT ────────────────────────────────────────────────────

function FeatureCard({
  icon,
  title,
  description,
  children,
  delay = 0,
}: {
  icon: string
  title: string
  description: string
  children?: React.ReactNode
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, amount: 0.4 })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="group relative overflow-hidden rounded-xl border border-zinc-800/60 bg-[#0c1018]/80 backdrop-blur-sm p-6 sm:p-8 hover:border-zinc-700/60 transition-all duration-500"
      style={{
        boxShadow: '0 0 40px -15px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Hover glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none bg-gradient-to-br from-emerald-500/5 via-transparent to-violet-500/5" />

      <div className="relative z-10">
        <div className="text-3xl mb-4">{icon}</div>
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-zinc-400 mb-5 leading-relaxed">{description}</p>
        {children && <div className="mt-4">{children}</div>}
      </div>
    </motion.div>
  )
}

// ─── MODEL CAROUSEL ─────────────────────────────────────────────────────────────

const MODELS = [
  { name: 'Claude Opus', color: '#D97706' },
  { name: 'GPT-5', color: '#10B981' },
  { name: 'Gemini Pro', color: '#3B82F6' },
  { name: 'DeepSeek V3', color: '#8B5CF6' },
  { name: 'Qwen Coder', color: '#EC4899' },
  { name: 'Llama 3.3', color: '#06B6D4' },
  { name: 'Mistral Large', color: '#F97316' },
  { name: 'Grok', color: '#EF4444' },
]

function ModelCarousel() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const iv = setInterval(() => setActive(prev => (prev + 1) % MODELS.length), 1800)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="flex flex-wrap gap-2">
      {MODELS.map((model, idx) => (
        <motion.div
          key={model.name}
          animate={{
            scale: idx === active ? 1.08 : 1,
            opacity: idx === active ? 1 : 0.5,
          }}
          transition={{ duration: 0.3 }}
          className="px-2.5 py-1 rounded-md text-xs font-mono border transition-colors"
          style={{
            borderColor: idx === active ? model.color + '60' : 'rgb(63, 63, 70, 0.3)',
            backgroundColor: idx === active ? model.color + '15' : 'transparent',
            color: idx === active ? model.color : 'rgb(113, 113, 122)',
          }}
        >
          {model.name}
        </motion.div>
      ))}
    </div>
  )
}

// ─── AGENT ORBIT ────────────────────────────────────────────────────────────────

const AGENTS = [
  { name: 'File Picker', emoji: '🔍', color: '#22D3EE' },
  { name: 'Planner', emoji: '📋', color: '#FBBF24' },
  { name: 'Editor', emoji: '✏️', color: '#34D399' },
  { name: 'Reviewer', emoji: '✅', color: '#A78BFA' },
]

function AgentOrbit() {
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    const iv = setInterval(() => setRotation(prev => prev + 1.5), 50)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="relative w-full h-32 flex items-center justify-center">
      {/* Center node */}
      <div className="absolute w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center z-10">
        <span className="text-emerald-400 font-mono text-xs font-bold">LC</span>
      </div>

      {/* Orbit ring */}
      <div className="absolute w-28 h-28 rounded-full border border-dashed border-zinc-800" />

      {/* Orbiting agents */}
      {AGENTS.map((agent, idx) => {
        const angle = (rotation + idx * 90) * (Math.PI / 180)
        const radius = 56
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius

        return (
          <motion.div
            key={agent.name}
            className="absolute flex flex-col items-center gap-0.5"
            style={{
              transform: `translate(${x}px, ${y}px)`,
            }}
          >
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-sm"
              style={{ backgroundColor: agent.color + '20', border: `1px solid ${agent.color}40` }}
            >
              {agent.emoji}
            </div>
            <span className="text-[9px] text-zinc-500 whitespace-nowrap">{agent.name}</span>
          </motion.div>
        )
      })}
    </div>
  )
}

// ─── GITHUB STARS COUNTER ───────────────────────────────────────────────────────

function StarsCounter() {
  const [count, setCount] = useState(0)
  const [liveStars, setLiveStars] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, amount: 0.5 })

  // Fetch live star count from GitHub API
  useEffect(() => {
    fetch('https://api.github.com/repos/yethikrishna/levelcode')
      .then(res => res.json())
      .then(data => {
        if (data.stargazers_count != null) {
          setLiveStars(data.stargazers_count)
        }
      })
      .catch(() => {
        // Fallback if API fails - just show 0
      })
  }, [])

  // Animate counting up to the live value
  useEffect(() => {
    if (!isInView || liveStars === null) return
    const target = liveStars
    if (target === 0) { setCount(0); return }
    const duration = Math.min(2000, target * 20) // Scale duration with count
    const start = Date.now()
    const iv = setInterval(() => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * target))
      if (progress >= 1) clearInterval(iv)
    }, 16)
    return () => clearInterval(iv)
  }, [isInView, liveStars])

  return (
    <div ref={ref} className="flex items-center gap-3">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-800/80 border border-zinc-700/50">
        <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        <span className="font-mono text-white text-sm font-bold">{count.toLocaleString()}</span>
      </div>
      <span className="text-xs text-zinc-500">stars on GitHub</span>
    </div>
  )
}

// ─── STANDALONE BADGE ───────────────────────────────────────────────────────────

function StandaloneBadge() {
  const [step, setStep] = useState(0)
  const steps = [
    { text: 'npm install -g @levelcode/cli', icon: '📦' },
    { text: 'export OPENROUTER_API_KEY=sk-...', icon: '🔑' },
    { text: 'levelcode', icon: '🚀' },
    { text: 'Ready! No backend needed.', icon: '✓' },
  ]

  useEffect(() => {
    const iv = setInterval(() => setStep(prev => (prev + 1) % steps.length), 2200)
    return () => clearInterval(iv)
  }, [steps.length])

  return (
    <div className="space-y-2">
      {steps.map((s, idx) => (
        <motion.div
          key={idx}
          animate={{
            opacity: idx <= step ? 1 : 0.3,
            x: idx <= step ? 0 : 8,
          }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2 text-xs font-mono"
        >
          <span>{idx < step ? '✓' : idx === step ? s.icon : '○'}</span>
          <span className={idx <= step ? 'text-zinc-300' : 'text-zinc-600'}>
            {s.text}
          </span>
        </motion.div>
      ))}
    </div>
  )
}

// ─── MAIN EXPORT ────────────────────────────────────────────────────────────────

export default function FeatureShowcase() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 w-full max-w-4xl mx-auto px-4">
      <FeatureCard
        icon="🤖"
        title="200+ AI Models"
        description="Use any model on OpenRouter — Claude, GPT, Gemini, DeepSeek, Llama, and more. Switch models per-agent."
        delay={0}
      >
        <ModelCarousel />
      </FeatureCard>

      <FeatureCard
        icon="🔄"
        title="Multi-Agent Architecture"
        description="Specialized agents collaborate: File Picker finds context, Planner designs changes, Editor writes code, Reviewer validates."
        delay={0.1}
      >
        <AgentOrbit />
      </FeatureCard>

      <FeatureCard
        icon="⭐"
        title="Open Source"
        description="Apache 2.0 licensed. Fork it, extend it, contribute back. Full source code on GitHub."
        delay={0.2}
      >
        <StarsCounter />
      </FeatureCard>

      <FeatureCard
        icon="⚡"
        title="Standalone Mode"
        description="No backend, no account, no sign-up. Just set your API key and start coding. Three commands to get going."
        delay={0.3}
      >
        <StandaloneBadge />
      </FeatureCard>
    </div>
  )
}
