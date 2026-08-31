import { describe, it, expect, beforeEach, afterEach, setDefaultTimeout } from 'bun:test'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  createAgentWorktree,
  createNamedWorktree,
  removeNamedWorktree,
  applyWorktreeInclude,
  commitInWorktree,
  hasUncommittedChanges,
  listAgentWorktrees,
  removeAgentWorktree,
} from '../worktree-isolation'

// Real git operations against temp repos.
setDefaultTimeout(30_000)

let repoRoot: string
let origGitAuthor: Record<string, string | undefined>

function git(args: string[], cwd: string = repoRoot): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' })
}

function commitAll(message: string): void {
  git(['add', '-A'])
  git(['-c', 'user.email=test@test', '-c', 'user.name=test', 'commit', '-m', message])
}

beforeEach(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-'))
  git(['init', '-b', 'main'])
  git(['config', 'user.email', 'test@test'])
  git(['config', 'user.name', 'test'])
  fs.writeFileSync(path.join(repoRoot, 'README.md'), '# test repo', 'utf-8')
  fs.writeFileSync(path.join(repoRoot, '.env'), 'SECRET=x', 'utf-8')
  fs.writeFileSync(
    path.join(repoRoot, '.worktreeinclude'),
    '# files every worktree needs\n.env\nconfig/*.local\n',
    'utf-8',
  )
  fs.mkdirSync(path.join(repoRoot, 'config'))
  fs.writeFileSync(path.join(repoRoot, 'config', 'dev.local'), 'port=1', 'utf-8')
  commitAll('initial')
})

afterEach(() => {
  // Worktree cleanup must happen before the repo dir is deleted
  try {
    execFileSync('git', ['worktree', 'prune', '--expire', 'now'], { cwd: repoRoot })
  } catch { /* repo already gone */ }
  fs.rmSync(repoRoot, { recursive: true, force: true })
})

describe('createAgentWorktree', () => {
  it('creates a worktree on an agent branch with .worktreeinclude files copied', () => {
    const info = createAgentWorktree(repoRoot, 'intern-1', '42')

    expect(info.branch).toBe('agent/intern-1/42')
    expect(fs.existsSync(path.join(info.path, '.git'))).toBe(true)
    expect(fs.existsSync(path.join(info.path, 'README.md'))).toBe(true)

    // .worktreeinclude entries copied, comments ignored
    expect(fs.readFileSync(path.join(info.path, '.env'), 'utf-8')).toBe('SECRET=x')
    expect(fs.readFileSync(path.join(info.path, 'config', 'dev.local'), 'utf-8')).toBe('port=1')
  })

  it('worktree starts clean and edits are isolated from the main repo', () => {
    const info = createAgentWorktree(repoRoot, 'intern-2')
    expect(hasUncommittedChanges(info.path)).toBe(false)

    fs.writeFileSync(path.join(info.path, 'README.md'), '# edited by agent', 'utf-8')
    expect(hasUncommittedChanges(info.path)).toBe(true)
    // Main repo untouched
    expect(fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf-8')).toBe('# test repo')
  })

  it('commits land on the agent branch, not main', () => {
    const info = createAgentWorktree(repoRoot, 'intern-3')
    fs.writeFileSync(path.join(info.path, 'feature.ts'), 'export {}', 'utf-8')
    const result = commitInWorktree(info.path, 'feat: add feature')

    expect(result.success).toBe(true)
    expect(result.commitHash).toBeDefined()
    // Main HEAD is unchanged
    const mainHash = git(['rev-parse', 'HEAD'])
    expect(result.commitHash).not.toBe(mainHash)
  })

  it('removeAgentWorktree cleans worktree and branches', () => {
    createAgentWorktree(repoRoot, 'intern-4', 'a')
    createAgentWorktree(repoRoot, 'intern-4', 'b')
    removeAgentWorktree(repoRoot, 'intern-4')

    const remaining = listAgentWorktrees(repoRoot)
    expect(remaining.find((w) => w.agentId === 'intern-4')).toBeUndefined()
  })
})

describe('createNamedWorktree', () => {
  it('creates a named worktree on branch worktree/<name> with includes', () => {
    const wtPath = createNamedWorktree(repoRoot, 'feature-auth')

    expect(fs.existsSync(path.join(wtPath, '.git'))).toBe(true)
    expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], wtPath)).toContain('worktree/feature-auth')
    expect(fs.existsSync(path.join(wtPath, '.env'))).toBe(true)
  })

  it('reuses an existing worktree for the same name (resume semantics)', () => {
    const first = createNamedWorktree(repoRoot, 'feature-auth')
    fs.writeFileSync(path.join(first, 'wip.txt'), 'uncommitted work', 'utf-8')

    const second = createNamedWorktree(repoRoot, 'feature-auth')
    expect(second).toBe(first)
    // The uncommitted file survives the "re-entry"
    expect(fs.readFileSync(path.join(second, 'wip.txt'), 'utf-8')).toBe('uncommitted work')
  })

  it('rejects unsafe names', () => {
    expect(() => createNamedWorktree(repoRoot, '../escape')).toThrow()
    expect(() => createNamedWorktree(repoRoot, 'a b')).toThrow()
    expect(() => createNamedWorktree(repoRoot, '')).toThrow()
  })

  it('removeNamedWorktree removes the worktree but keeps the branch', () => {
    createNamedWorktree(repoRoot, 'temp-wt')
    expect(removeNamedWorktree(repoRoot, 'temp-wt')).toBe(true)
    // Branch still exists
    const branches = git(['branch', '--list', 'worktree/temp-wt'])
    expect(branches).toContain('worktree/temp-wt')
  })
})

describe('applyWorktreeInclude', () => {
  it('returns empty array when no .worktreeinclude exists', () => {
    fs.rmSync(path.join(repoRoot, '.worktreeinclude'))
    commitAll('drop include')
    const wtPath = createNamedWorktree(repoRoot, 'no-include')
    expect(applyWorktreeInclude(repoRoot, wtPath)).toEqual([])
  })

  it('skips missing files without failing', () => {
    fs.writeFileSync(
      path.join(repoRoot, '.worktreeinclude'),
      '.env\ndoes-not-exist.txt\n',
      'utf-8',
    )
    const wtPath = createNamedWorktree(repoRoot, 'partial')
    expect(fs.existsSync(path.join(wtPath, '.env'))).toBe(true)
  })
})

describe('listAgentWorktrees', () => {
  it('lists both agent and named worktrees', () => {
    createAgentWorktree(repoRoot, 'designer-1')
    createNamedWorktree(repoRoot, 'listing-check')

    const list = listAgentWorktrees(repoRoot)
    expect(list.find((w) => w.branch === 'agent/designer-1/task')).toBeDefined()
    expect(list.find((w) => w.branch === 'worktree/listing-check')).toBeDefined()
  })
})
