import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getConfigDir } from './auth'

// ============================================================================
// Compliance Event
// ============================================================================

export interface ComplianceEvent {
  id: string
  timestamp: number
  type: ComplianceEventType
  agentId?: string
  taskId?: string
  teamName: string
  action: string
  details: Record<string, unknown>
  signature?: string
}

export type ComplianceEventType =
  | 'agent_spawn'
  | 'agent_stop'
  | 'task_start'
  | 'task_complete'
  | 'task_fail'
  | 'review_approve'
  | 'review_reject'
  | 'bible_add'
  | 'bible_approve'
  | 'bible_reject'
  | 'phase_transition'
  | 'config_change'
  | 'tool_use'
  | 'file_change'

// ============================================================================
// Signing Configuration
// ============================================================================

export interface SigningConfig {
  algorithm: 'HMAC-SHA256' | 'HMAC-SHA512' | 'RSA-SHA256'
  secret?: string          // for HMAC
  privateKey?: string      // for RSA
  publicKey?: string       // for RSA verification
  enabled: boolean
}

const DEFAULT_SIGNING_CONFIG: SigningConfig = {
  algorithm: 'HMAC-SHA256',
  enabled: false,          // off by default, enable via config
}

function getSigningConfigPath(teamName: string): string {
  return path.join(getConfigDir(), 'swarm', teamName, 'signing-config.json')
}

export function loadSigningConfig(teamName: string): SigningConfig {
  try {
    const filePath = getSigningConfigPath(teamName)
    if (!fs.existsSync(filePath)) return { ...DEFAULT_SIGNING_CONFIG }
    return { ...DEFAULT_SIGNING_CONFIG, ...JSON.parse(fs.readFileSync(filePath, 'utf-8')) }
  } catch {
    return { ...DEFAULT_SIGNING_CONFIG }
  }
}

export function saveSigningConfig(teamName: string, config: Partial<SigningConfig>): void {
  const filePath = getSigningConfigPath(teamName)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const existing = loadSigningConfig(teamName)
  const updated = { ...existing, ...config }
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8')
}

// ============================================================================
// Cryptographic Signing
// ============================================================================

export function signEntry(
  entry: Omit<ComplianceEvent, 'signature'>,
  config: SigningConfig,
): string {
  if (!config.enabled) return ''

  const payload = JSON.stringify(entry)
  const secret = config.secret || getDefaultSecret()

  switch (config.algorithm) {
    case 'HMAC-SHA256':
      return crypto.createHmac('sha256', secret).update(payload).digest('hex')
    case 'HMAC-SHA512':
      return crypto.createHmac('sha512', secret).update(payload).digest('hex')
    case 'RSA-SHA256':
      if (!config.privateKey) throw new Error('privateKey required for RSA')
      return crypto.sign('RSA-SHA256', Buffer.from(payload), config.privateKey).toString('hex')
    default:
      throw new Error(`Unsupported algorithm: ${config.algorithm}`)
  }
}

export function verifyEntry(
  entry: ComplianceEvent,
  config: SigningConfig,
): boolean {
  if (!config.enabled) return true
  if (!entry.signature) return false

  const signature = entry.signature
  const payload = JSON.stringify({
    ...entry,
    signature: undefined,
  })

  const secret = config.secret || getDefaultSecret()

  switch (config.algorithm) {
    case 'HMAC-SHA256': {
      const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
      return expected === signature
    }
    case 'HMAC-SHA512': {
      const expected = crypto.createHmac('sha512', secret).update(payload).digest('hex')
      return expected === signature
    }
    case 'RSA-SHA256': {
      if (!config.publicKey) return false
      return crypto.verify(
        'RSA-SHA256',
        Buffer.from(payload),
        config.publicKey,
        Buffer.from(signature, 'hex'),
      )
    }
    default:
      return false
  }
}

function getDefaultSecret(): string {
  // Use a machine-specific secret derived from hostname + a fixed salt
  const salt = 'levelcode-compliance-salt'
  const seed = require('os').hostname() + salt
  return crypto.createHash('sha256').update(seed).digest('hex')
}

// ============================================================================
// Compliance Logging
// ============================================================================

function getComplianceLogPath(teamName: string): string {
  return path.join(getConfigDir(), 'swarm', teamName, 'compliance.jsonl')
}

