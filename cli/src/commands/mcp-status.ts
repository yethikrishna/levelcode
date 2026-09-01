/**
 * `/mcp` — live health view of configured MCP servers.
 *
 * For each server in the merged mcp.json config: attempt a real client
 * connection (bounded by a short timeout so a hung server can't freeze the
 * session), list its tool count, and render ✓/✗. CI-equivalent usage is the
 * doctor surface; this is the interactive counterpart.
 */

import { getMCPClient, listMCPTools } from '@levelcode/common/mcp/client'

import type { MCPConfig } from '@levelcode/common/types/mcp'

export type McpServerHealth = {
  name: string
  type: string
  ok: boolean
  toolCount: number
  error?: string
}

const HEALTH_TIMEOUT_MS = 8_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ])
}

/** Injectable for tests: connect a server and return its tool count. */
export type McpConnector = (
  config: MCPConfig,
) => Promise<{ toolCount: number }>

export const realMcpConnector: McpConnector = async (config) => {
  const clientId = await getMCPClient(config)
  const tools = await listMCPTools(clientId)
  return { toolCount: tools.tools.length }
}

export async function checkMcpServers(
  servers: Record<string, MCPConfig>,
  connect: McpConnector = realMcpConnector,
): Promise<McpServerHealth[]> {
  const results: McpServerHealth[] = []

  for (const [name, config] of Object.entries(servers)) {
    try {
      const { toolCount } = await withTimeout(
        connect(config),
        HEALTH_TIMEOUT_MS,
        `MCP server "${name}"`,
      )
      results.push({ name, type: config.type, ok: true, toolCount })
    } catch (error) {
      results.push({
        name,
        type: config.type,
        ok: false,
        toolCount: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}

export function formatMcpStatus(health: McpServerHealth[]): string {
  if (health.length === 0) {
    return [
      'MCP servers: none configured.',
      'Add servers to .mcp.json (project) or ~/.config/levelcode/mcp.json (user).',
    ].join('\n')
  }

  const lines: string[] = ['MCP servers:']
  for (const server of health) {
    if (server.ok) {
      lines.push(
        `  \u2713 ${server.name} (${server.type}) — ${server.toolCount} tool${server.toolCount === 1 ? '' : 's'}`,
      )
    } else {
      lines.push(
        `  \u2717 ${server.name} (${server.type}) — ${server.error ?? 'unreachable'}`,
      )
    }
  }
  const ok = health.filter((s) => s.ok).length
  lines.push(
    `  ${ok}/${health.length} reachable${ok < health.length ? ' — failed servers are skipped for tool calls' : ''}`,
  )
  return lines.join('\n')
}
