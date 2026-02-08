import type { OAuthProviderConfig } from '../oauth-types'

export const AZURE_OAUTH_CONFIG: OAuthProviderConfig = {
  clientId: process.env.AZURE_OAUTH_CLIENT_ID ?? '',
  authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  redirectUri: 'http://localhost:8402/callback',
  scopes: ['https://cognitiveservices.azure.com/.default', 'offline_access'],
  pkce: true,
  callbackMode: 'localhost',
  localhostPort: 8402,
}

export function isAzureOAuthConfigured(): boolean {
  return Boolean(process.env.AZURE_OAUTH_CLIENT_ID)
}
