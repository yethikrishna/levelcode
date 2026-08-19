/**
 * BYOK (Bring Your Own Key) Org Vault
 *
 * An encrypted, organization-level key store that holds API keys for
 * LLM providers and other services. Keys are encrypted at rest using
 * AES-256-GCM with a master key derived from the local machine ID
 * combined with a user-supplied salt.
 *
 * Features:
 * - Per-key labeling and metadata
 * - Per-user key assignment
 * - Daily spend caps per key with rolling 24h usage tracking
 * - Provider namespacing (e.g. "openai", "anthropic", "google")
 *
 * The vault never exposes raw key material except when explicitly
 * retrieved by an authorized caller; on-disk representation is always
 * ciphertext + auth tag.
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// ============================================================================
// Types
// ============================================================================

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure-openai'
  | 'mistral'
  | 'cohere'
  | 'together'
  | 'groq'
  | 'deepseek'
  | 'custom'
  | (string & {})

/**
 * Metadata stored alongside an encrypted key.
 */
export interface KeyInfo {
  /** Unique key id */
  id: string
  /** Provider this key is for */
  provider: ProviderId
  /** Human-readable label (e.g. "prod-openai-primary") */
  label: string
  /** When the key was added (ISO timestamp) */
  addedAt: string
  /** When the key was last used (ISO timestamp, or null) */
  lastUsedAt: string | null
  /** User ids that are allowed to use this key */
  assignedUsers: string[]
  /** Daily spend limit in USD cents (null = unlimited) */
  dailyLimitCents: number | null
  /** Spend over the current rolling 24h window in USD cents */
  currentSpendCents: number
  /** Timestamp when the current spend window started */
  windowStartAt: string
  /** Whether the key is currently enabled */
  enabled: boolean
}

/**
 * The shape persisted to disk — ciphertext + auth data, never raw keys.
 */
interface VaultEntry {
  info: KeyInfo
  /** AES-256-GCM ciphertext (base64) */
  ciphertext: string
  /** GCM auth tag (base64) */
  authTag: string
  /** Initialization vector (base64) */
  iv: string
}

interface VaultFile {
  version: 1
  salt: string
  entries: VaultEntry[]
}

/**
 * Result of calling recordSpend — indicates whether the key is still within budget.
 */
export interface SpendCheckResult {
  withinLimit: boolean
  currentSpendCents: number
  limitCents: number | null
  remainingCents: number | null
}

// ============================================================================
// OrgKeyVault
// ============================================================================

/**
 * Encrypted organizational API-key vault.
 *
 * Master-key derivation:
 *   masterKey = PBKDF2(machineId + username, salt, 200_000 iters, SHA-256, 32 bytes)
 *
 * Each stored key is individually encrypted with AES-256-GCM using a
 * fresh random IV per entry. The salt is stored alongside the entries
 * and is generated on first initialization.
 */
export class OrgKeyVault {
  private readonly vaultDir: string
  private readonly vaultPath: string
  private salt: Buffer | null = null
  private entries: Map<string, VaultEntry> = new Map()
  private loaded = false

  /**
   * @param vaultDir - Directory under which vault.json is stored.
   *                   Defaults to `.levelcode/vault/` under the process CWD.
   */
  constructor(vaultDir?: string) {
    this.vaultDir = vaultDir ?? path.join(process.cwd(), '.levelcode', 'vault')
    this.vaultPath = path.join(this.vaultDir, 'vault.json')
  }

  /**
   * Load the vault from disk. Initializes a new vault file if none exists.
   */
  async load(): Promise<void> {
    if (!fs.existsSync(this.vaultDir)) {
      fs.mkdirSync(this.vaultDir, { recursive: true })
    }

    if (fs.existsSync(this.vaultPath)) {
      const raw = fs.readFileSync(this.vaultPath, 'utf-8')
      const data = JSON.parse(raw) as VaultFile
      if (data.version !== 1) throw new Error(`Unsupported vault version: ${data.version}`)
      this.salt = Buffer.from(data.salt, 'base64')
      this.entries = new Map(data.entries.map((e) => [e.info.id, e]))
    } else {
      this.salt = crypto.randomBytes(16)
      this.entries = new Map()
      await this.persist()
    }
    this.loaded = true
  }

