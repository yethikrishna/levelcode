export type PackageType = 'agent' | 'skill' | 'team-template' | 'tool' | 'policy'

export interface PackageMeta {
  name: string
  version: string
  type: PackageType
  description: string
  author: string
  tags?: string[]
  homepage?: string
  license?: string
  engines?: { levelcode?: string }
  main?: string
  integrity?: string
  publishedAt: number
  updatedAt: number
  downloads?: number
}

export interface PackageManifest extends PackageMeta {
  files: string[]
}

export interface PackageValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface InstallResult {
  success: boolean
  package?: PackageMeta
  error?: string
}

export interface RegistryIndex {
  packages: Record<string, PackageMeta[]>
  installed: Record<string, { version: string; installedAt: number }>
}
