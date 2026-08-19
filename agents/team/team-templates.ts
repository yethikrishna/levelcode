import type { TeamRole } from '@levelcode/common/types/team-config'

export interface TeamTemplate {
  id: string
  displayName: string
  description: string
  roles: TeamRole[]
  suggestedUse: string
}

export const BUILT_IN_TEAM_TEMPLATES: TeamTemplate[] = [
  {
    id: 'code-review',
    displayName: 'Code Review Team',
    description: 'Specialized team for thorough code reviews, security audits, and quality assurance.',
    roles: ['coordinator', 'senior-staff-engineer', 'principal-engineer', 'tester', 'reviewer'],
    suggestedUse: 'Use for PR reviews, legacy code audits, or pre-release quality gates.'
  },
  {
    id: 'fullstack-sprint',
    displayName: 'Fullstack Sprint Team',
    description: 'Balanced full-stack development team for feature implementation sprints.',
    roles: ['coordinator', 'cto', 'senior-engineer', 'mid-level-engineer', 'designer', 'tester', 'product-lead'],
    suggestedUse: 'Ideal for 1-2 week feature sprints involving frontend, backend, and UX.'
  },
  {
    id: 'research',
    displayName: 'Research & Exploration Team',
    description: 'Deep research oriented team for technology evaluation, feasibility studies, and innovation.',
    roles: ['coordinator', 'fellow', 'scientist', 'researcher', 'distinguished-engineer'],
    suggestedUse: 'Best for R&D spikes, framework comparisons, or exploring new architectural patterns.'
  },
  {
    id: 'security-audit',
    displayName: 'Security Audit Team',
    description: 'Specialized marketplace template for comprehensive security audits, vulnerability assessments, and compliance reviews.',
    roles: ['coordinator', 'senior-staff-engineer', 'principal-engineer', 'tester', 'reviewer', 'cto'],
    suggestedUse: 'Use for security-focused code reviews, penetration testing prep, OWASP compliance, and threat modeling.'
  },
  {
    id: 'data-pipeline',
    displayName: 'Data Pipeline Team',
    description: 'Marketplace template optimized for building and maintaining scalable data pipelines, ETL processes, and analytics infrastructure.',
    roles: ['coordinator', 'scientist', 'senior-engineer', 'mid-level-engineer', 'tester', 'researcher'],
    suggestedUse: 'Ideal for Spark/Flink pipelines, data lake implementations, real-time streaming, and ML feature stores.'
  },
  {
    id: 'mobile-sprint',
    displayName: 'Mobile Sprint Team',
    description: 'Pre-built marketplace template for rapid mobile app development sprints across iOS and Android platforms.',
    roles: ['coordinator', 'cto', 'senior-engineer', 'designer', 'tester', 'product-lead', 'mid-level-engineer'],
    suggestedUse: 'Perfect for React Native/Flutter sprints, native feature rollouts, app store submissions, and mobile UX iterations.'
  }
]

export function getTemplateById(id: string): TeamTemplate | undefined {
  return BUILT_IN_TEAM_TEMPLATES.find(t => t.id === id)
}

export function listTemplates(): TeamTemplate[] {
  return [...BUILT_IN_TEAM_TEMPLATES]
}

// Swarm Marketplace initial (v1 item 15) - minimal registry for community-style sharing
export interface MarketplaceRegistryEntry {
  id: string
  template: TeamTemplate
  contributor?: string
  sharedAt?: string
}

export const SWARM_MARKETPLACE_REGISTRY: MarketplaceRegistryEntry[] = []

export function registerMarketplaceTemplate(entry: MarketplaceRegistryEntry): void {
  SWARM_MARKETPLACE_REGISTRY.push(entry)
}