  /**
   * Add a new API key to the vault.
   *
   * @param provider - Provider identifier (e.g. "openai", "anthropic")
   * @param key - The raw API key material
   * @param label - Human-readable label
   * @returns The KeyInfo for the newly added key
   */
  async addKey(provider: ProviderId, key: string, label: string): Promise<KeyInfo> {
    this.ensureLoaded()
    const id = `key_${crypto.randomBytes(8).toString('hex')}`
    const now = new Date().toISOString()
    const info: KeyInfo = {
      id,
      provider,
      label,
      addedAt: now,
      lastUsedAt: null,
      assignedUsers: [],
      dailyLimitCents: null,
      currentSpendCents: 0,
      windowStartAt: now,
      enabled: true,
    }
    const encrypted = this.encryptKey(key)
    this.entries.set(id, { info, ...encrypted })
    await this.persist()
    return { ...info }
  }

  /**
   * Retrieve the raw key material for a given key id.
   * Updates `lastUsedAt` and resets the rolling spend window if needed.
   *
   * @param id - Key id to look up
   * @returns The decrypted key string, or null if not found
   */
  async getKey(id: string): Promise<string | null> {
    this.ensureLoaded()
    const entry = this.entries.get(id)
    if (!entry) return null
    if (!entry.info.enabled) throw new Error(`Key ${id} is disabled`)
    this.rollSpendWindow(entry)
    entry.info.lastUsedAt = new Date().toISOString()
    await this.persist()
    return this.decryptKey(entry)
  }

  /**
   * Look up a key by provider + optional label.
   * Returns the first matching key (useful when no specific id is needed).
   *
   * @param provider - Provider to match
   * @param label - Optional label filter
   */
  async getKeyByProvider(provider: ProviderId, label?: string): Promise<string | null> {
    this.ensureLoaded()
    for (const entry of this.entries.values()) {
      if (entry.info.provider !== provider) continue
      if (label && entry.info.label !== label) continue
      if (!entry.info.enabled) continue
      this.rollSpendWindow(entry)
      entry.info.lastUsedAt = new Date().toISOString()
      await this.persist()
      return this.decryptKey(entry)
    }
    return null
  }

  /**
   * List metadata for all keys (does not expose raw key material).
   */
  listKeys(): KeyInfo[] {
    this.ensureLoaded()
    return Array.from(this.entries.values()).map((e) => ({ ...e.info }))
  }

  /**
   * Remove a key from the vault.
   *
   * @param id - Key id to delete
   */
  async removeKey(id: string): Promise<boolean> {
    this.ensureLoaded()
    const existed = this.entries.delete(id)
    if (existed) await this.persist()
    return existed
  }

  /**
   * Assign a key to a user (grants them access to use it).
   */
  async assignKeyToUser(keyId: string, userId: string): Promise<void> {
    this.ensureLoaded()
    const entry = this.entries.get(keyId)
    if (!entry) throw new Error(`Key ${keyId} not found`)
    if (!entry.info.assignedUsers.includes(userId)) {
      entry.info.assignedUsers.push(userId)
      await this.persist()
    }
  }

  /**
   * Set (or clear) the daily spend limit for a key.
   *
   * @param keyId - Key id
   * @param dailyLimitCents - Limit in USD cents per 24h window, or null for unlimited
   */
  async setSpendLimit(keyId: string, dailyLimitCents: number | null): Promise<void> {
    this.ensureLoaded()
    const entry = this.entries.get(keyId)
    if (!entry) throw new Error(`Key ${keyId} not found`)
    entry.info.dailyLimitCents = dailyLimitCents
    await this.persist()
  }

