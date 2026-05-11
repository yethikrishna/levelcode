import type { SwarmPersona } from '../types/swarm-persona'
import type { SwarmState } from './swarm-state'
import { PERSONA_PRESETS } from '../types/swarm-persona'
import { loadPersonas } from './persona-manager'

// ============================================================================
// Reviewer Swarm Configuration
// ============================================================================

export interface ReviewerSwarmConfig {
  rounds: number              // Number of review rounds (default 2)
  personas: string[]         // Persona IDs to use in rotation
  adversarial: boolean      // Try to break each other's reviews
  minConfidence: number     // Minimum confidence to approve (default 70)
  maxIterations: number     // Max attempts per review (default 3)
}

const DEFAULT_CONFIG: ReviewerSwarmConfig = {
  rounds: 2,
  personas: ['security-auditor', 'style-maintainer', 'performance-profiler'],
  adversarial: true,
  minConfidence: 70,
  maxIterations: 3,
}

// ============================================================================
// Review Result
// ============================================================================

export interface ReviewResult {
  round: number
  personaId: string
  personaName: string
  confidence: number
  issues: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low'
    type: string
    message: string
    line?: number
    suggestion?: string
  }>
  approved: boolean
  summary: string
}

// ============================================================================
// Review Execution
// ============================================================================

export interface SwarmReviewContext {
  taskId: string
  files: string[]
  diff?: string
  code?: string
  config: ReviewerSwarmConfig
}

const REVIEWER_PROMPT = `You are a code reviewer. Analyze the provided code for issues.
Return your review as JSON:
{
  "confidence": number (0-100),
  "issues": Array<{
    "severity": "critical"|"high"|"medium"|"low",
    "type": string,
    "message": string,
    "line"?: number,
    "suggestion"?: string
  }>,
  "approved": boolean,
  "summary": string
}

Focus on:
- Security vulnerabilities
- Performance issues
- Architectural problems
- Code quality and maintainability

Do NOT approve unless confidence >= {minConfidence}.`

export function buildReviewerPrompt(
  persona: SwarmPersona,
  context: SwarmReviewContext,
  minConfidence: number,
): string {
  const prompt = REVIEWER_PROMPT.replace('{minConfidence}', minConfidence.toString())
  return `${prompt}\n\nYour role: ${persona.role}\nYour specialty: ${persona.description || 'general review'}\n\nCode to review:\n${context.diff || context.code || 'Files: ' + context.files.join(', ')}`
}

export async function executeReview(
  persona: SwarmPersona,
  context: SwarmReviewContext,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<ReviewResult> {
  const prompt = buildReviewerPrompt(persona, context, context.config.minConfidence)

  // Call AI model - simplified for integration
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: persona.systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    throw new Error(`Review failed: ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || ''

  // Parse JSON from response
  let parsed: ReviewResult
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0])
    } else {
      throw new Error('No JSON found')
    }
  } catch {
    return {
      round: 0,
      personaId: persona.id,
      personaName: persona.name,
      confidence: 50,
      issues: [{ severity: 'high', type: 'parse', message: 'Failed to parse review response' }],
      approved: false,
      summary: 'Review parsing failed',
    }
  }

  return parsed
}

// ============================================================================
// Multi-Round Review
// ============================================================================

export async function runSwarmReview(
  state: SwarmState,
  context: SwarmReviewContext,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<{
  results: ReviewResult[]
  approved: boolean
  consensus: number
}> {
  const config: ReviewerSwarmConfig = { ...DEFAULT_CONFIG, ...context.config }
  const allResults: ReviewResult[] = []

  // Load personas
  const personas = loadPersonas(state.teamName)
  const activePersonas = config.personas
    .map(id => personas[id])
    .filter(Boolean)

  if (activePersonas.length === 0) {
    throw new Error('No valid personas for review')
  }

  for (let round = 0; round < config.rounds; round++) {
    for (let i = 0; i < activePersonas.length; i++) {
      const persona = activePersonas[i]

      // Adversarial: use a different persona from last round if enabled
      let reviewPersona = persona
      if (config.adversarial && allResults.length > 0) {
        // Try a different one to get fresh perspective
        const nextIdx = (i + 1) % activePersonas.length
        reviewPersona = activePersonas[nextIdx]
      }

      try {
        const result = await executeReview(
          reviewPersona,
          { ...context, config },
          model,
          apiKey,
          baseUrl,
        )
        result.round = round + 1
        allResults.push(result)
      } catch (error) {
        allResults.push({
          round: round + 1,
          personaId: reviewPersona.id,
          personaName: reviewPersona.name,
          confidence: 0,
          issues: [{
            severity: 'high',
            type: 'system',
            message: `Review failed: ${error}`,
          }],
          approved: false,
          summary: 'Review execution failed',
        })
      }
    }
  }

  // Calculate consensus
  const approvals = allResults.filter(r => r.approved).length
  const total = allResults.length
  const consensus = total > 0 ? Math.round((approvals / total) * 100) : 0

  const finalApproved =
    approvals >= Math.ceil(total * 0.6) && consensus >= config.minConfidence

  return {
    results: allResults,
    approved: finalApproved,
    consensus,
  }
}

// ============================================================================
// Review Aggregation
// ============================================================================

export function aggregateReviews(results: ReviewResult[]): {
  critical: number
  high: number
  medium: number
  low: number
  byType: Record<string, number>
  recommendations: string[]
} {
  const stats = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    byType: {} as Record<string, number>,
    recommendations: [] as string[],
  }

  for (const result of results) {
    for (const issue of result.issues) {
      stats[issue.severity]++
      stats.byType[issue.type] = (stats.byType[issue.type] || 0) + 1

      if (issue.suggestion && issue.severity !== 'low') {
        stats.recommendations.push(`[${issue.severity}] ${issue.suggestion}`)
      }
    }
  }

  return stats
}

export function formatReviewSummary(
  results: ReviewResult[],
  approved: boolean,
  consensus: number,
): string {
  const stats = aggregateReviews(results)

  const lines = [
    `=== Swarm Review Summary ===`,
    ``,
    `Approved: ${approved ? 'YES' : 'NO'}`,
    `Consensus: ${consensus}%`,
    ``,
    `Issues by severity:`,
    `  Critical: ${stats.critical}`,
    `  High: ${stats.high}`,
    `  Medium: ${stats.medium}`,
    `  Low: ${stats.low}`,
    ``,
    `Reviews: ${results.length}`,
  ]

  if (stats.recommendations.length > 0) {
    lines.push('', 'Top recommendations:')
    for (const rec of stats.recommendations.slice(0, 5)) {
      lines.push(`  - ${rec}`)
    }
  }

  return lines.join('\n')
}