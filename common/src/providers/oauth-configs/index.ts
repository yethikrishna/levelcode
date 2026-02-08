import { GOOGLE_OAUTH_CONFIG, isGoogleOAuthConfigured } from './google'
import { GITHUB_OAUTH_CONFIG, isGithubOAuthConfigured } from './github'
import { AZURE_OAUTH_CONFIG, isAzureOAuthConfigured } from './azure'
import { OPENROUTER_OAUTH_CONFIG, isOpenRouterOAuthConfigured } from './openrouter'
import { CLAUDE_OAUTH_CONFIG, isClaudeOAuthConfigured } from './claude'

import type { OAuthProviderConfig } from '../oauth-types'

export const OAUTH_CONFIGS: Record<string, OAuthProviderConfig> = {
  'google-gemini': GOOGLE_OAUTH_CONFIG,
  'github-models': GITHUB_OAUTH_CONFIG,
  'azure': AZURE_OAUTH_CONFIG,
  'openrouter': OPENROUTER_OAUTH_CONFIG,
  'anthropic': CLAUDE_OAUTH_CONFIG,
}

/** Returns only OAuth configs that have a clientId set (either hardcoded or via env var) */
export function getConfiguredOAuthProviders(): Record<string, OAuthProviderConfig> {
  const configured: Record<string, OAuthProviderConfig> = {}
  for (const [id, config] of Object.entries(OAUTH_CONFIGS)) {
    if (config.clientId) {
      configured[id] = config
    }
  }
  return configured
}

export function isOAuthConfigured(providerId: string): boolean {
  const config = OAUTH_CONFIGS[providerId]
  return Boolean(config?.clientId)
}

export {
  GOOGLE_OAUTH_CONFIG, isGoogleOAuthConfigured,
  GITHUB_OAUTH_CONFIG, isGithubOAuthConfigured,
  AZURE_OAUTH_CONFIG, isAzureOAuthConfigured,
  OPENROUTER_OAUTH_CONFIG, isOpenRouterOAuthConfigured,
  CLAUDE_OAUTH_CONFIG, isClaudeOAuthConfigured,
}
