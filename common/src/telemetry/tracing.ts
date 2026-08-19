// Lightweight OpenTelemetry-compatible tracing module.
// Uses @opentelemetry/api and @opentelemetry/sdk-trace-base if available;
// otherwise falls back to an in-memory JSON span recorder that writes to disk
// when OTEL_EXPORTER_OTLP_ENDPOINT is not configured.

import fs from 'fs'
import path from 'path'

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined
}

export interface Span {
  name: string
  spanId: string
  traceId: string
  parentSpanId?: string
  startTime: number
  endTime?: number
  attributes: SpanAttributes
  status: 'unset' | 'ok' | 'error'
  events: Array<{ name: string; timestamp: number; attributes?: SpanAttributes }>
  children: Span[]
}

export interface TracerOptions {
  endpoint?: string
  serviceName?: string
  /** Directory for JSON span recording when OTLP is not configured */
  jsonOutputDir?: string
  /** Sampling ratio 0.0-1.0 (default 1.0) */
  sampleRate?: number
}

interface TracerInternal {
  endpoint?: string
  serviceName: string
  jsonOutputDir?: string
  sampleRate: number
  activeSpans: Map<string, Span>
  rootSpans: Span[]
  otelTracer?: any
  otelProvider?: any
  enabled: boolean
}

let tracer: TracerInternal | null = null

function generateId(bytes: number): string {
  const buf = new Uint8Array(bytes)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf)
  } else {
    for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function createSpan(name: string, parentSpanId?: string): Span {
  const traceId = parentSpanId && tracer?.activeSpans.has(parentSpanId)
    ? findTraceId(parentSpanId)
    : generateId(16)
  return {
    name,
    spanId: generateId(8),
    traceId,
    parentSpanId,
    startTime: Date.now(),
    attributes: {},
    status: 'unset',
    events: [],
    children: [],
  }
}

function findTraceId(spanId: string): string {
  if (!tracer) return generateId(16)
  const span = tracer.activeSpans.get(spanId)
  if (span) return span.traceId
  return generateId(16)
}

function writeSpanJson(spans: Span[], dir: string): void {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const filename = `traces-${new Date().toISOString().replace(/[:.]/g, '-')}-${generateId(4)}.json`
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(spans, null, 2), 'utf-8')
  } catch {
  }
}

async function tryInitOtel(
  serviceName: string,
  endpoint: string,
  sampleRate: number,
): Promise<{ tracer?: any; provider?: any } | null> {
  try {
    const api = await import('@opentelemetry/api')
    const sdkTraceBase = await import('@opentelemetry/sdk-trace-base')
    const resources = await import('@opentelemetry/resources')
    const semanticConventions = await import('@opentelemetry/semantic-conventions')

    let exporter: any
    try {
      // @ts-expect-error - optional dependency, may not be installed; fallthrough to grpc below
      const otlpHttp = await import('@opentelemetry/exporter-trace-otlp-http')
      exporter = new otlpHttp.OTLPTraceExporter({ url: endpoint })
    } catch {
      try {
        const otlpGrpc = await import('@opentelemetry/exporter-trace-otlp-grpc')
        exporter = new otlpGrpc.OTLPTraceExporter({ url: endpoint })
      } catch {
        return null
      }
    }

    const provider = new sdkTraceBase.BasicTracerProvider({
      resource: new resources.Resource({
        [semanticConventions.ATTR_SERVICE_NAME]: serviceName,
      }),
      sampler: sampleRate >= 1
        ? new sdkTraceBase.AlwaysOnSampler()
        : sampleRate <= 0
          ? new sdkTraceBase.AlwaysOffSampler()
          : new sdkTraceBase.TraceIdRatioBasedSampler(sampleRate),
    })

    provider.addSpanProcessor(new sdkTraceBase.SimpleSpanProcessor(exporter))
    provider.register()

    const otelTracer = api.trace.getTracer(serviceName)
    return { tracer: otelTracer, provider }
  } catch {
    return null
  }
}

export async function initTracer(
  serviceName: string,
  options: TracerOptions = {},
): Promise<void> {
  const endpoint = options.endpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
  const sampleRate = options.sampleRate ?? 1.0
  const jsonOutputDir = options.jsonOutputDir || (process.env.OTEL_JSON_DIR ? path.resolve(process.env.OTEL_JSON_DIR) : undefined)

  if (!endpoint && !jsonOutputDir && !process.env.OTEL_TRACING_ENABLED) {
    tracer = {
      serviceName,
      sampleRate,
      activeSpans: new Map(),
      rootSpans: [],
      enabled: false,
    }
    return
  }

  let otelTracer: any
  let otelProvider: any

  if (endpoint) {
    const otel = await tryInitOtel(serviceName, endpoint, sampleRate)
    if (otel) {
      otelTracer = otel.tracer
      otelProvider = otel.provider
    }
  }

  tracer = {
    endpoint,
    serviceName,
    jsonOutputDir,
    sampleRate,
    activeSpans: new Map(),
    rootSpans: [],
    otelTracer,
    otelProvider,
    enabled: true,
  }
}

export function isTracingEnabled(): boolean {
  return tracer?.enabled ?? false
}

export function getCurrentSpanId(): string | undefined {
  if (!tracer || !tracer.enabled) return undefined
  const keys = Array.from(tracer.activeSpans.keys())
  return keys[keys.length - 1]
}

