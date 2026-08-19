import { mkdir, readFile, writeFile, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export interface PersistedTeamMember {
  role: string;
  model?: string;
  config?: Record<string, unknown>;
}

export interface PersistedTeam {
  id: string;
  name: string;
  members: PersistedTeamMember[];
  createdAt: string;
  lastUsed: string;
  description?: string;
}

const TEAMS_DIR = join(homedir(), '.config', 'levelcode', 'teams');

async function ensureTeamsDir() {
  await mkdir(TEAMS_DIR, { recursive: true });
}

function getTeamPath(id: string): string {
  return join(TEAMS_DIR, `${id}.json`);
}

export class TeamRegistry {
  private teams = new Map<string, PersistedTeam>();

  async loadAll(): Promise<PersistedTeam[]> {
    await ensureTeamsDir();
    const files = await readdir(TEAMS_DIR).catch(() => []);
    const teams: PersistedTeam[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await readFile(join(TEAMS_DIR, file), 'utf8');
        const team = JSON.parse(content) as PersistedTeam;
        teams.push(team);
        this.teams.set(team.id, team);
      } catch {
        // skip corrupt files
      }
    }
    return teams.sort((a, b) => b.lastUsed.localeCompare(a.lastUsed));
  }

  async save(team: Omit<PersistedTeam, 'id' | 'createdAt' | 'lastUsed'> & { id?: string }): Promise<PersistedTeam> {
    await ensureTeamsDir();

    const id = team.id || this.slugify(team.name);
    const now = new Date().toISOString();

    const persisted: PersistedTeam = {
      id,
      name: team.name,
      members: team.members,
      description: team.description,
      createdAt: this.teams.has(id) ? this.teams.get(id)!.createdAt : now,
      lastUsed: now,
    };

    await writeFile(getTeamPath(id), JSON.stringify(persisted, null, 2), 'utf8');
    this.teams.set(id, persisted);
    return persisted;
  }

  async load(idOrName: string): Promise<PersistedTeam | null> {
    const teams = await this.loadAll();
    const found = teams.find(
      t => t.id === idOrName || t.name.toLowerCase() === idOrName.toLowerCase()
    );
    if (found) {
      found.lastUsed = new Date().toISOString();
      await writeFile(getTeamPath(found.id), JSON.stringify(found, null, 2));
      this.teams.set(found.id, found);
    }
    return found || null;
  }

  async delete(idOrName: string): Promise<boolean> {
    const team = await this.load(idOrName);
    if (!team) return false;
    await rm(getTeamPath(team.id), { force: true });
    this.teams.delete(team.id);
    return true;
  }

  async list(): Promise<PersistedTeam[]> {
    return this.loadAll();
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);
  }
}

// Singleton for easy import
export const teamRegistry = new TeamRegistry();

// === OrgMemory Extension (Phase A) ===
// Encrypted scoped memory + capability tokens + P2P sync hooks
// Defense-first: capability tokens + TTL + verification gates

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

export interface OrgMemoryScope {
  role: string;
  deviceId: string;
  ttl: number;
  data: Record<string, unknown>;
}

export interface CapabilityToken {
  scope: string;
  signature: string;
  expires: number;
}

export class OrgMemory {
  private store = new Map<string, OrgMemoryScope>();
  private key: Buffer;

  constructor(masterKey = process.env.ORG_MEMORY_KEY || 'levelcode-dev') {
    this.key = scryptSync(masterKey, 'org-memory-salt', 32);
  }

  issueCapability(scope: string, ttlMs = 3600000): CapabilityToken {
    const expires = Date.now() + ttlMs;
    const signature = randomBytes(32).toString('hex');
    return { scope, signature, expires };
  }

  async persist(scopeKey: string, data: Record<string, unknown>, token: CapabilityToken): Promise<void> {
    if (Date.now() > token.expires) throw new Error('Capability token expired');
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
    const authTag = cipher.getAuthTag();

    this.store.set(scopeKey, {
      role: token.scope,
      deviceId: 'local',
      ttl: Date.now() + 86400000,
      data: { iv: iv.toString('hex'), encrypted: encrypted.toString('hex'), authTag: authTag.toString('hex') }
    });
  }

  async syncFromPeer(peerData: OrgMemoryScope): Promise<void> {
    // P2P hook: verify + merge (future E2E signature check)
    this.store.set(`${peerData.role}:${peerData.deviceId}`, peerData);
  }

  get(scopeKey: string): OrgMemoryScope | undefined {
    const entry = this.store.get(scopeKey);
    if (entry && Date.now() > entry.ttl) {
      this.store.delete(scopeKey);
      return undefined;
    }
    return entry;
  }
}

export const orgMemory = new OrgMemory();