/**
 * SDK environment helper for dependency injection.
 *
 * This module provides SDK-specific env helpers that extend the base
 * process env with SDK-specific vars for binary paths and WASM.
 */

import { BYOK_OPENROUTER_ENV_VAR } from '@levelcode/common/constants/byok'
import { CLAUDE_OAUTH_TOKEN_ENV_VAR } from '@levelcode/common/constants/claude-oauth'
import { API_KEY_ENV_VAR } from '@levelcode/common/constants/paths'
import { getBaseEnv } from '@levelcode/common/env-process'

import type { SdkEnv } from './types/env'

/**
 * Get SDK environment values.
 * Composes from getBaseEnv() + SDK-specific vars.
 */
export const getSdkEnv = (): SdkEnv => ({
  ...getBaseEnv(),

  // SDK-specific paths
  LEVELCODE_RG_PATH: process.env.LEVELCODE_RG_PATH,
  LEVELCODE_WASM_DIR: process.env.LEVELCODE_WASM_DIR,

  // Build flags
  VERBOSE: process.env.VERBOSE,
  OVERRIDE_TARGET: process.env.OVERRIDE_TARGET,
  OVERRIDE_PLATFORM: process.env.OVERRIDE_PLATFORM,
  OVERRIDE_ARCH: process.env.OVERRIDE_ARCH,
})

export const getLevelCodeApiKeyFromEnv = (): string | undefined => {
  return process.env[API_KEY_ENV_VAR]
}

export const getSystemProcessEnv = (): NodeJS.ProcessEnv => {
  return process.env
}

export const getByokOpenrouterApiKeyFromEnv = (): string | undefined => {
  return process.env[BYOK_OPENROUTER_ENV_VAR]
}

/**
 * Get Claude OAuth token from environment variable.
 * This allows users to provide their Claude Pro/Max OAuth token for direct Anthropic API access.
 */
export const getClaudeOAuthTokenFromEnv = (): string | undefined => {
  return process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR]
}

export const getOpenRouterApiKeyFromEnv = (): string | undefined => {
  return (
    process.env.OPENROUTER_API_KEY ??
    process.env.OPEN_ROUTER_API_KEY ??
    process.env.CODEBUFF_BYOK_OPENROUTER
  )
}

export const getOpenRouterBaseUrlFromEnv = (): string | undefined => {
  return process.env.OPENROUTER_BASE_URL
}

export const getAnthropicApiKeyFromEnv = (): string | undefined => {
  return process.env.ANTHROPIC_API_KEY
}

export const getAnthropicBaseUrlFromEnv = (): string | undefined => {
  return process.env.ANTHROPIC_BASE_URL
}

/**
 * Standalone mode: bypass all backend dependencies, route LLM calls directly.
 * Default mode when no backend URL (NEXT_PUBLIC_LEVELCODE_APP_URL) is configured.
 * Also activates when a direct provider key (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)
 * is set AND LEVELCODE_API_KEY is NOT set.
 */
export const isStandaloneMode = (): boolean => {
  const appUrl = process.env.NEXT_PUBLIC_LEVELCODE_APP_URL
  if (!appUrl) return true
  const hasDirectKey = !!getOpenRouterApiKeyFromEnv() || !!getAnthropicApiKeyFromEnv()
  return hasDirectKey && !getLevelCodeApiKeyFromEnv()
}
