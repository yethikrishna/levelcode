import type { SwarmPersona } from '../types/swarm-persona'
import { PERSONA_PRESETS, getPresetPersonaIds } from '../types/swarm-persona'
import { getConfigDir } from '../utils/auth'
import fs from 'fs'
import path from 'path'

// ============================================================================
// Persona Storage
// ============================================================================

function getPersonasDir(): string {
  return path.join(getConfigDir(), 'swarm', 'personas')
}

function getPersonasPath(teamName: string): string {
  return path.join(getPersonasDir(), `${teamName}-personas.json`)
}

// ============================================================================
// Load Personas
// ============================================================================

export function loadPersonas(teamName: string): Record<string, SwarmPersona> {
  const personas: Record<string, SwarmPersona> = {}

  // Load presets first
  Object.assign(personas, PERSONA_PRESETS)

  // Load custom personas for this team
  try {
    const filePath = getPersonasPath(teamName)
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const custom = JSON.parse(raw)
      Object.assign(personas, custom)
    }
  } catch {
    // Ignore errors, use presets only
  }

  return personas
}

export function loadPersona(teamName: string, personaId: string): SwarmPersona | null {
  const personas = loadPersonas(teamName)
  return personas[personaId] ?? null
}

// ============================================================================
// Save Personas
// ============================================================================

export function savePersonas(teamName: string, personas: Record<string, SwarmPersona>): void {
  const dir = getPersonasDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Only save custom personas (filter out presets)
  const custom: Record<string, SwarmPersona> = {}
  for (const [id, persona] of Object.entries(personas)) {
    if (persona.isCustom) {
      custom[id] = persona
    }
  }

  fs.writeFileSync(getPersonasPath(teamName), JSON.stringify(custom, null, 2), 'utf-8')
}

export function savePersona(teamName: string, persona: SwarmPersona): void {
  const personas = loadPersonas(teamName)
  personas[persona.id] = { ...persona, isCustom: true }
  savePersonas(teamName, personas)
}

// ============================================================================
// Delete Persona
// ============================================================================

export function deletePersona(teamName: string, personaId: string): boolean {
  const personas = loadPersonas(teamName)

  if (!personas[personaId]) return false
  if (!personas[personaId].isCustom) return false

  delete personas[personaId]
  savePersonas(teamName, personas)
  return true
}

// ============================================================================
// List Personas
// ============================================================================

export function listPersonas(teamName: string, includePresets = true): SwarmPersona[] {
  const personas = loadPersonas(teamName)

  const list = Object.values(personas)
  if (!includePresets) {
    return list.filter(p => p.isCustom)
  }
  return list
}

export function getAvailablePersonaIds(teamName: string): string[] {
  return Object.keys(loadPersonas(teamName))
}

// ============================================================================
// Validate Persona
// ============================================================================

export function validatePersona(persona: Partial<SwarmPersona>): string[] {
  const errors: string[] = []

  if (!persona.id?.trim()) {
    errors.push('Persona ID is required')
  }
  if (!persona.name?.trim()) {
    errors.push('Persona name is required')
  }
  if (!persona.role?.trim()) {
    errors.push('Persona role is required')
  }
  if (!persona.systemPrompt?.trim()) {
    errors.push('System prompt is required')
  }

  const validRoles = ['implementer', 'reviewer', 'tester', 'architect', 'debugger']
  if (persona.role && !validRoles.includes(persona.role)) {
    errors.push(`Role must be one of: ${validRoles.join(', ')}`)
  }

  return errors
}

// ============================================================================
// Persona Formatting
// ============================================================================

export function formatPersonaBrief(persona: SwarmPersona): string {
  const lines = [
    `${persona.name} (@${persona.id})`,
    `Role: ${persona.role}`,
  ]

  if (persona.description) {
    lines.push(`Description: ${persona.description}`)
  }

  if (persona.toolPermissions) {
    const perms = persona.toolPermissions
    if (perms.allowed?.length) {
      lines.push(`Allowed: ${perms.allowed.join(', ')}`)
    }
    if (perms.blocked?.length) {
      lines.push(`Blocked: ${perms.blocked.join(', ')}`)
    }
  }

  return lines.join('\n')
}

export function formatPersonaList(teamName: string): string {
  const personas = listPersonas(teamName)
  const lines: string[] = ['Available Personas:', '']

  for (const persona of personas) {
    lines.push(formatPersonaBrief(persona))
    lines.push('')
  }

  return lines.join('\n')
}