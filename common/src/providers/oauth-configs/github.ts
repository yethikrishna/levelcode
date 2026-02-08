import type { OAuthProviderConfig } from '../oauth-types'

export const GITHUB_OAUTH_CONFIG: OAuthProviderConfig = {
  clientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? '',
  authorizationUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  redirectUri: 'http://localhost:8401/callback',
  scopes: ['read:user'],
  pkce: true,
  callbackMode: 'localhost',
  localhostPort: 8401,
}

export function isGithubOAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_OAUTH_CLIENT_ID)
}
