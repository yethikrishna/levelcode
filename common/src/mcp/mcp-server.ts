import { getApprovedEntries, getBibleContext } from '../utils/memory-bible'
import { loadSwarmState } from '../utils/swarm-state'
import { loadPersonas } from '../utils/persona-manager'
import { getConfigDir } from '../utils/auth'
import path from 'path'
import fs from 'fs'

// ============================================================================
// MCP Server - Expose Swarm Tools & Memory via Model Context Protocol
// ============================================================================

/**
 * MCP Server implementation for LevelCode Swarm.
 * Allows external agents (from other frameworks) to discover and use
 * Swarm tools, memory, and personas securely.
 */

export interface MCPServerConfig {
  port: number
  host: string
  authEnabled: boolean
  allowedOrigins: string[]    // Which external agents can connect
  readOnly: boolean        // If true, only expose read tools
  exposeMemory: boolean
  exposeTools: boolean
  exposePersonas: boolean
}

const DEFAULT_MCP_CONFIG: MCPServerConfig = {
  port: 3000,
  host: 'localhost',
  authEnabled: true,
  allowedOrigins: ['*'],    // open by default, restrict in prod
  readOnly: false,
  exposeMemory: true,
  exposeTools: true,
  exposePersonas: true,
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>    // JSON Schema
}

export interface MCPToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string    // base64 for images
    mimeType?: string
  }>
  isError?: boolean
}

// ============================================================================
// Swarm MCP Tools - Exposed for External Agents
// ============================================================================

function getSwarmTools(teamName: string, readOnly: boolean): MCPTool[] {
  const tools: MCPTool[] = []

  // Always expose read tools
  tools.push({
    name: 'swarm_status',
    description: 'Get current swarm status, agent health, and task progress',
    inputSchema: {
      type: 'object',
      properties: {
        teamName: { type: 'string', description: 'Team name' },
      },
      required: ['teamName'],
    },
  })

  tools.push({
    name: 'bible_query',
    description: 'Query human-vetted bible entries (approved truth only)',
    inputSchema: {
      type: 'object',
      properties: {
        teamName: { type: 'string', description: 'Team name' },
        type: {
          type: 'string',
          enum: ['document', 'decision', 'intelligence', 'feature', 'product-context', 'market-insight'],
        },
      },
    },
  })

  tools.push({
    name: 'bible_context',
    description: 'Get the full bible context string for agent priming',
    inputSchema: {
      type: 'object',
      properties: {
        teamName: { type: 'string' },
        type: { type: 'string' },
      },
    },
  })

  tools.push({
    name: 'persona_list',
    description: 'List available swarm personas',
    inputSchema: {
      type: 'object',
      properties: {
        teamName: { type: 'string' },
      },
    },
  })

  // Write tools (only if not readOnly)
  if (!readOnly) {
    tools.push({
      name: 'bible_add',
      description: 'Add a new bible entry (goes to pending for human review)',
      inputSchema: {
        type: 'object',
        properties: {
          teamName: { type: 'string' },
          type: {
            type: 'string',
            enum: ['document', 'decision', 'intelligence', 'feature', 'product-context', 'market-insight'],
          },
          title: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['teamName', 'type', 'title', 'content'],
      },
    })

    tools.push({
      name: 'task_list',
      description: 'List all tasks in the swarm',
      inputSchema: {
        type: 'object',
        properties: {
          teamName: { type: 'string' },
          status: { type: 'string' },
        },
      },
    })
  }

  return tools
}

// ============================================================================
// MCP Tool Execution
// ============================================================================

export function executeMCPTool(
  teamName: string,
  call: MCPToolCall,
): MCPToolResult {
  try {
    switch (call.name) {
      case 'swarm_status': {
        const state = loadSwarmState(teamName)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              phase: state.phase,
              agents: state.agents.length,
              tasks: state.tasks.length,
              completed: state.metrics.tasksCompleted,
              health: state.metrics.healthScore,
            }, null, 2),
          }],
        }
      }

      case 'bible_query': {
        const type = call.arguments['type'] as string | undefined
        const entries = getApprovedEntries(teamName, type as any)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(entries.map(e => ({
              id: e.id,
              type: e.type,
              title: e.title,
              source: e.source,
              createdAt: e.createdAt,
            })), null, 2),
          }],
        }
      }

      case 'bible_context': {
        const type = call.arguments['type'] as string | undefined
        const context = getBibleContext(teamName, type as any)
        return {
          content: [{ type: 'text', text: context }],
        }
      }

      case 'persona_list': {
        const personas = loadPersonas(teamName)
        const list = Object.entries(personas).map(([id, p]) => ({
          id,
          name: p.name,
          role: p.role,
          description: p.description,
          isCustom: p.isCustom,
        }))
        return {
          content: [{ type: 'text', text: JSON.stringify(list, null, 2) }],
        }
      }

      case 'bible_add': {
        const { createEntry } = require('../utils/memory-bible')
        const type = call.arguments['type'] as string
        const title = call.arguments['title'] as string
        const content = call.arguments['content'] as string
        const entry = createEntry(teamName, type, title, content, 'external-agent', {
          autoApprove: false,
        })
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              entryId: entry.id,
              status: entry.status,
              message: 'Entry created (pending human review)',
            }),
          }],
        }
      }

      case 'task_list': {
        const state = loadSwarmState(teamName)
        const statusFilter = call.arguments['status'] as string | undefined
        const tasks = statusFilter
          ? state.tasks.filter(t => t.status === statusFilter)
          : state.tasks
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(tasks.map(t => ({
              taskId: t.taskId,
              subject: t.subject,
              status: t.status,
              owner: t.owner,
              phase: t.phase,
            })), null, 2),
          }],
        }
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${call.name}` }],
          isError: true,
        }
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error}` }],
      isError: true,
    }
  }
}

