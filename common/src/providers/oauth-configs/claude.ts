import { CLAUDE_OAUTH_CLIENT_ID } from '../../constants/claude-oauth'
import type { OAuthProviderConfig } from '../oauth-types'

export const CLAUDE_OAUTH_CONFIG: OAuthProviderConfig = {
  clientId: CLAUDE_OAUTH_CLIENT_ID,
  authorizationUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
  redirectUri: 'https://console.anthropic.com/oauth/code/callback',
  scopes: ['org:create_api_key', 'user:profile', 'user:inference'],
  pkce: true,
  callbackMode: 'copy-paste',
}

export function isClaudeOAuthConfigured(): boolean {
  return Boolean(CLAUDE_OAUTH_CLIENT_ID)
}