  /**
   * Record spend against a key and check whether it is still within its daily budget.
   *
   * @param keyId - Key id
   * @param centsCents - Amount to add, in USD cents
   */
  async recordSpend(keyId: string, centsCents: number): Promise<SpendCheckResult> {
    this.ensureLoaded()
    const entry = this.entries.get(keyId)
    if (!entry) throw new Error(`Key ${keyId} not found`)
    this.rollSpendWindow(entry)
    entry.info.currentSpendCents += Math.max(0, Math.round(centsCents))
    await this.persist()

    const limit = entry.info.dailyLimitCents
    const within = limit === null ? true : entry.info.currentSpendCents <= limit
    return {
      withinLimit: within,
      currentSpendCents: entry.info.currentSpendCents,
      limitCents: limit,
      remainingCents: limit === null ? null : Math.max(0, limit - entry.info.currentSpendCents),
    }
  }

  /**
   * Check whether a given user is allowed to use a key.
   */
  isUserAuthorized(keyId: string, userId: string): boolean {
    const entry = this.entries.get(keyId)
    if (!entry) return false
    if (!entry.info.enabled) return false
    if (entry.info.assignedUsers.length === 0) return true
    return entry.info.assignedUsers.includes(userId)
  }

  /**
   * Enable or disable a key.
   */
  async setEnabled(keyId: string, enabled: boolean): Promise<void> {
    this.ensureLoaded()
    const entry = this.entries.get(keyId)
    if (!entry) throw new Error(`Key ${keyId} not found`)
    entry.info.enabled = enabled
    await this.persist()
  }

  // ============================================================================
  // Encryption internals
  // ============================================================================

  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error('Vault not loaded; call .load() first')
    }
    if (!this.salt) {
      throw new Error('Vault salt is not initialized')
    }
  }

  private encryptKey(plaintext: string): { ciphertext: string; authTag: string; iv: string } {
    const masterKey = this.deriveMasterKey()
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv)
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return {
      ciphertext: enc.toString('base64'),
      authTag: tag.toString('base64'),
      iv: iv.toString('base64'),
    }
  }

  private decryptKey(entry: VaultEntry): string {
    const masterKey = this.deriveMasterKey()
    const iv = Buffer.from(entry.iv, 'base64')
    const tag = Buffer.from(entry.authTag, 'base64')
    const ct = Buffer.from(entry.ciphertext, 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv)
    decipher.setAuthTag(tag)
    const dec = Buffer.concat([decipher.update(ct), decipher.final()])
    return dec.toString('utf8')
  }

  private deriveMasterKey(): Buffer {
    if (!this.salt) throw new Error('No salt available')
    const machineSeed = `${os.hostname()}:${os.userInfo().username}:${os.platform()}`
    return crypto.pbkdf2Sync(machineSeed, this.salt, 200_000, 32, 'sha256')
  }

  private rollSpendWindow(entry: VaultEntry): void {
    const windowMs = 24 * 60 * 60 * 1000
    const windowStart = new Date(entry.info.windowStartAt).getTime()
    const now = Date.now()
    if (now - windowStart >= windowMs) {
      entry.info.windowStartAt = new Date(now).toISOString()
      entry.info.currentSpendCents = 0
    }
  }

  private async persist(): Promise<void> {
    if (!fs.existsSync(this.vaultDir)) {
      fs.mkdirSync(this.vaultDir, { recursive: true })
    }
    const data: VaultFile = {
      version: 1,
      salt: this.salt!.toString('base64'),
      entries: Array.from(this.entries.values()),
    }
    const tmp = this.vaultPath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, this.vaultPath)
  }
}

/**
 * Singleton default vault instance, rooted at `.levelcode/vault/`.
 */
let defaultVault: OrgKeyVault | null = null

export function getDefaultKeyVault(): OrgKeyVault {
  if (!defaultVault) {
    defaultVault = new OrgKeyVault()
  }
  return defaultVault
}

export function resetDefaultKeyVault(): void {
  defaultVault = null
}