export function startSpan(name: string, attributes: SpanAttributes = {}, parentSpanId?: string): Span | null {
  if (!tracer || !tracer.enabled) return null

  if (tracer.otelTracer) {
    const otelSpan = tracer.otelTracer.startSpan(name, {
      attributes: { ...attributes, 'service.name': tracer.serviceName },
    })
    const span: Span = {
      name,
      spanId: (otelSpan.spanContext && otelSpan.spanContext().spanId) || generateId(8),
      traceId: (otelSpan.spanContext && otelSpan.spanContext().traceId) || generateId(16),
      parentSpanId,
      startTime: Date.now(),
      attributes,
      status: 'unset',
      events: [],
      children: [],
    }
    ;(span as any)._otel = otelSpan
    tracer.activeSpans.set(span.spanId, span)
    if (!parentSpanId) tracer.rootSpans.push(span)
    return span
  }

  const effectiveParent = parentSpanId || getCurrentSpanId()
  const span = createSpan(name, effectiveParent)
  span.attributes = { ...attributes, 'service.name': tracer.serviceName }
  tracer.activeSpans.set(span.spanId, span)

  if (effectiveParent) {
    const parent = tracer.activeSpans.get(effectiveParent)
    if (parent) parent.children.push(span)
  } else {
    tracer.rootSpans.push(span)
  }

  return span
}

export function endSpan(span: Span | null, status: 'ok' | 'error' = 'ok'): void {
  if (!span || !tracer || !tracer.enabled) return

  span.endTime = Date.now()
  span.status = status
  tracer.activeSpans.delete(span.spanId)

  if ((span as any)._otel) {
    const otelSpan = (span as any)._otel
    otelSpan.setStatus({ code: status === 'ok' ? 1 : 2 })
    otelSpan.end()
    return
  }

  if (tracer.activeSpans.size === 0 && tracer.jsonOutputDir) {
    writeSpanJson(tracer.rootSpans, tracer.jsonOutputDir)
    tracer.rootSpans = []
  }
}

export function setSpanAttributes(span: Span | null, attributes: SpanAttributes): void {
  if (!span || !tracer) return
  Object.assign(span.attributes, attributes)
  if ((span as any)._otel) {
    for (const [k, v] of Object.entries(attributes)) {
      if (v !== undefined) (span as any)._otel.setAttribute(k, v)
    }
  }
}

export function addSpanEvent(span: Span | null, name: string, attributes?: SpanAttributes): void {
  if (!span) return
  span.events.push({ name, timestamp: Date.now(), attributes })
  if ((span as any)._otel) {
    (span as any)._otel.addEvent(name, attributes)
  }
}

export function recordSpanError(span: Span | null, error: Error): void {
  if (!span) return
  span.status = 'error'
  span.attributes['error.message'] = error.message
  span.attributes['error.type'] = error.name
  addSpanEvent(span, 'exception', {
    'exception.message': error.message,
    'exception.type': error.name,
  })
  if ((span as any)._otel) {
    (span as any)._otel.recordException(error)
    (span as any)._otel.setStatus({ code: 2 })
  }
}

export async function traced<T>(
  name: string,
  fn: (span: Span | null) => Promise<T> | T,
  attributes: SpanAttributes = {},
): Promise<T> {
  const span = startSpan(name, attributes)
  try {
    const result = await fn(span)
    endSpan(span, 'ok')
    return result
  } catch (err) {
    if (err instanceof Error) recordSpanError(span, err)
    else {
      endSpan(span, 'error')
    }
    throw err
  }
}

export function tracedSync<T>(
  name: string,
  fn: (span: Span | null) => T,
  attributes: SpanAttributes = {},
): T {
  const span = startSpan(name, attributes)
  try {
    const result = fn(span)
    endSpan(span, 'ok')
    return result
  } catch (err) {
    if (err instanceof Error) recordSpanError(span, err)
    else endSpan(span, 'error')
    throw err
  }
}

export function spanAgentStep(agentId: string, stepNumber: number, fn: () => Promise<void>): Promise<void> {
  return traced('agent.step', fn, { 'agent.id': agentId, 'agent.step': stepNumber, 'span.kind': 'internal' })
}

export function spanToolCall(toolName: string, agentId: string, fn: () => Promise<any>): Promise<any> {
  return traced('tool.call', fn, { 'tool.name': toolName, 'agent.id': agentId, 'span.kind': 'client' })
}

export function spanLlmCall(model: string, provider: string, fn: () => Promise<{ tokens?: number; cost?: number }>): Promise<{ tokens?: number; cost?: number }> {
  return traced('llm.call', async (span) => {
    const result = await fn()
    if (span) {
      setSpanAttributes(span, {
        'llm.model': model,
        'llm.provider': provider,
        'llm.tokens': result.tokens,
        'llm.cost_usd': result.cost,
      })
    }
    return result
  }, { 'llm.model': model, 'llm.provider': provider, 'span.kind': 'client' })
}

export function spanFileEdit(filePath: string, operation: 'write' | 'edit' | 'create' | 'delete', fn: () => Promise<void>): Promise<void> {
  return traced('file.edit', fn, { 'file.path': filePath, 'file.operation': operation, 'span.kind': 'internal' })
}

export async function shutdownTracer(): Promise<void> {
  if (!tracer) return
  if (tracer.otelProvider) {
    try {
      await tracer.otelProvider.shutdown()
    } catch {}
  }
  if (tracer.jsonOutputDir && tracer.rootSpans.length > 0) {
    writeSpanJson(tracer.rootSpans, tracer.jsonOutputDir)
    tracer.rootSpans = []
  }
  tracer = null
}
