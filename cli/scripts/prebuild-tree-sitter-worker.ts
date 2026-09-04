#!/usr/bin/env bun
/**
 * Prebuild the OpenTUI tree-sitter parser worker into a self-contained
 * ES module bundle that can run as a Blob-URL worker inside a compiled
 * binary.
 *
 * Why: @opentui/core spawns its parser worker via
 * `new Worker(new URL('./parser.worker.js', import.meta.url))`. Under
 * `bun build --compile` that URL resolves into the executable's virtual
 * filesystem, which `new Worker` cannot load ("ModuleNotFound resolving
 * B:\~BUN\root\parser.worker.js") — so syntax highlighting silently dies
 * in the shipped binaries. Blob-URL workers DO work in compiled binaries
 * (verified), but the raw worker source cannot run as a blob because its
 * bare `web-tree-sitter` imports have no node_modules context there.
 *
 * The build therefore bundles the worker with `--target=bun` (inlining
 * web-tree-sitter and its emscripten loader), strips the dynamic
 * `import("web-tree-sitter/tree-sitter.wasm")` (unresolvable from a blob
 * — the wasm binary is inlined as base64 instead via the
 * CODEBUFF_INLINED_WASM_DATA define that opentui's loader supports), and
 * writes the bundle as a text asset the CLI imports and turns into a
 * Blob URL at boot.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cliRoot = join(__dirname, '..')
const repoRoot = dirname(cliRoot)

const workerEntry = join(repoRoot, 'node_modules', '@opentui', 'core', 'parser.worker.js')
const wasmSource = join(repoRoot, 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm')
const outFile = join(cliRoot, 'src', 'generated', 'tree-sitter-worker-bundle.js')

function log(msg: string) {
  console.log(`[tree-sitter-worker] ${msg}`)
}

function run(args: string[]) {
  const result = Bun.spawnSync(args, { cwd: cliRoot, stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0) {
    throw new Error(
      `Command "${args.join(' ')}" failed (${result.exitCode}):\n${result.stderr.toString()}`,
    )
  }
}

async function main() {
  if (!Bun.file(workerEntry).exists()) {
    throw new Error(`OpenTUI worker not found at ${workerEntry}`)
  }

  log('Reading tree-sitter.wasm for inlining...')
  const wasmBuffer = readFileSync(wasmSource)
  const wasmBase64 = wasmBuffer.toString('base64')
  log(`wasm: ${(wasmBuffer.length / 1024 / 1024).toFixed(1)} MB`)

  log('Bundling parser worker (--target=bun)...')
  const bundle = await Bun.build({
    entrypoints: [workerEntry],
    target: 'bun',
    format: 'esm',
    define: {
      CODEBUFF_INLINED_WASM_DATA: JSON.stringify(wasmBase64),
    },
    minify: false,
  })

  if (!bundle.success) {
    throw new Error(
      `Worker bundle failed: ${JSON.stringify(bundle.logs ?? bundle, null, 1).slice(0, 2000)}`,
    )
  }

  let code = await bundle.outputs[0]!.text()

  // The bundle keeps the dynamic `import("web-tree-sitter/tree-sitter.wasm", ...)`
  // which cannot resolve inside a blob worker. Replace it with a constant:
  // emscripten's readBinary hook (CODEBUFF_INLINED_WASM_DATA define) serves
  // the wasm bytes when the requested filename contains "tree-sitter.wasm",
  // so a bare relative filename is all locateFile needs to return.
  const importNeedle =
    'let { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm", {\n          with: { type: "wasm" }\n        });'
  const importReplacement = 'let treeWasm = "tree-sitter.wasm";'
  if (!code.includes(importNeedle)) {
    throw new Error(
      'Expected wasm import not found in worker bundle — OpenTUI worker shape changed; update prebuild-tree-sitter-worker.ts',
    )
  }
  code = code.replace(importNeedle, importReplacement)

  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, code)
  log(`Wrote ${outFile} (${(code.length / 1024 / 1024).toFixed(1)} MB)`)
}

main()
