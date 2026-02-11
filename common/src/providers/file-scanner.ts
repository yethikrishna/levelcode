import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import type { DetectedEnvKey } from './auto-detect-env'

/**
 * Configuration options for file scanning
 */
export interface FileScannerOptions {
  /** Current working directory (default: process.cwd()) */
  cwd?: string
  /** Maximum file size to scan in bytes (default: 1MB) */
  maxFileSize?: number
  /** Whether to scan home directory for common key files (default: true) */
  scanHome?: boolean
}

/**
 * Common configuration files to scan for API keys
 */
const COMMON_CONFIG_FILES = [
  '.env',
  '.env.local',
  '.env.development.local',
  '.env.test.local',
  '.env.production.local',
  '.envrc',
  '.env.example',
  '.env.sample',
  '.env.template',
  '.secrets',
  'config/.env',
  'config/.env.local',
  'config/.env.production',
]

/**
 * Regex patterns for detecting API keys with their provider IDs
 * These are carefully crafted to match exact key formats with minimal false positives
 */
const API_KEY_PATTERNS: Array<{ regex: RegExp; providerId: string; description: string }> = [
  // OpenAI
  { regex: /sk-(?:proj-)?[A-Za-z0-9]{48}/g, providerId: 'openai', description: 'OpenAI API key' },
  
  // Anthropic
  { regex: /sk-ant-[A-Za-z0-9_-]{95}/g, providerId: 'anthropic', description: 'Anthropic API key' },
  
  // xAI (Grok)
  { regex: /xai-[A-Za-z0-9_-]{36,}/g, providerId: 'xai', description: 'xAI/Grok API key' },
  
  // Groq
  { regex: /gsk_[A-Za-z0-9]{32}/g, providerId: 'groq', description: 'Groq API key' },
  
  // OpenRouter
  { regex: /sk-or-v1-[A-Za-z0-9]{32,}/g, providerId: 'openrouter', description: 'OpenRouter API key' },
  
  // Google/Gemini
  { regex: /AIza[A-Za-z0-9_-]{35}/g, providerId: 'google', description: 'Google AI API key' },
  
  // Perplexity
  { regex: /pplx-[A-Za-z0-9_-]{40}/g, providerId: 'perplexity', description: 'Perplexity API key' },
  
  // Replicate
  { regex: /r8_[A-Za-z0-9_-]{32}/g, providerId: 'replicate', description: 'Replicate API token' },
  
  // Nvidia
  { regex: /nvapi-[A-Za-z0-9_-]{36}/g, providerId: 'nvidia', description: 'Nvidia API key' },
  
  // Together AI
  { regex: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, providerId: 'together', description: 'Together API key (UUID-like)' },
  
  // Fireworks
  { regex: /fw-[A-Za-z0-9_-]{32,}/g, providerId: 'fireworks', description: 'Fireworks API key' },
  
  // DeepSeek
  { regex: /sk-[a-f0-9]{48}/g, providerId: 'deepseek', description: 'DeepSeek API key' },
  
  // Cohere
  { regex: /[a-f0-9]{32}/g, providerId: 'cohere', description: 'Cohere API key (32 char hex)' },
  
  // Mistral
  { regex: /[a-zA-Z0-9]{32}/g, providerId: 'mistral', description: 'Mistral API key (32 char alphanum)' },
  
  // Moonshot
  { regex: /sk-[a-zA-Z0-9]{32}/g, providerId: 'moonshot', description: 'Moonshot API key' },
  
  // 302.AI
  { regex: /302[a-zA-Z0-9]{32}/g, providerId: '302ai', description: '302.AI API key' },
  
  // Cerebras
  { regex: /cs-[a-zA-Z0-9_-]{32}/g, providerId: 'cerebras', description: 'Cerebras API key' },
  
  // DeepInfra
  { regex: /[a-zA-Z0-9_-]{40}/g, providerId: 'deepinfra', description: 'DeepInfra API key' },
]

/**
 * Check if a file exists and is within size limits
 */
function isSafeToScan(filePath: string, maxSize: number): boolean {
  try {
    const stats = fs.statSync(filePath)
    return stats.isFile() && stats.size <= maxSize
  } catch {
    return false
  }
}

/**
 * Read file content safely
 */
function readFileContent(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Extract the API key value from an env variable line
 * Handles various formats: KEY=VALUE, KEY="VALUE", KEY='VALUE', export KEY=VALUE
 */
function extractEnvValue(line: string): string | null {
  // Match standard env var formats
  const match = line.match(/^(?:export\s+)?[A-Za-z0-9_]+[\s]*[=:][\s]*(.+)$/)
  if (!match) return null

  let value = match[1]!.trim()

  // Remove quotes if present
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }

  // Remove any inline comments
  const commentIndex = value.indexOf('#')
  if (commentIndex !== -1) {
    value = value.slice(0, commentIndex).trim()
  }

  return value || null
}

