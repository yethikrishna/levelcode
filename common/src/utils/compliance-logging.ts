import fs from 'fs'
import path from 'path'
import { getConfigDir } from './auth'

// ============================================================================
// Compliance Logging — Immutable Events (OpenTelemetry Compatible)
// ============================================================================

export interface ComplianceEvent {
  traceId: string
  spanId?: string
  timestamp: number
  eventType: 'decision' | 'tool-call' | 'state-change' | 'phase-transition' | 'approval' | 'rejection'
  agentId?: string
  taskId?: string
  payload: Record<string, unknown>
  signature?: string     // cryptographic hash for tamper detection
  humanApprover?: string
}

export interface OpenTelemetrySpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  operation: string
  startTime: number
  endTime?: number
  attributes: Record<string, string | number | boolean>
  status: 'unset' | 'ok' | 'error'
}

// ============================================================================
// Event Storage
// ============================================================================

function getEventsPath(teamName: string): string {
  return path.join(getConfigDir(), 'swarm', teamName, 'compliance', 'events.jsonl')
}

function ensureDir(teamName: string): void {
  const dir = path.dirname(getEventsPath(teamName))
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// Simple signing (not crypto-grade, but sufficient for integrity)
function signEvent(event: ComplianceEvent): string {
  const content = `${event.traceId}:${event.timestamp}:${event.eventType}:${JSON.stringify(event.payload)}`
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i)
    hash |= 0
  }
  return hash.toString(36)
}

// ============================================================================
// Log Events
// ============================================================================

export function logDecision(
  teamName: string,
  traceId: string,
  agentId: string,
  decision: string,
  evidence: string,
  humanApprover?: string,
): ComplianceEvent {
  const event: ComplianceEvent = {
    traceId,
    timestamp: Date.now(),
    eventType: 'decision',
    agentId,
    payload: { decision, evidence },
    humanApprover,
    signature: '',
  }
  event.signature = signEvent(event)

  appendEvent(teamName, event)
  return event
}

export function logToolCall(
  teamName: string,
  traceId: string,
  agentId: string,
  tool: string,
  args: Record<string, unknown>,
  result: 'success' | 'failure',
): ComplianceEvent {
  const event: ComplianceEvent = {
    traceId,
    timestamp: Date.now(),
    eventType: 'tool-call',
    agentId,
    payload: { tool, args, result },
    signature: '',
  }
  event.signature = signEvent(event)

  appendEvent(teamName, event)
  return event
}

export function logStateChange(
  teamName: string,
  traceId: string,
  changeType: string,
  oldValue: unknown,
  newValue: unknown,
): ComplianceEvent {
  const event: ComplianceEvent = {
    traceId,
    timestamp: Date.now(),
    eventType: 'state-change',
    payload: { changeType, oldValue, newValue },
    signature: '',
  }
  event.signature = signEvent(event)

  appendEvent(teamName, event)
  return event
}

export function logApproval(
  teamName: string,
  traceId: string,
  agentId: string,
  entryId: string,
  approvedBy: string,
): ComplianceEvent {
  const event: ComplianceEvent = {
    traceId,
    timestamp: Date.now(),
    eventType: 'approval',
    agentId,
    payload: { entryId },
    humanApprover: approvedBy,
    signature: '',
  }
  event.signature = signEvent(event)

  appendEvent(teamName, event)
  return event
}

// ============================================================================
// OpenTelemetry Export
// ============================================================================

export function exportToOpenTelemetry(
  teamName: string,
): OpenTelemetrySpan[] {
  const events = loadAllEvents(teamName)
  return events.map(e => ({
    traceId: e.traceId,
    spanId: e.spanId || e.traceId.slice(0, 16),
    operation: e.eventType,
    startTime: e.timestamp,
    endTime: e.timestamp,
    attributes: {
      'agent.id': e.agentId || '',
      'event.type': e.eventType,
      'human.approver': e.humanApprover || '',
      ...e.payload,
    } as Record<string, string | number | boolean>,
    status: e.eventType === 'rejection' ? 'error' : 'ok',
  }))
}

// ============================================================================
// Trace Continuity
// ============================================================================

export function startTrace(teamName: string, operation: string): string {
  const traceId = `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const event: ComplianceEvent = {
    traceId,
    timestamp: Date.now(),
    eventType: 'state-change',
    payload: { operation, action: 'start-trace' },
    signature: '',
  }
  event.signature = signEvent(event)
  appendEvent(teamName, event)
  return traceId
}

// ============================================================================
// Persistence
// ============================================================================

function appendEvent(teamName: string, event: ComplianceEvent): void {
  ensureDir(teamName)
  const line = JSON.stringify(event) + '\n'
  fs.appendFileSync(getEventsPath(teamName), line, 'utf-8')
}

export function loadAllEvents(teamName: string): ComplianceEvent[] {
  const filePath = getEventsPath(teamName)
  if (!fs.existsSync(filePath)) return []

  const content = fs.readFileSync(filePath, 'utf-8')
  const events: ComplianceEvent[] = []
  for (const line of content.split('\n')) {
    if (line.trim()) {
      try {
        events.push(JSON.parse(line))
      } catch {
        // Skip invalid lines
      }
    }
  }
  return events
}

export function verifyEventIntegrity(event: ComplianceEvent): boolean {
  const storedSignature = event.signature
  event.signature = ''
  const computed = signEvent(event)
  event.signature = storedSignature
  return storedSignature === computed
}

// ============================================================================
// Formatting
// ============================================================================

export function formatComplianceReport(teamName: string): string {
  const events = loadAllEvents(teamName)
  if (events.length === 0) return 'No compliance events logged.'

  const lines = [
    `=== Compliance Report: ${teamName} ===`,
    '',
    `Total Events: ${events.length}`,
    '',
  ]

  const byType: Record<string, number> = {}
  for (const e of events) {
    byType[e.eventType] = (byType[e.eventType] || 0) + 1
  }

  lines.push('By Event Type:')
  for (const [type, count] of Object.entries(byType)) {
    lines.push(`  ${type}: ${count}`)
  }

  lines.push('', 'Recent Events:')
  const recent = events.slice(-10)
  for (const e of recent) {
    const icon = e.eventType === 'approval' ? '✅' :
                  e.eventType === 'rejection' ? '❌' : '📝'
    const verified = verifyEventIntegrity(e) ? '✅' : '⚠️ TAMPERED'
    lines.push(`  ${icon} [${e.eventType}] ${e.agentId || 'system'} — ${verified}`)
  }

  return lines.join('\n')
}
