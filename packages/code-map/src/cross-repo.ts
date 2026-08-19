/**
 * Cross-Repo Dependency Map
 *
 * Builds a map of inter-package and inter-file dependencies within a
 * monorepo by walking package.json and tsconfig.json boundaries and
 * scanning import statements. Supports blast-radius analysis ("if I change
 * this symbol, what breaks?"), forward/backward dependency queries,
 * and ASCII-graph visualization.
 */

import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// Types
// ============================================================================

/**
 * A single package discovered within the monorepo.
 */
export interface PackageInfo {
  /** Canonical package name (from package.json "name" field, or directory name) */
  name: string
  /** Absolute path to the package root */
  rootDir: string
  /** Relative path from the monorepo root */
  relPath: string
  /** Package version (from package.json) */
  version?: string
  /** Dependencies declared in package.json */
  packageDeps: string[]
  /** Set of files belonging to this package (absolute paths) */
  files: Set<string>
  /** Internal packages this package depends on (by name) */
  internalDeps: Set<string>
  /** Internal packages that depend on this one (by name) */
  internalDependents: Set<string>
}

/**
 * Information about a dependency edge between two files.
 */
export interface DepInfo {
  /** Source file (importer) absolute path */
  from: string
  /** Target file (imported) absolute path */
  to: string
  /** The import specifier as written in source (e.g. "./utils", "@levelcode/common") */
  specifier: string
  /** Whether this is an internal (same-repo) dependency */
  isInternal: boolean
  /** Named/symbol imports (e.g. ["foo", "bar"]) */
  importedSymbols?: string[]
  /** Whether this is a type-only import */
  isTypeOnly?: boolean
}

/**
 * Blast radius result: everything potentially affected by changing a symbol.
 */
export interface BlastRadius {
  /** The file that would be changed */
  originFile: string
  /** The symbol name that would be changed (or null if whole-file) */
  symbol: string | null
  /** Files that directly import this file */
  directAffectedFiles: string[]
  /** Packages that contain affected files */
  affectedPackages: string[]
  /** Transitive closure of files that import (directly or indirectly) the origin */
  transitiveAffectedFiles: string[]
  /** Total count of affected files */
  totalFileCount: number
  /** Total count of affected packages */
  totalPackageCount: number
}

/**
 * A node in the dependency graph for visualization.
 */
interface GraphNode {
  id: string
  label: string
  edges: string[]
}

// ============================================================================
// Regex patterns for import extraction
// ============================================================================

const STATIC_IMPORT_RE =
  /import\s+(?:type\s+)?(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s+)?['"]([^'"]+)['"]/g
