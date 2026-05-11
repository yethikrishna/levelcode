import type { SwarmState } from './swarm-state'
import { getBibleStats, getBibleContext } from './memory-bible'
import { orchestrateTeam, formatOrchestratorReport } from './meta-orchestrator'
import { analyzeSession, formatSessionAnalysis } from './meta-orchestrator'
import { generateHandoffPack, formatHandoffPack } from './handoff'
import { calculateHealthScore } from './swarm-state'

// ============================================================================
// Reflection Ritual — Post-Milestone Review
// ============================================================================

export interface ReflectionRitual {
  id: string
  teamName: string
  milestone: string       // e.g., "Phase Beta Complete", "Epic X Finished"
  conductedAt: number
  conductedBy: string    // 'system' | human name
  learnings: string[]
  proposedEvolutions: Array<{
    type: 'prompt-update' | 'new-persona' | 'config-change' | 'workflow-change'
    description: string
    expectedImpact: 'high' | 'medium' | 'low'
    approved?: boolean
  }>
  roiMetrics: {
    timeSaved: number      // estimated minutes saved
    qualityImprovement: number  // 0-100
    tokenEfficiencyGain: number  // percentage improvement
  }
  humanApproved?: boolean
  implementedAt?: number
}

// ============================================================================
// Conduct Reflection Ritual
// ============================================================================

export function conductReflection(
  state: SwarmState,
  milestone: string,
  conductedBy = 'system',
): ReflectionRitual {
  const session = analyzeSession(state)
  const orchestrator = orchestrateTeam(state)
  const handoff = generateHandoffPack(state)
  const bibleStats = getBibleStats(state.teamName)

  const learnings: string[] = []

  // Extract learnings from session
  learnings.push(...session.topFailurePatterns)

  // Orchestraor recommendations become learnings
  learnings.push(...orchestrator.recommendations)

  // Health-based learnings
  const health = calculateHealthScore(state)
  if (health < 70) {
    learnings.push(`Health score (${health}%) indicates need for team composition review`)
  }

  // Token efficiency learnings
  if (session.tokenEfficiency < 10) {
    learnings.push('Low token efficiency — review agent context and prompt design')
  }

  // Bible evolution
  if (bibleStats.pending > 5) {
    learnings.push(`${bibleStats.pending} bible entries pending human review — may be blocking agents`)
  }

  // Proposed evolutions
  const proposedEvolutions: ReflectionRitual['proposedEvolutions'] = []

  // Prompt improvements
  for (const improvement of orchestrator.promptImprovements) {
    proposedEvolutions.push({
      type: 'prompt-update',
      description: `${improvement.personaId}: ${improvement.suggestedChanges}`,
      expectedImpact: improvement.expectedImpact,
    })
  }

  // New persona suggestions
  for (const suggestion of orchestrator.newPersonaSuggestions) {
    proposedEvolutions.push({
      type: 'new-persona',
      description: `Add ${suggestion.name} (${suggestion.id}): ${suggestion.reason}`,
      expectedImpact: 'medium',
    })
  }

  // Workflow changes based on bottlenecks
  for (const bottleneck of orchestrator.bottlenecks) {
    proposedEvolutions.push({
      type: 'workflow-change',
      description: bottleneck,
      expectedImpact: 'high',
    })
  }

  // ROI estimation
  const roiMetrics = {
    timeSaved: session.completedTasks * 15,  // estimate 15 min saved per completed task
    qualityImprovement: Math.min(100, health + 10),
    tokenEfficiencyGain: session.tokenEfficiency < 10 ? 20 : 5,
  }

  const ritual: ReflectionRitual = {
    id: `ritual-${Date.now().toString(36)}`,
    teamName: state.teamName,
    milestone,
    conductedAt: Date.now(),
    conductedBy,
    learnings,
    proposedEvolutions,
    roiMetrics,
  }

  // Save ritual
  saveRitual(state.teamName, ritual)

  return ritual
}

// ============================================================================
// Human Review & Ratification
// ============================================================================

export function approveRitual(
  teamName: string,
  ritualId: string,
  implementedBy?: string,
): { success: boolean; message: string } {
  const rituals = loadRituals(teamName)
  const ritual = rituals.find(r => r.id === ritualId)
  if (!ritual) {
    return { success: false, message: `Ritual ${ritualId} not found` }
  }

  ritual.humanApproved = true
  ritual.implementedAt = Date.now()
  if (implementedBy) ritual.conductedBy = implementedBy

  saveRituals(teamName, rituals)
  return { success: true, message: `Ritual ${ritualId} approved and ratified` }
}

