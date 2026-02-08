import { z } from 'zod'

import { OAuthTokenSchema } from './oauth-types'

import type { OAuthProviderConfig } from './oauth-types'

// ============================================================================
// API Format & Auth Types
// ============================================================================

export const API_FORMATS = ['openai-compatible', 'anthropic', 'google', 'cohere'] as const
export type ApiFormat = (typeof API_FORMATS)[number]

export const AUTH_TYPES = ['bearer', 'x-api-key', 'none', 'aws-credentials', 'oauth'] as const
export type AuthType = (typeof AUTH_TYPES)[number]

export const PROVIDER_CATEGORIES = [
  'major-paid',
  'aggregators',
  'specialized',
  'chinese',
  'enterprise',
  'free-local',
  'gpu-cloud',
  'coding-tools',
  'custom',
] as const
export type ProviderCategory = (typeof PROVIDER_CATEGORIES)[number]

export const DUPLICATE_MODEL_STRATEGIES = ['cheapest', 'fastest', 'preferred-order'] as const
export type DuplicateModelStrategy = (typeof DUPLICATE_MODEL_STRATEGIES)[number]

// ============================================================================
// Provider Definition (static, built-in)
// ============================================================================

export interface ProviderDefinition {
  id: string
  name: string
  baseUrl: string
  envVars: string[]
  apiFormat: ApiFormat
  authType: AuthType
  category: ProviderCategory
  docUrl?: string
  npm?: string
  description?: string
  /** Default headers to include in requests */
  defaultHeaders?: Record<string, string>
  /** OAuth configuration for browser-based auth (if supported) */
  oauthConfig?: OAuthProviderConfig
}

// ============================================================================
// Provider Entry (user's saved config)
// ============================================================================

export const ProviderEntrySchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  autoDetected: z.boolean().optional(),
  models: z.array(z.string()),
  customModelIds: z.array(z.string()),
  displayName: z.string().optional(),
  oauthToken: OAuthTokenSchema.optional(),
})
export type ProviderEntry = z.infer<typeof ProviderEntrySchema>

// ============================================================================
// Model Catalog Entry (from models.dev)
// ============================================================================

export const ModelCatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  family: z.string().optional(),
  providerId: z.string(),
  cost: z.object({
    input: z.number(),
    output: z.number(),
  }).optional(),
  limit: z.object({
    context: z.number(),
    output: z.number(),
  }).optional(),
  capabilities: z.object({
    reasoning: z.boolean().optional(),
    tool_call: z.boolean().optional(),
    vision: z.boolean().optional(),
    function_calling: z.boolean().optional(),
    json_output: z.boolean().optional(),
  }).optional(),
  modalities: z.array(z.string()).optional(),
})
export type ModelCatalogEntry = z.infer<typeof ModelCatalogEntrySchema>

// ============================================================================
// User Settings
// ============================================================================

export const UserSettingsSchema = z.object({
  autoDetectLocal: z.boolean(),
  catalogRefreshHours: z.number().min(1).max(24),
  preferredProviderOrder: z.array(z.string()),
  duplicateModelStrategy: z.enum(DUPLICATE_MODEL_STRATEGIES),
})
export type UserSettings = z.infer<typeof UserSettingsSchema>

export const DEFAULT_USER_SETTINGS: UserSettings = {
  autoDetectLocal: true,
  catalogRefreshHours: 1,
  preferredProviderOrder: ['anthropic', 'openrouter', 'openai'],
  duplicateModelStrategy: 'preferred-order',
}

// ============================================================================
// Full Providers Config (persisted to disk)
// ============================================================================

export const ProvidersConfigSchema = z.object({
  version: z.number(),
  providers: z.record(z.string(), ProviderEntrySchema),
  activeModel: z.string().nullable(),
  activeProvider: z.string().nullable(),
  settings: UserSettingsSchema,
  catalogLastUpdated: z.string().nullable(),
})
export type ProvidersConfig = z.infer<typeof ProvidersConfigSchema>

export const DEFAULT_PROVIDERS_CONFIG: ProvidersConfig = {
  version: 1,
  providers: {},
  activeModel: null,
  activeProvider: null,
  settings: DEFAULT_USER_SETTINGS,
  catalogLastUpdated: null,
}

// ============================================================================
// Connection Test Result
// ============================================================================

export interface ProviderTestResult {
  success: boolean
  latencyMs: number
  error?: string
  models?: string[]
  providerName: string
}

// ============================================================================
// Resolved Model (for routing)
// ============================================================================

export interface ResolvedModel {
  providerId: string
  modelId: string
  providerEntry: ProviderEntry
  providerDefinition?: ProviderDefinition
}
