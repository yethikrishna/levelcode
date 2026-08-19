/**
 * llama.cpp server provider.
 *
 * Communicates with a running llama.cpp server (launched via `llama-server`
 * or the older `server` binary). llama-server exposes an OpenAI-compatible
 * API at /v1 by default (http://localhost:8080), which is what this module
 * targets.
 *
 * Unlike Ollama, llama.cpp serves a single GGUF model per server instance
 * (specified at startup via `-m` / `--model`), so `listModels()` returns
 * metadata about the currently loaded model rather than a catalog.
 *
 * The provider also supports specifying a GGUF model path to load via the
 * native `/props` endpoint (if the server was started with `--mmproj` support).
 */

// ============================================================================
// Types
// ============================================================================

export interface LlamaCppMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

export interface LlamaCppChatOptions {
  model?: string
  stream?: boolean
  temperature?: number
  top_p?: number
  max_tokens?: number
  stop?: string[]
  frequency_penalty?: number
  presence_penalty?: number
  response_format?: { type: 'text' | 'json_object' }
}

export interface LlamaCppCompleteOptions {
  model?: string
  stream?: boolean
  temperature?: number
  top_p?: number
  max_tokens?: number
  stop?: string[]
  frequency_penalty?: number
  presence_penalty?: number
  echo?: boolean
  suffix?: string
}

export interface LlamaCppModelInfo {
  id: string
  object: 'model'
  created: number
  owned_by: string
  meta?: {
    n_vocab?: number
    n_ctx_train?: number
    n_embd?: number
    n_layer?: number
    rope_freq_base_train?: number
    rope_freq_scale_train?: number
    n_params?: number
    n_params_billions?: string
    size_label?: string
  }
}

export interface LlamaCppListModelsResponse {
  object: 'list'
  data: LlamaCppModelInfo[]
}

export interface LlamaCppPropsResponse {
  model_path?: string
  n_ctx?: number
  n_batch?: number
  n_ubatch?: number
  n_gpu_layers?: number
  flash_attn?: boolean
  cache_type_k?: string
  cache_type_v?: string
  total_slots?: number
}

export interface LlamaCppChatChoice {
  index: number
  message: {
    role: 'assistant'
    content: string
  }
  finish_reason: 'stop' | 'length' | null
}

