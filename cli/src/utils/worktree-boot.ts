import { createNamedWorktree } from '@levelcode/common/utils/worktree-isolation'

/**
 * Shared `--worktree <name>` resolution for both boot paths
 * (interactive via cli-main, headless via run-headless).
 *
 * Creates or re-enters `.levelcode/worktrees/<name>` on branch
 * `worktree/<name>` inside the given root (defaults to the process cwd).
 * Returns the directory the session should run in, or undefined when no
 * worktree was requested.
 */
export async function resolveWorktreeBoot(
  name: string | undefined,
  cwd: string | undefined,
  reportError: (message: string) => void,
): Promise<string | undefined> {
  if (!name) return cwd
  try {
    const root = cwd ?? process.cwd()
    return createNamedWorktree(root, name)
  } catch (error) {
    reportError(`--worktree: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  }
}