export function logComplianceEvent(
  teamName: string,
  event: Omit<ComplianceEvent, 'id' | 'timestamp' | 'teamName' | 'signature'>,
): ComplianceEvent {
  const config = loadSigningConfig(teamName)

  const entry: ComplianceEvent = {
    id: `CMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    teamName,
    ...event,
  }

  if (config.enabled) {
    entry.signature = signEntry(entry, config)
  }

  // Append to JSONL file
  const logPath = getComplianceLogPath(teamName)
  const dir = path.dirname(logPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8')

  return entry
}

export function verifyComplianceLog(teamName: string): {
  valid: number
  invalid: number
  missingSignature: number
  errors: string[]
} {
  const logPath = getComplianceLogPath(teamName)
  if (!fs.existsSync(logPath)) {
    return { valid: 0, invalid: 0, missingSignature: 0, errors: [] }
  }

  const config = loadSigningConfig(teamName)
  const content = fs.readFileSync(logPath, 'utf-8')
  const lines = content.trim().split('\n').filter(Boolean)

  let valid = 0
  let invalid = 0
  let missingSignature = 0
  const errors: string[] = []

  for (const line of lines) {
    try {
      const entry: ComplianceEvent = JSON.parse(line)
      if (!entry.signature) {
        missingSignature++
        continue
      }
      if (verifyEntry(entry, config)) {
        valid++
      } else {
        invalid++
        errors.push(`Invalid signature for ${entry.id}`)
      }
    } catch {
      errors.push(`Malformed line: ${line.slice(0, 50)}...`)
    }
  }

  return { valid, invalid, missingSignature, errors }
}

// ============================================================================
// Query Compliance Events
// ============================================================================

export function getComplianceEvents(
  teamName: string,
  filter?: {
    type?: ComplianceEventType
    agentId?: string
    taskId?: string
    after?: number
    before?: number
  },
): ComplianceEvent[] {
  const logPath = getComplianceLogPath(teamName)
  if (!fs.existsSync(logPath)) return []

  const content = fs.readFileSync(logPath, 'utf-8')
  const lines = content.trim().split('\n').filter(Boolean)

  const events: ComplianceEvent[] = []

  for (const line of lines) {
    try {
      const entry: ComplianceEvent = JSON.parse(line)
      if (filter) {
        if (filter.type && entry.type !== filter.type) continue
        if (filter.agentId && entry.agentId !== filter.agentId) continue
        if (filter.taskId && entry.taskId !== filter.taskId) continue
        if (filter.after && entry.timestamp < filter.after) continue
        if (filter.before && entry.timestamp > filter.before) continue
      }
      events.push(entry)
    } catch {
      // Skip malformed lines
    }
  }

  return events
}

// ============================================================================
// Formatting
// ============================================================================

export function formatComplianceEvent(event: ComplianceEvent): string {
  const lines = [
    `[${event.id}] ${event.type}`,
    `  Team: ${event.teamName}`,
    `  Time: ${new Date(event.timestamp).toLocaleString()}`,
    `  Action: ${event.action}`,
  ]

  if (event.agentId) lines.push(`  Agent: ${event.agentId}`)
  if (event.taskId) lines.push(`  Task: ${event.taskId}`)

  lines.push(`  Details: ${JSON.stringify(event.details)}`)

  if (event.signature) {
    lines.push(`  Signature: ${event.signature.slice(0, 16)}...`)
    lines.push(`  Valid: ${event.signature ? 'Yes' : 'No'}`)
  }

  return lines.join('\n')
}

export function formatComplianceSummary(teamName: string): string {
  const events = getComplianceEvents(teamName)
  const verification = verifyComplianceLog(teamName)

  const lines = [
    `=== Compliance Log: ${teamName} ===`,
    ``,
    `Total events: ${events.length}`,
    `Valid signatures: ${verification.valid}`,
    `Invalid signatures: ${verification.invalid}`,
    `Missing signatures: ${verification.missingSignature}`,
  ]

  if (verification.errors.length > 0) {
    lines.push('', 'Errors:')
    for (const err of verification.errors.slice(0, 10)) {
      lines.push(`  - ${err}`)
    }
  }

  if (events.length > 0) {
    lines.push('', 'Recent events:')
    const recent = events.slice(-5)
    for (const event of recent) {
      const icon = event.signature ? '✅' : '⚠️'
      lines.push(`  ${icon} [${event.type}] ${event.action}`)
    }
  }

  return lines.join('\n')
}
