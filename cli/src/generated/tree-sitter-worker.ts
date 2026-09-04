// @ts-expect-error — generated worker bundle has no type declarations
import workerBundle from './tree-sitter-worker-bundle.js' with { type: 'text' }

/**
 * Boot-time wiring for the OpenTUI tree-sitter parser worker in compiled
 * binaries.
 *
 * @opentui/core spawns its worker via `new Worker(new URL('./parser.worker.js',
 * import.meta.url))`, which under `bun build --compile` resolves into the
 * executable's virtual filesystem — `new Worker` cannot load from there
 * ("ModuleNotFound resolving B:\~BUN\root\parser.worker.js"), so syntax
 * highlighting silently dies in shipped binaries (the worker's onerror only
 * logs; the TUI boots but highlight-dependent operations never complete).
 *
 * Blob-URL workers DO work in compiled binaries. OpenTUI checks
 * OTUI_TREE_SITTER_WORKER_PATH first in its worker spawn, so we generate a
 * blob URL from the prebuilt, self-contained worker bundle and publish it
 * through that env var before the renderer (and its tree-sitter client) is
 * created.
 *
 * The prebundle (scripts/prebuild-tree-sitter-worker.ts) inlines
 * web-tree-sitter and its wasm (base64 via the CODEBUFF_INLINED_WASM_DATA
 * loader hook), so the blob worker needs no node_modules context.
 *
 * In `bun dev` the real worker file resolves fine, but the blob path works
 * there too — one code path, exercised identically.
 */

let registered = false

export function registerTreeSitterWorker(): void {
  if (registered) return
  registered = true
  try {
    const blob = new Blob([workerBundle], { type: 'text/javascript' })
    process.env.OTUI_TREE_SITTER_WORKER_PATH = URL.createObjectURL(blob)
  } catch {
    // Best-effort: without the override, OpenTUI falls back to its own
    // (failing) resolution — same behavior as before this existed.
  }
}
