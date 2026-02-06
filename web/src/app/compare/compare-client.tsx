'use client'

import { motion } from 'framer-motion'
import { Check, X, Minus, Zap, Clock, Cpu } from 'lucide-react'
import Link from 'next/link'

import { BlockColor } from '@/components/ui/decorative-blocks'
import { Section } from '@/components/ui/section'

type FeatureValue = boolean | string

interface Tool {
  name: string
  features: Record<string, FeatureValue>
}

const tools: Tool[] = [
  {
    name: 'LevelCode',
    features: {
      'Open Source': true,
      'Multi-Agent': true,
      'Model Support': 'Any LLM',
      'Terminal-Native': true,
      'Custom Agents': true,
      'Offline / Standalone': true,
      Price: 'Free + PAYG',
    },
  },
  {
    name: 'Claude Code',
    features: {
      'Open Source': false,
      'Multi-Agent': false,
      'Model Support': 'Claude only',
      'Terminal-Native': true,
      'Custom Agents': false,
      'Offline / Standalone': false,
      Price: '$20+/mo',
    },
  },
  {
    name: 'Cursor',
    features: {
      'Open Source': false,
      'Multi-Agent': false,
      'Model Support': 'Multiple',
      'Terminal-Native': false,
      'Custom Agents': false,
      'Offline / Standalone': false,
      Price: '$20/mo',
    },
  },
  {
    name: 'Aider',
    features: {
      'Open Source': true,
      'Multi-Agent': false,
      'Model Support': 'Any LLM',
      'Terminal-Native': true,
      'Custom Agents': false,
      'Offline / Standalone': true,
      Price: 'Free + API',
    },
  },
  {
    name: 'GitHub Copilot',
    features: {
      'Open Source': false,
      'Multi-Agent': false,
      'Model Support': 'Multiple',
      'Terminal-Native': false,
      'Custom Agents': false,
      'Offline / Standalone': false,
      Price: '$10+/mo',
    },
  },
]

const featureKeys = [
  'Open Source',
  'Multi-Agent',
  'Model Support',
  'Terminal-Native',
  'Custom Agents',
  'Offline / Standalone',
  'Price',
]

function FeatureCell({ value }: { value: FeatureValue }) {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="h-5 w-5 text-green-400 mx-auto" />
    ) : (
      <X className="h-5 w-5 text-red-400/60 mx-auto" />
    )
  }
  return <span className="text-sm text-white/80">{value}</span>
}

function BenchmarkCard({
  icon,
  label,
  levelcodeValue,
  otherValue,
  otherLabel,
  unit,
  levelcodeBetter,
}: {
  icon: React.ReactNode
  label: string
  levelcodeValue: string
  otherValue: string
  otherLabel: string
  unit: string
  levelcodeBetter: boolean
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-full bg-green-500/10">{icon}</div>
        <h3 className="text-lg font-semibold text-white">{label}</h3>
      </div>
      <div className="flex items-end gap-4">
        <div className="flex-1">
          <div className="text-3xl font-bold text-green-400">
            {levelcodeValue}
            <span className="text-sm font-normal text-white/50 ml-1">
              {unit}
            </span>
          </div>
          <div className="text-xs text-white/50 mt-1">LevelCode</div>
        </div>
        <div className="text-white/30 text-sm">vs</div>
        <div className="flex-1 text-right">
          <div className="text-3xl font-bold text-white/40">
            {otherValue}
            <span className="text-sm font-normal text-white/30 ml-1">
              {unit}
            </span>
          </div>
          <div className="text-xs text-white/40 mt-1">{otherLabel}</div>
        </div>
      </div>
      {levelcodeBetter && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="text-xs text-green-400/80 font-medium">
            LevelCode advantage
          </div>
        </div>
      )}
    </div>
  )
}

