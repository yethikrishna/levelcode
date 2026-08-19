import { MarketplaceRegistry, PackagePackager } from '@levelcode/sdk'
import type { PackageType, PackageMeta } from '@levelcode/sdk'

const registry = new MarketplaceRegistry()
const packager = new PackagePackager()

const VALID_TYPES: PackageType[] = ['agent', 'skill', 'team-template', 'tool', 'policy']

/**
 * Format a single package entry for display in chat.
 */
function formatPackage(pkg: PackageMeta, installed?: { version: string; installedAt: number } | null): string {
  const lines = [
    `📦 ${pkg.name}@${pkg.version} [${pkg.type}]`,
    `   ${pkg.description || '(no description)'}`,
    `   Author: ${pkg.author || 'unknown'}`,
  ]
  if (pkg.tags && pkg.tags.length > 0) {
    lines.push(`   Tags: ${pkg.tags.join(', ')}`)
  }
  lines.push(`   Downloads: ${pkg.downloads ?? 0}`)
  if (installed) {
    lines.push(`   ✅ Installed: ${installed.version} (${new Date(installed.installedAt).toLocaleDateString()})`)
  }
  return lines.join('\n')
}

/**
 * Handle /marketplace:search <query> [--type <type>]
 */
export function handleMarketplaceSearch(args: string): string {
  const parts = args.trim().split(/\s+/)
  let typeFilter: PackageType | undefined
  const queryParts: string[] = []

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '--type' && parts[i + 1]) {
      const t = parts[i + 1] as PackageType
      if (VALID_TYPES.includes(t)) {
        typeFilter = t
      }
      i++
    } else if (parts[i]) {
      queryParts.push(parts[i]!)
    }
  }

  const query = queryParts.join(' ')
  const results = registry.search(query, typeFilter)

  if (results.length === 0) {
    return query
      ? `No packages found matching "${query}"${typeFilter ? ` of type "${typeFilter}"` : ''}.`
      : 'No packages published yet. Use /marketplace:publish to publish one.'
  }

  const lines = [`=== Marketplace Search Results (${results.length}) ===`, '']
  for (const pkg of results) {
    const installed = registry.getInstalled(pkg.name)
    lines.push(formatPackage(pkg, installed))
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * Handle /marketplace:install <name> [version]
 */
export function handleMarketplaceInstall(args: string): string {
  const parts = args.trim().split(/\s+/)
  const name = parts[0]
  const version = parts[1]

  if (!name) {
    return 'Usage: /marketplace:install <package-name> [version]'
  }

  try {
    const installed = registry.install(name, version)
    return `✅ Installed ${installed.name}@${installed.version} successfully.`
  } catch (error) {
    return `❌ Installation failed: ${error instanceof Error ? error.message : String(error)}`
  }
}

/**
 * Handle /marketplace:uninstall <name>
 */
export function handleMarketplaceUninstall(args: string): string {
  const name = args.trim()
  if (!name) {
    return 'Usage: /marketplace:uninstall <package-name>'
  }

  try {
    registry.uninstall(name)
    return `✅ Uninstalled ${name} successfully.`
  } catch (error) {
    return `❌ Uninstall failed: ${error instanceof Error ? error.message : String(error)}`
  }
}

/**
 * Handle /marketplace:list [--installed]
 */
export function handleMarketplaceList(args: string): string {
  const installedOnly = args.trim() === '--installed'

  const packages = installedOnly ? registry.listInstalled() : registry.list()

  if (packages.length === 0) {
    return installedOnly
      ? 'No packages installed. Use /marketplace:search to find packages.'
      : 'No packages published yet. Use /marketplace:publish to publish one.'
  }

  const header = installedOnly
    ? `=== Installed Packages (${packages.length}) ===`
    : `=== Marketplace Packages (${packages.length}) ===`

  const lines = [header, '']
  for (const pkg of packages) {
    const installed = registry.getInstalled(pkg.name)
    lines.push(formatPackage(pkg, installed))
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * Handle /marketplace:publish <name> <version> <type> [description]
 * Simplified in-place publishing from CLI arguments.
 */
export function handleMarketplacePublish(args: string): string {
  const parts = args.trim().split(/\s+/)
  const name = parts[0]
  const version = parts[1]
  const type = parts[2] as PackageType
  const description = parts.slice(3).join(' ') || 'Published via CLI'

  if (!name || !version || !type) {
    return 'Usage: /marketplace:publish <name> <version> <type> [description]\nTypes: ' + VALID_TYPES.join(', ')
  }

  if (!VALID_TYPES.includes(type)) {
    return `Invalid type "${type}". Must be one of: ${VALID_TYPES.join(', ')}`
  }

  try {
    const meta: PackageMeta = {
      name,
      version,
      type,
      description,
      author: 'local',
      tags: [],
      publishedAt: Date.now(),
      updatedAt: Date.now(),
      downloads: 0,
    }
    const published = registry.publish(meta)
    return `✅ Published ${published.name}@${published.version} [${published.type}] to local marketplace.`
  } catch (error) {
    return `❌ Publish failed: ${error instanceof Error ? error.message : String(error)}`
  }
}
