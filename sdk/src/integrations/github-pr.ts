import type {
  PRRef,
  PRComment,
  PRFile,
  ReviewComment,
  ReviewResult,
  AttachOptions,
  CheckRun,
} from './github-pr-types'
import { getGithubTokenFromEnv } from '../env'

const GITHUB_API = 'https://api.github.com'

/**
 * Parses a PR reference string in the form "owner/repo#number".
 */
export function parsePRRef(input: string): PRRef | null {
  const match = input.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/)
  if (!match) return null
  return {
    owner: match[1]!,
    repo: match[2]!,
    number: parseInt(match[3]!, 10),
  }
}

/**
 * Manages swarm agents attached to GitHub Pull Requests.
 *
 * On attach: spawns a swarm that reviews the PR diff, runs tests
 * (configurable), posts comments, suggests fixes, and can auto-merge
 * when all checks are green.
 *
 * Uses the GitHub REST API via native fetch; a personal access token
 * can be passed via options or read from the GITHUB_TOKEN environment
 * variable. No external dependencies (e.g. Octokit) are required.
 */
export class PRSwarmManager {
  private token: string
  private attachedPRs = new Map<string, PRRef>()
  private activeSwarms = new Map<string, AbortController>()

  constructor(token?: string) {
    this.token = token ?? getGithubTokenFromEnv() ?? ''
  }

  /**
   * Attach a swarm to a GitHub PR. The swarm will review the diff,
   * optionally run checks, and post review comments.
   *
   * @param owner   Repository owner (org or user)
   * @param repo    Repository name
   * @param prNumber Pull request number
   * @param options  Configuration for the attached swarm
   */
  async attachToPR(
    owner: string,
    repo: string,
    prNumber: number,
    options: AttachOptions = {},
  ): Promise<{ prRef: PRRef; swarmId: string; initialReview: ReviewResult | null }> {
    const prRef: PRRef = { owner, repo, number: prNumber }
    const key = this.prKey(prRef)

    if (this.attachedPRs.has(key)) {
      throw new Error(`Already attached to ${owner}/${repo}#${prNumber}`)
    }

    this.attachedPRs.set(key, prRef)
    const swarmId = `swarm-${owner}-${repo}-${prNumber}-${Date.now()}`
    const abortController = new AbortController()
    this.activeSwarms.set(swarmId, abortController)

    let initialReview: ReviewResult | null = null
    try {
      initialReview = await this.reviewDiff(prRef, options)

      if (initialReview.comments.length > 0) {
        for (const comment of initialReview.comments) {
          await this.createReviewComment(prRef, comment)
        }
      }

      await this.postComment(
        prRef,
        `🤖 LevelCode swarm attached (${swarmId}). Review score: ${initialReview.score}/100. ${initialReview.approved ? '✅ Approved.' : '⚠️ Issues found.'}`,
      )

      if (options.autoApprove && initialReview.approved) {
        await this.submitReview(prRef, 'APPROVE', initialReview.summary)
      }

      if (options.autoMerge && initialReview.approved && initialReview.testsPassed) {
        await this.autoMergeIfGreen(prRef)
      }
    } catch (error) {
      await this.postComment(
        prRef,
        `❌ Swarm review failed: ${error instanceof Error ? error.message : String(error)}`,
      ).catch(() => {})
    }

    return { prRef, swarmId, initialReview }
  }