export default function CompareClient() {
  return (
    <>
      {/* Hero Section */}
      <Section background={BlockColor.Black}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-green-400">
              Comparison
            </span>
            <h1 className="hero-heading text-white mt-4 mb-6">
              How LevelCode Compares
            </h1>
            <p className="text-lg text-white/70 max-w-2xl mx-auto font-paragraph">
              See how LevelCode stacks up against other AI coding tools across
              features, performance, and value.
            </p>
          </motion.div>
        </div>
      </Section>

      {/* Feature Matrix Section */}
      <Section background={BlockColor.DarkForestGreen}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="feature-heading text-white text-center mb-4">
              Feature Comparison
            </h2>
            <p className="text-white/60 text-center mb-12 max-w-xl mx-auto font-paragraph">
              A detailed look at capabilities across leading AI coding
              assistants.
            </p>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-4 px-4 text-sm font-medium text-white/50">
                      Feature
                    </th>
                    {tools.map((tool) => (
                      <th
                        key={tool.name}
                        className={`py-4 px-4 text-sm font-semibold text-center ${
                          tool.name === 'LevelCode'
                            ? 'text-green-400'
                            : 'text-white/80'
                        }`}
                      >
                        {tool.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {featureKeys.map((feature) => (
                    <tr
                      key={feature}
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-4 px-4 text-sm font-medium text-white/70">
                        {feature}
                      </td>
                      {tools.map((tool) => (
                        <td
                          key={`${tool.name}-${feature}`}
                          className={`py-4 px-4 text-center ${
                            tool.name === 'LevelCode' ? 'bg-green-400/5' : ''
                          }`}
                        >
                          <FeatureCell value={tool.features[feature]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-6">
              {tools.map((tool) => (
                <div
                  key={tool.name}
                  className={`rounded-lg border p-4 ${
                    tool.name === 'LevelCode'
                      ? 'border-green-400/30 bg-green-400/5'
                      : 'border-white/10 bg-white/[0.02]'
                  }`}
                >
                  <h3
                    className={`text-lg font-semibold mb-3 ${
                      tool.name === 'LevelCode'
                        ? 'text-green-400'
                        : 'text-white'
                    }`}
                  >
                    {tool.name}
                  </h3>
                  <div className="space-y-2">
                    {featureKeys.map((feature) => (
                      <div
                        key={feature}
                        className="flex items-center justify-between py-1"
                      >
                        <span className="text-sm text-white/60">{feature}</span>
                        <FeatureCell value={tool.features[feature]} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </Section>

      {/* Benchmark Results Section */}
      <Section background={BlockColor.Black}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="feature-heading text-white text-center mb-4">
              Benchmark Results
            </h2>
            <p className="text-white/60 text-center mb-12 max-w-xl mx-auto font-paragraph">
              Real performance data from 175+ standardized coding tasks.
            </p>

            <div className="grid md:grid-cols-3 gap-6">
              <BenchmarkCard
                icon={<Zap className="h-5 w-5 text-green-400" />}
                label="Task Accuracy"
                levelcodeValue="61"
                otherValue="53"
                otherLabel="Claude Code"
                unit="%"
                levelcodeBetter={true}
              />
              <BenchmarkCard
                icon={<Clock className="h-5 w-5 text-green-400" />}
                label="Avg. Completion"
                levelcodeValue="32"
                otherValue="45"
                otherLabel="Claude Code"
                unit="s"
                levelcodeBetter={true}
              />
              <BenchmarkCard
                icon={<Cpu className="h-5 w-5 text-green-400" />}
                label="Token Efficiency"
                levelcodeValue="45k"
                otherValue="62k"
                otherLabel="Claude Code"
                unit="avg"
                levelcodeBetter={true}
              />
            </div>

            <p className="text-xs text-white/30 text-center mt-8">
              Benchmarks conducted on 175+ standardized coding tasks across
              multiple programming languages and frameworks.
            </p>
          </motion.div>
        </div>
      </Section>

      {/* CTA Section */}
      <Section background={BlockColor.DarkForestGreen}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="feature-heading text-white mb-4">
              Ready to Try LevelCode?
            </h2>
            <p className="text-white/70 mb-8 max-w-lg mx-auto font-paragraph">
              Open source, multi-agent, and built for developers who want full
              control over their AI coding assistant.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-md bg-green-500 hover:bg-green-400 text-black font-semibold px-8 py-3 transition-colors"
              >
                Get Started Free
              </Link>
              <Link
                href="https://github.com/yethikrishna/levelcode"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md border border-white/20 hover:border-white/40 text-white font-medium px-8 py-3 transition-colors"
              >
                View on GitHub
              </Link>
            </div>
          </motion.div>
        </div>
      </Section>
    </>
  )
}
