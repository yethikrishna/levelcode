import type { OAuthProviderConfig } from '../oauth-types'

export const OPENROUTER_OAUTH_CONFIG: OAuthProviderConfig = {
  clientId: process.env.OPENROUTER_OAUTH_CLIENT_ID ?? '',
  authorizationUrl: 'https://openrouter.ai/auth',
  tokenUrl: 'https://openrouter.ai/api/v1/auth/keys',
  redirectUri: 'http://localhost:8403/callback',
  scopes: [],
  pkce: false,
  callbackMode: 'localhost',
  localhostPort: 8403,
}

export function isOpenRouterOAuthConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_OAUTH_CLIENT_ID)
}
