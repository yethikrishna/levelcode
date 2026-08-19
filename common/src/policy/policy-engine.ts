import fs from 'fs'
import path from 'path'

import type { ToolName } from '../tools/constants'

/**
 * Policy rule effect: what to do when a rule matches.
 */
export type PolicyEffect = 'allow' | 'deny' | 'requireApproval'

/**
 * A single policy rule definition.
 *
 * Rules can target specific tools, path patterns, or command regexes.
 * All conditions on a rule must match for the effect to apply.
 */
export interface PolicyRule {
  /** Unique rule identifier */
  id: string
  /** Human-readable description */
  description: string
  /** Effect when the rule matches */
  effect: PolicyEffect
  /** Tool name(s) this rule applies to. If omitted, applies to all tools. */
  tools?: (ToolName | string)[]
  /** Glob patterns for filesystem paths this rule applies to. */
  paths?: string[]
  /** Regex pattern(s) for terminal commands this rule applies to. */
  commandPatterns?: string[]
  /** If true, paths are treated as deny patterns (rule matches when path matches) */
  pathDeny?: boolean
  /** Reason code for audit logging */
  reason?: string
  /** Whether this rule is enabled (default: true) */
  enabled?: boolean
}

/**
 * A loaded policy document containing multiple rules.
 */
export interface PolicyDocument {
  /** Policy name */
  name: string
  /** Policy version (semver) */
  version?: string
  /** Human-readable description */
  description?: string
  /** Rules defined in this policy */
  rules: PolicyRule[]
}

/**
 * Result of evaluating a tool call against loaded policies.
 */
export interface PolicyResult {
  /** Final decision */
  decision: PolicyEffect
  /** Human-readable reason for the decision */
  reason: string
  /** ID of the matching rule, if any */
  matchedRuleId?: string
  /** Source policy name that contained the matching rule */
  matchedPolicy?: string
}

/**
 * Context passed to policy checks beyond the tool call itself.
 */
export interface PolicyContext {
  /** Filesystem path being operated on, if applicable */
  filePath?: string
  /** Terminal command string, if applicable */
  command?: string
  /** Active permission profile */
  profile?: string
  /** Current working directory */
  cwd?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Built-in policy template identifiers.
 */
export type BuiltInPolicyTemplate =
  | 'no-destructive'
  | 'read-only-tests'
  | 'no-secrets-in-code'

/**
 * Simple glob-to-regex converter for path patterns.
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<GLOBSTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<GLOBSTAR>>/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

/**
 * Check whether a file path matches any of the given glob patterns.
 */
function matchesAnyGlob(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  return patterns.some((pattern) => {
    try {
      return globToRegex(pattern).test(normalized)
    } catch {
      return false
    }
  })
}

/**
 * Check whether a command matches any of the given regex patterns.
 */
function matchesAnyCommand(command: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern, 'i').test(command)
    } catch {
      return false
    }
  })
}

/**
 * Built-in policy templates.
 */
const BUILT_IN_POLICIES: Record<BuiltInPolicyTemplate, PolicyDocument> = {
  'no-destructive': {
    name: 'no-destructive',
    description: 'Block all destructive operations (force push, rm -rf, hard reset, etc.)',
    rules: [
      {
        id: 'no-force-push',
        description: 'Block git push --force',
        effect: 'deny',
        tools: ['run_terminal_command'],
        commandPatterns: [
          'git\\s+push\\s+.*(--force|--force-with-lease|-f)\\b',
        ],
        reason: 'Force push is blocked by no-destructive policy',
      },
      {
        id: 'no-rm-rf',
        description: 'Block rm -rf',
        effect: 'deny',
        tools: ['run_terminal_command'],
        commandPatterns: [
          '\\brm\\s+-[a-zA-Z]*r[a-zA-Z]*f\\b',
          '\\brm\\s+-[a-zA-Z]*f[a-zA-Z]*r\\b',
          '\\brm\\s+.*--recursive.*--force',
        ],
        reason: 'Recursive force removal is blocked by no-destructive policy',
      },
      {
        id: 'no-hard-reset',
        description: 'Block git reset --hard',
        effect: 'deny',
        tools: ['run_terminal_command'],
        commandPatterns: ['git\\s+reset\\s+--hard\\b'],
        reason: 'Hard reset is blocked by no-destructive policy',
      },
      {
        id: 'no-git-clean-fd',
        description: 'Block git clean -fd',
        effect: 'deny',
        tools: ['run_terminal_command'],
        commandPatterns: ['git\\s+clean\\s+-[a-zA-Z]*f[a-zA-Z]*d[a-zA-Z]*\\b'],
        reason: 'git clean -fd is blocked by no-destructive policy',
      },
    ],
  },

  'read-only-tests': {
    description: 'Require approval for writes during test runs; allow reads freely',
    name: 'read-only-tests',
    rules: [
      {
        id: 'tests-no-write',
        description: 'Require approval for file writes during test commands',
        effect: 'requireApproval',
        tools: ['write_file', 'str_replace', 'propose_str_replace', 'propose_write_file'],
        reason: 'File writes during test execution require approval (read-only-tests policy)',
      },
    ],
  },

  'no-secrets-in-code': {
    name: 'no-secrets-in-code',
    description: 'Block writing known secret patterns into tracked files',
    rules: [
      {
        id: 'no-aws-keys',
        description: 'Block AWS access key patterns',
        effect: 'deny',
        tools: ['write_file', 'str_replace', 'propose_str_replace', 'propose_write_file'],
        paths: ['**/*.{js,ts,jsx,tsx,py,go,rs,java,rb,php,sh,yml,yaml,json,toml,env}'],
        commandPatterns: ['AKIA[0-9A-Z]{16}'],
        reason: 'Possible AWS access key detected in code (no-secrets-in-code policy)',
      },
      {
        id: 'no-private-keys',
        description: 'Block writing private key contents',
        effect: 'deny',
        tools: ['write_file', 'str_replace', 'propose_str_replace', 'propose_write_file'],
        commandPatterns: ['-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----'],
        reason: 'Private key content detected (no-secrets-in-code policy)',
      },
      {
        id: 'no-github-tokens',
        description: 'Block GitHub token patterns',
        effect: 'deny',
        tools: ['write_file', 'str_replace', 'propose_str_replace', 'propose_write_file'],
        commandPatterns: ['ghp_[A-Za-z0-9]{36,}', 'github_pat_[A-Za-z0-9_]{82,}'],
        reason: 'GitHub token detected in code (no-secrets-in-code policy)',
      },
    ],
  },
}

