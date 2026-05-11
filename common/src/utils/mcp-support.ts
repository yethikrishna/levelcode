import type { SwarmState } from './swarm-state'
import type { SwarmPersona } from '../types/swarm-persona'
import fs from 'fs'
import path from 'path'
import { getConfigDir } from './auth'

// ============================================================================
// MCP (Model Context Protocol) Native Support
// ============================================================================

export interface MCPServerConfig {
  id: string
  name: string
  version: string
  description?: string
  tools: MCPTool[]
  resources: MCPResource[]
  prompts: MCPPrompt[]
  enabled: boolean
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>  // JSON Schema
}

export interface MCPResource {
  uri: string
  name: string
  mimeType?: string
  description?: string
}

export interface MCPPrompt {
  name: string
  description: string
  arguments?: Array<{ name: string; description: string; required?: boolean }>
}

// ============================================================================
// Expose LevelCODE Tools via MCP
// ============================================================================

export function getLevelCODETools(): MCPTool[] {
  return [
    {
      name: 'bible_query',
      description: 'Query approved bible entries (human-vetted truth)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          type: { type: 'string', enum: ['document', 'decision', 'intelligence', 'feature', 'product-context', 'market-insight'] },
        },
        required: ['query'],
      },
    },
    {
      name: 'bible_add',
      description: 'Add a new bible entry (requires human review)',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['document', 'decision', 'intelligence', 'feature', 'product-context', 'market-insight'] },
          title: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['type', 'title', 'content'],
      },
    },
    {
      name: 'swarm_create',
      description: 'Create a new swarm team',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          members: { type: 'array', items: { type: 'string' } },
        },
        required: ['name'],
      },
    },
    {
      name: 'swarm_status',
      description: 'Get swarm status dashboard',
      inputSchema: {
        type: 'object',
        properties: {
          teamName: { type: 'string' },
        },
      },
    },
    {
      name: 'agent_spawn',
      description: 'Spawn a new agent with a specific persona',
      inputSchema: {
        type: 'object',
        properties: {
          personaId: { type: 'string' },
          taskId: { type: 'string' },
        },
        required: ['personaId', 'taskId'],
      },
    },
  ]
}

export function getLevelCODEPrompts(): MCPPrompt[] {
  return [
    {
      name: 'swarm-orchestration',
      description: 'Best practices for orchestrating a multi-agent swarm',
      arguments: [
        { name: 'teamName', description: 'Name of the team', required: true },
        { name: 'phase', description: 'Current development phase', required: false },
      ],
    },
    {
      name: 'bible-guidelines',
      description: 'Guidelines for contributing to the human-vetted bible',
      arguments: [],
    },
  ]
}

export function getLevelCODEResources(teamName?: string): MCPResource[] {
  const resources: MCPResource[] = [
    {
      uri: 'levelcode://bible/approved',
      name: 'Approved Bible Entries',
      mimeType: 'application/json',
      description: 'Human-vetted truth that agents can trust',
    },
    {
      uri: 'levelcode://swarm/state',
      name: 'Swarm State',
      mimeType: 'application/json',
      description: 'Current swarm state (agents, tasks, metrics)',
    },
  ]

  if (teamName) {
    resources.push({
      uri: `levelcode://team/${teamName}/config`,
      name: `${teamName} Config`,
      mimeType: 'application/json',
      description: 'Team configuration',
    })
  }

  return resources
}

// ============================================================================
// MCP Server Persistence
// ============================================================================

function getMCPConfigPath(): string {
  return path.join(getConfigDir(), 'mcp-servers.json')
}

export function loadMCPServers(): MCPServerConfig[] {
  try {
    const filePath = getMCPConfigPath()
    if (!fs.existsSync(filePath)) return []
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return []
  }
}

export function saveMCPServer(config: MCPServerConfig): void {
  const servers = loadMCPServers()
  const idx = servers.findIndex(s => s.id === config.id)
  if (idx >= 0) {
    servers[idx] = config
  } else {
    servers.push(config)
  }

  const filePath = getMCPConfigPath()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(servers, null, 2), 'utf-8')
}

export function removeMCPServer(serverId: string): void {
  const servers = loadMCPServers().filter(s => s.id !== serverId)
  const filePath = getMCPConfigPath()
  fs.writeFileSync(filePath, JSON.stringify(servers, null, 2), 'utf-8')
}

// ============================================================================
// Formatting
// ============================================================================

export function formatMCPServer(server: MCPServerConfig): string {
  const lines = [
    `=== MCP Server: ${server.name} ===`,
    '',
    `ID: ${server.id}`,
    `Version: ${server.version}`,
    `Enabled: ${server.enabled ? 'YES' : 'NO'}`,
  ]

  if (server.description) {
    lines.push(`Description: ${server.description}`)
  }

  lines.push('', `Tools: ${server.tools.length}`, `Resources: ${server.resources.length}`, `Prompts: ${server.prompts.length}`)

  return lines.join('\n')
}

export function formatMCPServers(servers: MCPServerConfig[]): string {
  if (servers.length === 0) return 'No MCP servers configured.'

  const lines = ['=== MCP Servers ===', '']
  for (const server of servers) {
    const icon = server.enabled ? '✅' : '❌'
    lines.push(`${icon} ${server.name} (${server.id}) - ${server.tools.length} tools`)
  }
  return lines.join('\n')
}
