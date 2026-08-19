/**
 * Memory Sharing Tokens v2
 *
 * Signed, expiring tokens for sharing agent context across sessions,
 * processes, or machines. Uses HMAC-SHA256 for integrity, base64url
 * encoding for transport, supports scope restrictions, expiration, and
 * automatic secret redaction on export.
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// ============================================================================
// Types
// ============================================================================

/**
 * Scope controlling what kind of context a token grants access to.
 */
export type TokenScope =
  | 'session:read'
  | 'session:write'
  | 'memory:read'
  | 'memory:write'
  | 'scratchpad:read'
  | 'scratchpad:write'
  | 'full'

/**
 * Options for creating a new sharing token.
 */
export interface CreateTokenOptions {
  /** Scopes granted by this token (default: ['session:read']) */
  scopes?: TokenScope[]
  /** Expiration as a Date or TTL in milliseconds from now (default: 1 hour) */
  expiresIn?: Date | number
  /** Optional human-readable label for the token */
  label?: string
  /** Optional issuer identifier */
  issuer?: string
  /** Optional audience (intended consumer) identifier */
  audience?: string
}

/**
 * A signed sharing token containing metadata and payload.
 */
export interface SharingToken {
  /** The raw base64url-encoded token string (header.payload.signature) */
  raw: string
  /** Unique token identifier */
  id: string
  /** Issued-at timestamp (seconds since epoch) */
  iat: number
  /** Expiration timestamp (seconds since epoch) */
  exp: number
  /** Granted scopes */
  scopes: TokenScope[]
  /** Optional label */
  label?: string
  /** Optional issuer */
  issuer?: string
  /** Optional audience */
  audience?: string
}

/**
 * Snapshot of agent/session state carried inside a token.
 */
export interface ContextState {
  /** Session identifier this state belongs to */
  sessionId: string
  /** Working directory */
  cwd: string
  /** Current conversation messages (sanitized) */
  messages: Array<Record<string, unknown>>
  /** Scratchpad contents per agent */
  scratchpads: Record<string, string>
  /** Key/value memory facts */
  memoryFacts: Array<{ key: string; value: string; timestamp: string }>
  /** Files modified in this session */
  modifiedFiles: string[]
  /** Arbitrary metadata */
  metadata: Record<string, unknown>
  /** When this snapshot was taken (ISO timestamp) */
  capturedAt: string
}

/**
 * Token payload structure (signed).
 */
interface TokenPayload {
  /** Token ID */
  jti: string
  /** Issued at (seconds since epoch) */
  iat: number
  /** Expiration (seconds since epoch) */
  exp: number
  /** Scopes */
  scopes: TokenScope[]
  /** Issuer */
  iss?: string
  /** Audience */
  aud?: string
  /** Label */
  label?: string
  /** The context state being shared */
  state: ContextState
}

/**
 * Header portion of the JWT-like token.
 */
interface TokenHeader {
  alg: 'HS256'
  typ: 'LCT'
}

/**
 * Result of validating a token.
 */
export interface ValidationResult {
  /** Whether the token is structurally valid, unexpired, and correctly signed */
  valid: boolean
  /** Parsed token if valid */
  token?: SharingToken
  /** Parsed payload if valid */
  payload?: TokenPayload
  /** Error code if invalid */
  error?: 'malformed' | 'bad-signature' | 'expired' | 'invalid-scope' | 'wrong-audience'
  /** Human-readable error message */
  message?: string
}

// ============================================================================
// Helpers
// ============================================================================

const DEFAULT_SECRET_PATH = path.join(os.homedir(), '.levelcode', 'sharing-secret.key')

function getOrCreateMasterKey(): Buffer {
  const dir = path.dirname(DEFAULT_SECRET_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (fs.existsSync(DEFAULT_SECRET_PATH)) {
    return fs.readFileSync(DEFAULT_SECRET_PATH)
  }
  const key = crypto.randomBytes(32)
  fs.writeFileSync(DEFAULT_SECRET_PATH, key, { mode: 0o600 })
  return key
}

function base64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf-8') : buf
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): Buffer {
  let s = str.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return Buffer.from(s, 'base64')
}

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'openai', re: /sk-[A-Za-z0-9]{20,}/g },
  { name: 'anthropic', re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: 'github', re: /ghp_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}/g },
  { name: 'aws', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'jwt', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'generic-key', re: /(?:api[_-]?key|secret|token|password|auth)["']?\s*[:=]\s*["']([A-Za-z0-9_-]{16,})["']/gi },
  { name: 'bearer', re: /Bearer\s+[A-Za-z0-9._-]{20,}/g },
]

