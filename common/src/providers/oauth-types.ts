import { z } from 'zod'

// ============================================================================
// OAuth Token (stored per provider)
// ============================================================================

export const OAuthTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.number(),
  tokenType: z.string().default('Bearer'),
  scope: z.string().optional(),
  connectedAt: z.number(),
})
export type OAuthToken = z.infer<typeof OAuthTokenSchema>

// ============================================================================
// OAuth Provider Config (static, per-provider definition)
// ============================================================================

export const OAuthCallbackModeSchema = z.enum(['copy-paste', 'localhost'])
export type OAuthCallbackMode = z.infer<typeof OAuthCallbackModeSchema>

export const OAuthProviderConfigSchema = z.object({
  clientId: z.string(),
  authorizationUrl: z.string(),
  tokenUrl: z.string(),
  redirectUri: z.string(),
  scopes: z.array(z.string()),
  pkce: z.boolean().default(true),
  callbackMode: OAuthCallbackModeSchema,
  localhostPort: z.number().optional(),
})
export type OAuthProviderConfig = z.infer<typeof OAuthProviderConfigSchema>
