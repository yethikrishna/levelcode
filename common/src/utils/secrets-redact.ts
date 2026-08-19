/**
 * A single detected secret match within text.
 */
export interface SecretMatch {
  /** Type/category of the detected secret */
  type: SecretType
  /** The matched secret value (before redaction) */
  value: string
  /** Starting index in the original text */
  start: number
  /** Ending index in the original text */
  end: number
  /** Replacement string used for redaction */
  replacement: string
}

/**
 * Known secret categories with pattern-based detection.
 */
export type SecretType =
  | 'openai-api-key'
  | 'anthropic-api-key'
  | 'github-pat'
  | 'google-api-key'
  | 'aws-access-key'
  | 'aws-secret-key'
  | 'stripe-secret-key'
  | 'stripe-publishable-key'
  | 'slack-token'
  | 'slack-webhook'
  | 'jwt-token'
  | 'generic-api-key'
  | 'bearer-token'
  | 'basic-auth'
  | 'private-key'
  | 'env-assignment'
  | 'password-field'
  | 'connection-string'

/**
 * Redaction pattern definition.
 */
interface RedactionPattern {
  type: SecretType
  regex: RegExp
  /** Either a static replacement string or a function to generate replacement */
  replacement: string | ((match: string, type: SecretType) => string)
  /** Human-readable description of what this pattern catches */
  description: string
}

/**
 * Options controlling redaction behavior.
 */
export interface RedactOptions {
  /** Custom replacement string for redacted secrets (default: '[REDACTED:<type>]') */
  replacement?: string | ((type: SecretType, match: string) => string)
  /** Additional patterns to include beyond the built-in set */
  extraPatterns?: Array<{ type: SecretType; pattern: RegExp; description?: string }>
  /** Types to exclude from redaction */
  excludeTypes?: SecretType[]
  /** Whether to also replace values in environment variable assignments (default: true) */
  redactEnvAssignments?: boolean
  /** Redaction placeholder style */
  style?: 'labeled' | 'masked' | 'removed'
}

const DEFAULT_REDACT_OPTIONS: Required<Omit<RedactOptions, 'replacement' | 'extraPatterns' | 'excludeTypes'>> &
  Pick<RedactOptions, 'replacement' | 'extraPatterns' | 'excludeTypes'> = {
  extraPatterns: [],
  excludeTypes: [],
  redactEnvAssignments: true,
  style: 'labeled',
}

/**
 * Default replacement: replace with a labeled placeholder like [REDACTED:openai-api-key].
 */
function defaultReplacement(type: SecretType, _match: string, style: RedactOptions['style']): string {
  switch (style) {
    case 'masked':
      return '********'
    case 'removed':
      return ''
    case 'labeled':
    default:
      return `[REDACTED:${type}]`
  }
}

/**
 * Built-in secret detection patterns covering common API key formats.
 *
 * Patterns are ordered from most specific to least specific to avoid
 * double-matching (e.g., a GitHub PAT should be caught before generic patterns).
 */
