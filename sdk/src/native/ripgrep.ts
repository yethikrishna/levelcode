import { execSync } from 'child_process'
import { existsSync } from 'fs'
import os from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { getSdkEnv } from '../env'

import type { SdkEnv } from '../types/env'

/**
 * Try to find ripgrep on the system PATH using `where` (Windows) or `which` (Unix).
 * Returns the path if found, undefined otherwise.
 */
function findRgOnPath(): string | undefined {
  try {
    const cmd = process.platform === 'win32' ? 'where rg.exe' : 'which rg'
    const result = execSync(cmd, { encoding: 'utf8', timeout: 3000 }).trim()
    // `where` on Windows can return multiple lines; take the first
    const firstLine = result.split('\n')[0]?.trim()
    if (firstLine && existsSync(firstLine)) {
      return firstLine
    }
  } catch {
    // Not found on PATH
  }
  return undefined
}

/**
 * Try common install locations for ripgrep on Windows.
 */
function findRgCommonLocations(): string | undefined {
  if (process.platform !== 'win32') return undefined

  const home = os.homedir()
  const candidates = [
    // Scoop
    join(home, 'scoop', 'shims', 'rg.exe'),
    // Chocolatey
    join('C:', 'ProgramData', 'chocolatey', 'bin', 'rg.exe'),
    // Cargo
    join(home, '.cargo', 'bin', 'rg.exe'),
    // Winget / Program Files
    join('C:', 'Program Files', 'ripgrep', 'rg.exe'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return undefined
}

/**
 * Get the path to the bundled ripgrep binary based on the current platform
 * @param importMetaUrl - import.meta.url from the calling module
 * @returns Path to the ripgrep binary
 */
export function getBundledRgPath(
  importMetaUrl?: string,
  env: SdkEnv = getSdkEnv(),
): string {
  // Allow override via environment variable
  if (env.LEVELCODE_RG_PATH) {
    return env.LEVELCODE_RG_PATH
  }

  // Determine platform-specific directory name
  const platform = process.platform
  const arch = process.arch

  let platformDir: string
  if (platform === 'win32' && arch === 'x64') {
    platformDir = 'x64-win32'
  } else if (platform === 'darwin' && arch === 'arm64') {
    platformDir = 'arm64-darwin'
  } else if (platform === 'darwin' && arch === 'x64') {
    platformDir = 'x64-darwin'
  } else if (platform === 'linux' && arch === 'arm64') {
    platformDir = 'arm64-linux'
  } else if (platform === 'linux' && arch === 'x64') {
    platformDir = 'x64-linux'
  } else {
    throw new Error(`Unsupported platform: ${platform}-${arch}`)
  }

  const binaryName = platform === 'win32' ? 'rg.exe' : 'rg'

  // Try to find the bundled binary relative to this module
  let vendorPath: string | undefined

  // Use the SDK's own import.meta.url if none is provided
  const metaUrl = importMetaUrl || import.meta.url

  if (metaUrl) {
    // ESM context - use import.meta.url to find relative path
    const currentFile = fileURLToPath(metaUrl)
    const currentDir = dirname(currentFile)

    // Try relative to current file (development - from src/native/ripgrep.ts to vendor/)
    const devPath = join(
      currentDir,
      '..',
      '..',
      'vendor',
      'ripgrep',
      platformDir,
      binaryName,
    )
    if (existsSync(devPath)) {
      vendorPath = devPath
    }

    // Try relative to bundled dist file (production - from dist/index.mjs to dist/vendor/)
    const distPath = join(
      currentDir,
      'vendor',
      'ripgrep',
      platformDir,
      binaryName,
    )
    if (existsSync(distPath)) {
      vendorPath = distPath
    }
  }

  // If not found via importMetaUrl, try CJS approach or other methods
  if (!vendorPath) {
    // Try from __dirname if available (CJS context)
    const dirname = new Function(
      `try { return __dirname; } catch (e) { return undefined; }`,
    )()

    if (typeof dirname !== 'undefined') {
      const cjsPath = join(
        dirname,
        '..',
        '..',
        'vendor',
        'ripgrep',
        platformDir,
        binaryName,
      )
      if (existsSync(cjsPath)) {
        vendorPath = cjsPath
      }
      const cjsPath2 = join(
        dirname,
        'vendor',
        'ripgrep',
        platformDir,
        binaryName,
      )
      if (existsSync(cjsPath2)) {
        vendorPath = cjsPath2
      }
    }
  }

  if (vendorPath && existsSync(vendorPath)) {
    return vendorPath
  }

  // Fallback: try to find in dist/vendor (for published package)
  const distVendorPath = join(
    process.cwd(),
    'node_modules',
    '@levelcode',
    'sdk',
    'dist',
    'vendor',
    'ripgrep',
    platformDir,
    binaryName,
  )
  if (existsSync(distVendorPath)) {
    return distVendorPath
  }

  // Try monorepo root vendor path (when running from cli/ or sdk/ subdirectory)
  const metaUrl2 = importMetaUrl || import.meta.url
  if (metaUrl2) {
    const currentFile2 = fileURLToPath(metaUrl2)
    const currentDir2 = dirname(currentFile2)
    // Walk up looking for a vendor/ripgrep directory
    let searchDir = currentDir2
    for (let i = 0; i < 6; i++) {
      const candidate = join(searchDir, 'vendor', 'ripgrep', platformDir, binaryName)
      if (existsSync(candidate)) {
        return candidate
      }
      const parentDir = dirname(searchDir)
      if (parentDir === searchDir) break
      searchDir = parentDir
    }
  }

  // Try finding ripgrep on system PATH
  const pathRg = findRgOnPath()
  if (pathRg) {
    return pathRg
  }

  // Try common install locations (Windows: scoop, chocolatey, cargo)
  const commonRg = findRgCommonLocations()
  if (commonRg) {
    return commonRg
  }

  // No fallback available
  throw new Error(
    `Ripgrep binary not found for ${platform}-${arch}. ` +
      `Expected at: ${vendorPath || 'vendor/'} or ${distVendorPath}. ` +
      `Install ripgrep: https://github.com/BurntSushi/ripgrep#installation\n` +
      `  Windows: scoop install ripgrep  OR  choco install ripgrep  OR  cargo install ripgrep\n` +
      `  Or set LEVELCODE_RG_PATH environment variable to the rg binary path.`,
  )
}
