import type { OAuthProviderConfig } from '../oauth-types'

export const GOOGLE_OAUTH_CONFIG: OAuthProviderConfig = {
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  redirectUri: 'http://localhost:8400/callback',
  scopes: ['https://www.googleapis.com/auth/generative-language'],
  pkce: true,
  callbackMode: 'localhost',
  localhostPort: 8400,
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID)
}
