import { PRSwarmManager, parsePRRef, getGithubTokenFromEnv } from '@levelcode/sdk'
import { ICON } from '../utils/icons'

const swarmManagers = new Map<string, PRSwarmManager>()

function getManager(token?: string): PRSwarmManager {
  const key = token ?? getGithubTokenFromEnv() ?? 'default'
  if (!swarmManagers.has(key)) {
    swarmManagers.set(key, new PRSwarmManager(token))
  }
  return swarmManagers.get(key)!
}

/**
 * Handle /pr:attach owner/repo#number [--auto-merge] [--auto-approve] [--no-tests]
 *
 * Attaches a review swarm to the specified GitHub pull request.
 */
export async function handlePRAttach(args: string): Promise<string> {
  const trimmed = args.trim()
  if (!trimmed) {
    return 'Usage: /pr:attach <owner/repo#number> [--auto-merge] [--auto-approve] [--no-tests]\nExample: /pr:attach facebook/react#12345'
  }

  const parts = trimmed.split(/\s+/)
  const refStr = parts[0]!
  const options = parts.slice(1)

  const prRef = parsePRRef(refStr)
  if (!prRef) {
    return `✗ Invalid PR reference "${refStr}". Expected format: owner/repo#number (e.g. facebook/react#12345)`
  }

  const autoMerge = options.includes('--auto-merge')
  const autoApprove = options.includes('--auto-approve')
  const runTests = !options.includes('--no-tests')

  try {
    const manager = getManager()
    const result = await manager.attachToPR(prRef.owner, prRef.repo, prRef.number, {
      autoMerge,
      autoApprove,
      runTests,
    })

    const review = result.initialReview
    if (!review) {
      return `◆ Swarm ${result.swarmId} attached to ${prRef.owner}/${prRef.repo}#${prRef.number} (no review produced).`
    }

    const lines = [
      `◆ Swarm attached to ${prRef.owner}/${prRef.repo}#${prRef.number}`,
      `Swarm ID: ${result.swarmId}`,
      ``,
      review.summary,
    ]

    if (review.comments.length > 0) {
      lines.push(``, `Review comments posted (${review.comments.length}):`)
      for (const c of review.comments.slice(0, 10)) {
        lines.push(`  • ${c.path}:${c.line} — ${c.body}`)
      }
      if (review.comments.length > 10) {
        lines.push(`  … and ${review.comments.length - 10} more`)
      }
    }

    return lines.join('\n')
  } catch (error) {
    return `✗ Failed to attach swarm: ${error instanceof Error ? error.message : String(error)}\n\nTip: Set GITHUB_TOKEN env var or ensure the repo is public.`
  }
}

/**
 * Handle /pr:detach owner/repo#number
 */
export function handlePRDetach(args: string): string {
  const prRef = parsePRRef(args.trim())
  if (!prRef) {
    return 'Usage: /pr:detach <owner/repo#number>'
  }

  try {
    const manager = getManager()
    manager.detachFromPR(prRef)
    return `⬢ Detached swarm from ${prRef.owner}/${prRef.repo}#${prRef.number}`
  } catch (error) {
    return `✗ ${error instanceof Error ? error.message : String(error)}`
  }
}

/**
 * Handle /pr:list
 */
export function handlePRList(): string {
  const manager = getManager()
  const attached = manager.listAttached()
  if (attached.length === 0) {
    return 'No PR swarms currently attached.'
  }
  const lines = [`Attached PR swarms (${attached.length}):`, '']
  for (const pr of attached) {
    lines.push(`  • ${pr.owner}/${pr.repo}#${pr.number}`)
  }
  return lines.join('\n')
}
