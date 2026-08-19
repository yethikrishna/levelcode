/**
 * Ollama local model provider.
 *
 * Communicates with a running Ollama instance via its native REST API
 * (http://localhost:11434 by default). Supports both the native `/api/chat`
 * and `/api/generate` endpoints as well as auto-detection of running models.
 *
 * Ollama also exposes an OpenAI-compatible API at /v1, but this module uses
 * the native endpoints because they provide richer metadata (model details,
 * streaming done reasons, etc.) and work even when the OpenAI compatibility
 * shim is disabled.
 */

// ============================================================================
// Types
// ============================================================================

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  images?: string[]
}

export interface OllamaChatOptions {
  model?: string
  stream?: boolean
  format?: 'json' | Record<string, unknown>
  options?: Record<string, unknown>
  keep_alive?: string
  tools?: Array<Record<string, unknown>>
}

export interface OllamaCompleteOptions {
  model?: string
  stream?: boolean
  format?: 'json' | Record<string, unknown>
  options?: Record<string, unknown>
  keep_alive?: string
  system?: string
  template?: string
  context?: number[]
}

export interface OllamaModelInfo {
  name: string
  model: string
  modified_at: string
  size: number
  digest: string
  details: {
    parent_model: string
    format: string
    family: string
    families: string[] | null
    parameter_size: string
    quantization_level: string
  }
}

export interface OllamaChatResponse {
  model: string
  created_at: string
  message: {
    role: 'assistant'
    content: string
    images?: string[] | null
    tool_calls?: Array<{
      function: {
        name: string
        arguments: Record<string, unknown>
      }
    }>
  }
  done: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  eval_count?: number
  eval_duration?: number
}

export interface OllamaGenerateResponse {
  model: string
  created_at: string
  response: string
  done: boolean
  context?: number[]
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  eval_count?: number
  eval_duration?: number
}

export interface OllamaListModelsResponse {
  models: OllamaModelInfo[]
}

export interface OllamaProviderConfig {
  baseUrl?: string
  defaultModel?: string
  timeoutMs?: number
}

// ============================================================================
// OllamaProvider
// ============================================================================

/**
 * Client for interacting with a local Ollama instance.
 *
 * Usage:
 * ```ts
 * const ollama = new OllamaProvider()
 * const models = await ollama.listModels()
 * const reply = await ollama.chat([{ role: 'user', content: 'Hi' }])
 * ```
 */
export class OllamaProvider {
  private readonly baseUrl: string
  private readonly defaultModel: string
  private readonly timeoutMs: number

  constructor(config: OllamaProviderConfig = {}) {
    this.baseUrl = (config.baseUrl ?? 'http://localhost:11434').replace(/\/+$/, '')
    this.defaultModel = config.defaultModel ?? 'qwen2.5-coder'
    this.timeoutMs = config.timeoutMs ?? 60_000
  }

  // ---------------------------------------------------------------------------
  // Connectivity
  // ---------------------------------------------------------------------------

  /**
   * Check whether an Ollama server is reachable at the configured base URL.
   * Sends a GET /api/tags request with a short timeout.
   */
  async isRunning(timeoutMs = 2000): Promise<boolean> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal })
      return res.ok
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  // ---------------------------------------------------------------------------
  // Model listing
  // ---------------------------------------------------------------------------

  /**
   * List all models available on the Ollama instance.
   * Calls GET /api/tags.
   */
  async listModels(): Promise<OllamaModelInfo[]> {
    const res = await this.fetchJson<OllamaListModelsResponse>('/api/tags')
    return res.models ?? []
  }

  // ---------------------------------------------------------------------------
  // Chat (multi-turn messages)
  // ---------------------------------------------------------------------------

  /**
   * Send a chat request using the Ollama /api/chat endpoint.
   *
   * @param messages - Array of chat messages in standard { role, content } form.
   * @param options  - Options including model override, streaming, format, etc.
   * @returns The assistant response message and timing metadata.
   */
  async chat(
    messages: OllamaMessage[],
    options: OllamaChatOptions = {},
  ): Promise<OllamaChatResponse> {
    const model = options.model ?? this.defaultModel
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: options.stream ?? false,
    }
    if (options.format !== undefined) body.format = options.format
    if (options.options !== undefined) body.options = options.options
    if (options.keep_alive !== undefined) body.keep_alive = options.keep_alive
    if (options.tools !== undefined) body.tools = options.tools

    return this.fetchJson<OllamaChatResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  // ---------------------------------------------------------------------------
  // Completion (single prompt)
  // ---------------------------------------------------------------------------

  /**
   * Send a raw completion/generation request using the Ollama /api/generate endpoint.
   *
   * @param prompt  - The text prompt to complete.
   * @param options - Options including model override, system prompt, etc.
   * @returns The generated text and timing metadata.
   */
  async complete(
    prompt: string,
    options: OllamaCompleteOptions = {},
  ): Promise<OllamaGenerateResponse> {
    const model = options.model ?? this.defaultModel
    const body: Record<string, unknown> = {
      model,
      prompt,
      stream: options.stream ?? false,
    }
    if (options.format !== undefined) body.format = options.format
    if (options.options !== undefined) body.options = options.options
    if (options.keep_alive !== undefined) body.keep_alive = options.keep_alive
    if (options.system !== undefined) body.system = options.system
    if (options.template !== undefined) body.template = options.template
    if (options.context !== undefined) body.context = options.context

    return this.fetchJson<OllamaGenerateResponse>('/api/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
        signal: controller.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 500)}`)
      }
      return (await res.json()) as T
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${this.timeoutMs}ms`)
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

let defaultInstance: OllamaProvider | null = null

/**
 * Return a shared OllamaProvider instance using default settings.
 */
export function getOllamaProvider(config?: OllamaProviderConfig): OllamaProvider {
  if (!defaultInstance || config) {
    defaultInstance = new OllamaProvider(config)
  }
  return defaultInstance
}

/**
 * Auto-detect whether Ollama is running locally and return a provider
 * instance together with the list of available models. Returns null when
 * Ollama is not reachable.
 */
export async function detectOllama(
  config?: OllamaProviderConfig,
): Promise<{ provider: OllamaProvider; models: string[] } | null> {
  const provider = new OllamaProvider(config)
  if (!(await provider.isRunning())) {
    return null
  }
  const models = await provider.listModels()
  return { provider, models: models.map((m) => m.name) }
}

/**
 * Model prefix used to route requests to this provider (e.g. "ollama/qwen2.5-coder").
 */
export const OLLAMA_MODEL_PREFIX = 'ollama/'