const BUILTIN_PATTERNS: RedactionPattern[] = [
  {
    type: 'openai-api-key',
    regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    replacement: (m) => defaultReplacement('openai-api-key', m, 'labeled'),
    description: 'OpenAI API key (sk-...)',
  },
  {
    type: 'anthropic-api-key',
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    replacement: (m) => defaultReplacement('anthropic-api-key', m, 'labeled'),
    description: 'Anthropic API key (sk-ant-...)',
  },
  {
    type: 'github-pat',
    regex: /\b(gh[pousr]_[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{82,})\b/g,
    replacement: (m) => defaultReplacement('github-pat', m, 'labeled'),
    description: 'GitHub personal access token (ghp_/gho_/ghu_/ghs_/ghr_/github_pat_)',
  },
  {
    type: 'google-api-key',
    regex: /\bAIza[A-Za-z0-9_-]{35}\b/g,
    replacement: (m) => defaultReplacement('google-api-key', m, 'labeled'),
    description: 'Google API key (AIza...)',
  },
  {
    type: 'aws-access-key',
    regex: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replacement: (m) => defaultReplacement('aws-access-key', m, 'labeled'),
    description: 'AWS access key ID (AKIA.../ASIA...)',
  },
  {
    type: 'stripe-secret-key',
    regex: /\bsk_(?:live|test)_[0-9A-Za-z]{24,}\b/g,
    replacement: (m) => defaultReplacement('stripe-secret-key', m, 'labeled'),
    description: 'Stripe secret key (sk_live_/sk_test_)',
  },
  {
    type: 'stripe-publishable-key',
    regex: /\bpk_(?:live|test)_[0-9A-Za-z]{24,}\b/g,
    replacement: (m) => defaultReplacement('stripe-publishable-key', m, 'labeled'),
    description: 'Stripe publishable key (pk_live_/pk_test_)',
  },
  {
    type: 'slack-token',
    regex: /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/g,
    replacement: (m) => defaultReplacement('slack-token', m, 'labeled'),
    description: 'Slack API token (xoxb-/xoxp-/xoxa-/xoxr-/xoxs-)',
  },
  {
    type: 'slack-webhook',
    regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g,
    replacement: (m) => defaultReplacement('slack-webhook', m, 'labeled'),
    description: 'Slack incoming webhook URL',
  },
  {
    type: 'jwt-token',
    regex: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    replacement: (m) => defaultReplacement('jwt-token', m, 'labeled'),
    description: 'JWT token (eyJ...eyJ....)',
  },
  {
    type: 'bearer-token',
    regex: /\b(?:Bearer|bearer|token|Token)\s+([A-Za-z0-9._~+/=-]{20,})\b/g,
    replacement: (_m) => `Bearer ${defaultReplacement('bearer-token', '', 'labeled')}`,
    description: 'Authorization Bearer token header',
  },
  {
    type: 'basic-auth',
    regex: /\b(?:Basic|basic)\s+([A-Za-z0-9+/=]{20,})\b/g,
    replacement: (_m) => `Basic ${defaultReplacement('basic-auth', '', 'labeled')}`,
    description: 'HTTP Basic auth header',
  },
  {
    type: 'private-key',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    replacement: () => defaultReplacement('private-key', '', 'labeled'),
    description: 'PKCS/OpenSSH private key block',
  },
  {
    type: 'connection-string',
    regex: /\b(?:postgres|postgresql|mysql|mongodb|redis|amqp|mongodb\+srv):\/\/[^\s"'<>]+:[^\s"'<>]+@[^\s"'<>]+/g,
    replacement: (m) => {
      try {
        const url = new URL(m.replace(/^([a-z+]+):\/\//, 'http://'))
        const proto = m.split('://')[0]
        return `${proto}://${defaultReplacement('connection-string', '', 'labeled')}@${url.host}${url.pathname}`
      } catch {
        return defaultReplacement('connection-string', m, 'labeled')
      }
    },
    description: 'Database/service connection string with embedded credentials',
  },
  {
    type: 'password-field',
    regex: /"(?:password|passwd|pwd|secret|token|api[_-]?key)"\s*:\s*"([^"]{6,})"/gi,
    replacement: (m) => {
      const colonIdx = m.indexOf(':')
      if (colonIdx === -1) return defaultReplacement('password-field', m, 'labeled')
      return m.slice(0, colonIdx + 1) + ` "${defaultReplacement('password-field', '', 'labeled')}"`
    },
    description: 'JSON password/secret/token fields',
  },
]

/**
 * Patterns for detecting environment variable assignments that contain secrets.
 */
const ENV_ASSIGNMENT_PATTERNS: RedactionPattern[] = [
  {
    type: 'env-assignment',
    regex: /\b(?:export\s+)?(?:[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY|ACCESS_KEY|CREDENTIALS|AUTH))\s*=\s*["']?([^\s"'`;&|<>]{8,})["']?/g,
    replacement: (m) => {
      const eqIdx = m.indexOf('=')
      if (eqIdx === -1) return defaultReplacement('env-assignment', m, 'labeled')
      const before = m.slice(0, eqIdx + 1)
      return `${before}${defaultReplacement('env-assignment', '', 'labeled')}`
    },
    description: 'Environment variable assignment with secret-like name',
  },
]

/**
 * Generic "looks like an API key" fallback pattern.
 * Applied only if no specific pattern matches and the context suggests a key.
 */
const GENERIC_KEY_PATTERN: RedactionPattern = {
  type: 'generic-api-key',
  regex: /\b(?:api[_-]?key|apikey|secret|token)["']?\s*[:=]\s*["']?([A-Za-z0-9._~+/=-]{24,})["']?/gi,
  replacement: (_m) => defaultReplacement('generic-api-key', '', 'labeled'),
  description: 'Generic API key/secret/token assignment',
}

/**
 * Result of a redaction operation containing both the redacted text
 * and an audit trail of detected secrets.
 */
export interface RedactResult {
  /** The redacted text with secrets replaced */
  redactedText: string
  /** All detected secret matches in the original text */
  matches: SecretMatch[]
  /** Total number of secrets found and replaced */
  totalRedacted: number
  /** Breakdown of counts by secret type */
  countByType: Record<string, number>
}

/**
 * Audit log entry for a redaction event.
 */
export interface RedactionAuditEntry {
  /** Timestamp of the redaction */
  timestamp: string
  /** Number of secrets redacted */
  count: number
  /** Types of secrets detected */
  types: SecretType[]
  /** Source context (e.g., 'llm-request', 'tool-output') */
  source?: string
  /** Character length of the original text before redaction */
  originalLength: number
  /** Character length of the redacted text */
  redactedLength: number
}

/**
 * In-memory audit log of all redaction events.
 */
const auditLog: RedactionAuditEntry[] = []

/**
 * Maximum number of audit entries to keep in memory.
 */
const MAX_AUDIT_ENTRIES = 1000

/**
 * Detect and redact secrets from text before sending to LLM providers.
 *
 * Recognizes common API key formats including:
 * - OpenAI keys (sk-...)
 * - Anthropic keys (sk-ant-...)
 * - GitHub PATs (ghp_, gho_, github_pat_...)
 * - Google API keys (AIza...)
 * - AWS keys (AKIA..., ASIA...)
 * - Stripe keys (sk_live_, pk_test_...)
 * - Slack tokens/webhooks
 * - JWTs
 * - HTTP Bearer/Basic auth headers
 * - Private key blocks
 * - Database connection strings with credentials
 * - JSON password/secret fields
 * - Environment variable assignments with secret-like names
 *
 * @param text - The input text to scan and redact
 * @param options - Redaction configuration options
 * @returns RedactResult with redacted text and audit information
 *
 * @example
 * ```ts
 * const result = redactSecrets('My key is sk-abc123def456...')
 * console.log(result.redactedText) // "My key is [REDACTED:openai-api-key]"
 * ```
 */
export function redactSecrets(
  text: string,
  options?: RedactOptions & { source?: string },
): RedactResult {
  if (!text || text.length === 0) {
    return {
      redactedText: text,
      matches: [],
      totalRedacted: 0,
      countByType: {},
    }
  }

  const opts = { ...DEFAULT_REDACT_OPTIONS, ...options }
  const style = opts.style ?? 'labeled'
  const excludeTypes = new Set(opts.excludeTypes ?? [])

  const allPatterns: RedactionPattern[] = [
    ...BUILTIN_PATTERNS,
    ...(opts.redactEnvAssignments ? ENV_ASSIGNMENT_PATTERNS : []),
    GENERIC_KEY_PATTERN,
    ...(opts.extraPatterns ?? []).map((p) => ({
      type: p.type,
      regex: p.pattern,
      replacement: (m: string) => defaultReplacement(p.type, m, style),
      description: p.description ?? 'Custom pattern',
    })),
  ]

  const matches: SecretMatch[] = []
  const matchedRanges: Array<{ start: number; end: number }> = []

  for (const pattern of allPatterns) {
    if (excludeTypes.has(pattern.type)) continue

    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
      const start = match.index
      const end = start + match[0].length

      const overlaps = matchedRanges.some(
        (range) => !(end <= range.start || start >= range.end),
      )
      if (overlaps) {
        regex.lastIndex = start + 1
        continue
      }

      const value = match[0]
      let replacement: string
      if (typeof pattern.replacement === 'string') {
        replacement = pattern.replacement
      } else if (typeof opts.replacement === 'function') {
        replacement = opts.replacement(pattern.type, value)
      } else if (typeof opts.replacement === 'string') {
        replacement = opts.replacement
      } else {
        replacement = defaultReplacement(pattern.type, value, style)
      }

      matches.push({
        type: pattern.type,
        value,
        start,
        end,
        replacement,
      })
      matchedRanges.push({ start, end })

      if (match[0].length === 0) {
        regex.lastIndex++
      }
    }
  }

  matches.sort((a, b) => a.start - b.start)

  let redactedText = ''
  let lastIndex = 0
  const countByType: Record<string, number> = {}

  for (const m of matches) {
    redactedText += text.slice(lastIndex, m.start)
    redactedText += m.replacement
    lastIndex = m.end
    countByType[m.type] = (countByType[m.type] ?? 0) + 1
  }
  redactedText += text.slice(lastIndex)

  const result: RedactResult = {
    redactedText,
    matches,
    totalRedacted: matches.length,
    countByType,
  }

  const entry: RedactionAuditEntry = {
    timestamp: new Date().toISOString(),
    count: matches.length,
    types: matches.map((m) => m.type),
    source: opts.source,
    originalLength: text.length,
    redactedLength: redactedText.length,
  }

  auditLog.push(entry)
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.shift()
  }

  return result
}

