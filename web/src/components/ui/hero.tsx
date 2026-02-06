'use client'

import { motion } from 'framer-motion'

import { HeroButtons } from './hero-buttons'

export function Hero() {
  return (
    <div className="relative z-10">
      {/* Open-source badge */}
      <motion.div
        className="flex justify-center mb-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <a
          href="https://github.com/yethikrishna/levelcode"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-green-500/30 bg-green-500/10 text-green-400 text-sm font-medium hover:bg-green-500/20 transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
          Open Source -- Apache 2.0
        </a>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        <motion.h1
          className="hero-heading text-center mb-4 text-white text-balance"
          variants={{
            animate: {
              transition: {
                staggerChildren: 0.2,
              },
            },
          }}
          initial="initial"
          animate="animate"
        >
          <motion.span
            variants={{
              initial: { opacity: 0, y: 20 },
              animate: {
                opacity: 1,
                y: 0,
                transition: {
                  duration: 0.8,
                  ease: [0.165, 0.84, 0.44, 1],
                },
              },
            }}
          >
            The Open-Source
          </motion.span>{' '}
          <motion.span
            variants={{
              initial: { opacity: 0, y: 20 },
              animate: {
                opacity: 1,
                y: 0,
                transition: {
                  duration: 0.8,
                  ease: [0.165, 0.84, 0.44, 1],
                },
              },
            }}
          >
            AI Coding Agent
          </motion.span>{' '}
        </motion.h1>
      </motion.div>

      <motion.h2
        className="hero-subtext text-center mx-auto max-w-xl mb-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <span className="whitespace-nowrap">Edit your codebase and run terminal commands</span>{' '}
        <span className="whitespace-nowrap">via natural language.</span>{' '}
        <span className="whitespace-nowrap font-bold">No account required.</span>
      </motion.h2>

      {/* Quick start install command */}
      <motion.div
        className="flex justify-center mb-6"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <code className="px-4 py-2 rounded-lg bg-zinc-900/80 border border-zinc-700/50 text-green-400 font-mono text-sm sm:text-base">
          npm install -g @levelcode/cli
        </code>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mb-12 md:mb-4"
      >
        <HeroButtons />
      </motion.div>
    </div>
  )
}