export interface LlamaCppChatResponse {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: LlamaCppChatChoice[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface LlamaCppCompleteChoice {
  index: number
  text: string
  finish_reason: 'stop' | 'length' | null
}

export interface LlamaCppCompleteResponse {
  id: string
  object: 'text_completion'
  created: number
  model: string
  choices: LlamaCppCompleteChoice[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface LlamaCppHealthResponse {
  status: 'ok' | 'error'
  error?: { code: number; message: string }
}

export interface LlamaCppProviderConfig {
  baseUrl?: string
  apiKey?: string
  defaultModel?: string
  ggufPath?: string
  timeoutMs?: number
}

// ============================================================================
// LlamaCppProvider
// ============================================================================

/**
 * Client for interacting with a running llama.cpp server.
 *
 * Uses the OpenAI-compatible /v1 endpoints for chat and completions, plus
 * the llama.cpp-specific `/health` and `/props` endpoints for diagnostics.
 *
 * Usage:
 * ```ts
 * const llamacpp = new LlamaCppProvider()
 * const info = await llamacpp.getProps()
 * const reply = await llamacpp.chat([{ role: 'user', content: 'Hi' }])
 * ```
 */
export class LlamaCppProvider {
  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly defaultModel: string
  private readonly timeoutMs: number
  private readonly ggufPath?: string

  constructor(config: LlamaCppProviderConfig = {}) {
    this.baseUrl = (config.baseUrl ?? 'http://localhost:8080').replace(/\/+$/, '')
    this.apiKey = config.apiKey
    this.defaultModel = config.defaultModel ?? 'llama-cpp'
    this.ggufPath = config.ggufPath
    this.timeoutMs = config.timeoutMs ?? 120_000
  }

  // ---------------------------------------------------------------------------
  // Connectivity
  // ---------------------------------------------------------------------------

  /**
   * Check whether the llama.cpp server is reachable and healthy.
   * Calls GET /health with a short timeout.
   */
  async isRunning(timeoutMs = 2000): Promise<boolean> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: controller.signal })
      if (!res.ok) return false
      const data = (await res.json()) as LlamaCppHealthResponse
      return data.status === 'ok'
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Retrieve the running server properties (context size, model path, GPU layers, etc.).
   * Calls GET /props.
   */
  async getProps(): Promise<LlamaCppPropsResponse> {
    return this.fetchJson<LlamaCppPropsResponse>('/props')
  }

  // ---------------------------------------------------------------------------
  // Model listing
  // ---------------------------------------------------------------------------

  /**
   * List models available on the server.
   * llama.cpp serves exactly one model per instance, so this returns a
   * single-element array with the currently loaded model.
   * Calls GET /v1/models.
   */
  async listModels(): Promise<LlamaCppModelInfo[]> {
    try {
      const res = await this.fetchJson<LlamaCppListModelsResponse>('/v1/models')
      return res.data ?? []
    } catch {
      const props = await this.getProps().catch(() => ({} as LlamaCppPropsResponse))
      return [
        {
          id: props.model_path?.split(/[\\/]/).pop()?.replace(/\.gguf$/, '') ?? this.defaultModel,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'llama.cpp',
        },
      ]
    }
  }

  // ---------------------------------------------------------------------------
  // Chat (multi-turn messages) - OpenAI-compatible
  // ---------------------------------------------------------------------------

  /**
   * Send a chat request using the OpenAI-compatible /v1/chat/completions endpoint.
   *
   * @param messages - Array of chat messages in standard { role, content } form.
   * @param options  - Generation options (temperature, max_tokens, etc.).
   * @returns The assistant response with usage metadata.
   */
  async chat(
    messages: LlamaCppMessage[],
    options: LlamaCppChatOptions = {},
  ): Promise<LlamaCppChatResponse> {
    const model = options.model ?? this.defaultModel
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: options.stream ?? false,
    }
    if (options.temperature !== undefined) body.temperature = options.temperature
    if (options.top_p !== undefined) body.top_p = options.top_p
    if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens
    if (options.stop !== undefined) body.stop = options.stop
    if (options.frequency_penalty !== undefined) body.frequency_penalty = options.frequency_penalty
    if (options.presence_penalty !== undefined) body.presence_penalty = options.presence_penalty
    if (options.response_format !== undefined) body.response_format = options.response_format

    return this.fetchJson<LlamaCppChatResponse>('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  // ---------------------------------------------------------------------------
  // Completion (single prompt) - OpenAI-compatible
  // ---------------------------------------------------------------------------

  /**
   * Send a raw completion request using the OpenAI-compatible /v1/completions endpoint.
   *
   * @param prompt  - The text prompt to complete.
   * @param options - Generation options (temperature, max_tokens, echo, suffix, etc.).
   * @returns The generated text with usage metadata.
   */
  async complete(
    prompt: string,
    options: LlamaCppCompleteOptions = {},
  ): Promise<LlamaCppCompleteResponse> {
    const model = options.model ?? this.defaultModel
    const body: Record<string, unknown> = {
      model,
      prompt,
      stream: options.stream ?? false,
    }
    if (options.temperature !== undefined) body.temperature = options.temperature
    if (options.top_p !== undefined) body.top_p = options.top_p
    if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens
    if (options.stop !== undefined) body.stop = options.stop
    if (options.frequency_penalty !== undefined) body.frequency_penalty = options.frequency_penalty
    if (options.presence_penalty !== undefined) body.presence_penalty = options.presence_penalty
    if (options.echo !== undefined) body.echo = options.echo
    if (options.suffix !== undefined) body.suffix = options.suffix

    return this.fetchJson<LlamaCppCompleteResponse>('/v1/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  // ---------------------------------------------------------------------------
  // GGUF path helpers
  // ---------------------------------------------------------------------------

  /**
   * Return the GGUF model path this provider was configured with, if any.
   */
  getGgufPath(): string | undefined {
    return this.ggufPath
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      }
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`
      }
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`llama.cpp HTTP ${res.status}: ${text.slice(0, 500)}`)
      }
      return (await res.json()) as T
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`llama.cpp request timed out after ${this.timeoutMs}ms`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}

// ============================================================================
// Singleton & auto-detection helpers
// ============================================================================

let defaultInstance: LlamaCppProvider | null = null

/**
 * Return a shared LlamaCppProvider instance using default settings.
 */
export function getLlamaCppProvider(config?: LlamaCppProviderConfig): LlamaCppProvider {
  if (!defaultInstance || config) {
    defaultInstance = new LlamaCppProvider(config)
  }
  return defaultInstance
}

/**
 * Auto-detect whether a llama.cpp server is running locally and return a
 * provider instance. Returns null when the server is not reachable.
 */
export async function detectLlamaCpp(
  config?: LlamaCppProviderConfig,
): Promise<{ provider: LlamaCppProvider; modelId: string; props: LlamaCppPropsResponse } | null> {
  const provider = new LlamaCppProvider(config)
  if (!(await provider.isRunning())) {
    return null
  }
  const props = await provider.getProps()
  const models = await provider.listModels()
  const modelId = models[0]?.id ?? (props.model_path?.split(/[\\/]/).pop()?.replace(/\.gguf$/, '') ?? 'llama-cpp')
  return { provider, modelId, props }
}

/**
 * Model prefix used to route requests to this provider (e.g. "llama-cpp/qwen2.5-coder-7b").
 */
export const LLAMA_CPP_MODEL_PREFIX = 'llama-cpp/'
