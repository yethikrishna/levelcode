import type { SwarmPersona } from '../types/swarm-persona'
import { loadPersonas, savePersona } from './persona-manager'
import { getConfigDir } from './auth'
import fs from 'fs'
import path from 'path'

// ============================================================================
// Agent Marketplace
// ============================================================================

export interface MarketplaceAgent {
  id: string
  name: string
  description: string
  version: string
  author: string
  tags: string[]
  successRate: number      // 0-1
  reviewQuality: number   // 0-100
  downloads: number
  rating: number           // 0-5
  price?: number          // credits or USD
  publishedAt: number
  updatedAt: number
  systemPrompt: string
  toolPermissions?: SwarmPersona['toolPermissions']
  behaviorRules?: string[]
  isOfficial?: boolean
  repository?: string     // URL to source
}

export interface MarketplaceReview {
  agentId: string
  reviewer: string
  rating: number           // 1-5
  comment: string
  createdAt: number
}

// ============================================================================
// Local Marketplace Storage
// ============================================================================

function getMarketplacePath(): string {
  return path.join(getConfigDir(), 'marketplace', 'agents.json')
}

function getReviewsPath(): string {
  return path.join(getConfigDir(), 'marketplace', 'reviews.json')
}

// ============================================================================
// Publish Agent to Marketplace
// ============================================================================

export function publishAgent(
  persona: SwarmPersona,
  author: string,
  options?: {
    tags?: string[]
    price?: number
    repository?: string
  },
): MarketplaceAgent {
  const agent: MarketplaceAgent = {
    id: persona.id,
    name: persona.name,
    description: persona.description || '',
    version: '1.0.0',
    author,
    tags: options?.tags || [],
    successRate: 0,
    reviewQuality: 0,
    downloads: 0,
    rating: 0,
    price: options?.price,
    publishedAt: Date.now(),
    updatedAt: Date.now(),
    systemPrompt: persona.systemPrompt,
    toolPermissions: persona.toolPermissions,
    behaviorRules: persona.behaviorRules,
    isOfficial: false,
    repository: options?.repository,
  }

  const agents = loadMarketplaceAgents()
  const existingIdx = agents.findIndex(a => a.id === agent.id)
  if (existingIdx >= 0) {
    agent.downloads = agents[existingIdx].downloads
    agent.rating = agents[existingIdx].rating
    agents[existingIdx] = agent
  } else {
    agents.push(agent)
  }

  saveMarketplaceAgents(agents)
  return agent
}

// ============================================================================
// Search & Discovery
// ============================================================================

export function searchAgents(
  query?: string,
  tags?: string[],
  minRating?: number,
  sortBy: 'rating' | 'downloads' | 'recent' = 'rating',
): MarketplaceAgent[] {
  let agents = loadMarketplaceAgents()

  // Filter by query
  if (query) {
    const lower = query.toLowerCase()
    agents = agents.filter(a =>
      a.name.toLowerCase().includes(lower) ||
      a.description.toLowerCase().includes(lower) ||
      a.tags.some(t => t.toLowerCase().includes(lower))
    )
  }

  // Filter by tags
  if (tags && tags.length > 0) {
    agents = agents.filter(a =>
      tags.some(t => a.tags.includes(t))
    )
  }

  // Filter by rating
  if (minRating !== undefined) {
    agents = agents.filter(a => a.rating >= minRating)
  }

  // Sort
  switch (sortBy) {
    case 'downloads':
      agents.sort((a, b) => b.downloads - a.downloads)
      break
    case 'recent':
      agents.sort((a, b) => b.updatedAt - a.updatedAt)
      break
    case 'rating':
    default:
      agents.sort((a, b) => b.rating - a.rating)
  }

  return agents
}

// ============================================================================
// Install Agent (import into team)
// ============================================================================

