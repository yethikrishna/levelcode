import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'

const CONTEXTS_ROOT = path.join(os.homedir(), '.config/levelcode/contexts')

interface Commit {
  id: string
  message: string
  parent: string | null
  timestamp: string
  tree: Record<string, any>
}

interface Ref {
  [branch: string]: string // branch -> commitId
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

function getContextDir(contextId: string): string {
  return path.join(CONTEXTS_ROOT, contextId)
}

function getObjectsDir(contextId: string): string {
  return path.join(getContextDir(contextId), 'objects')
}

function getRefsDir(contextId: string): string {
  return path.join(getContextDir(contextId), 'refs', 'heads')
}

function getCommitPath(contextId: string, commitId: string): string {
  return path.join(getObjectsDir(contextId), `${commitId}.json`)
}

function getRefPath(contextId: string, branch: string): string {
  return path.join(getRefsDir(contextId), branch)
}

async function initContext(contextId: string) {
  await ensureDir(getObjectsDir(contextId))
  await ensureDir(getRefsDir(contextId))
}

function generateCommitId(): string {
  return crypto.randomBytes(20).toString('hex')
}

export async function commit(
  contextId: string,
  params: { message: string; parent?: string | null; tree?: Record<string, any>; branch?: string }
): Promise<{ commitId: string; ref: string }> {
  await initContext(contextId)
  const commitId = generateCommitId()
  const now = new Date().toISOString()

  const c: Commit = {
    id: commitId,
    message: params.message,
    parent: params.parent ?? null,
    timestamp: now,
    tree: params.tree ?? {},
  }

  await fs.writeFile(getCommitPath(contextId, commitId), JSON.stringify(c, null, 2))

  const branch = params.branch ?? 'main'
  await fs.writeFile(getRefPath(contextId, branch), commitId)

  return { commitId, ref: `refs/heads/${branch}` }
}

export async function branch(
  contextId: string,
  params: { name: string; startPoint?: string }
): Promise<{ branch: string; commitId: string | null }> {
  await initContext(contextId)
  const refPath = getRefPath(contextId, params.name)

  let commitId: string | null = null
  if (params.startPoint) {
    commitId = params.startPoint
  } else {
    // default to main if exists
    const mainRef = getRefPath(contextId, 'main')
    try {
      commitId = (await fs.readFile(mainRef, 'utf8')).trim()
    } catch {
      commitId = null
    }
  }

  if (commitId) {
    await fs.writeFile(refPath, commitId)
  } else {
    await fs.writeFile(refPath, '')
  }

  return { branch: params.name, commitId }
}

export async function getRef(contextId: string, branch: string): Promise<string | null> {
  try {
    return (await fs.readFile(getRefPath(contextId, branch), 'utf8')).trim() || null
  } catch {
    return null
  }
}

export async function getCommit(contextId: string, commitId: string): Promise<Commit | null> {
  try {
    const data = await fs.readFile(getCommitPath(contextId, commitId), 'utf8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

// Support basic refs listing
export async function listBranches(contextId: string): Promise<string[]> {
  try {
    const files = await fs.readdir(getRefsDir(contextId))
    return files
  } catch {
    return []
  }
}