/**
 * Destructive command patterns used as default always-on guards.
 */
const DEFAULT_DESTRUCTIVE_PATTERNS: string[] = [
  '\\brm\\s+-rf\\b',
  '\\bgit\\s+push\\s+.*--force',
  '\\bgit\\s+reset\\s+--hard',
  '\\bdd\\s+if=',
  '\\bmkfs\\b',
]

/**
 * Policy Engine for policy-as-code governance.
 *
 * Loads YAML/JSON policy files from `.levelcode/policies/` or project root,
 * evaluates tool calls against all loaded rules, and produces a decision
 * (allow / deny / requireApproval) with reasoning.
 */
export class PolicyEngine {
  private policies: PolicyDocument[] = []
  private rules: (PolicyRule & { __policyName: string })[] = []
  private loadedDirectories: Set<string> = new Set()

  /**
   * Load policy files from a directory.
   *
   * Scans for `.yml`, `.yaml`, and `.json` files, parses them as
   * PolicyDocument instances, and merges their rules into the engine.
   *
   * @param dir - Absolute path to the directory containing policy files
   */
  async loadPolicies(dir: string): Promise<number> {
    if (this.loadedDirectories.has(dir)) {
      return 0
    }
    this.loadedDirectories.add(dir)

    if (!fs.existsSync(dir)) {
      return 0
    }

    const entries = fs.readdirSync(dir)
    let loadedCount = 0

    for (const entry of entries) {
      const fullPath = path.join(dir, entry)
      const stat = fs.statSync(fullPath)
      if (!stat.isFile()) continue

      const ext = path.extname(entry).toLowerCase()
      if (ext !== '.json' && ext !== '.yml' && ext !== '.yaml') continue

      try {
        const raw = fs.readFileSync(fullPath, 'utf-8')
        let doc: PolicyDocument

        if (ext === '.json') {
          doc = JSON.parse(raw) as PolicyDocument
        } else {
          doc = await this.parseYaml(raw)
        }

        if (doc && Array.isArray(doc.rules)) {
          this.policies.push(doc)
          for (const rule of doc.rules) {
            if (rule.enabled !== false) {
              this.rules.push({ ...rule, __policyName: doc.name })
            }
          }
          loadedCount++
        }
      } catch (err) {
        // Skip malformed policy files but do not crash
        console.warn(`[policy-engine] Failed to load policy file ${entry}: ${(err as Error).message}`)
      }
    }

    return loadedCount
  }

  /**
   * Parse YAML content. Uses a lightweight approach — attempts dynamic import
   * of the `yaml` package; falls back to treating content as JSON on failure.
   */
  private async parseYaml(raw: string): Promise<PolicyDocument> {
    try {
      const yaml = await import('yaml')
      return yaml.parse(raw) as PolicyDocument
    } catch {
      return JSON.parse(raw) as PolicyDocument
    }
  }

  /**
   * Add a single policy rule programmatically.
   */
  addPolicy(rule: PolicyRule, policyName: string = 'programmatic'): void {
    if (rule.enabled !== false) {
      this.rules.push({ ...rule, __policyName: policyName })
    }
  }

  /**
   * Add an entire PolicyDocument programmatically.
   */
  addPolicyDocument(doc: PolicyDocument): void {
    this.policies.push(doc)
    for (const rule of doc.rules) {
      if (rule.enabled !== false) {
        this.rules.push({ ...rule, __policyName: doc.name })
      }
    }
  }

  /**
   * Load a built-in policy template by name.
   */
  loadBuiltInPolicy(template: BuiltInPolicyTemplate): void {
    const doc = BUILT_IN_POLICIES[template]
    if (doc) {
      this.addPolicyDocument(doc)
    }
  }

