import fs from 'fs'
import path from 'path'
import { getConfigDir } from '../utils/auth'
import type { SwarmPersona } from '../types/swarm-persona'

// ============================================================================
// Agent Marketplace - Publish & Discover Reusable Swarm Agents
// ============================================================================

export interface PublishedAgent {
  id: string
  name: string
  version: string
  author: string
  description: string
  persona: SwarmPersona
  tags: string[]
  publishedAt: number
  updatedAt: number
  stats: AgentStats
  reviews: AgentReview[]
  pricing?: {
    type: 'free' | 'credits' | 'subscription'
    amount?: number
  }
  compatibility: {
    minVersion: string
    frameworks: string[]  // ['levelcode', 'autogen', 'crewai']
  }
}

export interface AgentStats {
  successRate: number      // 0-1
  avgReviewQuality: number  // 0-100
  totalUses: number
  totalSuccesses: number
  totalFailures: number
  avgExecutionTime: number  // ms
  reputationScore: number    // 0-100, computed
}

export interface AgentReview {
  reviewerId: string
  reviewerName: string
  rating: number           // 1-5
  comment: string
  createdAt: number
  helpful: number          // votes
  verified: boolean          // verified user?
}

export interface MarketplaceConfig {
  registryUrl?: string      // Remote registry (optional)
  localOnly: boolean
  allowAnonymous: boolean
  requireVerification: boolean
  autoUpdate: boolean
}

const DEFAULT_MARKETPLACE_CONFIG: MarketplaceConfig = {
  localOnly: false,
  allowAnonymous: false,
  requireVerification: true,
  autoUpdate: false,
}

// ============================================================================
// Local Registry
// ============================================================================

function getMarketplaceDir(): string {
  return path.join(getConfigDir(), 'marketplace', 'agents')
}

function getMarketplaceConfigPath(): string {
  return path.join(getConfigDir(), 'marketplace', 'config.json')
}

function getAgentPath(agentId: string): string {
  return path.join(getMarketplaceDir(), `${agentId}.json`)
}

// ============================================================================
// Config I/O
// ============================================================================

export function loadMarketplaceConfig(): MarketplaceConfig {
  try {
    const filePath = getMarketplaceConfigPath()
    if (!fs.existsSync(filePath)) return { ...DEFAULT_MARKETPLACE_CONFIG }
    return { ...DEFAULT_MARKETPLACE_CONFIG, ...JSON.parse(fs.readFileSync(filePath, 'utf-8')) }
  } catch {
    return { ...DEFAULT_MARKETPLACE_CONFIG }
  }
}

export function saveMarketplaceConfig(config: Partial<MarketplaceConfig>): void {
  const dir = path.dirname(getMarketplaceConfigPath())
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const existing = loadMarketplaceConfig()
  const updated = { ...existing, ...config }
  fs.writeFileSync(getMarketplaceConfigPath(), JSON.stringify(updated, null, 2), 'utf-8')
}

// ============================================================================
// Publish Agent
// ============================================================================

export function publishAgent(
  persona: SwarmPersona,
  author: string,
  options?: {
    version?: string
    tags?: string[]
    pricing?: PublishedAgent['pricing']
    frameworks?: string[]
  },
): { success: boolean; agentId?: string; message: string } {
  const agentId = `agent-${persona.id}-${Date.now()}`

  const published: PublishedAgent = {
    id: agentId,
    name: persona.name,
    version: options?.version ?? '1.0.0',
    author,
    description: persona.description || persona.role,
    persona: { ...persona, isCustom: true },
    tags: options?.tags ?? [persona.role],
    publishedAt: Date.now(),
    updatedAt: Date.now(),
    stats: {
      successRate: 0,
      avgReviewQuality: 0,
      totalUses: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      avgExecutionTime: 0,
      reputationScore: 0,
    },
    reviews: [],
    pricing: options?.pricing,
    compatibility: {
      minVersion: '1.0.0',
      frameworks: options?.frameworks ?? ['levelcode'],
    },
  }

  const dir = getMarketplaceDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  fs.writeFileSync(getAgentPath(agentId), JSON.stringify(published, null, 2), 'utf-8')

  return { success: true, agentId, message: `Agent ${persona.name} published with ID: ${agentId}` }
}

