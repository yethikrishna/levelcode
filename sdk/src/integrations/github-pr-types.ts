/**
 * GitHub PR types used by PRSwarmManager.
 */
export interface PRRef {
  owner: string
  repo: string
  number: number
}

export interface PRComment {
  id: number
  body: string
  user: string
  createdAt: string
  path?: string
  line?: number
}

export interface PRFile {
  filename: string
  status: 'added' | 'modified' | 'removed' | 'renamed'
  additions: number
  deletions: number
  patch?: string
}

export interface ReviewComment {
  path: string
  line: number
  body: string
  side?: 'LEFT' | 'RIGHT'
}

export interface ReviewResult {
  prRef: PRRef
  summary: string
  comments: ReviewComment[]
  approved: boolean
  issues: string[]
  suggestions: string[]
  testsPassed: boolean
  score: number
  reviewedAt: number
}

export interface AttachOptions {
  /** GitHub personal access token (or uses GITHUB_TOKEN env) */
  token?: string
  /** Regex of files to exclude from review */
  excludePaths?: string[]
  /** Auto-approve when all checks pass and no issues found */
  autoApprove?: boolean
  /** Auto-merge when checks green and approved */
  autoMerge?: boolean
  /** Run tests as part of checks */
  runTests?: boolean
  /** Custom review prompt passed to the swarm */
  reviewPrompt?: string
}

export interface CheckRun {
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped'
}
