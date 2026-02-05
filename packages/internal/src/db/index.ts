import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env } from '@levelcode/internal/env'

import * as schema from './schema'

import type { LevelCodePgDatabase } from './types'

const client = postgres(env.DATABASE_URL)

export const db: LevelCodePgDatabase = drizzle(client, { schema })
export default db

// Re-export advisory lock utilities
export {
  ADVISORY_LOCK_IDS,
  tryAcquireAdvisoryLock,
} from './advisory-lock'
export type { LockHandle, AdvisoryLockId } from './advisory-lock'
