import * as fs from 'fs'
import * as path from 'path'

import { Parser } from 'web-tree-sitter'

import { TREE_SITTER_WASM_PATHS } from './assets/tree-sitter-wasm'

/**
 * Resolve a tree-sitter wasm file at runtime.
 *
 * Order:
 * 1. Embedded asset map — under `bun build --compile` the wasm files are
 *    embedded in the executable and this map holds their virtual paths
 *    (readable there). This is the ONLY correct source in compiled
 *    binaries: `require.resolve('web-tree-sitter')` is answered at build
 *    time by Bun's compiler and baked in (the CI runner's path), which
 *    crashes at runtime on any other machine.
 * 2. Emscripten's script directory (dev: node_modules/web-tree-sitter).
 * 3. Exe-relative wasm/ directory (binaries that ship one).
 * 4. Package resolution — dev only, guarded.
 */
export function resolveTreeSitterWasm(name: string, scriptDir: string): string {
  // 1) Embedded asset (compiled binary).
  const embedded = TREE_SITTER_WASM_PATHS[name]
  if (embedded) return embedded

  // 2) Script directory (dev) — real file next to web-tree-sitter.cjs.
  const scriptDirCandidate = path.join(scriptDir, name)
  if (fs.existsSync(scriptDirCandidate)) return scriptDirCandidate

  // 3) Exe-relative (binaries that ship a wasm/ directory next to the exe).
  const exeDir = path.dirname(process.execPath)
  const exeCandidate = path.join(exeDir, 'wasm', name)
  if (fs.existsSync(exeCandidate)) return exeCandidate

  // 4) Package resolution — dev only. Guarded: under `bun build --compile`
  // the answer would be baked from the build machine.
  try {
    const pkgDir = path.dirname(require.resolve('web-tree-sitter'))
    const candidate = path.join(pkgDir, name)
    if (fs.existsSync(candidate)) return candidate
  } catch {
    // Fall through to the error below.
  }

  throw new Error(
    `tree-sitter wasm not found: ${name} (looked in embedded assets, ${scriptDirCandidate}, ${exeCandidate})`,
  )
}

/**
 * Initialize web-tree-sitter for Node.js environments with proper WASM file location
 */
export async function initTreeSitterForNode(): Promise<void> {
  // Use locateFile to override where the runtime looks for tree-sitter.wasm
  await Parser.init({
    locateFile: (name: string, scriptDir: string) => {
      if (name === 'tree-sitter.wasm') {
        return resolveTreeSitterWasm(name, scriptDir)
      }

      // For other files, use default behavior
      return path.join(scriptDir, name)
    },
  })
}
