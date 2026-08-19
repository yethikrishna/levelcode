import type { TeamRole } from '@levelcode/common/types/team-config'
import * as net from 'net'

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
}

/**
 * Look up the AgentDefinition for a given team role.
 * Returns undefined if the role has no registered template.
 */
export function getTeamAgent(role: TeamRole): AgentDefinition | undefined {
  return TEAM_AGENTS[role]
}

/**
 * Berserk P2P Wave 1: Real remoteDispatch using TCP P2P transport.
 * Message framing: 4-byte BE uint32 length prefix + JSON payload.
 * Targets v1 item 14 + distributed execution. Connects to P2P_PEER or localhost:7337.
 */
export async function remoteDispatch(role: TeamRole, payload: unknown): Promise<unknown> {
  const host = process.env.P2P_PEER_HOST || '127.0.0.1'
  const port = parseInt(process.env.P2P_PEER_PORT || '7337', 10)

  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port }, () => {
      const message = JSON.stringify({ type: 'dispatch', role, payload })
      const frame = Buffer.alloc(4 + Buffer.byteLength(message))
      frame.writeUInt32BE(Buffer.byteLength(message), 0)
      frame.write(message, 4)
      socket.write(frame)
    })

    let buffer = Buffer.alloc(0)
    let expectedLen = -1

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      while (true) {
        if (expectedLen === -1 && buffer.length >= 4) {
          expectedLen = buffer.readUInt32BE(0)
          buffer = buffer.subarray(4)
        }
        if (expectedLen !== -1 && buffer.length >= expectedLen) {
          const responseJson = buffer.subarray(0, expectedLen).toString()
          buffer = buffer.subarray(expectedLen)
          expectedLen = -1
          try {
            const response = JSON.parse(responseJson)
            socket.end()
            resolve(response)
          } catch (e) {
            reject(e)
          }
          break
        } else {
          break
        }
      }
    })

    socket.on('error', (err) => reject(new Error(`P2P TCP error: ${err.message}`)))
    socket.on('end', () => {
      if (!socket.destroyed) reject(new Error('P2P connection closed unexpectedly'))
    })
    socket.setTimeout(30000, () => {
      socket.destroy()
      reject(new Error('P2P remoteDispatch timeout'))
    })
  })
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

/**
 * Berserk P2P Wave 1: Minimal decentralized agent discovery stub.
 * Simple broadcast registry (in-memory gossip simulation over P2P net).
 * Supports capability advertisement + heartbeat.
 * Targets verification items 36-38. Extendable to UDP broadcast.
 */
interface DiscoveredAgent {
  id: string
  role: TeamRole
  capabilities: string[]
  lastHeartbeat: number
  endpoint?: string
}

const p2pRegistry = new Map<string, DiscoveredAgent>()

export function advertiseCapabilities(role: TeamRole, capabilities: string[], endpoint?: string): void {
  const id = `${role}-${Date.now()}`
  p2pRegistry.set(id, {
    id,
    role,
    capabilities,
    lastHeartbeat: Date.now(),
    endpoint,
  })
}

export function heartbeat(agentId: string): boolean {
  const agent = p2pRegistry.get(agentId)
  if (agent) {
    agent.lastHeartbeat = Date.now()
    return true
  }
  return false
}

export function discoverAgents(): DiscoveredAgent[] {
  // Simple broadcast/gossip: return all active (heartbeat within 60s)
  const now = Date.now()
  return Array.from(p2pRegistry.values()).filter(a => now - a.lastHeartbeat < 60000)
}

export function getRegistrySize(): number {
  return p2pRegistry.size
}

// Inter-Agent Auction Protocol
export {
  AgentAuction,
  getDefaultAgentAuction,
  resetDefaultAgentAuction,
} from './auction'
export type {
  AuctionTask,
  Bid,
  AuctionResult,
  AgentDescriptor,
} from './auction'

// Dynamic Role Synthesis (#26)
export {
  RoleSynthesizer,
  getRoleSynthesizer,
  resetRoleSynthesizer,
  CATEGORY_KEYWORDS,
  CATEGORY_TOOLS,
  CATEGORY_PROMPTS,
  BASE_SPAWNABLE_AGENTS,
} from './role-synthesis'
export type {
  TaskCategory,
  AutonomyLevel,
  RoleContext,
  SynthesizedRole,
  ValidationResult,
} from './role-synthesis'