  /**
   * Check a tool call against all loaded policies.
   *
   * Evaluation order:
   * 1. If any rule with effect 'deny' matches → deny
   * 2. If any rule with effect 'requireApproval' matches → requireApproval
   * 3. Otherwise → allow
   *
   * @param toolCall - The tool call to evaluate
   * @param context - Additional context (file path, command, profile, etc.)
   * @returns PolicyResult with decision and reason
   */
  checkPolicy(
    toolCall: { toolName: ToolName | string; args?: Record<string, unknown> },
    context: PolicyContext = {},
  ): PolicyResult {
    const { toolName, args = {} } = toolCall
    const filePath = context.filePath || this.extractFilePath(toolName, args)
    const command = context.command || this.extractCommand(toolName, args)

    let firstApprovalRule: (PolicyRule & { __policyName: string }) | null = null

    for (const rule of this.rules) {
      if (!this.ruleMatches(rule, toolName, filePath, command)) {
        continue
      }

      if (rule.effect === 'deny') {
        return {
          decision: 'deny',
          reason: rule.reason || `Blocked by policy rule "${rule.id}" (${rule.description})`,
          matchedRuleId: rule.id,
          matchedPolicy: rule.__policyName,
        }
      }

      if (rule.effect === 'requireApproval' && !firstApprovalRule) {
        firstApprovalRule = rule
      }
    }

    if (firstApprovalRule) {
      return {
        decision: 'requireApproval',
        reason: firstApprovalRule.reason
          || `Approval required by policy rule "${firstApprovalRule.id}" (${firstApprovalRule.description})`,
        matchedRuleId: firstApprovalRule.id,
        matchedPolicy: firstApprovalRule.__policyName,
      }
    }

    return {
      decision: 'allow',
      reason: 'Allowed: no matching deny or requireApproval rules',
    }
  }

  /**
   * Check whether a tool is entirely blocked (regardless of args).
   * Returns true if any deny rule matches the tool name with no path/command constraints.
   */
  isToolBlocked(toolName: ToolName | string): boolean {
    return this.rules.some(
      (r) =>
        r.effect === 'deny'
        && r.tools?.includes(toolName)
        && !r.paths
        && !r.commandPatterns,
    )
  }

  /**
   * Get all loaded rules.
   */
  getRules(): PolicyRule[] {
    return this.rules.map(({ __policyName: _, ...rule }) => rule)
  }

  /**
   * Get all loaded policy documents.
   */
  getPolicies(): PolicyDocument[] {
    return [...this.policies]
  }

  /**
   * Remove all loaded rules and policies (useful for testing).
   */
  clear(): void {
    this.policies = []
    this.rules = []
    this.loadedDirectories.clear()
  }

  /**
   * Determine if a single rule matches the given tool/path/command.
   */
  private ruleMatches(
    rule: PolicyRule,
    toolName: string,
    filePath?: string,
    command?: string,
  ): boolean {
    if (rule.tools && !rule.tools.includes(toolName)) {
      return false
    }

    if (rule.paths && filePath) {
      const pathMatches = matchesAnyGlob(filePath, rule.paths)
      if (rule.pathDeny ? !pathMatches : !pathMatches) {
        if (!pathMatches) return false
      }
    } else if (rule.paths && !filePath) {
      return false
    }

    if (rule.commandPatterns) {
      if (!command) return false
      if (!matchesAnyCommand(command, rule.commandPatterns)) {
        return false
      }
    }

    return true
  }

  /**
   * Best-effort extraction of a file path from tool arguments.
   */
  private extractFilePath(toolName: string, args: Record<string, unknown>): string | undefined {
    if (args.file_path) return String(args.file_path)
    if (args.path) return String(args.path)
    if (args.filePath) return String(args.filePath)
    if (toolName === 'str_replace' && args.file_path) return String(args.file_path)
    return undefined
  }

  /**
   * Best-effort extraction of a command string from tool arguments.
   */
  private extractCommand(toolName: string, args: Record<string, unknown>): string | undefined {
    if (toolName !== 'run_terminal_command') return undefined
    if (args.command) return String(args.command)
    if (args.cmd) return String(args.cmd)
    return undefined
  }
}

/**
 * Singleton global policy engine instance.
 */
let _globalEngine: PolicyEngine | null = null

/**
 * Get the global PolicyEngine singleton.
 */
export function getPolicyEngine(): PolicyEngine {
  if (!_globalEngine) {
    _globalEngine = new PolicyEngine()
  }
  return _globalEngine
}

/**
 * Reset the global policy engine (primarily for testing).
 */
export function resetPolicyEngine(): void {
  _globalEngine = null
}

/**
 * Create a PolicyEngine pre-loaded with sensible default policies:
 * - no-destructive: blocks rm -rf, force push, hard reset
 */
export function createDefaultPolicyEngine(): PolicyEngine {
  const engine = new PolicyEngine()
  engine.loadBuiltInPolicy('no-destructive')
  return engine
}

export { BUILT_IN_POLICIES }
