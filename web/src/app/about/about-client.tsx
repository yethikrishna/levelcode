'use client'

import { motion } from 'framer-motion'
import { Github, Mail, Scale, Users, Heart, Code } from 'lucide-react'
import Link from 'next/link'

import { BlockColor } from '@/components/ui/decorative-blocks'
import { Section } from '@/components/ui/section'

function TeamMember({
  name,
  role,
  github,
}: {
  name: string
  role: string
  github?: string
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center mx-auto mb-4">
        <span className="text-xl font-bold text-white">
          {name
            .split(' ')
            .map((n) => n[0])
            .join('')}
        </span>
      </div>
      <h3 className="text-lg font-semibold text-white">{name}</h3>
      <p className="text-sm text-white/60 mt-1">{role}</p>
      {github && (
        <Link
          href={`https://github.com/${github}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-green-400 transition-colors mt-3"
        >
          <Github className="h-4 w-4" />
          @{github}
        </Link>
      )}
    </div>
  )
}

function ValueCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-full bg-green-500/10">{icon}</div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </div>
      <p className="text-sm text-white/60 leading-relaxed">{description}</p>
    </div>
  )
}

export default function AboutClient() {
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
              About Us
            </span>
            <h1 className="hero-heading text-white mt-4 mb-6">
              Built for Developers, by Developers
            </h1>
            <p className="text-lg text-white/70 max-w-2xl mx-auto font-paragraph">
              Making AI-powered coding accessible to everyone through open
              source.
            </p>
          </motion.div>
        </div>
      </Section>

      {/* Mission Section */}
      <Section background={BlockColor.DarkForestGreen}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto text-center"
          >
            <h2 className="feature-heading text-white mb-6">Our Mission</h2>
            <p className="text-xl text-white/80 leading-relaxed font-paragraph">
              We believe every developer deserves access to powerful AI coding
              tools -- not just those who can afford expensive subscriptions.
              LevelCode is built to be open, extensible, and community-driven,
              putting the power of AI-assisted development into the hands of
              developers everywhere.
            </p>
          </motion.div>
        </div>
      </Section>

      {/* Founder Section */}
      <Section background={BlockColor.Black}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="feature-heading text-white text-center mb-4">
              The Founder
            </h2>
            <p className="text-white/60 text-center mb-12 max-w-xl mx-auto font-paragraph">
              Built with passion for open-source and the developer community.
            </p>

            <div className="max-w-sm mx-auto">
              <TeamMember
                name="Yethikrishna R"
                role="Founder & Lead Developer"
                github="yethikrishna"
              />
            </div>
          </motion.div>
        </div>
      </Section>

      {/* Endorsed By Section */}
      <Section background={BlockColor.DarkForestGreen}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="feature-heading text-white text-center mb-4">
              Vouched By Real People
            </h2>
            <p className="text-white/60 text-center mb-12 max-w-xl mx-auto font-paragraph">
              People who have seen LevelCode in action and can vouch for its
              legitimacy and quality.
            </p>

            <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
                    <span className="text-sm font-bold text-white">IR</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Indu R</h3>
                    <p className="text-sm text-white/50">Verified Endorser</p>
                  </div>
                </div>
                <p className="text-sm text-white/70 leading-relaxed italic">
                  &ldquo;I&apos;ve personally witnessed the development of LevelCode from
                  the ground up. It&apos;s a legitimate, powerful AI coding tool
                  that delivers on its promises. The multi-agent approach is
                  genuinely innovative.&rdquo;
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
                    <span className="text-sm font-bold text-white">JK</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      Jith S Krishna
                    </h3>
                    <p className="text-sm text-white/50">Verified Endorser</p>
                  </div>
                </div>
                <p className="text-sm text-white/70 leading-relaxed italic">
                  &ldquo;LevelCode is the real deal. I&apos;ve seen it outperform
                  other AI coding tools first-hand. Yethikrishna has built
                  something truly remarkable with this open-source project.&rdquo;
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </Section>

      {/* Open Source Values Section */}
      <Section background={BlockColor.DarkForestGreen}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="feature-heading text-white text-center mb-4">
              Open Source Values
            </h2>
            <p className="text-white/60 text-center mb-12 max-w-xl mx-auto font-paragraph">
              We are committed to transparency, community, and building in the
              open.
            </p>

            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              <ValueCard
                icon={<Code className="h-5 w-5 text-green-400" />}
                title="Fully Open Source"
                description="Every line of LevelCode is open source under the Apache 2.0 License. Fork it, modify it, contribute to it -- it's yours."
              />
              <ValueCard
                icon={<Users className="h-5 w-5 text-green-400" />}
                title="Community Driven"
                description="We build with the community, not just for it. Feature requests, bug reports, and pull requests are all welcome."
              />
              <ValueCard
                icon={<Heart className="h-5 w-5 text-green-400" />}
                title="Free to Use"
                description="500 free credits monthly with no subscription required. We believe great tools should be accessible to everyone."
              />
              <ValueCard
                icon={<Scale className="h-5 w-5 text-green-400" />}
                title="Apache 2.0 License"
                description="A permissive license that lets you use LevelCode however you want -- personal projects, commercial products, or anything in between."
              />
            </div>
          </motion.div>
        </div>
      </Section>

      {/* Contact / CTA Section */}
      <Section background={BlockColor.Black}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="feature-heading text-white mb-4">Get in Touch</h2>
            <p className="text-white/60 mb-8 max-w-lg mx-auto font-paragraph">
              Have questions, feedback, or want to contribute? We would love to
              hear from you.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <Link
                href="mailto:yethikrishnarcvn7a@gmail.com"
                className="inline-flex items-center gap-2 rounded-md border border-white/20 hover:border-white/40 text-white font-medium px-6 py-3 transition-colors"
              >
                <Mail className="h-4 w-4" />
                yethikrishnarcvn7a@gmail.com
              </Link>
              <Link
                href="https://github.com/yethikrishna/levelcode"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-green-500 hover:bg-green-400 text-black font-semibold px-6 py-3 transition-colors"
              >
                <Github className="h-4 w-4" />
                View on GitHub
              </Link>
            </div>

            <p className="text-xs text-white/30">
              Licensed under the Apache License, Version 2.0
            </p>
          </motion.div>
        </div>
      </Section>
    </>
  )
}
