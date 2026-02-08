import type { ProviderDefinition, ProviderCategory } from './provider-types'

// ============================================================================
// Provider Definitions
// ============================================================================

export const PROVIDER_DEFINITIONS: Record<string, ProviderDefinition> = {
  // --------------------------------------------------------------------------
  // Major Paid
  // --------------------------------------------------------------------------
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    envVars: ['ANTHROPIC_API_KEY'],
    apiFormat: 'anthropic',
    authType: 'x-api-key',
    category: 'major-paid',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    envVars: ['OPENAI_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'major-paid',
  },
  google: {
    id: 'google',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envVars: ['GOOGLE_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'major-paid',
  },
  xai: {
    id: 'xai',
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    envVars: ['XAI_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'major-paid',
  },

  // --------------------------------------------------------------------------
  // Aggregators
  // --------------------------------------------------------------------------
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    envVars: ['OPENROUTER_API_KEY', 'OPEN_ROUTER_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'aggregators',
    defaultHeaders: {
      'HTTP-Referer': 'https://levelcode.ai',
      'X-Title': 'LevelCode',
    },
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    envVars: ['GROQ_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'aggregators',
  },
  together: {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    envVars: ['TOGETHER_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'aggregators',
  },
  fireworks: {
    id: 'fireworks',
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    envVars: ['FIREWORKS_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'aggregators',
  },
  aihubmix: {
    id: 'aihubmix',
    name: 'AIHubMix',
    baseUrl: 'https://aihubmix.com/v1',
    envVars: ['AIHUBMIX_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'aggregators',
  },
  '302ai': {
    id: '302ai',
    name: '302.AI',
    baseUrl: 'https://api.302.ai/v1',
    envVars: ['API_302AI_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'aggregators',
  },

  // --------------------------------------------------------------------------
  // Specialized
  // --------------------------------------------------------------------------
  mistral: {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    envVars: ['MISTRAL_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'specialized',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    envVars: ['DEEPSEEK_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'specialized',
  },
  cohere: {
    id: 'cohere',
    name: 'Cohere',
    baseUrl: 'https://api.cohere.com/v2',
    envVars: ['COHERE_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'specialized',
  },
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    envVars: ['PERPLEXITY_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'specialized',
  },
  replicate: {
    id: 'replicate',
    name: 'Replicate',
    baseUrl: 'https://openai-proxy.replicate.com/v1',
    envVars: ['REPLICATE_API_TOKEN'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'specialized',
  },

  // --------------------------------------------------------------------------
  // Chinese Providers
  // --------------------------------------------------------------------------
  alibaba: {
    id: 'alibaba',
    name: 'Alibaba (Qwen/DashScope)',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    envVars: ['DASHSCOPE_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'chinese',
  },
  'alibaba-cn': {
    id: 'alibaba-cn',
    name: 'Alibaba-CN',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    envVars: ['DASHSCOPE_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'chinese',
  },
  moonshot: {
    id: 'moonshot',
    name: 'Moonshot AI',
    baseUrl: 'https://api.moonshot.ai/v1',
    envVars: ['MOONSHOT_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'chinese',
  },
  'moonshot-cn': {
    id: 'moonshot-cn',
    name: 'Moonshot-CN',
    baseUrl: 'https://api.moonshot.cn/v1',
    envVars: ['MOONSHOT_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'chinese',
  },
  xiaomi: {
    id: 'xiaomi',
    name: 'Xiaomi',
    baseUrl: 'https://api.xiaomi.com/v1',
    envVars: ['XIAOMI_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'chinese',
  },
  zai: {
    id: 'zai',
    name: 'Z.AI',
    baseUrl: 'https://api.z-ai.cn/v1',
    envVars: ['ZAI_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'chinese',
  },
  'zai-coding': {
    id: 'zai-coding',
    name: 'Z.AI Coding Plan',
    baseUrl: 'https://api.z-ai.cn/v1',
    envVars: ['ZAI_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'chinese',
  },

  // --------------------------------------------------------------------------
  // Enterprise
  // --------------------------------------------------------------------------
  'aws-bedrock': {
    id: 'aws-bedrock',
    name: 'AWS Bedrock',
    baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    envVars: [],
    apiFormat: 'openai-compatible',
    authType: 'aws-credentials',
    category: 'enterprise',
  },
  'azure-openai': {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    baseUrl: '',
    envVars: ['AZURE_OPENAI_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'enterprise',
  },
  'github-models': {
    id: 'github-models',
    name: 'GitHub Models',
    baseUrl: 'https://models.inference.ai.azure.com',
    envVars: ['GITHUB_TOKEN'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'enterprise',
  },

  // --------------------------------------------------------------------------
  // Free / Local
  // --------------------------------------------------------------------------
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    envVars: [],
    apiFormat: 'openai-compatible',
    authType: 'none',
    category: 'free-local',
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    envVars: [],
    apiFormat: 'openai-compatible',
    authType: 'none',
    category: 'free-local',
  },
  'ollama-cloud': {
    id: 'ollama-cloud',
    name: 'Ollama Cloud',
    baseUrl: 'https://cloud.ollama.com/v1',
    envVars: ['OLLAMA_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'free-local',
  },

  // --------------------------------------------------------------------------
  // GPU Cloud
  // --------------------------------------------------------------------------
  nvidia: {
    id: 'nvidia',
    name: 'Nvidia',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    envVars: ['NVIDIA_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'gpu-cloud',
  },
  vultr: {
    id: 'vultr',
    name: 'Vultr',
    baseUrl: 'https://api.vultrinference.com/v1',
    envVars: ['VULTR_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'gpu-cloud',
  },
  cerebras: {
    id: 'cerebras',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    envVars: ['CEREBRAS_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'gpu-cloud',
  },
  deepinfra: {
    id: 'deepinfra',
    name: 'DeepInfra',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    envVars: ['DEEPINFRA_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'gpu-cloud',
  },

  // --------------------------------------------------------------------------
  // Coding Tools
  // --------------------------------------------------------------------------
  'opencode-zen': {
    id: 'opencode-zen',
    name: 'OpenCode Zen',
    baseUrl: 'https://opencode.ai/api/v1',
    envVars: ['OPENCODE_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'coding-tools',
  },
  kilocode: {
    id: 'kilocode',
    name: 'KiloCode',
    baseUrl: 'https://api.kilocode.ai/v1',
    envVars: ['KILOCODE_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'coding-tools',
  },
  codebuff: {
    id: 'codebuff',
    name: 'CodeBuff',
    baseUrl: 'https://api.codebuff.com/v1',
    envVars: ['CODEBUFF_API_KEY'],
    apiFormat: 'openai-compatible',
    authType: 'bearer',
    category: 'coding-tools',
  },
} satisfies Record<string, ProviderDefinition>

// ============================================================================
// Category Labels
// ============================================================================

export const PROVIDER_CATEGORY_LABELS: Record<ProviderCategory, string> = {
  'major-paid': 'Major Paid',
  aggregators: 'Aggregators',
  specialized: 'Specialized',
  chinese: 'Chinese Providers',
  enterprise: 'Enterprise',
  'free-local': 'Free / Local',
  'gpu-cloud': 'GPU Cloud',
  'coding-tools': 'Coding Tools',
  custom: 'Custom',
} satisfies Record<ProviderCategory, string>

// ============================================================================
// Helper Functions
// ============================================================================

/** Returns the provider definition for a given ID, or undefined if not found. */
export function getProviderDefinition(id: string): ProviderDefinition | undefined {
  return PROVIDER_DEFINITIONS[id]
}

/** Returns all built-in provider definitions as an array. */
export function getAllProviders(): ProviderDefinition[] {
  return Object.values(PROVIDER_DEFINITIONS)
}

/** Groups all provider definitions by their category. */
export function getProvidersByCategory(): Record<ProviderCategory, ProviderDefinition[]> {
  const grouped = Object.fromEntries(
    Object.keys(PROVIDER_CATEGORY_LABELS).map((cat) => [cat, [] as ProviderDefinition[]])
  ) as Record<ProviderCategory, ProviderDefinition[]>

  for (const provider of Object.values(PROVIDER_DEFINITIONS)) {
    grouped[provider.category].push(provider)
  }

  return grouped
}

/** Finds the first provider whose `envVars` array includes the given environment variable name. */
export function getProviderByEnvVar(envVar: string): ProviderDefinition | undefined {
  return Object.values(PROVIDER_DEFINITIONS).find((p) => p.envVars.includes(envVar))
}