// ============================================================================
// MemoryTokenManager
// ============================================================================

/**
 * Creates and validates signed, expiring, scope-restricted memory sharing
 * tokens. Tokens follow a JWT-like three-segment structure:
 * `base64url(header).base64url(payload).base64url(HMAC-SHA256)`.
 *
 * The master signing key is stored at `~/.levelcode/sharing-secret.key`
 * (auto-generated on first use with mode 0600).
 */
export class MemoryTokenManager {
  private masterKey: Buffer
  private revokedTokens: Set<string> = new Set()

  /**
   * @param masterKey - Optional explicit HMAC key (32 bytes). If omitted, a
   *   per-machine key is loaded from (or generated at)
   *   `~/.levelcode/sharing-secret.key`.
   */
  constructor(masterKey?: Buffer) {
    this.masterKey = masterKey ?? getOrCreateMasterKey()
  }

  /**
   * Create a new signed sharing token wrapping a context state snapshot.
   *
   * @param scope - Primary scope (convenience; scopes can also be passed in options)
   * @param options - Token creation options (expiration, scopes, labels, etc.)
   * @returns The signed token descriptor
   */
  createToken(scope: TokenScope, options: CreateTokenOptions = {}): SharingToken {
    const scopes = options.scopes ?? [scope]
    const now = Math.floor(Date.now() / 1000)
    let exp: number

    if (options.expiresIn instanceof Date) {
      exp = Math.floor(options.expiresIn.getTime() / 1000)
    } else if (typeof options.expiresIn === 'number') {
      exp = now + Math.floor(options.expiresIn / 1000)
    } else {
      exp = now + 3600
    }

    const id = `ltk_${crypto.randomBytes(12).toString('hex')}`
    const payload: TokenPayload = {
      jti: id,
      iat: now,
      exp,
      scopes,
      iss: options.issuer,
      aud: options.audience,
      label: options.label,
      state: {
        sessionId: '',
        cwd: '',
        messages: [],
        scratchpads: {},
        memoryFacts: [],
        modifiedFiles: [],
        metadata: {},
        capturedAt: new Date().toISOString(),
      },
    }

    const header: TokenHeader = { alg: 'HS256', typ: 'LCT' }
    const headerB64 = base64urlEncode(JSON.stringify(header))
    const payloadB64 = base64urlEncode(JSON.stringify(payload))
    const signingInput = `${headerB64}.${payloadB64}`
    const sig = crypto.createHmac('sha256', this.masterKey).update(signingInput).digest()
    const sigB64 = base64urlEncode(sig)
    const raw = `${signingInput}.${sigB64}`

    return {
      raw,
      id,
      iat: now,
      exp,
      scopes,
      label: options.label,
      issuer: options.issuer,
      audience: options.audience,
    }
  }

  /**
   * Export a context state into a token payload, applying automatic secret
   * redaction before serialization.
   *
   * @param state - The raw context state to export
   * @returns A sanitized TokenPayload fragment (state only) suitable for embedding
   */
  exportContext(state: ContextState): TokenPayload {
    const sanitized = this.redactSecrets({
      jti: '',
      iat: 0,
      exp: 0,
      scopes: [],
      state,
    })
    return sanitized
  }

  /**
   * Import (parse and validate) a token string, returning the contained
   * context state if valid.
   *
   * @param token - The raw token string
   * @returns The reconstructed ContextState
   * @throws If the token is invalid, expired, or fails signature verification
   */
  importToken(token: string): ContextState {
    const result = this.validateToken(token)
    if (!result.valid || !result.payload) {
      throw new Error(`Token validation failed: ${result.error} - ${result.message}`)
    }
    return result.payload.state
  }