export function updatePublishedAgent(
  agentId: string,
  updates: {
    version?: string
    description?: string
    tags?: string[]
    pricing?: PublishedAgent['pricing']
  },
): { success: boolean; message: string } {
  const filePath = getAgentPath(agentId)
  if (!fs.existsSync(filePath)) {
    return { success: false, message: `Agent ${agentId} not found` }
  }

  const agent: PublishedAgent = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  if (updates.version) agent.version = updates.version
  if (updates.description) agent.persona.description = updates.description
  if (updates.tags) agent.tags = updates.tags
  if (updates.pricing) agent.pricing = updates.pricing
  agent.updatedAt = Date.now()

  fs.writeFileSync(filePath, JSON.stringify(agent, null, 2), 'utf-8')
  return { success: true, message: `Agent ${agentId} updated` }
}

export function unpublishAgent(agentId: string): { success: boolean; message: string } {
  const filePath = getAgentPath(agentId)
  if (!fs.existsSync(filePath)) {
    return { success: false, message: `Agent ${agentId} not found` }
  }
  fs.unlinkSync(filePath)
  return { success: true, message: `Agent ${agentId} unpublished` }
}

// ============================================================================
// Discovery
// ============================================================================

export function listPublishedAgents(filters?: {
  tag?: string
  author?: string
  minReputation?: number
  framework?: string
}): PublishedAgent[] {
  const dir = getMarketplaceDir()
  if (!fs.existsSync(dir)) return []

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
  let agents: PublishedAgent[] = []

  for (const file of files) {
    try {
      const agent: PublishedAgent = JSON.parse(
        fs.readFileSync(path.join(dir, file), 'utf-8'),
      )
      agents.push(agent)
    } catch {
      // Skip invalid files
    }
  }

  // Apply filters
  if (filters?.tag) {
    agents = agents.filter(a => a.tags.includes(filters.tag!))
  }
  if (filters?.author) {
    agents = agents.filter(a => a.author === filters.author)
  }
  if (filters?.minReputation !== undefined) {
    agents = agents.filter(a => a.stats.reputationScore >= filters.minReputation!)
  }
  if (filters?.framework) {
    agents = agents.filter(a => a.compatibility.frameworks.includes(filters.framework!))
  }

  // Sort by reputation score (descending)
  agents.sort((a, b) => b.stats.reputationScore - a.stats.reputationScore)

  return agents
}

