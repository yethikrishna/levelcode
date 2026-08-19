import * as fs from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import type {
  PackageMeta,
  PackageManifest,
  PackageValidationResult,
  PackageType,
} from './types'

const PACKAGE_TYPES: PackageType[] = ['agent', 'skill', 'team-template', 'tool', 'policy']
const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/
const NAME_RE = /^@?[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)?$/

/**
 * Bundles source files into a LevelCode package directory with a manifest.json,
 * validates bundles, and installs them into a target directory.
 *
 * A package is a directory containing:
 *   - manifest.json  (PackageManifest with file inventory)
 *   - <entry files>  (JS/TS/JSON/YAML files that make up the package payload)
 */
export class PackagePackager {
  /**
   * Create a package bundle in `outDir` from the provided file map and metadata.
   * Each entry in `files` is a relative path -> absolute source path mapping.
   * Returns the manifest written to the bundle.
   */
  createPackage(
    files: Record<string, string>,
    meta: PackageMeta,
    outDir: string,
  ): PackageManifest {
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true })
    }

    const fileEntries = Object.keys(files).sort()
    const manifest: PackageManifest = {
      ...meta,
      files: fileEntries,
    }

    const errors: string[] = []
    const validation = this.validateManifest(manifest)
    if (!validation.valid) {
      throw new Error(`Invalid package metadata: ${validation.errors.join('; ')}`)
    }

    for (const [relPath, absPath] of Object.entries(files)) {
      if (!fs.existsSync(absPath)) {
        errors.push(`Source file not found: ${absPath}`)
        continue
      }
      const targetPath = path.join(outDir, relPath)
      const targetDir = path.dirname(targetPath)
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }
      fs.copyFileSync(absPath, targetPath)
    }

    if (errors.length > 0) {
      throw new Error(`Failed to create package: ${errors.join('; ')}`)
    }

    const manifestPath = path.join(outDir, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

    const integrity = this.computeIntegrity(outDir)
    manifest.integrity = integrity
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

    return manifest
  }

  /**
   * Install a package from a bundle directory into `targetDir`.
   * Copies files and writes the manifest; returns the installed manifest.
   */
  installPackage(bundlePath: string, targetDir: string): PackageManifest {
    if (!fs.existsSync(bundlePath)) {
      throw new Error(`Bundle path does not exist: ${bundlePath}`)
    }

    const manifestPath = path.join(bundlePath, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Bundle is missing manifest.json')
    }

    const manifestRaw = fs.readFileSync(manifestPath, 'utf-8')
    const manifest = JSON.parse(manifestRaw) as PackageManifest

    const validation = this.validatePackage(bundlePath)
    if (!validation.valid) {
      throw new Error(`Invalid package bundle: ${validation.errors.join('; ')}`)
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    this.copyDir(bundlePath, targetDir)

    const installedManifestPath = path.join(targetDir, 'manifest.json')
    const installed: PackageManifest = {
      ...manifest,
      integrity: this.computeIntegrity(targetDir),
    }
    fs.writeFileSync(installedManifestPath, JSON.stringify(installed, null, 2), 'utf-8')

    return installed
  }

  /**
   * Validate a package bundle on disk: check manifest presence, required fields,
   * file existence, and integrity hash (if present).
   */
  validatePackage(bundlePath: string): PackageValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    const manifestPath = path.join(bundlePath, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      return { valid: false, errors: ['manifest.json is missing'], warnings }
    }

    let manifest: PackageManifest
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PackageManifest
    } catch (e) {
      return { valid: false, errors: [`manifest.json is not valid JSON: ${(e as Error).message}`], warnings }
    }

    const manifestValidation = this.validateManifest(manifest)
    errors.push(...manifestValidation.errors)
    warnings.push(...manifestValidation.warnings)

    for (const file of manifest.files) {
      const filePath = path.join(bundlePath, file)
      if (!fs.existsSync(filePath)) {
        errors.push(`Missing declared file: ${file}`)
      }
    }

    if (manifest.main) {
      const mainPath = path.join(bundlePath, manifest.main)
      if (!fs.existsSync(mainPath)) {
        errors.push(`Entry point (main) not found: ${manifest.main}`)
      }
    }

    if (manifest.integrity) {
      const actual = this.computeIntegrity(bundlePath, ['manifest.json'])
      if (actual !== manifest.integrity) {
        warnings.push(`Integrity hash mismatch: expected ${manifest.integrity}, got ${actual}`)
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  /**
   * Validate manifest metadata (field presence, formats, types).
   */
  validateManifest(manifest: Partial<PackageManifest>): PackageValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!manifest.name || typeof manifest.name !== 'string') {
      errors.push('name is required and must be a string')
    } else if (!NAME_RE.test(manifest.name)) {
      errors.push(`name "${manifest.name}" must be a valid package identifier (e.g. "my-agent" or "@scope/pkg")`)
    }

    if (!manifest.version || typeof manifest.version !== 'string') {
      errors.push('version is required and must be a string')
    } else if (!SEMVER_RE.test(manifest.version)) {
      errors.push(`version "${manifest.version}" must be valid semver (e.g. "1.0.0")`)
    }

    if (!manifest.type || !PACKAGE_TYPES.includes(manifest.type as PackageType)) {
      errors.push(`type must be one of: ${PACKAGE_TYPES.join(', ')}`)
    }

    if (!manifest.description || typeof manifest.description !== 'string') {
      warnings.push('description is recommended')
    }

    if (!manifest.author || typeof manifest.author !== 'string') {
      warnings.push('author is recommended')
    }

    if (manifest.tags && !Array.isArray(manifest.tags)) {
      errors.push('tags must be an array of strings')
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  /**
   * Read and parse a manifest from a bundle directory.
   */
  readManifest(bundlePath: string): PackageManifest {
    const manifestPath = path.join(bundlePath, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`No manifest.json in ${bundlePath}`)
    }
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PackageManifest
  }

  /**
   * Compute an integrity hash over all files in a bundle directory,
   * optionally excluding certain relative paths (e.g. manifest.json itself
   * during its own write).
   */
  computeIntegrity(dir: string, exclude: string[] = []): string {
    const hash = createHash('sha256')
    const files = this.walkDir(dir).sort()
    for (const file of files) {
      const rel = path.relative(dir, file)
      if (exclude.includes(rel)) continue
      hash.update(rel)
      hash.update(fs.readFileSync(file))
    }
    return 'sha256-' + hash.digest('hex')
  }

  private walkDir(dir: string): string[] {
    const results: string[] = []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...this.walkDir(full))
      } else {
        results.push(full)
      }
    }
    return results
  }

  private copyDir(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true })
    }
    const entries = fs.readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      if (entry.isDirectory()) {
        this.copyDir(srcPath, destPath)
      } else {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }
}
