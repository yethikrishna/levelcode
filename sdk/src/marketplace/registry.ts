import * as fs from 'fs'
import * as path from 'path'
import { getConfigDir } from '@levelcode/common/utils/auth'
import type {
  PackageMeta,
  PackageType,
  RegistryIndex,
} from './types'

/**
 * Manages the local marketplace registry: publishing, searching,
 * installing, uninstalling, and listing packages.
 *
 * Registry index is persisted to `.levelcode/marketplace/registry.json`.
 * Installed packages live under `.levelcode/marketplace/packages/<name>/<version>/`.
 */
export class MarketplaceRegistry {
  private registryDir: string
  private packagesDir: string
  private indexPath: string
  private index: RegistryIndex

  constructor(baseDir?: string) {
    const root = baseDir ?? getConfigDir()
    this.registryDir = path.join(root, 'marketplace')
    this.packagesDir = path.join(this.registryDir, 'packages')
    this.indexPath = path.join(this.registryDir, 'registry.json')
    this.index = this.loadIndex()
  }

  private loadIndex(): RegistryIndex {
    try {
      if (!fs.existsSync(this.indexPath)) {
        return { packages: {}, installed: {} }
      }
      const raw = fs.readFileSync(this.indexPath, 'utf-8')
      return JSON.parse(raw) as RegistryIndex
    } catch {
      return { packages: {}, installed: {} }
    }
  }

  private saveIndex(): void {
    if (!fs.existsSync(this.registryDir)) {
      fs.mkdirSync(this.registryDir, { recursive: true })
    }
    fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8')
  }

  private getPackageDir(name: string, version: string): string {
    const safeName = name.replace(/[^a-zA-Z0-9_@./-]/g, '_')
    return path.join(this.packagesDir, safeName, version)
  }

  /**
   * Publish a package to the registry. If the same name+version already exists,
   * the metadata is updated; otherwise a new version entry is appended.
   */
  publish(pkg: PackageMeta): PackageMeta {
    if (!pkg.name || typeof pkg.name !== 'string') {
      throw new Error('Package name is required')
    }
    if (!pkg.version || typeof pkg.version !== 'string') {
      throw new Error('Package version is required')
    }
    if (!pkg.type || !['agent', 'skill', 'team-template', 'tool', 'policy'].includes(pkg.type)) {
      throw new Error(`Invalid package type: ${pkg.type}`)
    }

    const now = Date.now()
    const entry: PackageMeta = {
      ...pkg,
      publishedAt: pkg.publishedAt ?? now,
      updatedAt: now,
      downloads: pkg.downloads ?? 0,
    }

    if (!this.index.packages[pkg.name]) {
      this.index.packages[pkg.name] = []
    }

    const versions = this.index.packages[pkg.name]!
    const existingIdx = versions.findIndex(v => v.version === pkg.version)
    if (existingIdx >= 0) {
      const existing = versions[existingIdx]!
      entry.downloads = existing.downloads ?? 0
      entry.publishedAt = existing.publishedAt
      versions[existingIdx] = entry
    } else {
      versions.push(entry)
    }

    versions.sort((a, b) => b.updatedAt - a.updatedAt)
    this.saveIndex()
    return entry
  }

  /**
   * Search packages by name, description, tags, or type.
   * Returns packages matching the query sorted by relevance (downloads desc).
   */
  search(query: string, type?: PackageType): PackageMeta[] {
    const lower = query.toLowerCase().trim()
    const results: PackageMeta[] = []

    for (const versions of Object.values(this.index.packages)) {
      const latest = versions[0]
      if (!latest) continue
      if (type && latest.type !== type) continue
      if (!lower) {
        results.push(latest)
        continue
      }
      const matches =
        latest.name.toLowerCase().includes(lower) ||
        latest.description.toLowerCase().includes(lower) ||
        (latest.tags ?? []).some(t => t.toLowerCase().includes(lower))
      if (matches) {
        results.push(latest)
      }
    }

    results.sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))
    return results
  }

  /**
   * Install a package by name and optional version.
   * If version is omitted, installs the latest published version.
   * Returns the installed package metadata.
   */
  install(name: string, version?: string): PackageMeta {
    const versions = this.index.packages[name]
    if (!versions || versions.length === 0) {
      throw new Error(`Package "${name}" not found in registry`)
    }

    const targetVersion = version ?? versions[0]!.version
    const pkg = versions.find(v => v.version === targetVersion)
    if (!pkg) {
      throw new Error(`Version ${targetVersion} of "${name}" not found`)
    }

    const installDir = this.getPackageDir(name, targetVersion)
    if (!fs.existsSync(installDir)) {
      fs.mkdirSync(installDir, { recursive: true })
      const manifestPath = path.join(installDir, 'manifest.json')
      fs.writeFileSync(manifestPath, JSON.stringify({ ...pkg, files: [] }, null, 2), 'utf-8')
    }

    this.index.installed[name] = {
      version: targetVersion,
      installedAt: Date.now(),
    }
    pkg.downloads = (pkg.downloads ?? 0) + 1
    this.saveIndex()
    return pkg
  }

  /**
   * Uninstall a previously installed package, removing its files and
   * clearing the installed record.
   */
  uninstall(name: string): void {
    const installed = this.index.installed[name]
    if (!installed) {
      throw new Error(`Package "${name}" is not installed`)
    }

    const pkgDir = path.join(this.packagesDir, name.replace(/[^a-zA-Z0-9_@./-]/g, '_'))
    if (fs.existsSync(pkgDir)) {
      fs.rmSync(pkgDir, { recursive: true, force: true })
    }

    delete this.index.installed[name]
    this.saveIndex()
  }

  /**
   * List all published packages (latest version of each).
   */
  list(): PackageMeta[] {
    const results: PackageMeta[] = []
    for (const versions of Object.values(this.index.packages)) {
      if (versions[0]) results.push(versions[0])
    }
    results.sort((a, b) => b.updatedAt - a.updatedAt)
    return results
  }

  /**
   * Get a specific package metadata (latest version) by name.
   */
  get(name: string): PackageMeta | null {
    const versions = this.index.packages[name]
    return versions?.[0] ?? null
  }

  /**
   * Get the installed record for a package, or null if not installed.
   */
  getInstalled(name: string): { version: string; installedAt: number } | null {
    return this.index.installed[name] ?? null
  }

  /**
   * List all installed packages with their metadata.
   */
  listInstalled(): PackageMeta[] {
    const results: PackageMeta[] = []
    for (const [name, rec] of Object.entries(this.index.installed)) {
      const versions = this.index.packages[name]
      const pkg = versions?.find(v => v.version === rec.version)
      if (pkg) results.push(pkg)
    }
    return results
  }

  /**
   * Get the filesystem path for an installed package.
   */
  getInstalledPath(name: string, version?: string): string | null {
    const installed = this.index.installed[name]
    if (!installed) return null
    const v = version ?? installed.version
    return this.getPackageDir(name, v)
  }
}
