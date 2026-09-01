import { describe, it, expect } from 'bun:test'

import {
  checkMcpServers,
  formatMcpStatus,
} from '../mcp-status'

import type { MCPConfig } from '@levelcode/common/types/mcp'
import type { McpConnector } from '../mcp-status'

const stdioServer: MCPConfig = { type: 'stdio', command: 'echo', args: [] }
const httpServer: MCPConfig = {
  type: 'http',
  url: 'http://localhost:9999',
  params: {},
  headers: {},
}

const okConnector: McpConnector = async () => ({ toolCount: 12 })
const failConnector: McpConnector = async () => {
  throw new Error('ECONNREFUSED')
}

describe('checkMcpServers', () => {
  it('marks reachable servers with tool counts', async () => {
    const health = await checkMcpServers(
      { 'github-mcp': stdioServer },
      okConnector,
    )
    expect(health).toEqual([
      { name: 'github-mcp', type: 'stdio', ok: true, toolCount: 12 },
    ])
  })

  it('captures connection errors without throwing', async () => {
    const health = await checkMcpServers(
      { broken: httpServer },
      failConnector,
    )
    expect(health[0]!.ok).toBe(false)
    expect(health[0]!.error).toContain('ECONNREFUSED')
  })

  it('checks multiple servers in config order', async () => {
    const health = await checkMcpServers(
      { a: stdioServer, b: httpServer },
      (config) => (config.type === 'stdio' ? okConnector(config) : failConnector(config)),
    )
    expect(health.map((h) => h.name)).toEqual(['a', 'b'])
    expect(health[0]!.ok).toBe(true)
    expect(health[1]!.ok).toBe(false)
  })
})

describe('formatMcpStatus', () => {
  it('explains when nothing is configured', () => {
    const out = formatMcpStatus([])
    expect(out).toContain('none configured')
    expect(out).toContain('.mcp.json')
  })

  it('renders ok and failed servers distinctly with a summary', () => {
    const out = formatMcpStatus([
      { name: 'good', type: 'stdio', ok: true, toolCount: 3 },
      { name: 'bad', type: 'http', ok: false, toolCount: 0, error: 'timed out' },
    ])
    expect(out).toContain('\u2713 good (stdio) — 3 tools')
    expect(out).toContain('\u2717 bad (http) — timed out')
    expect(out).toContain('1/2 reachable')
  })

  it('omits the skip note when everything is reachable', () => {
    const out = formatMcpStatus([
      { name: 'good', type: 'stdio', ok: true, toolCount: 1 },
    ])
    expect(out).not.toContain('skipped')
  })
})
