import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env } from '@levelcode/internal/env'

import * as schema from './schema'

import type { LevelCodePgDatabase } from './types'

// postgres('') produces a degenerate client (no .options), which crashes
// drizzle's driver at module load — and DATABASE_URL defaults to '' in
// non-CI environments (tests set their own or never connect). postgres-js
// defers all connections until the first query, so a placeholder URL is
// safe: unit tests that mock db.transaction never touch it, and a real
// misconfiguration surfaces as a clear connection error on first use.
const client = postgres(env.DATABASE_URL || 'postgres://localhost:5432/levelcode')

export const db: LevelCodePgDatabase = drizzle(client, { schema })
export default db

// Re-export advisory lock utilities
export {
  ADVISORY_LOCK_IDS,
  tryAcquireAdvisoryLock,
} from './advisory-lock'
export type { LockHandle, AdvisoryLockId } from './advisory-lock'