/**
 * Convenience wrapper: redact secrets and return only the redacted text string.
 */
export function redactSecretsText(text: string, options?: RedactOptions): string {
  return redactSecrets(text, options).redactedText
}

/**
 * Retrieve the redaction audit log.
 * Returns a copy to prevent external mutation.
 */
export function getRedactionAuditLog(): RedactionAuditEntry[] {
  return [...auditLog]
}

/**
 * Clear the redaction audit log (useful for testing).
 */
export function clearRedactionAuditLog(): void {
  auditLog.length = 0
}

/**
 * Get summary statistics about redactions that have occurred.
 */
export function getRedactionStats(): {
  totalRedactions: number
  entriesCount: number
  redactionsByType: Record<string, number>
} {
  const redactionsByType: Record<string, number> = {}
  let totalRedactions = 0

  for (const entry of auditLog) {
    totalRedactions += entry.count
    for (const type of entry.types) {
      redactionsByType[type] = (redactionsByType[type] ?? 0) + 1
    }
  }

  return {
    totalRedactions,
    entriesCount: auditLog.length,
    redactionsByType,
  }
}

/**
 * Add a custom redaction pattern at runtime.
 * Patterns added this way will be checked after built-in patterns.
 */
export function addRedactionPattern(
  type: SecretType,
  pattern: RegExp,
  description?: string,
): void {
  BUILTIN_PATTERNS.push({
    type,
    regex: new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'),
    replacement: (m) => defaultReplacement(type, m, 'labeled'),
    description: description ?? `Custom pattern for ${type}`,
  })
}