  /**
   * Redact known secret patterns from string fields within a token payload.
   * Modifies a copy and returns it; the original is not mutated.
   *
   * @param payload - The payload to sanitize
   * @returns A new payload with secrets replaced by `[REDACTED:<type>]`
   */
  redactSecrets(payload: TokenPayload): TokenPayload {
    const copy: TokenPayload = JSON.parse(JSON.stringify(payload))

    const redactString = (s: string): string => {
      let out = s
      for (const { name, re } of SECRET_PATTERNS) {
        out = out.replace(re, `[REDACTED:${name}]`)
      }
      return out
    }

    const walk = (obj: unknown): unknown => {
      if (typeof obj === 'string') return redactString(obj)
      if (Array.isArray(obj)) return obj.map(walk)
      if (obj && typeof obj === 'object') {
        const result: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          if (/(secret|token|key|password|auth)/i.test(k)) {
            result[k] = '[REDACTED:sensitive-field]'
          } else {
            result[k] = walk(v)
          }
        }
        return result
      }
      return obj
    }

    copy.state = walk(copy.state) as ContextState
    return copy
  }

  /**
   * Validate a token string — check structure, signature, expiration,
   * and revocation status.
   *
   * @param token - Raw token string
   * @param expectedAudience - Optional audience to require
   * @returns ValidationResult with valid flag, parsed data, and error info
   */
  validateToken(token: string, expectedAudience?: string): ValidationResult {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        return { valid: false, error: 'malformed', message: 'Token must have 3 segments' }
      }

      const [headerB64, payloadB64, sigB64] = parts
      const signingInput = `${headerB64}.${payloadB64}`

      const expectedSig = crypto
        .createHmac('sha256', this.masterKey)
        .update(signingInput)
        .digest()
      const actualSig = base64urlDecode(sigB64!)

      if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
        return { valid: false, error: 'bad-signature', message: 'HMAC signature does not match' }
      }

      const header = JSON.parse(base64urlDecode(headerB64!).toString('utf-8')) as TokenHeader
      if (header.alg !== 'HS256' || header.typ !== 'LCT') {
        return { valid: false, error: 'malformed', message: 'Unsupported token header' }
      }

      const payload = JSON.parse(base64urlDecode(payloadB64!).toString('utf-8')) as TokenPayload
      const now = Math.floor(Date.now() / 1000)
      if (payload.exp <= now) {
        return { valid: false, error: 'expired', message: `Token expired at ${new Date(payload.exp * 1000).toISOString()}` }
      }

      if (expectedAudience && payload.aud !== expectedAudience) {
        return { valid: false, error: 'wrong-audience', message: `Expected audience ${expectedAudience}` }
      }

      if (this.revokedTokens.has(payload.jti)) {
        return { valid: false, error: 'malformed', message: 'Token has been revoked' }
      }

      const parsed: SharingToken = {
        raw: token,
        id: payload.jti,
        iat: payload.iat,
        exp: payload.exp,
        scopes: payload.scopes,
        label: payload.label,
        issuer: payload.iss,
        audience: payload.aud,
      }

      return { valid: true, token: parsed, payload }
    } catch (err) {
      return {
        valid: false,
        error: 'malformed',
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /**
   * Revoke a token by ID so it can no longer be imported/validated.
   * @param tokenId - The `jti` of the token to revoke
   */
  revokeToken(tokenId: string): void {
    this.revokedTokens.add(tokenId)
  }

  /**
   * Encode a complete token from a payload (signs and returns raw string).
   *
   * @param payload - The payload to encode (will be signed)
   * @returns Raw token string
   */
  encodePayload(payload: TokenPayload): string {
    const header: TokenHeader = { alg: 'HS256', typ: 'LCT' }
    const headerB64 = base64urlEncode(JSON.stringify(header))
    const payloadB64 = base64urlEncode(JSON.stringify(payload))
    const signingInput = `${headerB64}.${payloadB64}`
    const sig = crypto.createHmac('sha256', this.masterKey).update(signingInput).digest()
    return `${signingInput}.${base64urlEncode(sig)}`
  }
}

let defaultManager: MemoryTokenManager | null = null

export function getDefaultMemoryTokenManager(): MemoryTokenManager {
  if (!defaultManager) defaultManager = new MemoryTokenManager()
  return defaultManager
}

export function resetDefaultMemoryTokenManager(): void {
  defaultManager = null
}