export function getPublishedAgent(agentId: string): PublishedAgent | null {
  const filePath = getAgentPath(agentId)
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

export function searchAgents(query: string): PublishedAgent[] {
  const all = listPublishedAgents()
  const lowerQuery = query.toLowerCase()
  return all.filter(a =>
    a.name.toLowerCase().includes(lowerQuery) ||
    a.description.toLowerCase().includes(lowerQuery) ||
    a.tags.some(t => t.toLowerCase().includes(lowerQuery)) ||
    a.persona.role.toLowerCase().includes(lowerQuery),
  )
}

// ============================================================================
// Reviews & Reputation
// ============================================================================

export function addReview(
  agentId: string,
  review: Omit<AgentReview, 'createdAt' | 'helpful'>,
): { success: boolean; message: string } {
  const agent = getPublishedAgent(agentId)
  if (!agent) {
    return { success: false, message: `Agent ${agentId} not found` }
  }

  const fullReview: AgentReview = {
    ...review,
    createdAt: Date.now(),
    helpful: 0,
  }

  agent.reviews.push(fullReview)

  // Update stats
  updateStatsFromReviews(agent)

  const filePath = getAgentPath(agentId)
  fs.writeFileSync(filePath, JSON.stringify(agent, null, 2), 'utf-8')

  return { success: true, message: `Review added to ${agent.name}` }
}

function updateStatsFromReviews(agent: PublishedAgent): void {
  if (agent.reviews.length === 0) return

  const totalRating = agent.reviews.reduce((sum, r) => sum + r.rating, 0)
  agent.stats.avgReviewQuality = Math.round(totalRating / agent.reviews.length * 20) // Convert 1-5 to 0-100

  // Reputation = weighted score (success rate 60%, review quality 40%)
  agent.stats.reputationScore = Math.round(
    agent.stats.successRate * 0.6 * 100 + agent.stats.avgReviewQuality * 0.4,
  )
}

export function recordAgentUse(
  agentId: string,
  success: boolean,
  executionTime: number,
): void {
  const agent = getPublishedAgent(agentId)
  if (!agent) return

  agent.stats.totalUses++
  if (success) {
    agent.stats.totalSuccesses++
  } else {
    agent.stats.totalFailures++
  }
  agent.stats.successRate = agent.stats.totalSuccesses / agent.stats.totalUses

  // Update avg execution time
  agent.stats.avgExecutionTime = Math.round(
    (agent.stats.avgExecutionTime * (agent.stats.totalUses - 1) + executionTime) / agent.stats.totalUses,
  )

  updateStatsFromReviews(agent)

  const filePath = getAgentPath(agentId)
  fs.writeFileSync(filePath, JSON.stringify(agent, null, 2), 'utf-8')
}

// ============================================================================
// Install Agent (Import into Team)
// ============================================================================

export function installAgent(
  agentId: string,
  teamName: string,
): { success: boolean; persona?: SwarmPersona; message: string } {
  const agent = getPublishedAgent(agentId)
  if (!agent) {
    return { success: false, message: `Agent ${agentId} not found` }
  }

  // Check compatibility
  if (!agent.compatibility.frameworks.includes('levelcode')) {
    return { success: false, message: `Agent not compatible with LevelCode` }
  }

  return {
    success: true,
    persona: agent.persona,
    message: `Agent ${agent.name} ready to install into ${teamName}`,
  }
}

// ============================================================================
// Formatting
// ============================================================================

export function formatAgentCard(agent: PublishedAgent): string {
  const lines = [
    `=== ${agent.name} (v${agent.version}) ===`,
    `ID: ${agent.id}`,
    `Author: ${agent.author}`,
    `Description: ${agent.description}`,
    ``,
    `Tags: ${agent.tags.join(', ')}`,
    `Frameworks: ${agent.compatibility.frameworks.join(', ')}`,
    ``,
    `Stats:`,
    `  Reputation: ${agent.stats.reputationScore}/100`,
    `  Success Rate: ${Math.round(agent.stats.successRate * 100)}%`,
    `  Uses: ${agent.stats.totalUses}`,
    `  Avg Review: ${agent.stats.avgReviewQuality}/100`,
    ``,
    `Reviews: ${agent.reviews.length}`,
  ]

  if (agent.pricing) {
    lines.push(``, `Pricing: ${agent.pricing.type}${agent.pricing.amount ? ` (${agent.pricing.amount} credits)` : ''}`)
  }

  return lines.join('\n')
}

export function formatMarketplaceListing(agents: PublishedAgent[]): string {
  if (agents.length === 0) return 'No agents found in marketplace.'

  const lines = ['=== Agent Marketplace ===', '', `Found ${agents.length} agent(s):`, '']

  for (const agent of agents) {
    const icon = agent.stats.reputationScore > 80 ? '🌟' :
                  agent.stats.reputationScore > 60 ? '✅' : '⚠️'
    lines.push(`${icon} ${agent.name} (v${agent.version})`)
    lines.push(`   ID: ${agent.id}`)
    lines.push(`   ${agent.description}`)
    lines.push(`   Tags: ${agent.tags.slice(0, 3).join(', ')}${agent.tags.length > 3 ? '...' : ''}`)
    lines.push(`   Reputation: ${agent.stats.reputationScore}/100 | Success: ${Math.round(agent.stats.successRate * 100)}% | Uses: ${agent.stats.totalUses}`)
    lines.push('')
  }

  return lines.join('\n')
}
