// Build script for @levelcode/sdk using Bun's bundler with dual package support
// Creates ESM + CJS bundles with TypeScript declarations

import { mkdir, cp, readFile, writeFile, rm } from 'fs/promises'
import Module from 'module'
import { delimiter, join, resolve } from 'path'
import { spawn } from 'child_process'

const workspaceNodeModules = join(import.meta.dir, '..', 'node_modules')
const existingNodePath = process.env.NODE_PATH ?? ''
const nodePathEntries = existingNodePath
  ? new Set(existingNodePath.split(delimiter))
  : new Set<string>()

if (!nodePathEntries.has(workspaceNodeModules)) {
  nodePathEntries.add(workspaceNodeModules)
  process.env.NODE_PATH = Array.from(nodePathEntries).join(delimiter)
  const moduleWithInit = Module as unknown as { _initPaths?: () => void }
  moduleWithInit._initPaths?.()
}

async function build() {
  console.log('🧹 Cleaning dist directory...')
  await rm('dist', { recursive: true, force: true })

  await mkdir('./dist', { recursive: true })

  // Read external dependencies from package.json
  const pkgText = await Bun.file('./package.json').text()
  const pkg = JSON.parse(pkgText)
  const external = [
    // Only exclude actual npm dependencies, not workspace packages
    ...Object.keys(pkg.dependencies || {}).filter(
      (dep) => !dep.startsWith('@levelcode/'),
    ),
    // Add Node.js built-ins
    'fs',
    'path',
    'child_process',
    'os',
    'crypto',
    'stream',
    'util',
    'ws',
    'bufferutil',
    'utf-8-validate',
    'http',
    'https',
    'net',
    'tls',
    'url',
    'events',
  ]

  console.log('📦 Building ESM format...')
  await Bun.build({
    entrypoints: ['src/index.ts'],
    outdir: 'dist',
    target: 'node',
    format: 'esm',
    minify: false,
    sourcemap: 'linked',
    external,
    naming: '[dir]/index.mjs',
    env: 'NEXT_PUBLIC_*',
    loader: {
      '.scm': 'text',
    },
    plugins: [],
  })

  console.log('📦 Building CJS format...')
  await Bun.build({
    entrypoints: ['src/index.ts'],
    outdir: 'dist',
    target: 'node',
    format: 'cjs',
    minify: false,
    sourcemap: 'linked',
    external,
    naming: '[dir]/index.cjs',
    define: {
      'import.meta.url': 'undefined',
      'import.meta': 'undefined',
    },
    env: 'NEXT_PUBLIC_*',
    loader: {
      '.scm': 'text',
    },
    plugins: [],
  })

  console.log('📝 Generating and bundling TypeScript declarations...')
  const dtsBundled = await generateDeclarationBundle()
  if (!dtsBundled) {
    console.log('  Falling back to tsc for declaration generation...')
    await generateDeclarationsWithTsc()
  }

  console.log('📂 Copying WASM files for tree-sitter...')
  await copyWasmFiles()

  console.log('📂 Copying vendored ripgrep binaries...')
  await copyRipgrepVendor()

  console.log('✅ Build complete!')
  console.log('  📄 dist/index.mjs (ESM)')
  console.log('  📄 dist/index.cjs (CJS)')
  console.log('  📄 dist/index.d.ts (Types)')
}

/**
 * Run dts-bundle-generator as a subprocess with increased memory (8 GB).
 * This avoids OOM by isolating the heavy type-resolution work in its own
 * V8 heap instead of sharing memory with the main Bun build process.
 * Returns true on success, false on failure.
 */
async function generateDeclarationBundle(): Promise<boolean> {
  const sdkRoot = resolve(import.meta.dir, '..')
  const workspaceRoot = resolve(sdkRoot, '..')

  // Use the dts-bundle-generator JS entry point directly with node,
  // so that --max-old-space-size is actually respected by V8.
  // (bunx uses Bun's runtime which ignores NODE_OPTIONS)
  const dtsBinJs = join(workspaceRoot, 'node_modules', 'dts-bundle-generator', 'dist', 'bin', 'dts-bundle-generator.js')

  // Use tsconfig.dts.json which excludes bun-types to avoid symbol
  // resolution errors in dts-bundle-generator, and adds ESNext.Promise
  // for Promise.withResolvers support
  const tsconfigPath = join(sdkRoot, 'tsconfig.dts.json')

  const args = [
    '--max-old-space-size=8192',
    dtsBinJs,
    '--project', tsconfigPath,
    '--no-check',
    '--export-referenced-types=false',
    '--external-imports=@levelcode/common',
    '--external-imports=@levelcode/agent-runtime',
    '--external-imports=@levelcode/code-map',
    '-o', join(sdkRoot, 'dist', 'index.d.ts'),
    join(sdkRoot, 'src', 'index.ts'),
  ]

  try {
    const success = await new Promise<boolean>((resolvePromise) => {
      const child = spawn('node', args, {
        cwd: sdkRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
        },
        shell: process.platform === 'win32',
      })

      let stderr = ''
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })
      child.stdout?.on('data', (data: Buffer) => {
        // dts-bundle-generator may print progress info on stdout
        const msg = data.toString().trim()
        if (msg) console.log(`  [dts-bundle-generator] ${msg}`)
      })

      // Timeout after 5 minutes to avoid hanging builds
      const timeout = setTimeout(() => {
        console.warn('  dts-bundle-generator timed out after 5 minutes, killing...')
        child.kill('SIGTERM')
      }, 5 * 60 * 1000)

      child.on('close', (code) => {
        clearTimeout(timeout)
        if (code === 0) {
          resolvePromise(true)
        } else {
          console.warn(`  dts-bundle-generator exited with code ${code}`)
          if (stderr.trim()) {
            // Print only the last few lines of stderr to avoid noise
            const lines = stderr.trim().split('\n')
            const tail = lines.slice(-10).join('\n')
            console.warn(`  stderr (last lines):\n${tail}`)
          }
          resolvePromise(false)
        }
      })

      child.on('error', (err) => {
        clearTimeout(timeout)
        console.warn(`  dts-bundle-generator spawn error: ${err.message}`)
        resolvePromise(false)
      })
    })

    if (success) {
      await fixDuplicateImports()
      console.log('  ✓ Created bundled type definitions')
      return true
    }
    return false
  } catch (error: any) {
    console.warn(`  dts-bundle-generator failed: ${error.message}`)
    return false
  }
}