  /**
   * Post a top-level comment on the pull request.
   */
  async postComment(prRef: PRRef, comment: string): Promise<PRComment> {
    const data = await this.githubRequest<{
      id: number
      body: string
      user: { login: string }
      created_at: string
    }>(
      `${GITHUB_API}/repos/${prRef.owner}/${prRef.repo}/issues/${prRef.number}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ body: comment }),
      },
    )

    return {
      id: data.id,
      body: data.body,
      user: data.user.login,
      createdAt: data.created_at,
    }
  }

  /**
   * Run CI/check runs for the PR's head commit and return their status.
   */
  async runChecks(prRef: PRRef): Promise<CheckRun[]> {
    const pr = await this.githubRequest<{
      head: { sha: string }
    }>(`${GITHUB_API}/repos/${prRef.owner}/${prRef.repo}/pulls/${prRef.number}`)

    const sha = pr.head.sha
    const data = await this.githubRequest<{
      check_runs: Array<{
        name: string
        status: string
        conclusion: string | null
      }>
    }>(`${GITHUB_API}/repos/${prRef.owner}/${prRef.repo}/commits/${sha}/check-runs`)

    return data.check_runs.map(r => ({
      name: r.name,
      status: r.status as CheckRun['status'],
      conclusion: r.conclusion as CheckRun['conclusion'] | undefined,
    }))
  }

  /**
   * Fetch the PR diff and perform an automated code review, returning
   * a structured ReviewResult with comments, issues, and suggestions.
   */
  async reviewDiff(prRef: PRRef, options: AttachOptions = {}): Promise<ReviewResult> {
    const files = await this.getPRFiles(prRef)
    const excludePatterns = options.excludePaths ?? []
    const reviewedFiles = files.filter(f =>
      !excludePatterns.some(p => this.matchesGlob(f.filename, p)),
    )

    const issues: string[] = []
    const suggestions: string[] = []
    const comments: ReviewComment[] = []
    let totalAdditions = 0
    let totalDeletions = 0

    for (const file of reviewedFiles) {
      totalAdditions += file.additions
      totalDeletions += file.deletions

      if (file.patch) {
        const fileReview = this.analyzePatch(file)
        issues.push(...fileReview.issues)
        suggestions.push(...fileReview.suggestions)
        comments.push(...fileReview.comments)
      }
    }

    let testsPassed = true
    if (options.runTests !== false) {
      try {
        const checks = await this.runChecks(prRef)
        testsPassed = checks.every(c => c.conclusion === 'success' || c.conclusion === 'neutral' || c.conclusion === 'skipped')
      } catch {
        testsPassed = false
      }
    }

    const issuePenalty = issues.length * 10
    const testPenalty = testsPassed ? 0 : 20
    const score = Math.max(0, Math.min(100, 100 - issuePenalty - testPenalty))
    const approved = score >= 70 && issues.length === 0 && testsPassed

    const summary = [
      `Review of ${reviewedFiles.length} file(s):`,
      `  +${totalAdditions} -${totalDeletions} lines changed`,
      `  Issues found: ${issues.length}`,
      `  Suggestions: ${suggestions.length}`,
      `  Tests: ${testsPassed ? '✅ passing' : '❌ failing or unknown'}`,
      `  Score: ${score}/100`,
      issues.length > 0 ? `\nIssues:\n${issues.map(i => `  - ${i}`).join('\n')}` : '',
      suggestions.length > 0 ? `\nSuggestions:\n${suggestions.map(s => `  - ${s}`).join('\n')}` : '',
    ].filter(Boolean).join('\n')

    return {
      prRef,
      summary,
      comments,
      approved,
      issues,
      suggestions,
      testsPassed,
      score,
      reviewedAt: Date.now(),
    }
  }

  /**
   * Auto-merge the PR if all checks pass and it's approved.
   */
  async autoMergeIfGreen(prRef: PRRef): Promise<boolean> {
    try {
      const checks = await this.runChecks(prRef)
      const allGreen = checks.every(c => c.conclusion === 'success' || c.conclusion === 'neutral' || c.conclusion === 'skipped')
      if (!allGreen) return false

      const reviews = await this.githubRequest<
        Array<{ state: string }>
      >(`${GITHUB_API}/repos/${prRef.owner}/${prRef.repo}/pulls/${prRef.number}/reviews`)

      const hasApproval = reviews.some(r => r.state === 'APPROVED')
      if (!hasApproval) return false

      await this.githubRequest(
        `${GITHUB_API}/repos/${prRef.owner}/${prRef.repo}/pulls/${prRef.number}/merge`,
        {
          method: 'PUT',
          body: JSON.stringify({
            merge_method: 'squash',
            commit_title: `Merge PR #${prRef.number} (LevelCode swarm approved)`,
          }),
        },
      )

      await this.postComment(prRef, '✅ Auto-merged by LevelCode swarm (all checks green).').catch(() => {})
      return true
    } catch {
      return false
    }
  }

  /**
   * Detach a swarm from a PR, aborting any in-flight review.
   */
  detachFromPR(prRef: PRRef): void {
    const key = this.prKey(prRef)
    this.attachedPRs.delete(key)
    for (const [swarmId, controller] of this.activeSwarms) {
      if (swarmId.includes(`${prRef.owner}-${prRef.repo}-${prRef.number}`)) {
        controller.abort()
        this.activeSwarms.delete(swarmId)
      }
    }
  }

  /**
   * List all currently attached PRs.
   */
  listAttached(): PRRef[] {
    return Array.from(this.attachedPRs.values())
  }

  // ── Internal helpers ────────────────────────────────────────────────

  private prKey(prRef: PRRef): string {
    return `${prRef.owner}/${prRef.repo}#${prRef.number}`
  }

  private async getPRFiles(prRef: PRRef): Promise<PRFile[]> {
    const data = await this.githubRequest<
      Array<{
        filename: string
        status: string
        additions: number
        deletions: number
        patch?: string
      }>
    >(`${GITHUB_API}/repos/${prRef.owner}/${prRef.repo}/pulls/${prRef.number}/files?per_page=100`)

    return data.map(f => ({
      filename: f.filename,
      status: f.status as PRFile['status'],
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }))
  }

  private async createReviewComment(prRef: PRRef, comment: ReviewComment): Promise<void> {
    const pr = await this.githubRequest<{ head: { sha: string } }>(
      `${GITHUB_API}/repos/${prRef.owner}/${prRef.repo}/pulls/${prRef.number}`,
    )
    await this.githubRequest(
      `${GITHUB_API}/repos/${prRef.owner}/${prRef.repo}/pulls/${prRef.number}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({
          body: comment.body,
          commit_id: pr.head.sha,
          path: comment.path,
          line: comment.line,
          side: comment.side ?? 'RIGHT',
        }),
      },
    )
  }

  private async submitReview(
    prRef: PRRef,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body: string,
  ): Promise<void> {
    await this.githubRequest(
      `${GITHUB_API}/repos/${prRef.owner}/${prRef.repo}/pulls/${prRef.number}/reviews`,
      {
        method: 'POST',
        body: JSON.stringify({ event, body }),
      },
    )
  }

  private analyzePatch(file: PRFile): {
    issues: string[]
    suggestions: string[]
    comments: ReviewComment[]
  } {
    const issues: string[] = []
    const suggestions: string[] = []
    const comments: ReviewComment[] = []

    if (!file.patch) return { issues, suggestions, comments }

    const lines = file.patch.split('\n')
    let currentLine = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      if (line.startsWith('@@')) {
        const hunkMatch = line.match(/\+(\d+)(?:,(\d+))?/)
        if (hunkMatch) {
          currentLine = parseInt(hunkMatch[1]!, 10)
        }
        continue
      }
      if (line.startsWith('+') && !line.startsWith('+++')) {
        const added = line.slice(1)

        if (/debugger|console\.log\(|TODO|FIXME|HACK|XXX/.test(added)) {
          const label = /debugger/.test(added) ? 'debugger statement'
            : /console\.log\(/.test(added) ? 'console.log left in code'
            : /TODO|FIXME|HACK|XXX/.test(added) ? 'TODO/FIXME comment' : 'suspicious pattern'
          issues.push(`${file.filename}:${currentLine} — ${label}`)
          comments.push({
            path: file.filename,
            line: currentLine,
            body: `⚠️ ${label.charAt(0).toUpperCase() + label.slice(1)} detected.`,
            side: 'RIGHT',
          })
        }

        if (/\.only\(/.test(added) && /describe|it|test/.test(added)) {
          issues.push(`${file.filename}:${currentLine} — .only() will skip other tests`)
          comments.push({
            path: file.filename,
            line: currentLine,
            body: '⚠️ `.only()` found — this will skip other tests in CI.',
            side: 'RIGHT',
          })
        }

        if (/eval\(/.test(added)) {
          suggestions.push(`${file.filename}:${currentLine} — avoid eval() for security`)
        }

        if (/any\b/.test(added) && /:/.test(added) && /typescript|\.tsx?/.test(file.filename)) {
          suggestions.push(`${file.filename}:${currentLine} — consider replacing \`any\` with a proper type`)
        }

        currentLine++
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        // deletion, no line counter increment for new file
      } else {
        currentLine++
      }
    }

    return { issues, suggestions, comments }
  }

  private matchesGlob(filename: string, pattern: string): boolean {
    const regex = new RegExp(
      '^' + pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '{{GLOBSTAR}}')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(/{{GLOBSTAR}}/g, '.*') + '$',
    )
    return regex.test(filename)
  }

  private async githubRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }

    const response = await fetch(url, {
      ...init,
      headers,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`GitHub API error ${response.status}: ${text.slice(0, 200)}`)
    }

    return response.json() as Promise<T>
  }
}