// ============================================================================
// MCP Server Persistence
// ============================================================================

function getMCPConfigPath(teamName: string): string {
  return path.join(
    getConfigDir(),
    'swarm',
    teamName,
    'mcp-config.json',
  )
}

export function loadMCPConfig(teamName: string): MCPServerConfig {
  try {
    const filePath = getMCPConfigPath(teamName)
    if (!fs.existsSync(filePath)) return { ...DEFAULT_MCP_CONFIG }
    return { ...DEFAULT_MCP_CONFIG, ...JSON.parse(fs.readFileSync(filePath, 'utf-8')) }
  } catch {
    return { ...DEFAULT_MCP_CONFIG }
  }
}

export function saveMCPConfig(teamName: string, config: Partial<MCPServerConfig>): void {
  const filePath = getMCPConfigPath(teamName)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const existing = loadMCPConfig(teamName)
  const updated = { ...existing, ...config }
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8')
}

// ============================================================================
// MCP Resources (for external agents to discover available data)
// ============================================================================

export interface MCPResource {
  uri: string
  name: string
  description: string
  mimeType: string
}

export function listMCPResources(teamName: string): MCPResource[] {
  const resources: MCPResource[] = []

  // Bible resources
  resources.push({
    uri: `swarm://${teamName}/bible/approved`,
    name: 'Approved Bible Entries',
    description: 'Human-vetted truth that agents can trust',
    mimeType: 'application/json',
  })

  resources.push({
    uri: `swarm://${teamName}/bible/context`,
    name: 'Bible Context',
    description: 'Full bible context string for agent priming',
    mimeType: 'text/plain',
  })

  // Persona resources
  resources.push({
    uri: `swarm://${teamName}/personas`,
    name: 'Swarm Personas',
    description: 'Available agent personas with system prompts',
    mimeType: 'application/json',
  })

  // State resource
  resources.push({
    uri: `swarm://${teamName}/state`,
    name: 'Swarm State',
    description: 'Current swarm state (agents, tasks, metrics)',
    mimeType: 'application/json',
  })

  return resources
}

// ============================================================================
// Formatting - MCP Server Info
// ============================================================================

export function formatMCPServerInfo(
  teamName: string,
  config: MCPServerConfig,
): string {
  const tools = getSwarmTools(teamName, config.readOnly)
  const resources = listMCPResources(teamName)

  const lines = [
    `=== MCP Server: ${teamName} ===`,
    ``,
    `Endpoint: ${config.host}:${config.port}`,
    `Auth: ${config.authEnabled ? 'ENABLED' : 'DISABLED'}`,
    `Mode: ${config.readOnly ? 'READ-ONLY' : 'READ-WRITE'}`,
    ``,
    `Exposed:`,
    `  Memory: ${config.exposeMemory ? '✅' : '❌'}`,
    `  Tools: ${config.exposeTools ? '✅' : '❌'}`,
    `  Personas: ${config.exposePersonas ? '✅' : '❌'}`,
    ``,
    `Tools (${tools.length}):`,
  ]

  for (const tool of tools) {
    lines.push(`  - ${tool.name}: ${tool.description}`)
  }

  lines.push(``, `Resources (${resources.length}):`)
  for (const res of resources) {
    lines.push(`  - ${res.name}: ${res.uri}`)
  }

  return lines.join('\n')
}