// ============================================================================
// Formatting for Dashboard
// ============================================================================

export function formatReflectionRitual(ritual: ReflectionRitual): string {
  const lines = [
    `=== Reflection Ritual: ${ritual.milestone} ===`,
    '',
    `Team: ${ritual.teamName}`,
    `Conducted: ${new Date(ritual.conductedAt).toLocaleString()}`,
    `By: ${ritual.conductedBy}`,
    `Status: ${ritual.humanApproved ? '✅ Approved & Ratified' : '⏸️ Pending Human Approval'}`,
    '',
  ]

  if (ritual.learnings.length > 0) {
    lines.push('=== Learnings ===', '')
    for (const [i, learning] of ritual.learnings.entries()) {
      lines.push(`${i + 1}. ${learning}`)
    }
    lines.push('')
  }

  if (ritual.proposedEvolutions.length > 0) {
    lines.push('=== Proposed Evolutions ===', '')
    for (const evo of ritual.proposedEvolutions) {
      const icon = evo.expectedImpact === 'high' ? '⚡' :
                    evo.expectedImpact === 'medium' ? '🟡' : '✅'
      const approved = evo.approved ? ' ✅' : ''
      lines.push(`${icon} [${evo.type}] ${evo.description}${approved}`)
    }
    lines.push('')
  }

  lines.push('=== ROI Metrics ===')
  lines.push(`Estimated Time Saved: ${ritual.roiMetrics.timeSaved} minutes`)
  lines.push(`Quality Improvement: +${ritual.roiMetrics.qualityImprovement} points`)
  lines.push(`Token Efficiency Gain: +${ritual.roiMetrics.tokenEfficiencyGain}%`)

  return lines.join('\n')
}

export function formatRitualSummary(rituals: ReflectionRitual[]): string {
  if (rituals.length === 0) return 'No reflection rituals conducted yet.'

  const lines = ['=== Reflection Rituals ===', '', `Total: ${rituals.length} rituals`, '']

  for (const ritual of rituals) {
    const icon = ritual.humanApproved ? '✅' : '⏸️'
    lines.push(`${icon} ${ritual.milestone} — ${ritual.learnings.length} learnings, ${ritual.proposedEvolutions.length} evolutions`)
  }

  return lines.join('\n')
}

// ============================================================================
// Persistence
// ============================================================================

function getRitualsPath(teamName: string): string {
  const { getConfigDir } = require('./auth')
  const path = require('path')
  return path.join(getConfigDir(), 'swarm', teamName, 'reflection-rituals.json')
}

function saveRitual(teamName: string, ritual: ReflectionRitual): void {
  const rituals = loadRituals(teamName)
  const idx = rituals.findIndex(r => r.id === ritual.id)
  if (idx >= 0) {
    rituals[idx] = ritual
  } else {
    rituals.push(ritual)
  }
  saveRituals(teamName, rituals)
}

function saveRituals(teamName: string, rituals: ReflectionRitual[]): void {
  const path = require('path')
  const fs = require('fs')
  const filePath = getRitualsPath(teamName)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(rituals, null, 2), 'utf-8')
}

export function loadRituals(teamName: string): ReflectionRitual[] {
  try {
    const path = require('path')
    const fs = require('fs')
    const filePath = getRitualsPath(teamName)
    if (!fs.existsSync(filePath)) return []
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return []
  }
}

// ============================================================================
// Auto-Trigger Conditions
// ============================================================================

export function shouldTriggerReflection(state: SwarmState): {
  should: boolean
  reason?: string
} {
  const completed = state.tasks.filter(t => t.status === 'completed').length

  // Trigger on phase transition
  if (completed > 0 && completed % 10 === 0) {
    return { should: true, reason: `Milestone: ${completed} tasks completed` }
  }

  // Trigger on low health
  const health = calculateHealthScore(state)
  if (health < 50) {
    return { should: true, reason: `Low health score: ${health}%` }
  }

  // Trigger on high token usage
  if (state.metrics.totalTokens > 100000) {
    return { should: true, reason: `High token usage: ${state.metrics.totalTokens.toLocaleString()}` }
  }

  return { should: false }
}
