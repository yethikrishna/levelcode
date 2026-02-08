import crypto from 'crypto'

import type { OAuthProviderConfig, OAuthToken } from './oauth-types'

/**
 * Generate a PKCE code verifier (32 random bytes, base64url-encoded).
 */
export function generateCodeVerifier(): string {
  const buffer = crypto.randomBytes(32)
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Generate a PKCE code challenge from a verifier (SHA256, base64url-encoded).
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest()
  return hash
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Build the OAuth authorization URL from provider config and PKCE params.
 */
export function buildAuthorizationUrl(
  config: OAuthProviderConfig,
  codeChallenge: string,
  state: string,
): string {
  const url = new URL(config.authorizationUrl)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', config.scopes.join(' '))
  url.searchParams.set('state', state)

  if (config.pkce) {
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
  }

  if (config.callbackMode === 'copy-paste') {
    url.searchParams.set('code', 'true')
  }

  return url.toString()
}

/**
 * Exchange an authorization code for OAuth tokens.
 */
export async function exchangeAuthorizationCode(
  config: OAuthProviderConfig,
  code: string,
  codeVerifier: string,
  state?: string,
): Promise<OAuthToken> {
  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  }

  if (state) {
    body.state = state
  }

  const response = await globalThis.fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OAuth token exchange failed: ${errorText}`)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? undefined,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type ?? 'Bearer',
    scope: data.scope ?? undefined,
    connectedAt: Date.now(),
  }
}

/**
 * Refresh an OAuth token using the refresh token.
 */
export async function refreshOAuthToken(
  config: OAuthProviderConfig,
  refreshToken: string,
): Promise<OAuthToken> {
  const response = await globalThis.fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OAuth token refresh failed: ${errorText}`)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type ?? 'Bearer',
    scope: data.scope ?? undefined,
    connectedAt: Date.now(),
  }
}
