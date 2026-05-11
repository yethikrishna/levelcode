import type { SwarmState } from '../utils/swarm-state'
import fs from 'fs'
import path from 'path'
import { getConfigDir } from '../utils/auth'

// ============================================================================
// Circuit Breaker Configuration
// ============================================================================

export interface CircuitBreakerConfig {
  failureThreshold: number  // Failures before opening (default 5)
  successThreshold: number  // Successes before closing (default 3)
  timeout: number          // Time to wait before retry (default 30000)
  halfOpenRequests: number // Max requests in half-open state (default 3)
}

const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 30000,
  halfOpenRequests: 3,
}

// ============================================================================
// Circuit Breaker State
// ============================================================================

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreaker {
  id: string
  name: string
  state: CircuitState
  failures: number
  successes: number
  lastFailure?: number
  lastSuccess?: number
  nextAttempt?: number
  halfOpenCount: number
}

// ============================================================================
// Circuit Breaker Management
// ============================================================================

const CIRCUITS = new Map<string, CircuitBreaker>()

export function getCircuitBreaker(
  id: string,
  name?: string,
): CircuitBreaker {
  let circuit = CIRCUITS.get(id)
  if (!circuit) {
    circuit = {
      id,
      name: name || id,
      state: 'closed',
      failures: 0,
      successes: 0,
      halfOpenCount: 0,
    }
    CIRCUITS.set(id, circuit)
  }
  return circuit
}

export function isCircuitOpen(id: string): boolean {
  const circuit = CIRCUITS.get(id)
  if (!circuit) return false

  if (circuit.state === 'closed') {
    return false
  }

  if (circuit.state === 'open') {
    // Check if timeout has passed
    if (circuit.nextAttempt && Date.now() > circuit.nextAttempt) {
      // Transition to half-open
      circuit.state = 'half-open'
      circuit.halfOpenCount = 0
      return false
    }
    return true
  }

  // half-open: allow limited requests
  return circuit.halfOpenCount >= DEFAULT_CIRCUIT_BREAKER_CONFIG.halfOpenRequests
}

export function recordSuccess(id: string): void {
  const circuit = CIRCUITS.get(id)
  if (!circuit) return

  circuit.lastSuccess = Date.now()
  circuit.successes++

  if (circuit.state === 'half-open') {
    circuit.halfOpenCount++
    if (circuit.successes >= DEFAULT_CIRCUIT_BREAKER_CONFIG.successThreshold) {
      // Close the circuit
      circuit.state = 'closed'
      circuit.failures = 0
      circuit.successes = 0
      console.log(`[CircuitBreaker] ${circuit.name} CLOSED`)
    }
  } else if (circuit.state === 'closed') {
    circuit.successes = 0
  }
}

export function recordFailure(id: string, _error?: string): void {
  const circuit = CIRCUITS.get(id)
  if (!circuit) return

  circuit.lastFailure = Date.now()
  circuit.failures++

  if (circuit.state === 'half-open') {
    // Re-open the circuit
    circuit.state = 'open'
    circuit.nextAttempt = Date.now() + DEFAULT_CIRCUIT_BREAKER_CONFIG.timeout
    circuit.successes = 0
    console.log(`[CircuitBreaker] ${circuit.name} RE-OPENED`)
  } else if (circuit.state === 'closed') {
    if (circuit.failures >= DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      // Open the circuit
      circuit.state = 'open'
      circuit.nextAttempt = Date.now() + DEFAULT_CIRCUIT_BREAKER_CONFIG.timeout
      console.log(`[CircuitBreaker] ${circuit.name} OPENED (${circuit.failures} failures)`)
    }
  }
}

export function resetCircuitBreaker(id: string): void {
  const circuit = CIRCUITS.get(id)
  if (circuit) {
    circuit.state = 'closed'
    circuit.failures = 0
    circuit.successes = 0
  }
}

export function getAllCircuits(): CircuitBreaker[] {
  return Array.from(CIRCUITS.values())
}

// ============================================================================
// Swarm-Level Circuit Breakers
// ============================================================================

export const SWARM_CIRCUITS = {
  apiCalls: 'swarm-api-calls',
  taskExecution: 'swarm-task-execution',
  agentSpawning: 'swarm-agent-spawning',
  reviewLoop: 'swarm-review-loop',
  phaseTransition: 'swarm-phase-transition',
} as const

export function checkSwarmCircuit(id: keyof typeof SWARM_CIRCUITS): boolean {
  return isCircuitOpen(SWARM_CIRCUITS[id])
}

export function recordSwarmSuccess(id: keyof typeof SWARM_CIRCUITS): void {
  recordSuccess(SWARM_CIRCUITS[id])
}

export function recordSwarmFailure(id: keyof typeof SWARM_CIRCUITS, error?: string): void {
  recordFailure(SWARM_CIRCUITS[id], error)
}

// ============================================================================
// Circuit Breaker Integration with Swarm State
// ============================================================================

export function updateSwarmStateFromCircuits(state: SwarmState): void {
  // Check API circuit
  if (checkSwarmCircuit('apiCalls')) {
    if (!state.healthWarnings) state.healthWarnings = []
    state.healthWarnings.push('API circuit is open - rate limited')
  }

  // Check execution circuit
  if (checkSwarmCircuit('taskExecution')) {
    if (!state.healthWarnings) state.healthWarnings = []
    state.healthWarnings.push('Task execution circuit is open')
  }

  // Check review circuit
  if (checkSwarmCircuit('reviewLoop')) {
    if (!state.healthWarnings) state.healthWarnings = []
    state.healthWarnings.push('Review circuit is open - skipping reviews')
  }
}

// ============================================================================
// Circuit Breaker Persistence
// ============================================================================

export function saveCircuitBreakers(teamName: string): void {
  const dir = getConfigDir()
  const circuitDir = path.join(dir, 'swarm', 'circuits')
  if (!fs.existsSync(circuitDir)) {
    fs.mkdirSync(circuitDir, { recursive: true })
  }

  const data = getAllCircuits()
  const filePath = path.join(circuitDir, `${teamName}.json`)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export function loadCircuitBreakers(teamName: string): void {
  try {
    const dir = getConfigDir()
    const filePath = path.join(dir, 'swarm', 'circuits', `${teamName}.json`)
    if (!fs.existsSync(filePath)) return

    const data: CircuitBreaker[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    for (const circuit of data) {
      CIRCUITS.set(circuit.id, circuit)
    }
  } catch {
    // Ignore errors
  }
}

// ============================================================================
// Formatting
// ============================================================================

export function formatCircuitBreaker(circuit: CircuitBreaker): string {
  const icon = circuit.state === 'closed' ? '🟢' :
              circuit.state === 'open' ? '🔴' : '🟡'

  return `${icon} ${circuit.name}: ${circuit.state.toUpperCase()} (f:${circuit.failures}, s:${circuit.successes})`
}

export function formatAllCircuitBreakers(): string {
  const circuits = getAllCircuits()
  if (circuits.length === 0) {
    return 'No circuit breakers active.'
  }

  const lines = ['=== Circuit Breakers ===', '']
  for (const circuit of circuits) {
    lines.push(formatCircuitBreaker(circuit))
  }
  return lines.join('\n')
}