export function installAgent(
  agentId: string,
  teamName: string,
): { success: boolean; message: string; agent?: SwarmPersona } {
  const marketplaceAgents = loadMarketplaceAgents()
  const source = marketplaceAgents.find(a => a.id === agentId)
  if (!source) {
    return { success: false, message: `Agent ${agentId} not found in marketplace` }
  }

  // Convert to SwarmPersona
  const persona: SwarmPersona = {
    id: source.id,
    name: source.name,
    role: 'implementer',  // default role
    description: source.description,
    systemPrompt: source.systemPrompt,
    toolPermissions: source.toolPermissions,
    behaviorRules: source.behaviorRules,
    isCustom: true,
  }

  // Save to team
  savePersona(teamName, persona)

  // Increment downloads
  source.downloads++
  saveMarketplaceAgents(marketplaceAgents)

  return { success: true, message: `Agent ${source.name} installed to ${teamName}`, agent: persona }
}

// ============================================================================
// Reviews
// ============================================================================

export function addReview(review: MarketplaceReview): void {
  const reviews = loadReviews()
  reviews.push(review)
  saveReviews(reviews)

  // Update agent rating
  const agents = loadMarketplaceAgents()
  const agent = agents.find(a => a.id === review.agentId)
  if (agent) {
    const agentReviews = reviews.filter(r => r.agentId === review.agentId)
    const avgRating = agentReviews.reduce((sum, r) => sum + r.rating, 0) / agentReviews.length
    agent.rating = Math.round(avgRating * 10) / 10
    saveMarketplaceAgents(agents)
  }
}

export function getAgentReviews(agentId: string): MarketplaceReview[] {
  return loadReviews().filter(r => r.agentId === agentId)
}

// ============================================================================
// Persistence
// ============================================================================

function loadMarketplaceAgents(): MarketplaceAgent[] {
  try {
    const filePath = getMarketplacePath()
    if (!fs.existsSync(filePath)) return []
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return []
  }
}

function saveMarketplaceAgents(agents: MarketplaceAgent[]): void {
  const filePath = getMarketplacePath()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(agents, null, 2), 'utf-8')
}

function loadReviews(): MarketplaceReview[] {
  try {
    const filePath = getReviewsPath()
    if (!fs.existsSync(filePath)) return []
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return []
  }
}

function saveReviews(reviews: MarketplaceReview[]): void {
  const filePath = getReviewsPath()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(reviews, null, 2), 'utf-8')
}

// ============================================================================
// Formatting
// ============================================================================

export function formatAgentCard(agent: MarketplaceAgent): string {
  const lines = [
    `=== ${agent.name} (${agent.id}) ===`,
    '',
    `Author: ${agent.author}${agent.isOfficial ? ' ✅ Official' : ''}`,
    `Version: ${agent.version}`,
    `Rating: ${'⭐'.repeat(Math.round(agent.rating))} (${agent.rating}/5)`,
    `Downloads: ${agent.downloads.toLocaleString()}`,
    '',
    agent.description,
  ]

  if (agent.tags.length > 0) {
    lines.push('', `Tags: ${agent.tags.join(', ')}`)
  }

  if (agent.repository) {
    lines.push(`Repository: ${agent.repository}`)
  }

  if (agent.price !== undefined) {
    lines.push(`Price: $${agent.price}`)
  }

  return lines.join('\n')
}

export function formatMarketplace(agents: MarketplaceAgent[]): string {
  if (agents.length === 0) return 'Marketplace is empty.'

  const lines = ['=== Agent Marketplace ===', '', `Total Agents: ${agents.length}`, '']

  for (const agent of agents) {
    const official = agent.isOfficial ? '[Official]' : ''
    lines.push(`⭐ ${agent.name} ${official} — Rating: ${agent.rating}/5, Downloads: ${agent.downloads}`)
    if (agent.description) {
      lines.push(`   ${agent.description.slice(0, 80)}${agent.description.length > 80 ? '...' : ''}`)
    }
  }

  return lines.join('\n')
}