const DYNAMIC_IMPORT_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g
const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g
const NAMED_IMPORT_RE = /import\s+type?\s*\{([^}]+)\}/g
const EXPORT_REEXPORT_RE = /export\s+(?:\*|type\s+\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g

// File extensions we care about
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'])

// ============================================================================
// CrossRepoDependencyMap
// ============================================================================

/**
 * Builds and queries a cross-package dependency graph for a monorepo.
 *
 * The map is built lazily: call {@link buildMap} once to scan the root
 * directory and construct the graph, then use query methods.
 */
export class CrossRepoDependencyMap {
  /** Monorepo root directory (absolute) */
  private rootDir: string = ''
  /** Package name → PackageInfo */
  private packages: Map<string, PackageInfo> = new Map()
  /** Absolute file path → package name it belongs to */
  private fileToPackage: Map<string, string> = new Map()
  /** Absolute file path → outgoing DepInfo edges */
  private fileDeps: Map<string, DepInfo[]> = new Map()
  /** Absolute file path → incoming DepInfo edges (reverse index) */
  private fileReverseDeps: Map<string, DepInfo[]> = new Map()
  /** All known source files (absolute paths) */
  private allFiles: Set<string> = new Set()

  constructor() {}

  /**
   * Build the dependency map by walking the root directory.
   *
   * Discovers packages by finding package.json files (treating each as a
   * package root, skipping node_modules) and scans source files for
   * import/require statements.
   *
   * @param rootDir - Monorepo root directory (absolute path)
   */
  buildMap(rootDir: string): void {
    this.rootDir = path.resolve(rootDir)
    this.packages.clear()
    this.fileToPackage.clear()
    this.fileDeps.clear()
    this.fileReverseDeps.clear()
    this.allFiles.clear()

    this.discoverPackages()
    this.discoverFiles()
    this.scanImports()
    this.resolvePackageDependencies()
  }

  /**
   * Compute the blast radius of changing a symbol (or an entire file).
   * Returns transitive dependents (files and packages affected).
   *
   * @param symbol - Symbol name, or null for whole-file changes
   * @param file - Path to the file being changed (absolute or relative to root)
   * @returns Blast radius with direct and transitive dependents
   */
  findBlastRadius(symbol: string | null, file: string): BlastRadius {
    const absFile = path.resolve(this.rootDir, file)
    if (!this.allFiles.has(absFile) && !fs.existsSync(absFile)) {
      return {
        originFile: absFile,
        symbol,
        directAffectedFiles: [],
        affectedPackages: [],
        transitiveAffectedFiles: [],
        totalFileCount: 0,
        totalPackageCount: 0,
      }
    }

    const direct = this.getDependents(absFile).map((d) => d.from)
    const visited = new Set<string>([absFile])
    const queue = [...direct]
    const transitive: string[] = []

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      transitive.push(current)
      const dependents = this.getDependents(current).map((d) => d.from)
      for (const d of dependents) {
        if (!visited.has(d)) queue.push(d)
      }
    }

    const affectedPkgSet = new Set<string>()
    for (const f of transitive) {
      const pkg = this.fileToPackage.get(f)
      if (pkg) affectedPkgSet.add(pkg)
    }

    return {
      originFile: absFile,
      symbol,
      directAffectedFiles: direct,
      affectedPackages: Array.from(affectedPkgSet),
      transitiveAffectedFiles: transitive,
      totalFileCount: transitive.length,
      totalPackageCount: affectedPkgSet.size,
    }
  }

  /**
   * Get outgoing dependencies of a file (things this file imports).
   *
   * @param filePath - Absolute or root-relative path
   * @returns Array of DepInfo edges from this file to its imports
   */
  getDependencies(filePath: string): DepInfo[] {
    const abs = path.resolve(this.rootDir, filePath)
    return this.fileDeps.get(abs) ?? []
  }

  /**
   * Get incoming dependencies of a file (things that import this file).
   *
   * @param filePath - Absolute or root-relative path
   * @returns Array of DepInfo edges pointing to this file
   */
  getDependents(filePath: string): DepInfo[] {
    const abs = path.resolve(this.rootDir, filePath)
    return this.fileReverseDeps.get(abs) ?? []
  }

  /**
   * Return a list of discovered packages.
   */
  getPackages(): PackageInfo[] {
    return Array.from(this.packages.values())
  }

  /**
   * Render an ASCII dependency graph of the package-level topology.
   *
   * @returns Multi-line ASCII string suitable for console output
   */
  visualizeMap(): string {
    const lines: string[] = []
    lines.push('Cross-Repo Dependency Map')
    lines.push('='.repeat(60))
    lines.push(`Root: ${this.rootDir}`)
    lines.push(`Packages: ${this.packages.size}`)
    lines.push(`Source files: ${this.allFiles.size}`)
    lines.push('')

    for (const pkg of this.packages.values()) {
      const deps = Array.from(pkg.internalDeps)
      const dependents = Array.from(pkg.internalDependents)
      lines.push(`┌─ ${pkg.name} (${pkg.relPath})`)
      lines.push(`│  Files: ${pkg.files.size}`)
      if (deps.length > 0) {
        lines.push(`│  Depends on:`)
        for (const d of deps) lines.push(`│    → ${d}`)
      } else {
        lines.push(`│  Depends on: (none internal)`)
      }
      if (dependents.length > 0) {
        lines.push(`│  Used by:`)
        for (const d of dependents) lines.push(`│    ← ${d}`)
      }
      lines.push('└' + '─'.repeat(58))
      lines.push('')
    }

    lines.push('Dependency direction: arrow from dependent → dependency')
    return lines.join('\n')
  }

  // ============================================================================
  // Internals
  // ============================================================================

  /**
   * Discover packages by finding package.json files (excluding node_modules).
   */
  private discoverPackages(): void {
    const walk = (dir: string) => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (entry.name === 'package.json') {
          try {
            const pkgJson = JSON.parse(fs.readFileSync(full, 'utf-8'))
            const rootDir = path.dirname(full)
            const name = pkgJson.name || path.basename(rootDir)
            const relPath = path.relative(this.rootDir, rootDir) || '.'
            const deps: string[] = []
            if (pkgJson.dependencies) deps.push(...Object.keys(pkgJson.dependencies))
            if (pkgJson.devDependencies) deps.push(...Object.keys(pkgJson.devDependencies))
            if (pkgJson.peerDependencies) deps.push(...Object.keys(pkgJson.peerDependencies))
            if (!this.packages.has(name)) {
              this.packages.set(name, {
                name,
                rootDir,
                relPath,
                version: pkgJson.version,
                packageDeps: deps,
                files: new Set(),
                internalDeps: new Set(),
                internalDependents: new Set(),
              })
            }
          } catch {
            // Skip malformed package.json
          }
        }
      }
    }
    walk(this.rootDir)

    if (this.packages.size === 0) {
      this.packages.set('(root)', {
        name: '(root)',
        rootDir: this.rootDir,
        relPath: '.',
        packageDeps: [],
        files: new Set(),
        internalDeps: new Set(),
        internalDependents: new Set(),
      })
    }
  }

  /**
   * Discover source files within each package directory.
   */
  private discoverFiles(): void {
    for (const pkg of this.packages.values()) {
      const walk = (dir: string) => {
        let entries: fs.Dirent[]
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
          if (entry.isDirectory()) {
            walk(path.join(dir, entry.name))
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name)
            if (SOURCE_EXTS.has(ext)) {
              const abs = path.join(dir, entry.name)
              pkg.files.add(abs)
              this.allFiles.add(abs)
              this.fileToPackage.set(abs, pkg.name)
              this.fileDeps.set(abs, [])
              this.fileReverseDeps.set(abs, [])
            }
          }
        }
      }
      walk(pkg.rootDir)
    }
  }

  /**
   * Scan imports in each source file and resolve them to target files.
   */
  private scanImports(): void {
    for (const file of this.allFiles) {
      const sourcePkg = this.fileToPackage.get(file)
      let content: string
      try {
        content = fs.readFileSync(file, 'utf-8')
      } catch {
        continue
      }

      const specifiers = new Set<string>()
      const isTypeMap = new Map<string, boolean>()
      const namedSymbols = new Map<string, string[]>()

      this.collectSpecifiers(content, STATIC_IMPORT_RE, specifiers)
      this.collectSpecifiers(content, DYNAMIC_IMPORT_RE, specifiers)
      this.collectSpecifiers(content, REQUIRE_RE, specifiers)
      this.collectSpecifiers(content, EXPORT_REEXPORT_RE, specifiers)

      const typeOnlyMatches = content.match(/import\s+type\s+[^'"]+['"]([^'"]+)['"]/g) ?? []
      for (const m of typeOnlyMatches) {
        const spec = (m.match(/['"]([^'"]+)['"]/)?.[1])
        if (spec) isTypeMap.set(spec, true)
      }

      const namedMatches = content.match(NAMED_IMPORT_RE) ?? []
      for (const m of namedMatches) {
        const braceMatch = m.match(/\{([^}]+)\}/)
        const specMatch = m.match(/from\s+['"]([^'"]+)['"]/)
        if (braceMatch && specMatch) {
          const names = braceMatch[1]!
            .split(',')
            .map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim())
            .filter(Boolean)
          namedSymbols.set(specMatch[1]!, names)
        }
      }

      const dir = path.dirname(file)
      for (const spec of specifiers) {
        const resolved = this.resolveImport(spec, dir)
        if (!resolved) continue
        const dep: DepInfo = {
          from: file,
          to: resolved,
          specifier: spec,
          isInternal: this.allFiles.has(resolved) || this.isPackageImport(spec),
          importedSymbols: namedSymbols.get(spec),
          isTypeOnly: isTypeMap.get(spec) ?? false,
        }
        this.fileDeps.get(file)!.push(dep)
        if (!this.fileReverseDeps.has(resolved)) {
          this.fileReverseDeps.set(resolved, [])
        }
        this.fileReverseDeps.get(resolved)!.push(dep)

        const targetPkg = this.fileToPackage.get(resolved)
        if (sourcePkg && targetPkg && sourcePkg !== targetPkg) {
          this.packages.get(sourcePkg)!.internalDeps.add(targetPkg)
          this.packages.get(targetPkg)!.internalDependents.add(sourcePkg)
        }
      }
    }
  }

  private collectSpecifiers(content: string, re: RegExp, out: Set<string>): void {
    let match: RegExpExecArray | null
    const r = new RegExp(re.source, re.flags)
    while ((match = r.exec(content)) !== null) {
      if (match[1]) out.add(match[1])
    }
  }

  /**
   * Resolve an import specifier to an absolute file path, or null if it's
   * an external package or unresolvable.
   */
  private resolveImport(specifier: string, fromDir: string): string | null {
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const candidates = this.resolveFileCandidates(specifier, fromDir)
      for (const c of candidates) {
        if (this.allFiles.has(c) || fs.existsSync(c)) return c
      }
      return null
    }

    if (this.isPackageImport(specifier)) {
      for (const pkg of this.packages.values()) {
        if (specifier === pkg.name || specifier.startsWith(pkg.name + '/')) {
          const subPath = specifier === pkg.name ? '' : specifier.slice(pkg.name.length + 1)
          const candidates = this.resolveFileCandidates('./' + (subPath || 'index'), pkg.rootDir)
          for (const c of candidates) {
            if (this.allFiles.has(c)) return c
          }
          return path.join(pkg.rootDir, subPath || 'index.ts')
        }
      }
    }

    return null
  }

  private isPackageImport(specifier: string): boolean {
    for (const pkg of this.packages.keys()) {
      if (pkg === '(root)') continue
      if (specifier === pkg || specifier.startsWith(pkg + '/')) return true
    }
    return false
  }

  private resolveFileCandidates(specifier: string, fromDir: string): string[] {
    const base = path.resolve(fromDir, specifier)
    const candidates: string[] = []
    const exts = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']
    for (const ext of exts) {
      candidates.push(base + ext)
    }
    for (const ext of exts) {
      candidates.push(path.join(base, 'index' + ext))
    }
    return candidates
  }

  /**
   * Ensure internalDeps / internalDependents on packages are populated
   * from the file-level scan (already done during scanImports, but this
   * adds package-json-level internal deps that may not yet have file edges).
   */
  private resolvePackageDependencies(): void {
    for (const pkg of this.packages.values()) {
      for (const depName of pkg.packageDeps) {
        if (this.packages.has(depName)) {
          pkg.internalDeps.add(depName)
          this.packages.get(depName)!.internalDependents.add(pkg.name)
        }
      }
    }
  }
}

/**
 * Singleton default instance.
 */
let defaultMap: CrossRepoDependencyMap | null = null

export function getDefaultCrossRepoDependencyMap(): CrossRepoDependencyMap {
  if (!defaultMap) defaultMap = new CrossRepoDependencyMap()
  return defaultMap
}

export function resetDefaultCrossRepoDependencyMap(): void {
  defaultMap = null
}
