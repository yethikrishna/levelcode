import * as fs from 'fs'
import * as path from 'path'
import { getConfigDir } from '@levelcode/common/utils/auth'
import type { PackageMeta, PackageManifest, PackageType } from './types'

/**
 * Represents a loaded marketplace package with its manifest and resolved paths.
 */
export interface LoadedPackage {
  meta: PackageMeta
  manifest: PackageManifest
  directory: string
  entryPoint?: string
}

/**
 * Dynamically loads installed marketplace packages (agents, tools, skills, etc.)
 * from the local packages directory into the runtime.
 *
 * Loading is type-aware:
 *  - agent         → loads agent definitions (agent.json or index)
 *  - skill         → loads skill manifests
 *  - tool          → loads custom tool definitions
 *  - team-template → loads team configuration templates
 *  - policy        → loads policy rulesets
 */
export class MarketplaceLoader {
  private packagesDir: string
  private loaded = new Map<string, LoadedPackage>()

  constructor(baseDir?: string) {
    const root = baseDir ?? getConfigDir()
    this.packagesDir = path.join(root, 'marketplace', 'packages')
  }

  /**
   * Scan the installed packages directory and load every valid package.
   * Returns a map of package name → LoadedPackage.
   */
  loadMarketplacePackages(): Map<string, LoadedPackage> {
    this.loaded.clear()

    if (!fs.existsSync(this.packagesDir)) {
      return this.loaded
    }

    const packageNames = fs.readdirSync(this.packagesDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)

    for (const name of packageNames) {
      const pkgDir = path.join(this.packagesDir, name)
      try {
        const loaded = this.loadPackageFromDirectory(pkgDir)
        if (loaded) {
          this.loaded.set(loaded.meta.name, loaded)
        }
      } catch {
        // Skip packages that fail to load; invalid/corrupt installs are ignored.
      }
    }

    return this.loaded
  }

  /**
   * Load a single package by name (uses the latest installed version directory).
   */
  loadByName(name: string): LoadedPackage | null {
    if (!fs.existsSync(this.packagesDir)) return null
    const pkgBase = path.join(this.packagesDir, name)
    if (!fs.existsSync(pkgBase)) return null
    return this.loadLatestVersion(pkgBase)
  }

  /**
   * Get all currently loaded packages of a specific type.
   */
  getByType(type: PackageType): LoadedPackage[] {
    const results: LoadedPackage[] = []
    for (const pkg of this.loaded.values()) {
      if (pkg.meta.type === type) {
        results.push(pkg)
      }
    }
    return results
  }

  /**
   * Get a loaded package by exact name.
   */
  get(name: string): LoadedPackage | undefined {
    return this.loaded.get(name)
  }

  /**
   * Return all loaded packages.
   */
  getAll(): LoadedPackage[] {
    return Array.from(this.loaded.values())
  }

  /**
   * Resolve the entry point path for a loaded package.
   */
  resolveEntryPoint(pkg: LoadedPackage): string | null {
    const candidates = [
      pkg.manifest.main,
      'index.js',
      'index.ts',
      'index.mjs',
      `${pkg.meta.name}.js`,
      'agent.json',
      'skill.json',
      'tool.json',
      'team-template.json',
      'policy.json',
    ].filter(Boolean) as string[]

    for (const candidate of candidates) {
      const full = path.join(pkg.directory, candidate)
      if (fs.existsSync(full)) {
        return full
      }
    }
    return null
  }

  private loadLatestVersion(pkgBase: string): LoadedPackage | null {
    const versions = fs.readdirSync(pkgBase, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort((a, b) => this.compareSemver(b, a))

    for (const version of versions) {
      const dir = path.join(pkgBase, version)
      const loaded = this.loadPackageFromDirectory(dir)
      if (loaded) return loaded
    }
    return null
  }

  private loadPackageFromDirectory(dir: string): LoadedPackage | null {
    const manifestPath = path.join(dir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) return null

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PackageManifest
      if (!manifest.name || !manifest.version || !manifest.type) return null

      const entry = this.resolveEntryPointForDir(dir, manifest)

      const loaded: LoadedPackage = {
        meta: {
          name: manifest.name,
          version: manifest.version,
          type: manifest.type,
          description: manifest.description ?? '',
          author: manifest.author ?? '',
          tags: manifest.tags,
          homepage: manifest.homepage,
          license: manifest.license,
          engines: manifest.engines,
          main: manifest.main,
          integrity: manifest.integrity,
          publishedAt: manifest.publishedAt ?? 0,
          updatedAt: manifest.updatedAt ?? 0,
          downloads: manifest.downloads ?? 0,
        },
        manifest,
        directory: dir,
        entryPoint: entry ?? undefined,
      }

      return loaded
    } catch {
      return null
    }
  }

  private resolveEntryPointForDir(dir: string, manifest: PackageManifest): string | null {
    const candidates = [
      manifest.main,
      'index.js',
      'index.ts',
      'index.mjs',
      'agent.json',
      'skill.json',
      'tool.json',
      'team-template.json',
      'policy.json',
    ].filter(Boolean) as string[]

    for (const candidate of candidates) {
      const full = path.join(dir, candidate)
      if (fs.existsSync(full)) return full
    }
    return null
  }

  private compareSemver(a: string, b: string): number {
    const pa = a.split('.').map(n => parseInt(n, 10) || 0)
    const pb = b.split('.').map(n => parseInt(n, 10) || 0)
    for (let i = 0; i < 3; i++) {
      if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1
      if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1
    }
    return 0
  }
}

/**
 * Convenience function: load all marketplace packages and return them grouped by type.
 */
export function loadMarketplacePackages(baseDir?: string): {
  all: LoadedPackage[]
  agents: LoadedPackage[]
  skills: LoadedPackage[]
  tools: LoadedPackage[]
  teamTemplates: LoadedPackage[]
  policies: LoadedPackage[]
} {
  const loader = new MarketplaceLoader(baseDir)
  const all = Array.from(loader.loadMarketplacePackages().values())
  return {
    all,
    agents: all.filter(p => p.meta.type === 'agent'),
    skills: all.filter(p => p.meta.type === 'skill'),
    tools: all.filter(p => p.meta.type === 'tool'),
    teamTemplates: all.filter(p => p.meta.type === 'team-template'),
    policies: all.filter(p => p.meta.type === 'policy'),
  }
}