/**
 * Scan a single file for API keys
 */
function scanFileForKeys(filePath: string, maxSize: number): DetectedEnvKey[] {
  const content = readFileContent(filePath)
  if (!content) return []

  const detected: DetectedEnvKey[] = []
  const seenKeys = new Set<string>() // Deduplicate by key value

  for (const { regex, providerId } of API_KEY_PATTERNS) {
    // Reset regex state
    regex.lastIndex = 0

    // Check for direct matches in content
    const directMatches = content.match(regex)
    if (directMatches) {
      for (const match of directMatches) {
        if (match.length >= 20 && !seenKeys.has(match)) {
          seenKeys.add(match)
          detected.push({
            providerId,
            apiKey: match,
            source: 'file-scan',
            filePath,
          })
        }
      }
    }
  }

  return detected
}

/**
 * Scan common config files in the current directory
 */
function scanWorkingDirectory(options: FileScannerOptions): DetectedEnvKey[] {
  const cwd = options.cwd || process.cwd()
  const maxSize = options.maxFileSize || 1024 * 1024 // 1MB default
  const detected: DetectedEnvKey[] = []

  for (const configFile of COMMON_CONFIG_FILES) {
    const filePath = path.join(cwd, configFile)
    if (isSafeToScan(filePath, maxSize)) {
      const keys = scanFileForKeys(filePath, maxSize)
      detected.push(...keys)
    }
  }

  return detected
}

/**
 * Scan home directory for common key files
 */
function scanHomeDirectory(): DetectedEnvKey[] {
  const homeDir = os.homedir()
  if (!homeDir) return []

  const maxSize = 1024 * 1024 // 1MB
  const detected: DetectedEnvKey[] = []

  // Common home directory key files
  const homeFiles = [
    '.openai.key',
    '.openai_api_key',
    '.anthropic.key',
    '.google.key',
    '.secrets',
    '.env.keys',
  ]

  for (const keyFile of homeFiles) {
    const filePath = path.join(homeDir, keyFile)
    if (isSafeToScan(filePath, maxSize)) {
      const keys = scanFileForKeys(filePath, maxSize)
      detected.push(...keys)
    }
  }

  return detected
}

/**
 * Deduplicate detected keys by API key value
 */
function deduplicateKeys(keys: DetectedEnvKey[]): DetectedEnvKey[] {
  const seen = new Map<string, DetectedEnvKey>() // Key value -> First occurrence

  for (const key of keys) {
    if (!seen.has(key.apiKey)) {
      seen.set(key.apiKey, key)
    }
  }

  return Array.from(seen.values())
}

/**
 * Main function to scan common files for API keys
 * 
 * This function scans:
 * 1. Working directory for common config files (.env, .env.local, etc.)
 * 2. Home directory for common key files (.openai.key, etc.)
 * 
 * Returns an array of detected API keys with their source information
 */
export function scanCommonFilesForKeys(options: FileScannerOptions = {}): DetectedEnvKey[] {
  const allKeys: DetectedEnvKey[] = []

  // Scan working directory
  const workDirKeys = scanWorkingDirectory(options)
  allKeys.push(...workDirKeys)

  // Scan home directory if enabled
  if (options.scanHome !== false) {
    const homeDirKeys = scanHomeDirectory()
    allKeys.push(...homeDirKeys)
  }

  // Deduplicate and return
  return deduplicateKeys(allKeys)
}

/**
 * Get list of files that would be scanned (for debugging/logging)
 */
export function getFilesToScan(options: FileScannerOptions = {}): string[] {
  const cwd = options.cwd || process.cwd()
  const homeDir = os.homedir()
  const files: string[] = []

  // Working directory files
  for (const configFile of COMMON_CONFIG_FILES) {
    const filePath = path.join(cwd, configFile)
    if (isSafeToScan(filePath, options.maxFileSize || 1024 * 1024)) {
      files.push(filePath)
    }
  }

  // Home directory files
  if (options.scanHome !== false && homeDir) {
    const homeFiles = [
      '.openai.key',
      '.openai_api_key',
      '.anthropic.key',
      '.google.key',
      '.secrets',
      '.env.keys',
    ]
    for (const keyFile of homeFiles) {
      const filePath = path.join(homeDir, keyFile)
      if (isSafeToScan(filePath, options.maxFileSize || 1024 * 1024)) {
        files.push(filePath)
      }
    }
  }

  return files
}
