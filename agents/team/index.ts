import type { TeamRole } from '@levelcode/common/types/team-config'

import type { AgentDefinition } from '../types/agent-definition'

import coordinator from './coordinator'
import cto from './cto'
import vpEngineering from './vp-engineering'
import director from './director'
import fellow from './fellow'
import distinguishedEngineer from './distinguished-engineer'
import principalEngineer from './principal-engineer'
import seniorStaffEngineer from './senior-staff-engineer'
import staffEngineer from './staff-engineer'
import manager from './manager'
import subManager from './sub-manager'
import seniorEngineer from './senior-engineer'
import midLevelEngineer from './mid-level-engineer'
import juniorEngineer from './junior-engineer'
import researcher from './researcher'
import scientist from './scientist'
import designer from './designer'
import productLead from './product-lead'
import tester from './tester'
import intern from './intern'
import apprentice from './apprentice'

/**
 * Map of TeamRole to its AgentDefinition.
 *
 * Roles that exist in the TeamRole type but have no dedicated template
 * (e.g. 'super-senior', 'reviewer') are intentionally omitted.
 */
export const TEAM_AGENTS: Partial<Record<TeamRole, AgentDefinition>> = {
  'coordinator': coordinator,
  'cto': cto,
  'vp-engineering': vpEngineering,
  'director': director,
  'fellow': fellow,
  'distinguished-engineer': distinguishedEngineer,
  'principal-engineer': principalEngineer,
  'senior-staff-engineer': seniorStaffEngineer,
  'staff-engineer': staffEngineer,
  'manager': manager,
  'sub-manager': subManager,
  'senior-engineer': seniorEngineer as AgentDefinition,
  'mid-level-engineer': midLevelEngineer,
  'junior-engineer': juniorEngineer,
  'researcher': researcher,
  'scientist': scientist,
  'designer': designer,
  'product-lead': productLead,
  'tester': tester,
  'intern': intern,
  'apprentice': apprentice,
}

/**
 * Human-readable descriptions for each team role.
 */
export const TEAM_ROLE_DESCRIPTIONS: Partial<Record<TeamRole, string>> = {
  'coordinator': 'Top-level orchestrator that drives multi-agent projects to completion',
  'cto': 'Chief Technology Officer responsible for technical strategy and team structure',
  'vp-engineering': 'VP of Engineering managing operations, delivery, and team scaling',
  'director': 'Engineering Director overseeing multiple teams and cross-team alignment',
  'fellow': 'Engineering Fellow -- the most senior IC, tackling paradigm-defining problems',
  'distinguished-engineer': 'Distinguished Engineer shaping technical strategy across the system',
  'principal-engineer': 'Principal Engineer defining architecture and solving the hardest problems',
  'senior-staff-engineer': 'Senior Staff Engineer driving large-scale technical initiatives',
  'staff-engineer': 'Staff Engineer handling complex cross-cutting implementations',
  'manager': 'Engineering Manager coordinating engineers and tracking delivery',
  'sub-manager': 'Team Lead coordinating a small group on a focused workstream',
  'senior-engineer': 'Senior IC handling complex implementations and mentoring',
  'mid-level-engineer': 'Mid-level engineer building features and fixing bugs independently',
  'junior-engineer': 'Junior engineer handling well-scoped tasks under guidance',
  'researcher': 'Research specialist investigating codebases, APIs, and documentation',
  'scientist': 'Research engineer using experimentation and benchmarking for analysis',
  'designer': 'UI/UX specialist providing design guidance and specifications',
  'product-lead': 'Product specialist handling requirements, prioritization, and scope',
  'tester': 'Testing specialist writing and running tests for quality assurance',
  'intern': 'Entry-level agent for simple, well-defined read-only tasks',
  'apprentice': 'Learning-level agent for straightforward tasks with basic analysis',
}

/**
 * Look up the AgentDefinition for a given team role.
 * Returns undefined if the role has no registered template.
 */
export function getTeamAgent(role: TeamRole): AgentDefinition | undefined {
  return TEAM_AGENTS[role]
}

/**
 * Get all registered team agent definitions.
 */
export function getAllTeamAgents(): AgentDefinition[] {
  return Object.values(TEAM_AGENTS).filter(
    (agent): agent is AgentDefinition => agent !== undefined,
  )
}

/**
 * Get a map of agent ID to AgentDefinition for all team agents.
 * Useful for registering team agents into the agent template system.
 */
export function getTeamAgentsByIds(): Record<string, AgentDefinition> {
  const result: Record<string, AgentDefinition> = {}
  for (const agent of getAllTeamAgents()) {
    result[agent.id] = agent
  }
  return result
}