/**
 * Fallback: use tsc to emit declaration files when dts-bundle-generator
 * fails or runs out of memory. This produces per-file .d.ts output
 * rather than a single bundle, but is much lighter on memory.
 */
async function generateDeclarationsWithTsc(): Promise<void> {
  const sdkRoot = resolve(import.meta.dir, '..')
  const tsconfigPath = join(sdkRoot, 'tsconfig.json')

  try {
    const success = await new Promise<boolean>((resolvePromise) => {
      const tscBin = process.platform === 'win32' ? 'tsc.cmd' : 'tsc'
      const child = spawn('bunx', ['tsc', '--emitDeclarationOnly', '--declaration', '--project', tsconfigPath, '--outDir', join(sdkRoot, 'dist')], {
        cwd: sdkRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_OPTIONS: '--max-old-space-size=8192',
        },
        shell: process.platform === 'win32',
      })

      let stderr = ''
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })
      child.stdout?.on('data', () => {})

      child.on('close', (code) => {
        if (code === 0) {
          resolvePromise(true)
        } else {
          if (stderr.trim()) {
            const lines = stderr.trim().split('\n').slice(-10).join('\n')
            console.warn(`  tsc stderr:\n${lines}`)
          }
          resolvePromise(false)
        }
      })

      child.on('error', (err) => {
        console.warn(`  tsc spawn error: ${err.message}`)
        resolvePromise(false)
      })
    })

    if (success) {
      console.log('  ✓ Created type definitions via tsc (per-file, not bundled)')
    } else {
      console.warn('  ⚠ tsc declaration generation also failed; build continues without .d.ts')
    }
  } catch (error: any) {
    console.warn(`  ⚠ tsc fallback failed: ${error.message}; build continues without .d.ts`)
  }
}

/**
 * Fix duplicate imports in the generated index.d.ts file
 */
async function fixDuplicateImports() {
  try {
    let content = await readFile('dist/index.d.ts', 'utf-8')

    // Remove any duplicate zod default imports (handle various whitespace)
    const zodDefaultImportRegex = /import\s+z\s+from\s+['"]zod\/v4['"];?\n?/g
    const zodNamedImportRegex =
      /import\s+\{\s*z\s*\}\s+from\s+['"]zod\/v4['"];?/

    // If we have both imports, remove all default imports and keep only the named one
    if (
      content.match(zodNamedImportRegex) &&
      content.match(zodDefaultImportRegex)
    ) {
      content = content.replace(zodDefaultImportRegex, '')
    }

    await writeFile('dist/index.d.ts', content)
    console.log('  ✓ Fixed duplicate imports in bundled types')
  } catch (error) {
    console.warn(
      '  ⚠ Warning: Could not fix duplicate imports:',
      error.message,
    )
  }
}

/**
 * Copy WASM files from @vscode/tree-sitter-wasm to shared dist/wasm directory
 */
async function copyWasmFiles() {
  const wasmSourceDir = '../node_modules/@vscode/tree-sitter-wasm/wasm'
  const wasmFiles = [
    'tree-sitter.wasm', // Main tree-sitter WASM file
    'tree-sitter-c-sharp.wasm',
    'tree-sitter-cpp.wasm',
    'tree-sitter-go.wasm',
    'tree-sitter-java.wasm',
    'tree-sitter-javascript.wasm',
    'tree-sitter-python.wasm',
    'tree-sitter-ruby.wasm',
    'tree-sitter-rust.wasm',
    'tree-sitter-tsx.wasm',
    'tree-sitter-typescript.wasm',
  ]

  // Create shared wasm directory
  await mkdir('dist/wasm', { recursive: true })

  // Copy each WASM file to shared directory only
  for (const wasmFile of wasmFiles) {
    try {
      await cp(`${wasmSourceDir}/${wasmFile}`, `dist/wasm/${wasmFile}`)
      console.log(`  ✓ Copied ${wasmFile}`)
    } catch (error) {
      console.warn(`  ⚠ Warning: Could not copy ${wasmFile}:`, error.message)
    }
  }
}

async function copyRipgrepVendor() {
  const vendorSrc = 'vendor/ripgrep'
  const vendorDest = 'dist/vendor/ripgrep'
  try {
    await mkdir(vendorDest, { recursive: true })
    await cp(vendorSrc, vendorDest, { recursive: true })
    console.log('  ✓ Copied vendored ripgrep binaries')
  } catch (e) {
    console.warn(
      '  ⚠ No vendored ripgrep found; skipping (use fetch-ripgrep.ts first)',
    )
  }
}

if (import.meta.main) {
  build().catch(console.error)
}
