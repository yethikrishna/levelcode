import type { PermissionProfileName } from '../permissions/profiles'
import type { ToolName } from '../tools/constants'

const DESTRUCTIVE_COMMAND_PATTERNS: RegExp[] = [
  /\brm\s+-rf?\b/,
  /\brm\s+.*--recursive/,
  /\bgit\s+push\s+.*(--force|-\w*f)/,
  /\bgit\s+push\s+--force-with-lease/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-fd/,
  /\bdd\s+if=/,
  /\bmkfs\b/,
  /:\(\)\{.*\}\)/,
  /\bchmod\s+-R\s+777\b/,
  /\bshutdown\b/,
  /\breboot\b/,
]

const READ_ONLY_TOOLS: ToolName[] = [
  'read_files',
  'read_subtree',
  'read_docs',
  'list_directory',
  'find_files',
  'glob',
  'code_search',
  'repo_map',
  'remember',
  'think_deeply',
  'end_turn',
  'web_search',
  'task_get',
  'task_list',
]

const TEST_COMMAND_PATTERNS: RegExp[] = [
  /^(npm|yarn|pnpm|bun)\s+(test|vitest|jest|cypress|playwright)/i,
  /^bun\s+test\b/,
  /^cargo\s+test\b/,
  /^go\s+test\b/,
  /^pytest\b/,
  /^python\s+-m\s+pytest\b/,
  /^rspec\b/,
  /^tsc\b.*--noEmit/,
]

const WRITE_TOOLS: ToolName[] = [
  'write_file',
  'str_replace',
  'propose_str_replace',
  'propose_write_file',
]

const TERMINAL_TOOL: ToolName = 'run_terminal_command'

export interface ApprovalRequest {
  id: string
  timestamp: number
  toolCall: {
    toolName: ToolName | string
    args: Record<string, unknown>
  }
  diff: string
  filesChanged: string[]
  profile: PermissionProfileName
  isDestructive: boolean
  reason: string
}

export type ApprovalCallback = (
  request: ApprovalRequest,
  decision: 'approve' | 'reject' | 'edit',
  editedDiff?: string,
) => void

export interface ApprovalResult {
  approved: boolean
  pendingRequest?: ApprovalRequest
  reason: string
}

function generateRequestId(): string {
  return `approval-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function isDestructiveCommand(command: string): boolean {
  return DESTRUCTIVE_COMMAND_PATTERNS.some((pattern) => pattern.test(command))
}

function isTestCommand(command: string): boolean {
  return TEST_COMMAND_PATTERNS.some((pattern) => pattern.test(command.trim()))
}

function isFileWrite(toolName: string): boolean {
  return WRITE_TOOLS.includes(toolName as ToolName)
}

function isReadOnly(toolName: string): boolean {
  return READ_ONLY_TOOLS.includes(toolName as ToolName)
}

/**
 * Diff Preview & Approval Gate.
 *
 * Controls whether tool execution proceeds automatically, pauses for
 * user approval, or is blocked based on the active permission profile.
 *
 * Gate rules:
 * - sandboxed: requires approval for any file write
 * - trusted: auto-approves reads and test commands, pauses for destructive ops (rm, push --force, etc.)
 * - godmode: auto-approves everything
 */
export class DiffApprovalGate {
  private approvers: ApprovalCallback[] = []
  private pendingRequests: Map<string, ApprovalRequest> = new Map()

  /**
   * Register a callback invoked when an approval decision is made.
   * Returns an unsubscribe function.
   */
  registerApprover(callback: ApprovalCallback): () => void {
    this.approvers.push(callback)
    return () => {
      this.approvers = this.approvers.filter((c) => c !== callback)
    }
  }

  /**
   * Check whether a tool call should be auto-approved under the given profile.
   */
  isAutoApproved(
    toolCall: { toolName: ToolName | string; args?: Record<string, unknown> },
    profile: PermissionProfileName,
  ): boolean {
    const { toolName, args = {} } = toolCall

    if (profile === 'godmode') return true

    if (profile === 'trusted') {
      if (isReadOnly(toolName)) return true
      if (toolName === TERMINAL_TOOL) {
        const command = String(args.command ?? args.cmd ?? '').trim()
        if (isTestCommand(command)) return true
        if (isDestructiveCommand(command)) return false
        return true
      }
      if (isFileWrite(toolName)) return false
      return true
    }

    if (profile === 'sandboxed') {
      if (isReadOnly(toolName)) return true
      if (isFileWrite(toolName)) return false
      if (toolName === TERMINAL_TOOL) return false
      return true
    }

    if (profile === 'readonly') return isReadOnly(toolName)

    return false
  }

  /**
   * Create an approval request for a diff-based change.
   */
  requestApproval(
    diff: string,
    filesChanged: string[],
    toolCall: { toolName: ToolName | string; args?: Record<string, unknown> },
    profile: PermissionProfileName,
  ): ApprovalRequest {
    const { toolName, args = {} } = toolCall
    let reason = ''
    let isDestructive = false

    if (isFileWrite(toolName)) {
      reason = `File write (${toolName}) requires approval in ${profile} mode`
    } else if (toolName === TERMINAL_TOOL) {
      const command = String(args.command ?? args.cmd ?? '').trim()
      isDestructive = isDestructiveCommand(command)
      reason = isDestructive
        ? `Destructive command detected: "${command.slice(0, 80)}"`
        : `Terminal command requires approval in ${profile} mode`
    } else {
      reason = `Operation (${toolName}) requires approval in ${profile} mode`
    }

    const request: ApprovalRequest = {
      id: generateRequestId(),
      timestamp: Date.now(),
      toolCall: { toolName, args },
      diff,
      filesChanged,
      profile,
      isDestructive,
      reason,
    }

    this.pendingRequests.set(request.id, request)
    return request
  }

  /**
   * Resolve a pending approval request with a decision.
   */
  resolveApproval(
    requestId: string,
    decision: 'approve' | 'reject' | 'edit',
    editedDiff?: string,
  ): boolean {
    const request = this.pendingRequests.get(requestId)
    if (!request) return false

    this.pendingRequests.delete(requestId)
    for (const cb of this.approvers) {
      try { cb(request, decision, editedDiff) } catch { /* swallow */ }
    }
    return true
  }

  /**
   * Evaluate a tool call and produce an approval result.
   */
  evaluate(
    toolCall: { toolName: ToolName | string; args?: Record<string, unknown> },
    profile: PermissionProfileName,
    diff: string = '',
    filesChanged: string[] = [],
  ): ApprovalResult {
    if (this.isAutoApproved(toolCall, profile)) {
      return { approved: true, reason: `Auto-approved under ${profile} profile` }
    }
    const request = this.requestApproval(diff, filesChanged, toolCall, profile)
    return { approved: false, pendingRequest: request, reason: request.reason }
  }

  /** Get a pending approval request by ID. */
  getPendingRequest(requestId: string): ApprovalRequest | undefined {
    return this.pendingRequests.get(requestId)
  }

  /** Get all pending approval requests. */
  getPendingRequests(): ApprovalRequest[] {
    return Array.from(this.pendingRequests.values())
  }

  /** Clear all pending requests. */
  clearPending(): void {
    this.pendingRequests.clear()
  }
}

let _globalGate: DiffApprovalGate | null = null

/** Get the global DiffApprovalGate singleton. */
export function getDiffApprovalGate(): DiffApprovalGate {
  if (!_globalGate) _globalGate = new DiffApprovalGate()
  return _globalGate
}

/** Reset the global gate instance (primarily for testing). */
export function resetDiffApprovalGate(): void {
  _globalGate = null
}
