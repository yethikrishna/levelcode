import crypto from 'crypto'
import os from 'os'
import { loadProviderConfig, saveProviderConfig } from './provider-fs'
import { refreshOAuthToken } from './oauth-flow'

import type { OAuthToken } from './oauth-types'
import type { OAuthProviderConfig } from './oauth-types'

// ============================================================================
// Token encryption at rest
// ============================================================================

// Encryption key derived from machine-specific data (hostname + username)
// This isn't military-grade security but prevents casual reading of tokens from the JSON file
function getEncryptionKey(): Buffer {
  const material = `levelcode-oauth-${os.hostname()}-${os.userInfo().username}`
  return crypto.createHash('sha256').update(material).digest()
}

function encryptToken(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `enc:${iv.toString('hex')}:${encrypted.toString('hex')}`
}

function decryptToken(ciphertext: string): string {
  if (!ciphertext.startsWith('enc:')) return ciphertext // Backward compat: unencrypted
  const parts = ciphertext.split(':')
  const iv = Buffer.from(parts[1], 'hex')
  const encrypted = Buffer.from(parts[2], 'hex')
  const key = getEncryptionKey()
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

// ============================================================================
// Token storage
// ============================================================================

/**
 * Save an OAuth token for a provider in providers.json.
 * Tokens are encrypted at rest using AES-256-CBC.
 */
export async function saveOAuthToken(providerId: string, token: OAuthToken): Promise<void> {
  const config = await loadProviderConfig()
  const encryptedToken = {
    ...token,
    accessToken: encryptToken(token.accessToken),
    refreshToken: token.refreshToken ? encryptToken(token.refreshToken) : undefined,
  }

  const provider = config.providers[providerId]
  if (!provider) {
    // If provider doesn't exist yet, that's OK for OAuth-only connections
    // Create a minimal entry
    config.providers[providerId] = {
      enabled: true,
      models: [],
      customModelIds: [],
      oauthToken: encryptedToken,
    }
  } else {
    provider.oauthToken = encryptedToken
  }
  await saveProviderConfig(config)
}

/**
 * Get the stored OAuth token for a provider, or null if not found.
 * Tokens are decrypted transparently. Supports backward compatibility
 * with unencrypted tokens (they are returned as-is).
 */
export async function getOAuthToken(providerId: string): Promise<OAuthToken | null> {
  const config = await loadProviderConfig()
  const stored = config.providers[providerId]?.oauthToken
  if (!stored) return null
  return {
    ...stored,
    accessToken: decryptToken(stored.accessToken),
    refreshToken: stored.refreshToken ? decryptToken(stored.refreshToken) : undefined,
  }
}

/**
 * Clear the OAuth token for a provider.
 */
export async function clearOAuthToken(providerId: string): Promise<void> {
  const config = await loadProviderConfig()
  const provider = config.providers[providerId]
  if (provider) {
    delete provider.oauthToken
    await saveProviderConfig(config)
  }
}

/**
 * Check if an OAuth token is still valid (with 5-minute buffer before expiry).
 */
export function isOAuthTokenValid(token: OAuthToken): boolean {
  const bufferMs = 5 * 60 * 1000
  return token.expiresAt > Date.now() + bufferMs
}

// Mutex map to prevent concurrent refresh attempts per provider
const refreshPromises = new Map<string, Promise<OAuthToken | null>>()

/**
 * Get a valid OAuth token for a provider, refreshing if expired.
 * Uses a per-provider mutex to prevent concurrent refresh attempts.
 * Returns null if no token exists or refresh fails.
 */
export async function getValidOAuthToken(
  providerId: string,
  config: OAuthProviderConfig,
): Promise<OAuthToken | null> {
  const token = await getOAuthToken(providerId)
  if (!token) {
    return null
  }

  if (isOAuthTokenValid(token)) {
    return token
  }

  // Token expired — try to refresh
  if (!token.refreshToken) {
    return null
  }

  // If a refresh is already in progress for this provider, wait for it
  const existing = refreshPromises.get(providerId)
  if (existing) {
    return existing
  }

  const refreshPromise = (async (): Promise<OAuthToken | null> => {
    try {
      const newToken = await refreshOAuthToken(config, token.refreshToken!)
      // Preserve the original connectedAt timestamp
      newToken.connectedAt = token.connectedAt
      await saveOAuthToken(providerId, newToken)
      return newToken
    } catch {
      // Refresh failed — clear the stored token
      await clearOAuthToken(providerId)
      return null
    } finally {
      refreshPromises.delete(providerId)
    }
  })()

  refreshPromises.set(providerId, refreshPromise)
  return refreshPromise
}
